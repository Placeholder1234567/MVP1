# Guad open product questions: legal constraints, industry practice, recommendations

Researched 2026-10-19. This is not legal advice. Items marked "(secondary)" come from law-firm or vendor write-ups or third-party directories, not the primary text. Two law-firm pages (Covington, Cooley) could not be fetched directly, so their content is taken from search summaries. Check the eCFR text and get counsel review before launch.

Repo context used: `.specify/prd.md` (US-18, US-32, US-39, §5 Non-Goals 4 and 10, §6–7 tiers), `.specify/entitlements.md` (flags `reports`, `reports_basic`, `analytics_advanced`, `intake`, `lomi_summary`), `.specify/ai-pipeline.md` (summary task returns `highlights` + `recommendations`), `.specify/services.md` (Intake `matchToHome`, Schedule `findCandidates` "nearby"), `.specify/schema.ts` (`referrals` has free-text `notes` only; `rooms` has capacity/status; `homes` has lat/lng; no staff location and no BAA/terms fields on `agencies`), `.specify/security.md` (MFA required for admin and supervisor; BAA matrix for vendors only, nothing for customers). Today agencies are created only by the operator CLI (`npm run agency:provision`).

---

## A. Self-serve agency signup

### Legal constraints
- **The BAA comes before any PHI.** A covered entity may let a business associate create, receive, maintain or transmit PHI only after getting "satisfactory assurances" in a contract that meets §164.504(e) (45 CFR 164.502(e)(1), 164.504(e)). Guad says it operates as a Business Associate (security.md line 3). So no real resident data may enter a tenant until that tenant's BAA is in force. HHS cloud guidance: https://www.hhs.gov/hipaa/for-professionals/special-topics/cloud-computing
- **Required BAA terms that affect the product:**
  - Make PHI available for the individual's right of access (164.504(e)(2)(ii)(E)) and for amendment (F).
  - Make an accounting of disclosures available (G).
  - Return or destroy PHI at termination (J).
  - Report breaches and security incidents (C).
  - Flow the terms down to subcontractors (D). Guad already has Google Cloud and AWS BAAs.
- **Click-through acceptance is a valid way to sign.** Electronic signatures are enforceable under the federal ESIGN Act (15 U.S.C. 7001) and state UETA, and HIPAA does not require wet ink. Established vendors use click-through BAAs:
  - SimplePractice: creating a trial account accepts the BAA, ToS and Privacy Policy, with no re-signing on upgrade. https://support.simplepractice.com/hc/en-us/articles/360018696052
  - Appwrite: the org owner clicks "Accept & Enable" in the console. https://appwrite.io/blog/post/announcing-self-serve-baa
  - Vercel: Pro teams accept a BAA from the dashboard. https://tweets.vercel.fyi/x/vercel_dev/1965522098178388078 (secondary)
- **Only an authorized signatory can bind the covered entity.** The person clicking must be authorized to sign for the agency. This is why vendors capture name, title and an attestation of authority.
- **Admin authentication.** The Security Rule requires person or entity authentication (164.312(d)). Guad already requires admin MFA (security.md §MFA Policy).
- **Synthetic data is not PHI.** Fabricated records about no real person are not "individually identifiable health information", so a sandbox holding only generated data needs no BAA. HHS de-identification guidance: https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification/index.html. The risk is a trial user typing real residents into the sandbox, so the product must prevent that or treat the tenant as live.

### Industry standard
- **IDD and EVV vendors are sales-led:**
  - Therap: quote-based, contact sales, often under state contracts (therap-research.md §10). Directories list pricing "on request" with demos: https://www.capterra.com/p/124101/Therap/ and https://www.softwareadvice.com/product/467875-Therap/
  - AlayaCare: "Book a demo" / "speak to an expert". https://alayacare.com/?p=46695
  - AxisCare: custom pricing. https://jotform.com/blog/axiscare-pricing
  - Brightree, WellSky and CareLogic: enterprise, sales-led.
- **State aggregators go further and verify identity.** Agencies onboard to Sandata/HHAeXchange only with a state-issued Medicaid provider ID:
  - Arizona: onboarding can't start without an AHCCCS provider ID.
  - Ohio: the Medicaid ID comes in a welcome packet before the account exists.
  - Wisconsin: the ForwardHealth portal contact becomes the security admin.
  - Sources: https://dhs.wisconsin.gov/publications/p02745.pdf and https://test.azahcccs.gov/AHCCCS/Downloads/EVV/EVVOnePager.pdf
