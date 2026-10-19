# Guad compliance research: incident timelines, breached passwords, deactivated users, archived homes

Researched 2026-10-19. **This is product research, not legal advice.** Direct page fetches (eCFR, Cornell LII, NIST, Google docs) were blocked by the sandbox network policy, so citations come from web-search results that quote or summarize those pages. Every figure marked **[verify]** came from a secondary source, a proposed rule version, or a source with conflicting dates. Have counsel or the agency's state contact confirm it before it ships as a preset.

Repo context read: `CLAUDE.md`, `.specify/security.md`, `.specify/offline-sync.md`, `.specify/schema.ts`, `.specify/charting-guide.md`, `.specify/therap-research.md`.

---

## 1. Critical incident reporting timelines by state

### Legal requirements

**Federal HCBS baseline: 42 CFR 441.302(a)(6), as amended by the 2024 Medicaid Access Rule**
- States must assure CMS that they operate an incident management system that "identifies, reports, triages, investigates, resolves, tracks, and trends critical incidents."
- The minimum definition of a critical incident covers:
  - verbal, physical, sexual, psychological or emotional abuse
  - neglect
  - exploitation, including financial exploitation
  - misuse or unauthorized use of restrictive interventions or seclusion
  - medication errors resulting in a telephone call to or consultation with a poison control center, an ER visit, urgent care, hospitalization or death
  - unexplained or unanticipated death
- States must use an *information system* that supports electronic collection, tracking (including investigation status and resolution) and trending of critical incident data.
- States must require providers to report critical incidents that occur during the delivery of services.
- States must investigate separately when the investigating agency does not report a resolution within the State-specified timeframes.
- Performance minimums, reported under §441.311(b)(2): at least **90%** of critical incidents must have the investigation **initiated** within the State-specified timeframe, at least 90% must be **investigated and resolved** within it, and at least 90% must have **corrective action completed** within it.
- **Federal law sets no hour-level deadline for providers.** The deadlines are state-specified.
- Applicability: the (a)(6) requirements start **July 9, 2027**. The electronic incident system requirement, (a)(6)(i)(B), starts **July 9, 2029**.
- Sources:
  - https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-C/part-441/subpart-G/section-441.302
  - https://www.law.cornell.edu/cfr/text/42/441.311
  - CMS slides: https://www.medicaid.gov/medicaid/access-care/downloads/access-final-rule-slides-september-2024.pdf
  - Final rule: https://www.federalregister.gov (Medicaid Program; Ensuring Access to Medicaid Services, 2024)
  - Background: https://www.medicaid.gov/sites/default/files/2019-12/incident-management-101.pdf

**Federal ICF/IID: 42 CFR 483.420(d)**
- Allegations of mistreatment, neglect or abuse, and injuries of unknown source, must be reported **"immediately"** to the administrator or to other officials in accordance with State law.
- Results of investigations must be reported to the administrator or officials. CMS ICF/IID guidance (Appendix J) applies a **5 working days** expectation. **[verify against SOM Appendix J]**

**Federal crime reporting: Elder Justice Act, SSA §1150B (42 U.S.C. 1320b-25)**
- Applies to long-term care facilities that receive at least $10,000 a year in federal funds. **OPWDD applies it to ICF/IIDs.**
- Each covered individual (not the facility) must report a reasonable suspicion of a crime to the State Survey Agency and to law enforcement:
  - within **2 hours** if there is serious bodily injury
  - otherwise within **24 hours**
- Penalties reach civil money penalties up to $300,000 and exclusion from federal health care programs.
- Sources:
  - https://www.govinfo.gov/link/uscode/42/1320b-25
  - https://opwdd.ny.gov/system/files/documents/2020/01/elder-justice-act-adm.pdf

**Adult Protective Services and abuse hotlines**
- These run **in parallel** to state-agency incident reporting. Every state below says the incident report does not satisfy the mandated-reporter duty.

### State timelines (provider obligations, IDD residential/HCBS)