- **SMB home-care tools are self-serve:**
  - ShiftCare: 7-day trial, no card, minimum 5 staff. https://shiftcare.com/us/home-care-software. I found no public evidence of a click-through BAA.
  - SimplePractice (behavioral health): 30-day trial with the BAA accepted at signup.
- **Organization identity checks are cheap.** The CMS NPPES registry has a free, keyless API for type-2 (organization) NPIs: https://npiregistry.cms.hhs.gov/api/?version=2.1. A registry match shows the NPI exists. It does not show licensure, Medicaid enrollment or that the signer works there.

### Recommendation for Guad (buildable)
Use a **hybrid flow: self-serve sandbox, then a gated "go live".**

1. **Self-serve sandbox (no BAA needed).**
   - Signup form: work email, name, agency name, state.
   - Create the agency with `mode = 'sandbox'` and seed it with the existing synthetic demo seed (`src/lib/server/seed.ts`).
   - Show a persistent "Sample data — do not enter real residents" banner.
   - Block creating new clients, referrals and free-text PHI fields in sandbox, or allow only seeded clients. Starting from a fresh empty sandbox invites real data entry.
   - Cap the sandbox at 14–30 days, then purge it.
   - Never send real SMS or email from a sandbox to anyone except the signed-up user.
2. **Go live (creates a new, clean live tenant; do not convert the sandbox in place).** Steps:
   - The admin enrolls TOTP MFA first. This already exists.
   - Collect the legal entity name, the organization NPI (checked against NPPES, with name and state matching) and the state Medicaid provider ID. Store the Medicaid ID and verify it manually at first.
   - The admin attests that they are authorized to bind the agency and gives their title.
   - Click-through acceptance of the MSA plus BAA. Show the full text and require scrolling and a checkbox.
   - Log an immutable `agreement_acceptances` row: agency_id, user_id, document type, document version and SHA-256 hash, timestamp, IP, user agent, and attestation text. Use `audit.logEvent` too.
   - Payment method on file. This adds friction against fraudulent signups.
   - **Operator approval toggle.** The tenant stays `pending_verification` (no client or PHI tables writable, enforced in RLS by `agencies.status`) until an operator confirms the NPI and Medicaid match. Later this can be automated for clean NPI matches.
3. **Enterprise path.** Keep `agency:provision` for sales-led deals with a negotiated BAA (paper signature). Store the signed PDF reference in the same `agreement_acceptances` table.
4. **Schema and RLS additions.** Add to `agencies`: `status` (`sandbox | pending_verification | active | suspended | terminated`), `npi`, `medicaid_provider_id`, `state`, `baa_version_accepted`, `baa_accepted_at`. Add an RLS predicate so PHI-bearing inserts require `status = 'active'`. New policies go in a `.specify/sql-patches/` file.
5. **BAA versioning.** On a material BAA change, require re-acceptance by an admin at next sign-in.

### Owner's business decisions
- Whether to offer self-serve at all, or stay demo-led like Therap and AlayaCare. The IDD buyer is used to sales-led buying, and pricing per individual served favors sales.
- Sandbox length and contents.
- Whether go-live needs a human approval step, or only automated NPI matching plus payment.
- Whether to accept agencies with no Medicaid ID (private-pay only). Those may not be HIPAA covered entities, but a BAA is still sensible.
- Whether to negotiate BAA redlines for large customers.
- The BAA text itself, which needs a lawyer.

---

## B. Placement matching inputs (referral → home/room)

### Legal constraints
- **HCBS settings rule, 42 CFR 441.301(c)(4)** (for 1915(c), (i) and (k) waiver settings):
  - The setting is **selected by the individual** from options that include non-disability-specific settings and a private unit, documented in the person-centered plan ((c)(4)(ii)).
  - In provider-owned or controlled residences, people sharing units **choose their roommates** ((c)(4)(vi)(B)(2)).
  - A private room must be an available option.
  - Sources: CMS FAQ via https://www.nmhealth.org/document/general/CMS-FinalRule-42CFS441-PublicComments.pdf (secondary), https://www.dds.ca.gov/wp-content/uploads/2019/02/HCBS_CMSHCBFeb17_20190212.pdf and https://www.ahcancal.org/Assisted-Living/Policy/Documents/NCALBrief_Choice%20and%20Privacy.pdf
  - Person-centered planning is in 441.301(c)(1)–(3): led by the individual, with informed choice.
  - **Implication: software cannot decide placement.** It can only narrow options for the people who decide.
- **ADA Title II and Olmstead (28 CFR 35.130(d)).** Services must be delivered in the most integrated setting appropriate. Criteria or methods of administration that defeat integration are barred (35.130(b)(3)). This binds states and public entities. Providers under state contract inherit it indirectly. https://www.justice.gov/osg/brief/olmstead-v-lc-amicus-merits
- **Fair Housing Act (42 U.S.C. 3604).** Group homes are dwellings, so matching on disability type, race, national origin, religion or familial status risks FHA liability. HUD/DOJ joint statement on group homes: https://www.justice.gov/opa/file/909906/dl
  - Sex-based room or house assignment is a common licensing and safety practice. It is still a protected class, so treat it as a **resident or guardian preference and roommate-choice input**, never as an automatic exclusion rule. Owner and counsel should confirm against state licensing rules.
- **Section 1557, 45 CFR 92.210.** Covered entities (Medicaid-funded providers) must make reasonable efforts to **identify** patient care decision support tools that use race, color, national origin, sex, age or disability as inputs, and to **mitigate** the discrimination risk. Compliance date: May 1, 2025. A placement-suggestion tool that uses age, sex or disability-related needs is arguably in scope. https://www.law.cornell.edu/cfr/text/45/92.210 and https://www.healthaffairs.org/content/forefront/section-1557-rule-mandates-identification-and-mitigation-discriminatory-clinical
- **State referral rules.** Washington DDA Policy 4.02 lists factors the case manager must weigh:
  - the person's preference;
  - parent or guardian requests;
  - the preferences of potential housemates;
  - the provider's ability to meet health, safety and program needs;
  - the needs and safety of everyone in the residence;
  - the assessed residential support level 1–6.

  Source: https://www.dshs.wa.gov/sites/default/files/DDA/dda/documents/policy_archives/apolicy4.02_070108.pdf. The individual and family ultimately accept or decline an offered placement: https://www.deschutes.org/sites/default/files/fileattachments/health_services/page/442/provider_need_faq.pdf

### Industry standard
- **Matching is human-led.** State or county case managers send referral packets with the assessment (ICAP, SIS or state tool), ISP, behavior support plan and medical summary. Providers then match vacancies on:
  - needs and support level;
  - staffing ratio and night awake staff;
  - staff training (medication delegation, G-tube, seizure, Mandt/CPI or other restraint training);
  - physical accessibility;
  - temperament and compatibility with current housemates;
  - location relative to family and day program;
  - funding.

  This is followed by visits, a transition meeting and trial stays. Sources: https://wfspa.org/wp-content/uploads/2020/02/IDD-Group-Home-final-2-10-20.pdf and https://ddrcco.com/host-home-for-idd-services-matching-process/
- **No mainstream IDD vendor appears to auto-assign placements.** Pipeline and vacancy tracking is the norm. (I found no evidence of automated matching in Therap or AlayaCare marketing.)

### Recommendation for Guad (buildable)
**The output is a ranked suggestion list with reasons. It is never a decision, never auto-assigns, and never filters the list down to nothing.** The supervisor picks a home. The UI states that "Final placement requires the individual's or guardian's choice per the person-centered plan." `convertToClient` records who chose and that choice was documented (e.g., `choice_documented: boolean`, `roommate_choice_documented: boolean`). Each suggestion shows plain-language reasons ("Wheelchair accessible ✓", "Staff with G-tube training: 3", "Shared room: roommate consent pending").

Structured referral fields to add. Today `referrals` has only free-text `notes`. Use enums and booleans, not free text:

| Input | Use in matching |
|---|---|
| Support/supervision level (state level or ICAP/SIS band as entered; store raw score plus tool name) | Compare to home's staffing ratio / awake overnight |
| Mobility/accessibility needs (wheelchair, no stairs, roll-in shower, hoist) | **Hard requirement** vs home accessibility features (new `homes` fields) |
| Medical needs requiring trained staff (med administration level, G-tube, insulin, seizure protocol, oxygen) | Match to staff certifications at home (`profiles` certs) |
| Behavioral support needs (has BSP, restrictive procedures, elopement risk, staffing 1:1) | Match to staff training + staffing |
| Funding/waiver type and authorized rate | Home accepts that funding source |
| Room preference (private/shared) and roommate preferences/consent | Rooms with `capacity`; shared only flagged as "needs roommate choice" |
| Preferred area / proximity to family, day program, work | Distance from home (city/ZIP level) |
| Desired move-in date | Room availability date |
| Individual/guardian stated preferences (free text) | Shown, not scored |