| State | Primary channel | Initial notice | Written / follow-up | Guardian / family | APS / abuse hotline | Confidence |
|---|---|---|---|---|---|---|
| **California** (DDS, Title 17 §54327, rules amended and effective **May 1, 2026**) | Vendoring regional center (and the case-managing regional center if different). Regional center reports to DDS within 2 working days. | **24 h** from learning of the incident | Written SIR within **48 h** | Not a separate SIR clock (check the IPP and regional center contract) | Separately required under the Elder/Dependent Adult Act (W&I 15630): **phone immediately**, written SOC 341 within **2 working days**. Physical abuse in a long-term care facility with serious bodily injury: law enforcement within **2 h**. | High (DDS FAQ June 2026) |
| **Texas** (HHSC; HCS/TxHmL via CIMS; ICF/IID via TULIP) | DFPS (HCS/TxHmL) or HHSC Complaint & Incident Intake (ICF/IID) | ANE: **immediately, no later than 1 hour** (26 TAC §565.31; HHSC PL 2025-02 for ICF/IID) | Critical incident data in CIMS, historically 30 days after month end **[verify current CIMS deadline]**. Death: HHSC and service coordinator by **end of next business day** (Form 8493, 40 TAC 9.178(r)). | LAR deadline not found **[verify]** | DFPS hotline is the ANE channel | Medium |
| **New York** (OPWDD, 14 NYCRR Part 624; Justice Center) | Agency CEO/designee, then OPWDD (IRMA); Justice Center VPCR for reportable incidents | Reportable incidents and serious notable occurrences: **immediately**. Justice Center: immediately by phone. Deaths: Justice Center death line within **24 h**. | Initial written/IRMA within **24 h** **[verify, 2011 ADM]**. Minor notable occurrences: **48 h**. | Qualified person by phone "as soon as reasonably possible"; written follow-up about **10 days** **[verify, Part 624 handbook]** | Justice Center VPCR is the abuse channel | Medium |
| **Florida** (APD, Rule 65G-2) | APD Regional Office | Critical incidents: **1 h** on the APD web page vs. **4 h initial notice / report within 1 day** on the Dec 2025 form **[conflict, verify 65G-2.010]** | Reportable incidents: **1 business day**. Follow-up: **5 business days**. | Not specified in sources found | Florida Abuse Hotline **immediately** (1-800-962-2873) | Medium |
| **Pennsylvania** (55 Pa. Code ch. 6100, §6100.401–404) | ODP Enterprise Incident Management (EIM) | **24 h** from staff discovery for death, abuse, neglect, exploitation, missing person, serious injury, ER visit, hospitalization and similar. **72 h** for restraint use and certain medication errors. | Final report within **30 days** (extension needs written notice) | Individual and their designated persons within **24 h**, documented (§6100.401(c)–(d)) | Also Adult Protective Services / Older Adults Protective Services Act reporting | High |
| **Ohio** (DODD, OAC 5123-17-02, replaced in 2025) | County board of DD | MUI: county board within **4 h** for abuse, exploitation and similar; immediate action plan | Written report to county board by **3 p.m. on the first working day** after **[verify, proposed-version chart]** | Guardian **same day** (DODD family guide) | Ohio APS / law enforcement where applicable | Medium |
| **Massachusetts** (DDS, 115 CMR 13.00; DPPC) | DDS Area Office (HCSIS) | Major-review incidents: **verbal immediately** on discovery | Initial written report: **1 business day** (major) or **3 business days** (minor). Final report within **7 calendar days** (DDS Incident Mgmt Guidelines §VI). | Per guidelines **[verify]** | DPPC report by mandated reporters (M.G.L. c.19C: oral immediately, written within 48 h **[verify]**) | Medium |
| **Illinois** (DHS OIG, 59 Ill. Adm. Code 50) | OIG Hotline | Allegations of abuse, neglect, financial exploitation, and injuries or deaths where abuse/neglect is suspected: **immediately, no later than 4 h** | OIG assesses within 1 day. Agency completes its own inquiry for referred matters. | Guardian notified by the authorized representative in writing when OIG opens a case **[timing unverified]** | OIG is the channel for DD programs. Adults 60+ and other settings go to APS. | Medium |

Sources:
- **CA**
  - https://www.dds.ca.gov/wp-content/uploads/2026/06/FAQsAboutSpecialIncidentReporting_20260612.pdf
  - https://www.dds.ca.gov/transparency/laws-regulations/emergency-and-proposed-regulations/special-incident-reporting-sir/
  - https://cdss.ca.gov/cdssweb/entres/forms/english/soc341a.pdf
  - https://www.sfhsa.org/node/611