- **Do not score on** race, ethnicity, religion, national origin or diagnosis label.
- **Age and sex** appear only as an *informational* compatibility note ("current residents' ages 45–60"; "housemates' and guardian's stated preferences"), with no automatic exclusion. This fits the 1557 "identify and mitigate" duty. Document the tool's inputs in a short model card in the admin help page.
- **Hard filters are limited to physical facts:** accessibility hard requirements and an available room. Everything else ranks; nothing else hides.
- **Licensed capacity.** Add `homes.licensed_capacity` and `homes.license_type` (e.g., ICF/IID vs waiver group home). Warn rather than block when a placement would exceed capacity, because state rules differ.
- **Audit.** Log `matchToHome` runs with inputs and outputs (no PHI in logs; store the result in the DB) so the agency can show reasoning to auditors.

### Owner's business decisions
- Which assessment tools to support by name (ICAP, SIS-A, state-specific), or a generic "level 1–6".
- Whether sex is a filter (counsel and state licensing review needed), a preference, or omitted.
- Weighting of factors.
- Whether to include ICF/IID homes, which fall outside the HCBS rule but under 42 CFR 483 Subpart I.
- Whether matching uses staff-certification data, which is already in scope per US-32.

---

## C. Staff locations for "nearby" staff suggestions (US-18, `findCandidates`)

### Legal constraints
- **Precise geolocation is sensitive personal information in California.** CCPA/CPRA defines precise geolocation as data locating a person within a circle of 1,850-ft radius, and it is sensitive personal information (Civ. Code 1798.140). Workers can limit use of it to what is necessary (1798.121), and employee data has been fully in scope since 2023. https://cppa.ca.gov/meetings/materials/20250724_item4_ab322_memo.pdf. A home ZIP code is coarser than 1,850 ft, so it is not "precise".
- **California ADMT regulations (CPPA, finalized 2025).** These cover automated decision-making used for significant employment decisions, including **allocation of work**. Duties are pre-use notice, opt-out and risk assessment. Reported effective 2027 (secondary). A ranked "who to text first" list that a human reviews is lower risk than auto-assignment, but the coverage engine auto-fills on acceptance. https://callaborlaw.com/blog/california-finalizes-ai-regulations-for-automated-decision-making-technology
- **Workplace surveillance laws:**
  - California AB 1331, which would have barred monitoring at a worker's residence or off-duty, died in 2026 (secondary): https://letsdatascience.com/news/california-lawmakers-reject-workplace-surveillance-limits-fa4a9575
  - **New York Civil Rights Law §52-c** requires written, acknowledged notice of electronic monitoring at hire: https://www.kelleydrye.com/viewpoints/blogs/labor-days/ny-requires-notice-of-electronic-monitoring-to-employees-are-you-in-compliance
  - Connecticut (Gen. Stat. 31-48d) and Delaware (19 Del. C. 705) have similar notice laws (not independently verified here).
  - Illinois BIPA covers biometrics, not location. It is not triggered unless Guad adds face or fingerprint clock-in.
- **EVV.** The Cures Act §12006 EVV elements include *location of service delivery*. State FAQs say GPS is captured **only at visit start and end, with no continuous tracking**:
  - California: https://www.dhcs.ca.gov/provgovpart/Documents/EVV-Phase-II-FAQs.pdf
  - CMS FAQ via West Virginia: https://dhhr.wv.gov/bms/Programs/WaiverPrograms/Pages/EVV-Frequently-Asked-Questions.aspx
  - **CMS does not require EVV for congregate residential settings with 24-hour service** (May 2018 CMS FAQ): https://Medicaid.gov/federal-policy-guidance/downloads/faq051618.pdf
  - So Guad's clock-in GPS is mainly a timekeeping and fraud control for group homes, not a federal EVV mandate. Some states may still require it.
  - EVV gives no authority to keep caregiver home locations.
- **General principles.** Data minimization (FTC Act §5 unfair practices; state privacy laws). Guad's own Non-Goal 10 is "No real-time location tracking."