- **TX**
  - https://www.law.cornell.edu/regulations/texas/26-Tex-Admin-Code-SS-565-31
  - https://ams-prod.uhcprovider.com/content/dam/provider/docs/public/commplan/tx/hhs-messages/TX-HHSC-Alert-Reporting-Incidents-ANE.pdf
  - https://hhs.texas.gov/providers/long-term-care-providers/long-term-care-provider-resources/critical-incident-management-system-cimstm
  - https://www.hhs.texas.gov/handbooks/home-community-based-services-handbook/14500-death-reviews
- **NY**
  - https://regulations.justia.com/states/new-york/title-14/chapter-xiv/part-624/section-624-5
  - https://opwdd.ny.gov/notification-sheet-categoriesclassifications-incidents-requiring-reporting-112016
  - https://opwdd.ny.gov/adm-2011-03-required-format-reporting-incidents-and-allegations-abuse
- **FL**
  - https://apd.myflorida.com/providersupports/incidentreporting.htm
  - https://apd.myflorida.com/resources/notices/APD%20Incident%20Reporting%20Form%20OP%203-0006%20(December%202025).pdf
- **PA**
  - https://www.law.cornell.edu/regulations/pennsylvania/55-Pa-Code-SS-6100-401
  - https://regulations.justia.com/states/pennsylvania/title-55/part-viii/subpart-c/chapter-6100/incident-management/section-6100-404
- **OH**
  - https://www.law.cornell.edu/regulations/ohio/Ohio-Admin-Code-5123-17-02
  - https://registerofohio.state.oh.us/rules/search/details/hearingSummaryReport/881120/ruleAction/662063
- **MA**
  - https://www.mass.gov/regulations/115-CMR-13-incident-reporting
  - https://www.mass.gov/info-details/dds-did-not-ensure-that-its-provider-operated-group-homes-submitted-and-finalized-incident-reports-within-the-prescribed-timeframes
- **IL**
  - https://www.law.cornell.edu/regulations/illinois/Ill-Admin-Code-tit-59-SS-50.20
  - https://www.ilga.gov/ftp/JCAR/AdminCode/059/059000500000200R.html

### Industry standard (competitors)
- **Therap GER** has a fixed, generic structure:
  - event types
  - a **Notification Level** picklist (High / Medium / Low, shown on reviewers' To Do lists as red / orange / yellow)
  - submit and approve steps
  - linked external notifications by HIPAA-compliant text or email
- **The deadlines themselves are set per state, not per agency.** The state DD agency is often a Therap "oversight" customer, and it publishes a state GER guide that maps events to a level and a clock. Examples:
  - Nebraska: medium and high events go to the service coordinator ASAP, the GER within 24 h, and approval within 72 h. Low events are not reportable.
  - Alabama: Level of Harm 3–4 must be submitted and approved within 24 h.
  - New Mexico and North Dakota have their own grids.
- So the industry pattern is **state presets, with each agency choosing which events it uses and who gets notified**.
- Sources:
  - https://www.therapservices.net/whitepaper/Therap-Incident-Management-System.pdf
  - https://www.therapservices.net/resources/newmexico/DDSD-GER_Provider_Guide_Revised_10_19_16.pdf
  - https://www.therapservices.net/resources/northdakota/PnA-GENERAL-EVENT-REPORT-GRID-8-1-11.pdf
  - https://mh.alabama.gov/wp-content/uploads/2023/12/Appendix-A-Critical-Incident-Crosswalk-2023.12.pdf
- `therap-research.md` also notes users missing state-mandated deadlines during Therap outages. A clock that keeps running and alerts while offline is a real advantage.

### Recommendation for Guad
1. **Data model.** Add an agency-owned table, `incident_reporting_rules`: `agency_id`, `incident_type` (plus an optional severity or injury condition), `recipient` (`state_agency | guardian | aps_hotline | law_enforcement | case_manager | internal_admin`), `deadline_kind`, `deadline_minutes`, `label`, `citation_text`, `source_preset`, `source_preset_version`, `edited_by`, `edited_at`.
   - `deadline_kind` is one of `elapsed` (minutes), `business_days`, `next_business_day_at` (for example 15:00), or `same_day`.
   - Each rule is a row in the agency's own table, so an edit changes only that agency's copy.
   - It needs RLS in `rls.sql` (via a new sql-patch) and admin-only writes.
2. **Presets.** Ship versioned presets in `src/lib/domain/incident-deadlines/presets/{ca,tx,ny,fl,pa,oh,ma,il}.ts`. They are pure data, each with a citation and a `last_reviewed` date.
   - On agency provisioning, or when the admin picks a state in settings, copy the preset into the agency's rows. The admin must confirm with this text: "Guad's state presets are a starting point compiled from public sources and are not legal advice. Your agency is responsible for confirming them with your state."
   - Also ship a "federal minimum" preset (EJA 2 h / 24 h for ICF/IID, otherwise blank) for states without a preset.
3. **Clock start.** Every deadline runs from **discovery time**, the time staff learned of the incident, not from `occurred_at`. PA, CA and NY all count from discovery or "learning of".
   - Add `discovered_at` to `incidents`. It defaults to the time the record was created on the device, which is the offline-safe timestamp, and is editable backward with a reason.
4. **Pure domain function.** Put `computeDeadlines(incident, rules, agencyTimeZone, holidays)` in `src/lib/domain/`. It returns one obligation per recipient: `{recipient, due_at, label, citation}`. The phone and the server use the same function, so the caregiver sees "Report to regional center by 3:14 PM tomorrow" while offline.
5. **Tracking.** Add an `incident_notifications` table (one row per obligation): `due_at`, `completed_at`, `completed_by`, `method`, `reference_number` (for example a state intake or IRMA number), `note`.
   - Notifications escalate as the deadline approaches and when it is missed, following notifications.md.
   - Supervisor dashboard: "Due in < 1 h" and "Overdue". This replaces or extends the free-text `notified_parties`.
6. **Guad does not file with the state.** It records that filing happened. State systems (CIMS, IRMA, EIM, HCSIS, CA SIR) are separate portals.
   - Offer a "copy report text" or export for each state form later.
   - Do not auto-submit anything to a state agency.
7. **Mandated-reporter banner.** Abuse, neglect and exploitation (ANE) types always show "If someone is in danger call 911. Reporting here does not replace your personal duty to report to [APS/hotline from preset]". This matches CA, FL, MA and TX rules.
8. **Audit and retention.** Rule edits and obligation completions are audited automatically by the existing `audit_row_change` trigger. When a rule changes, existing incidents keep the deadlines they were assigned at creation. Snapshot `due_at` onto the notification row so history never re-computes.

### Needs owner or lawyer decision
- Whether to ship presets at launch, or only "agency-configured with a reference sheet". Presets with incorrect hours create liability.
- Every **[verify]** item above: FL 1 h vs 4 h, OH 3 p.m., TX CIMS cadence and LAR, NY guardian timing, MA DPPC written window, IL guardian timing.
- Who owns preset maintenance and the review cadence (rules changed in CA in May 2026 and in OH in 2025).
- Whether ICF/IID agencies need the EJA 2 h / 24 h obligation per individual staff member, not per agency.
- **Spec/MVP:** check whether the MVP incident wizard's severity step already implies deadlines. If so, flag the disagreement with this model.

---

## 2. Breached-password checks

### Legal requirements and standards
- **NIST SP 800-63B-4** (final, published **July 2025**; https://csrc.nist.gov/pubs/sp/800/63/b/4/final, https://pages.nist.gov/800-63-4/sp800-63b.html):
  - When a password is established or changed, verifiers **SHALL** compare it against a blocklist of commonly used, expected or **compromised** passwords. The whole password is compared, not substrings.
  - Minimum length is **15** when the password is a single factor, and **8** when it is used only as part of MFA.
  - Composition rules (character-type mixes) are **SHALL NOT**. Periodic rotation is **SHALL NOT**, except on evidence of compromise.
  - Verifiers must rate-limit failed attempts.
  - FAQ: https://pages.nist.gov/800-63-FAQ/
- **HIPAA** does not name breached-password checks. The relevant provisions are:
  - 45 CFR 164.308(a)(5)(ii)(D), password management (addressable)
  - 164.312(d), person or entity authentication
  - 164.308(a)(1), risk analysis
- HHS/OCR expects "recognized security practices". The 2021 HITECH amendment (Pub. L. 116-321) explicitly lets OCR consider NIST-based practices when setting penalties. Following 800-63B-4 is the defensible standard.

### What Identity Platform offers
- **Password policy** (https://docs.cloud.google.com/identity-platform/docs/password-policy):
  - minimum length 6–30, maximum length up to 4096
  - optional uppercase / lowercase / numeric / non-alphanumeric requirements
  - modes **Require** or **Notify**
  - can be set per project or per tenant
- **It has no leaked-password or blocklist check and no password history.** This matches what `security.md` already states.
- **Blocking functions** (beforeCreate / beforeSignIn) never receive the password, so they cannot be used for this.
- **reCAPTCHA Enterprise / Fraud Defense "Password defense"** (https://docs.cloud.google.com/recaptcha/docs/check-passwords):
  - Google's own leaked-credential check using Password Checkup (private set intersection over a hash prefix).
  - Billed per assessment, with a free monthly tier **[verify pricing]**.
  - It is a separate API call from the Identity Platform integration. Identity Platform's reCAPTCHA integration (https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise) only does bot scoring on sign-in, sign-up and password reset.
  - Identity Platform is on Google's HIPAA covered-products list. reCAPTCHA Enterprise / Fraud Defense coverage is **unconfirmed** (https://cloud.google.com/security/compliance/hipaa).

### HIBP Pwned Passwords range API
- `GET https://api.pwnedpasswords.com/range/{5-hex SHA-1 prefix}`
- Free, no API key, requires a User-Agent. Send `Add-Padding: true` to hide the response size.
- Only the 5-character prefix leaves the server. Each prefix matches hundreds of suffixes.
- The corpus can also be **downloaded and self-hosted**, which avoids any third-party call.
- Sources:
  - https://haveibeenpwned.com/NIST
  - https://blog.cloudflare.com/validating-leaked-passwords-with-k-anonymity/

### HIPAA/BAA analysis
- A password, or a 5-character prefix of its unsalted SHA-1, is **not PHI**. It is not health information and does not identify an individual.
- No PHI is sent, so HIBP is not a business associate and **no BAA is needed**.
- The residual exposure is metadata (Guad's server IP and the time of a password change). That is negligible if the call is made server-side, with no user identifier and no email.
- Record it in the subprocessor and vendor list as "receives no PHI", like the FCM entry.

### Recommendation for Guad
1. **Route every password set (sign-up via invite, change, reset completion) through one server endpoint**, for example `auth.setPassword`. The endpoint:
   - validates length
   - checks HIBP with padding, a 2-second timeout and a fail-**open** policy that logs the event without the password
   - checks `password_history`
   - calls Admin SDK `updateUser`

   Disable or hide the client-SDK password-change paths. This matches the existing implementation note in `security.md`.
2. **Threshold:** reject on any count ≥ 1. Message: "This password has appeared in a data breach. Choose a different one."
3. **Option to add later:** self-host the HIBP corpus (k-anonymity range files in Cloud Storage), if the owner wants zero external calls.
4. **Option instead of HIBP:** reCAPTCHA Password defense, only if Google confirms it is BAA-covered and the cost is acceptable.
5. **Fix the password policy in `security.md`, which conflicts with 800-63B-4:**
   - Drop the uppercase/lowercase/digit **composition rules**. They are "SHALL NOT" in rev 4.
   - Set the minimum length: 15 if any role can sign in with password only. Caregivers have no MFA requirement per the security.md table, so 15 for caregivers. A minimum of 8–10 is acceptable only where TOTP is enforced.
   - Simplest option: **minimum 12–15 for everyone, no composition rules**.
   - Configure Identity Platform's policy as length-only in "Require" mode.
6. **Password history:** 800-63B-4 doesn't require it. It is harmless but optional, so keep it low priority.
7. **Also check at sign-in (optional):** if the stored password is found in HIBP on a successful login, force a change. 800-63B allows forcing a change on evidence of compromise.

### Needs owner decision
- Minimum length (15 vs 12) and whether caregivers ever get MFA.
- External HIBP API or a self-hosted corpus.
- Whether the security.md change, which drops composition rules, is approved. The current spec contradicts NIST.

---

## 3. Deactivated user with unsynced offline writes

### Legal requirements
- **HIPAA termination procedures**, 45 CFR 164.308(a)(3)(ii)(C) (addressable): implement procedures to terminate a workforce member's **access** to ePHI when employment ends. The rule is about future access. It does not say to destroy records the person already created in the course of their work.
  - https://myctrl.tools/frameworks/hipaa-security/164-308-a-3-ii-c
  - https://www.bricker.com/insights/resources/key/hipaa-security-regulations-administrative-safeguards-164-308
- **Integrity**: 164.312(c)(1) protects ePHI from improper alteration or destruction. Silently discarding care documentation conflicts with this.
- **Documentation and billing integrity**: Medicaid requires records that "fully disclose" services furnished (42 CFR 431.107, as cited in MA HCBS provider agreements), and services without documentation are overpayments. A MAR dose that was given but never recorded is also a medication-safety risk: the next shift may give a double dose.
- **Late entries**: CMS Program Integrity Manual ch. 3 §3.3.2.5 says amendments, corrections and **delayed entries** must be clearly identified as such, with the date and author, and the original content kept.
  - https://www.cmadocs.org/newsroom/news/view/ArticleId/31539/Coding-Corner-Provider-queries-and-addendums-in-the-medical-record
  - https://icd10monitor.medlearn.com/making-late-entries-addendums-and-corrections-to-the-medical-record-warrants-a-proactive-strategy/
- **Abuse and incident duties**: an incident written offline by a now-terminated worker may be the only report of a reportable event. Dropping it can cause a missed state deadline (see Q1).

### Industry standard
- **EVV vendors** (HHAeXchange, Sandata) capture offline and upload when connectivity returns. Visits that can't be captured are handled through **manual "visit maintenance"** with reason codes, not dropped. PA DHS: "if a visit cannot be captured at the point of care, a manual entry ... will be required."
  - https://www.dhs.pa.gov/providers/Billing-Info/Documents/EVV%20Public%20Meeting%20Q%20and%20A%208.14.20.pdf
  - https://info.hhaexchange.com/hubfs/EVV%20Made%20Simple%20_%20PPT%20Final.pdf
  - https://medquest.hawaii.gov/content/dam/formsanddocuments/resources/Provider-Resources/electronic-visit-verification/Sandata%20SMC%20Guidance.pdf
- I found no public vendor documentation specifically about terminated users with pending offline data.
- The common EHR pattern is: access is revoked immediately, records made during employment stay attributed to the original author, and late or held entries enter a review or exception queue.

### Guad's spec today: internal conflict
`offline-sync.md` contradicts itself:
- **§ Logout and Session Events, "Account deactivation" row:** queued writes are "uploaded with the deactivated user's identity and flagged for supervisor review ... before local data is cleared". This is the correct direction.
- **§5 upload flowchart, "RLS violation (e.g., user deactivated)":** "Remove from local DB, force re-auth". This **drops data**.
- **Test case 6:** "All writes are rejected ... Local data is cleared". This also **drops data**.

These need to be reconciled before building.

### Recommendation for Guad
1. **Never silently drop.** A write rejected because the author was deactivated is *quarantined* on the server, not deleted on the device.
2. **Acceptance rule.** Accept into quarantine any queued write whose device-recorded `created_at` (or `occurred_at` / `administered_at`) is **at or before** `profiles.deactivated_at`, plus a small skew allowance (for example 5 min).
   - Writes stamped *after* deactivation are still captured, but as `suspect_after_deactivation`.
   - Never auto-accept a write into the live record.
3. **How the upload is accepted.** The device has lost its normal access, so `sync.upload` needs a narrow path, using a short-lived "final upload" token or the still-valid PowerSync upload credential:
   - The deactivated user can **write only to `quarantined_uploads`**, and only for their own queued rows.
   - It gives no reads and no sync download.
   - This satisfies HIPAA termination: no access to ePHI. They can only hand over what they already wrote.
   - Alternative: the device keeps the encrypted queue, and an admin-initiated "recover device queue" signs in on that device. This is clumsier.
4. **`quarantined_uploads` table.** Columns: `agency_id`, `author_profile_id`, `table`, `payload` (jsonb), `client_created_at`, `received_at`, `reason`, `status` (`pending | accepted | rejected`), `reviewed_by`, `reviewed_at`, `review_note`.
   - It is audited and RLS-limited to supervisors and admins.
   - It keeps rejected items. They are retained, not deleted.
5. **Supervisor review.**
   - "Accept" runs the same service function as normal upload (note, mar, incident) **as a late entry**:
     - `author_id` = the original caregiver
     - original timestamps kept
     - `late_entry = true`, `accepted_by`, `accepted_at`
   - MAR acceptance goes through the duplicate-dose-slot check. Conflicts become `amends_id` / conflict records as usual, never edits.
   - Incidents accepted from quarantine immediately start the Q1 deadline clocks, backdated to `discovered_at`. Alert the supervisor with high priority because a deadline may already be close or past.
   - "Reject" requires a reason. Rejected rows are kept for the retention period.
6. **Device side.** After the server acknowledges quarantine receipt, clear the local DB. Until then, keep it encrypted. This is consistent with "logout never loses work".
7. **Signature semantics.** Notes the user had **signed** (submitted) offline keep that signature with its original time. **Drafts** come in as drafts flagged "author no longer active". A supervisor can complete them only as their own addendum, never by signing in the departed user's name.
8. **Notification.** When a deactivated user's device uploads to quarantine, notify the agency's supervisors and admins: "[n] records from a deactivated account are waiting for review". The notification itself carries no PHI.
9. **Tests.** Replace offline-sync test 6 with: deactivate the user while offline, create a MAR dose and an incident, go online, and verify that rows land in quarantine, local data is cleared only after acknowledgement, a supervisor accepts, and the records appear with `late_entry`.

### Needs owner or lawyer decision
- How long quarantined items may wait before escalation, and whether unreviewed MAR quarantine blocks the next med pass. Recommendation: show it on the eMAR as "pending review: dose may have been given at 08:02".
- The grace window and how to treat writes timestamped after deactivation. Device clocks can be wrong or changed.
- Whether the "final upload" credential is acceptable under the agency's own HIPAA termination policy. The recommendation's position: yes, it is write-only.
- **Fix the spec conflict** (§5 flowchart and test 6 vs the deactivation row).

---

## 4. Archiving a home (closing a group-home location)

### Legal requirements: retention
- **HIPAA**: 45 CFR 164.316(b)(2) and 164.530(j) require keeping *policies, procedures and required documentation* for **6 years** from creation or last effective date. This applies to compliance documentation (for example audit logs and policies), not to the medical record itself.
- **Medicaid provider records**:
  - 42 CFR 431.107 provider agreements require records that fully disclose services. States commonly set **6 years** (MA HCBS provider agreement, CO, LA).
  - **Medicaid managed care**: 42 CFR 438.3(u) requires **10 years** for MCOs and their subcontractors/network providers. Many IDD providers bill through MCOs (TX, FL, NY, PA CHC, IL), so 10 years is often the binding floor.
- **ICF/IID**: 42 CFR 483.410(c) requires a client recordkeeping system, with retention per state law. *Note:* 42 CFR 483.70 is the nursing-facility (SNF/NF) rule: state law period, otherwise **5 years** from discharge, or 3 years after a minor reaches majority. It is not the ICF/IID section, but states often borrow it.
- **State examples**:
  - LA ICF: the longest of audit resolution, 3 years after discharge, or 3 years after a minor turns 18
  - OH ICF cost records: 7 years
  - Alaska: closure-keyed schedule with a 10-year component
- **False Claims Act** look-back: 6 years, up to 10 under 31 U.S.C. 3731(b). This is the practical reason providers keep records 7–10 years.
- **Closure does not end obligations.** Records must remain retrievable for surveys, audits, investigations and litigation holds. Several states require a records-custody plan when a facility closes.
- Sources:
  - https://www.mass.gov/doc/massachusetts-medicaid-program-provider-agreement-and-acknowledgement-of-terms-of-participation-for-home-and-community-based-services-waivers-gen-hcbs-rev-125-0/download
  - https://hcpf.colorado.gov/sites/hcpf/files/HCPF%20IM%2021-029%20Retainer%20Payment%20Record%20Retention.pdf
  - https://www.ldh.la.gov/assets/medicaid/PC-PM/1.25.24/CCW-7.7-RecordKeeping-01.24.24-PC.pdf
  - https://providernews.anthem.com/virginia/article/notice-of-regulatory-amendment-related-to-medicaid-participating-providers-and-facilities
  - https://www.kslaw.com/attachments/000/005/470/original/ca111317.pdf
  - https://state-rules.com/louisiana/lac/VII.30701/
  - https://www.in.gov/health/reports/QAMIS/ltccr/kjri11_2567.pdf (quotes 483.70 tiers)

`security.md` already sets clinical retention at **7 years from last service, or longer per state law** and audit retention at 7 years. Given 438.3(u), **10 years is the safer default** for agencies billing through MCOs.

### Industry standard
- EHRs and care platforms (Therap, and practice-management systems generally) **deactivate or close** programs and sites rather than deleting them. The site disappears from pickers, scheduling and billing, while historical records stay searchable and reportable under the old site name, read-only.
- Reopening is allowed.
- Hard delete is only allowed for records created in error with no clinical data. Otherwise it is an operator-only action after retention expires.

### Repo state
- `schema.ts` already has `homes.archived_at` ("keeps all its records, read-only: no new clock-ins, shifts, admissions or rooms ... Reversible").
- **Hazard:** a hard `DELETE FROM homes` would **cascade-delete** these tables:
  - `messages` (can be PHI and may reference incidents and clients)
  - `message_photos`, `message_reads`
  - `schedule_slots`, `schedule_templates` (staffing records that matter for EVV, billing and staffing-ratio audits)
  - `coverage_requests`
  - `rooms`

  Clinical tables (`notes`, `mar_records`, `incidents`, `health_entries`, `clock_records`, `controlled_counts`, `clients`) are `restrict`, which is good.

### Recommendation for Guad
1. **Archive, never delete**, through `home.archive` / `home.unarchive` (admin only, MFA, audited by trigger). Require these first:
   - **no current clients assigned.** Block with "Discharge or transfer N people first". The discharge or transfer flow records the date, which starts each client's retention clock.
   - **no open shifts or clock-ins**
   - **no open incidents or unresolved incident-notification obligations.** Warn, or block for anything overdue.
   - **future schedule slots and coverage requests are cancelled** with reason "home closed". Don't delete them.
2. **Effects while archived:**
   - Hidden from: scheduling, clock-in geofence ranking (`rankHomes`), home pickers, caregiver home lists, new admissions, rooms, new messages.
   - Still visible in: reports, exports, audit, person history, incident history, and supervisor and admin search, with an "Archived <date>" badge, read-only.
   - Enforcement: RLS or trigger-level blocks on INSERT/UPDATE of home-scoped tables where `homes.archived_at IS NOT NULL`, through a new sql-patch. These are the backstop to service checks, per CLAUDE.md rules.
   - **PowerSync:** add `archived_at IS NULL` to caregiver streams so devices drop the archived home's data. The 30-day window would age it out anyway. Supervisors and admins don't need it on device; they can use tRPC for history.
   - Remove the archived home from caregivers' `home_ids`. Keep the history of the assignments.
3. **Reversible:** unarchive clears `archived_at`. Nothing was deleted, so nothing needs restoring.
4. **Hard delete:** no UI. Change `onDelete: 'cascade'` to `'restrict'` for `messages`, `message_photos`, `schedule_slots`, `schedule_templates`, `coverage_requests` and `rooms` (or at least the first five). A home with history can then never be deleted by accident. An operator purge job after retention expiry is a later, separate item, with crypto-erase per security.md.
5. **Retention clock:** compute per client from the last service date, not per home. Store `retention_until` on discharge. Default to 10 years when the agency flags MCO billing, otherwise 7 years, configurable upward only. Add a `legal_hold` flag at agency and client level.
6. **Billing:** an agency's plan tier may count active homes. Archived homes shouldn't count, but their data still has to be stored. That is a pricing decision for the owner.

### Needs owner or lawyer decision
- Default retention: **7 vs 10 years**, and whether to vary it per state or by MCO status.
- Whether archive is blocked or only warned when clients are still assigned or incidents are open.
- Whether to change the cascade FKs now (a schema migration) or rely on "no delete endpoint".
- Whether archived homes count toward plan or tier limits.
- Records-custody obligations if the *agency itself* closes. This is partly covered by "Agency termination" in security.md.