### Industry standard
Staffing and home-care tools typically do proximity matching from the **caregiver's profile address or ZIP code**, entered by HR or the caregiver. Distance is computed to the client or visit location. GPS is captured only at clock-in/out. Live tracking is rare and contentious. The MVP (`mvp/src/geo.js`) and current code (`src/lib/domain/geo.ts`) only rank homes against the device's position at clock-in. "Nearby" staff is **not implemented**, and no staff location field exists in `schema.ts`.

### Recommendation for Guad (buildable)
- **Field.** Add an optional, staff-entered `profiles.home_area`: either a **5-digit ZIP** or a city. Geocode it server-side to the ZIP centroid lat/lng (store the centroid only, rounded to about 2 decimals, roughly 1 km). Never store the street address for this purpose. If the agency already holds the address in HR or payroll, keep it out of Guad.
- **Consent and visibility:**
  - The caregiver sets the field in their own profile, under the copy: "Used only to suggest open shifts at homes near you. Optional. Remove anytime."
  - The field is off by default and its absence never penalizes ranking.
  - Supervisors see only "~8 mi from Maple House", never the ZIP or a map pin.
- **Computation.** Compute distance **from the ZIP centroid to each home only**, with banded output (<5 mi, 5–15, 15+). Use it as one ranking factor after training and certification for the home, hours/overtime and availability.
- **No other location data:**
  - Never live-track and never use background geolocation.
  - Never reuse clock-in GPS to infer where staff live. Clock GPS keeps its current purpose and retention.
  - Write this into the privacy notice and keep Non-Goal 10.
- **Notice.** Ship an agency-facing template for employee monitoring and data-use notices (the NY §52-c acknowledgment at hire, CA notice at collection). The agency, as employer, gives the notice; Guad provides the text.
- **Human in the loop.** Keep the scheduler able to see and override the candidate list. Log `findCandidates` inputs as reasons ("trained at home, 6 mi, under 40 h"). This prepares for CA ADMT notice and risk-assessment duties if the regulations reach Guad's customers.
- **Deletion.** Clear `home_area` when a staff member is deactivated.

### Owner's business decisions
- Whether proximity is used at all, or only trained + available + hours. The PRD says "nearby".
- ZIP vs. city granularity.
- Whether to let agencies make the field mandatory. Recommendation: no.
- Whether auto-fill on first "YES" is acceptable or a supervisor must confirm (ADMT exposure).

---

## D. AI "recommendations" in the enhanced daily summary

### The conflict
- **PRD Non-Goal 4:** "No clinical decision support. Lomi … does not diagnose, recommend treatments, suggest medication changes, or provide clinical guidance."
- **What the spec promises:** the PRD §6 tier table, `entitlements.md` (`analytics_advanced`) and `ai-pipeline.md` (summary output `recommendations: Array<{text}>`) all promise "recommendations" in the Complete tier.
- **What is undefined:** nothing in the specs limits what a recommendation may say. The summary input (`DaySnapshot`) includes refused or held doses and out-of-range vitals, so an unconstrained model could write "consider PRN acetaminophen" or "monitor for UTI". That would be clinical advice and would break Non-Goal 4.

### Legal constraints
- **FDCA §520(o)(1)(A), administrative support.** Software for administrative support of a health care facility is **not a device**. FDA lists scheduling and practice management as examples. https://www.fda.gov/medical-devices/digital-health-center-excellence/step-2-software-function-intended-administrative-support-health-care-facility. Operational nudges belong here: overdue reviews, unfilled shifts, missing notes, overdue incident follow-ups.
- **FDCA §520(o)(1)(E), non-device CDS.** All four criteria must be met:
  1. It does not process medical images or signals.
  2. It displays or analyzes medical information.
  3. It supports or recommends to a **health care professional**.
  4. The HCP can independently review the basis, so they do not rely primarily on it.

  Sources: FDA 2022 final CDS guidance https://fda.gov/media/162880/download, superseded by the **revised CDS guidance of January 6, 2026** (adds enforcement discretion for single-output recommendations where only one is clinically appropriate; otherwise largely continuous) https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance (secondary) and https://www.acr.org/News-and-Publications/2026/fda-updates-guidance-on-clinical-decision-support
- **Key problem for Guad:** supervisors and DSPs in group homes are often **not licensed HCPs**. Some supervisors are QIDPs or RNs, most DSPs are not. FDA's guidance says functions aimed at patients or caregivers that make treatment or diagnosis recommendations **remain devices** (criterion 3 fails). Clinical recommendations to these users cannot rely on the non-device CDS exemption. The safe position is to make no clinical recommendations at all, which is exactly Non-Goal 4.
- **ONC HTI-1 DSI (45 CFR 170.315(b)(11)).** Source-attribute transparency for predictive decision support interventions applies only to **developers of ONC-certified health IT** for DSIs in their certified modules. Guad is not certified, so it does not apply directly. It is a good model for transparency. https://www.healthit.gov/sites/default/files/page/2023-12/HTI-1_DSI_fact%20sheet_508.pdf
- **Section 1557 §92.210.** Applies if recommendations become "patient care decision support". This is one more reason to keep them operational.
- **State AI-in-health laws** (e.g., California AB 3030 on GenAI patient communications) target communications to patients. Supervisor-facing summaries are lower risk, but AI labeling, which Guad already does, remains good practice.

### Recommendation for Guad (buildable)
1. **Rename "recommendations" to "Suggested next steps"** (or "Follow-ups") in the PRD, entitlements and UI. Define them as **operational and administrative only**. Update ai-pipeline.md's summary prompt and add a domain-level allowlist.
2. **Generate next steps deterministically from the `DaySnapshot`.** Use templates in `src/lib/domain/` rather than free LLM text. The LLM may only rephrase the narrative summary. Each step links to the source record so the supervisor can verify it. Allowed step types:
   - `review_notes` — "3 notes awaiting your review"
   - `fill_shift` — "PM shift at Maple House is unfilled"
   - `missing_note` — "No shift note yet for 2 people at Oak House"
   - `follow_up_med_refusal` — "Follow up on 2 refused/held doses (per your agency protocol)"
   - `ack_health_alert` — "1 out-of-range vital not yet acknowledged"
   - `incident_deadline` — "Incident #… notification due by 5 pm"
   - `clock_exception` — "2 missed punches to resolve"
   - `training_expiring` — "Training expiring for 1 staff member"
3. **Forbidden content.** A post-filter plus prompt rule drops any line suggesting a diagnosis, condition, cause, medication, dose, PRN use, treatment or care-plan change. An example of forbidden output: "may indicate infection", "consider increasing", "give". Run the fast-model classifier, or a keyword list (diagnosis terms, drug names from the agency formulary, verbs like "administer/increase/decrease/start/stop"), on any LLM-generated sentence and drop it. Log only an operation ID.
4. **Health items say "follow your protocol / contact the nurse or prescriber".** Never say what to do clinically. This mirrors the existing vital-threshold alerts, which are agency-configured thresholds, not AI.
5. **Label and transparency.** Show "Generated by Lomi from today's records. Operational reminders only, not clinical advice." Each item shows its source count and link (HTI-1-style transparency, voluntary).
6. **Tests.** Add unit tests asserting the allowlist and a red-team fixture set (snapshots with refusals and abnormal vitals) where the output contains no forbidden terms.
7. **Tier split.**
   - Professional (basic): narrative text only.
   - Complete (enhanced): highlights + suggested next steps + cross-home rollup. The value comes from prioritization and links, not clinical insight.

### Owner's business decisions
- Whether to ever pursue clinical recommendations post-v1. That would need FDA regulatory analysis, likely limited to licensed nurse users, plus clinical validation and liability review.
- The final label wording.
- Whether "trend" highlights ("refusals of X up this week") are acceptable. They are fine as descriptive statistics without interpretation.

---

## E. Report tiers: Professional vs Complete

### Legal constraints (things that cannot be paywalled)
- **HIPAA right of access, 45 CFR 164.524.** The *agency* (covered entity) must give an individual or personal representative (guardian) access to their designated record set within 30 calendar days (one 30-day extension), in electronic form if readily producible. The clock runs even when the business associate holds the data. The BAA must make PHI available for this (164.504(e)(2)(ii)(E)). https://canons.sog.unc.edu/2023/02/hipaa-and-the-right-of-access-a-qa-for-covered-entities/. OCR has run a Right of Access enforcement initiative since 2019. **Every tier that holds PHI (Professional and Complete) needs a per-person record export.** Starter holds little PHI, but timesheets reference clients by home, so the per-person export should exist there too in whatever form applies.
- **Accounting of disclosures (164.528).** The BAA must support this (164.504(e)(2)(ii)(G)). The agency needs an export of disclosures (e.g., exports sent to third parties) on every PHI tier. That means it cannot be gated behind Complete-only "audit log access". At minimum, a disclosure-accounting report per person must be available on every tier.
- **Return or destroy at termination (164.504(e)(2)(ii)(J)).** The agency must be able to get a **full data export at termination on every tier**. State record-retention rules (often 6+ years for Medicaid records; HIPAA documentation retention is 6 years, 164.316(b)(2)) mean agencies need their data when they leave.
- **Information blocking (45 CFR 171).** It applies to health care providers, certified health IT developers and HIN/HIEs. Guad is not certified, but its provider customers are actors, and export fees not agreed in writing at acquisition fall outside the fees exception (171.302). https://healthit.gov/faq/are-contractual-fees-export-electronic-health-information-ehi-using-technology-not-certified-45/. **Don't charge for, or tier-gate, EHI export for patient access or switching.**
- **Amendment (164.526)** and **MAR immutability.** Exports must include amendments (`amends_id` chains).
- **State incident and survey obligations.** These are agency duties, not Guad's. If Guad sells Care Records (incidents, MAR), an agency on Professional must still be able to produce incident records and the MAR for a state surveyor on demand. Gating them behind Complete would break the product's core promise.

### Industry standard
- **Operational and compliance reports and exports are included at base.**
  - AxisCare lists "Custom Reporting" in its base price: https://jotform.com/blog/axiscare-pricing
  - Therap sells modules, with Business Intelligence dashboards as an add-on (therap-research.md).
  - ShiftCare's higher tiers add custom forms and advanced incident management, with dashboards in higher tiers: https://www.capterra.com/p/233684/ShiftCare/pricing/
- **What vendors charge extra for:** analytics, BI dashboards, cross-site benchmarking, custom report builders, scheduled or automated delivery, API access.

### Recommendation for Guad
The proposal fits entitlements.md's flags (`reports_basic`, `reports`, plus `analytics`/`analytics_advanced`/`audit_log`/`intake` for Complete):

| Report / export | Starter (`reports_basic`) | Professional (`reports`) | Complete |
|---|---|---|---|
| Timesheets / payroll CSV, coverage log, clock-ins | ✓ | ✓ | ✓ |
| **Per-person record export (right of access): notes, MAR incl. amendments, health, incidents, goals, attendance — PDF + CSV** | ✓ (whatever exists) | ✓ | ✓ |
| **Disclosure accounting per person** (exports/shares of that person's data) | ✓ | ✓ | ✓ |
| **Full agency data export (all tables, CSV/JSON zip) — on request and at termination** | ✓ | ✓ | ✓ |
| Notes, behavior notes, MAR (scheduled/PRN/refusals), incidents, health/vitals, goal progress, attendance/services CSVs (US-39) | — | ✓ | ✓ |
| Printable per-person monthly MAR and goal progress report (ISP meeting/survey ready) | — | ✓ | ✓ |
| Incident log for state reporting (date range, severity, notification timestamps) | — | ✓ | ✓ |
| Intake/referral pipeline and room occupancy reports | — | — | ✓ (requires `intake`) |
| Full audit log export (all access events, admin review) | — | — | ✓ (`audit_log`) |
| Analytics: 4-week trends, cross-home comparison, documentation-timeliness, coverage-fill-rate, refusal trends | — | — | ✓ |
| Scheduled / emailed recurring reports, custom date-range rollups across homes | — | — | ✓ |

Notes:
- trpc-router.md and entitlements.md currently say "Complete: all report types including intake and audit". This stays, but **carve out** the per-person access export, disclosure accounting and the full agency export as **ungated** (no `requireFeature`, admin role only). Spec and implement them as `report.personRecord`, `report.disclosures` and `agency.exportAll`.
- **On downgrade or cancellation,** keep read-only export access for at least 90 days, and longer by contract. Never lock an agency out of its records.
- **Pricing.** Paywall analytics and convenience, never compliance access.

### Owner's business decisions
- Whether scheduled reports, PDFs and cross-home rollups are Complete-only or Professional.
- The post-termination export window (90 days suggested) and the format (CSV zip vs. also PDF).
- Whether the full audit log is ever offered on Professional. Disclosure accounting must be available regardless.
- Whether to charge for export assistance services. Avoid this for access and switching per 45 CFR 171.302.
