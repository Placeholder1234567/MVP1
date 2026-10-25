# Decisions: phone sync scope, referral stages, offline PIN guessing

Researched 2026-10-25 for three open questions. **Product research, not legal advice.** The sandbox blocked direct page fetches (NIST, PowerSync docs), so the citations below come from web-search results that quote or summarize those pages. Items marked **[verify]** came from secondary sources.

---

## 1. Should caregivers' phones sync only their own homes and colleagues?

**Decision: yes.** Phones get exactly what the server's RLS lets that user read, with one deliberate addition: every user can see the agency's supervisors and admins.

### What the spec said

- `offline-sync.md` §4 said caregivers get home-scoped data.
- Two lines later it listed homes and staff profiles as "synced to everyone in the agency."
- The streams did the second. Every caregiver's phone held:
  - every home's address and coordinates;
  - every staff member's name, email and phone, across all homes.
- RLS (`homes_select`, `profiles_select`) already hid those rows from the same caregiver online. The phone held more than the server would ever show that user.

### Standards and practice

- **HIPAA minimum necessary** (45 CFR 164.502(b), 164.514(d)):
  - Covered entities identify which workforce roles need which information and "make reasonable efforts to limit the access" to it.
  - Role-based access is the usual way to meet this.
  - Staff contact details are not PHI. Home addresses are not PHI on their own. But a group-home address tied to "residents with IDD" is sensitive, and the principle still applies to what we push onto devices.
  - Sources: https://humanservices.vermont.gov/humanservices/sites/ahsnew/files/minimum_necessary.pdf, https://www.accountablehq.com/post/hipaa-minimum-necessary-standard-explained-definitions-exceptions-and-enforcement-risks
- **HHS mobile-device guidance:**
  - Asks for risk analysis covering portable devices that hold ePHI.
  - Asks that applications have only the access they need.
  - Source: https://www.hhs.gov/sites/default/files/ocr/privacy/hipaa/administrative/securityrule/remoteuse.pdf
- **PowerSync's own guidance:**
  - RLS is authoritative for writes.
  - Sync rules "will generally mirror your RLS setup," so users only download what they could read.
  - Sources: https://docs.powersync.com/integrations/supabase/rls-and-sync-streams, https://docs.powersync.com/integration-guides/supabase-+-powersync/rls-and-sync-rules
- **Therap (the incumbent):**
  - Access follows the user's caseload. "If you do not have the right individuals on your caseload you cannot access their information."
  - Source: https://nmhealth.org/publication/view/form/7459

### Repo facts that shaped the details

- Caregivers never act on other homes:
  - Coverage offers go only to staff trained at the home (`eligibility.ts` `not_trained_at_home`).
  - Clock-in, board posts and charting are home-scoped.
  - The client already filtered homes for caregivers in `session.svelte.ts`. So limiting the synced homes changes nothing visible.
- Caregivers **do** need their supervisors, even ones with no assigned homes:
  - Their names appear on returned notes and board posts.
  - Any supervisor may witness a controlled-substance count.
- Under the old `profiles_select`, a supervisor with no assigned homes was invisible to caregivers. The online witness check reads the witness profile under the caregiver's RLS, so it refused that supervisor even though the rule allows any supervisor. This was a latent bug.

### What shipped

- **`homes` stream:** caregivers get their `home_ids`; supervisors and admins get every home in the agency. This is the same rule as `homes_select`.
- **`profiles` stream:** caregivers get colleagues who share a home, plus the agency's supervisors and admins. Supervisors and admins get everyone in the agency.
- **`sql-patches/0017`:** adds "supervisors and admins are visible to their agency" to `profiles_select`, so RLS and sync stay identical.
- **Not changed:** other homes' caregivers stay hidden. Nothing crosses agencies. Tests cover both, in the SQL RLS suite and the PowerSync streams suite.

---

## 2. Should referral stages follow a fixed order, and can a referral move back?

**Decision: stages have a normal forward order, but they are not a strict line.**

- Skipping forward is allowed.
- Moving back, or reopening a declined referral, is allowed only with a written reason. The reason is kept as a stage note.
- `placed` stays terminal and is reached only through admission. That rule already existed.

### Standards and practice

- **Intake is not linear in practice.** State and county IDD intake runs inquiry → application/eligibility → decision → placement **or waitlist**. Waitlists resolve when a slot opens. Decisions can be appealed and revisited.
  - Bexar County interest list: https://aacog.gov/IDDServices
  - Alaska registry ranked by score and slot availability: https://health.alaska.gov/media/y1phiqey/processforaccessingiddserviceseo22123.pdf
  - Multnomah County 90-day contested-case hearing: https://www.multco.us/dd/intake-eligibility
  - Wayne County residential referral (assessment, provider identification, consent, then authorization): https://www.dwihn.org/providers-residential-referral-process.pdf
  - So `waitlist → accepted`, `accepted → waitlist` (a bed falls through) and `declined → inquiry` (circumstances change, or an appeal succeeds) are all real events.
- **FHIR Task**, the HL7 workflow model for referrals and orders:
  - A normal forward path (requested → ready → in-progress → completed).
  - Non-terminal states can be suspended and resumed.
  - Separate terminal states.
  - Sources: https://www.hl7.org/fhir/STU3/Task.html, https://fhir.ch/ig/ch-umzh-connect/workflow-states.html
- **Pipeline and CRM practice:**
  - Each stage gets an order number.
  - Backward moves are allowed but recorded with who, when and why, so they show up in review instead of hiding.
  - Sources: https://modelmonkey.io/guides/track-stage-regression-sales-pipeline-crm, https://www.silverdale.us/blog/silverdale-apps-13/sme-pipeline-stage-change-history-4267

### Rule

- **Order:** `inquiry (1) → touring (2) → accepted | waitlist (3) → placed (4)`. `declined` is a closed state reachable from any open stage.
- **Moves that need no reason:**
  - Forward moves, including skips. An emergency placement can go straight from inquiry to accepted without a tour.
  - `accepted ↔ waitlist`. Both are "decided"; which one depends on whether a bed is open right now.
  - Moves to `declined`. The decline itself is the reason, and staff are prompted to add a note.
- **Moves that need a reason:**
  - Backward moves (for example accepted → touring, waitlist → inquiry).
  - Reopening a declined referral.
- **The reason:** kept as an append-only `referral_notes` row at the new stage. The `audit_row_change` trigger already records the status change itself.
- **`placed`:** only through `convertToClient` and never reopened (existing rule).

---

## 3. How to limit offline PIN guessing

**Decision:** where the device supports it, bind the wrapped database key to a hardware-backed passkey using the WebAuthn PRF extension, **combined with** the PIN. Where PRF is unavailable, keep today's PIN-only wrapping as a documented, reduced-assurance fallback. Do not add a server-held pepper or longer PINs.

### The problem

- The database key is wrapped with PBKDF2-SHA256 (600k iterations) from a 6–8 digit PIN.
- The 5-try limit is a counter in the same OPFS file, so it stops only someone using the app.
- Someone who copies the browser's storage off a lost phone can try all 10^6 six-digit PINs offline.
- At roughly 10–20 PBKDF2-600k guesses per second per GPU **[verify, depends on hardware]**, that takes hours to about a day.

### Standards

- **NIST SP 800-63B-4:**
  - Defines an unlock PIN as an *activation secret*.
  - When an authenticator verifies its activation secret locally, "verification SHALL be performed within a hardware-based authenticator or in a secure element (e.g., TEE, TPM)."
  - Activation-secret length: reported as SHALL ≥ 4, SHOULD ≥ 6 **[verify against the final text]**.
  - A software check of a short PIN against data stored next to it does not meet this. Hardware-held verification does.
  - Sources: https://pages.nist.gov/800-63-4/sp800-63b.html, https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf
- **OWASP MASVS:** asks for hardware-backed key storage (Android Keystore, Secure Enclave) where available. Sources: https://opensecurityarchitecture.org/frameworks/owasp-masvs-v2/coverage, https://jmrp.io/tools/pin-brute-force-calculator/
- **WebAuthn PRF** (the `prf` extension, built on CTAP2 `hmac-secret`):
  - Lets a web app get a stable 32-byte secret from a passkey after the user verifies on the device.
  - It is the browser's only route to hardware-held key material.
  - Bitwarden and 1Password use it to unlock encrypted vaults.
  - Support **[verify per release]**:
    - Chromium 116+ on desktop.
    - Chrome on Android with Google Password Manager passkeys, on by default from about Chrome 130.
    - Safari 18+ on iOS, iPadOS and macOS with iCloud Keychain passkeys.
    - Detect at runtime with `PublicKeyCredential.getClientCapabilities()`.
  - Sources: https://www.corbado.com/blog/passkeys-prf-webauthn, https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html, https://bitwarden.com/blog/prf-webauthn-and-its-role-in-passkeys/, https://groups.google.com/a/chromium.org/g/blink-dev/c/iTNOgLwD2bI

### Why not the other two options

- **Server-held pepper:** the PIN exists to unlock **offline**. A pepper that must come from the server does nothing offline, and a pepper cached on the device is no longer a pepper. The idea of the server releasing a key share after checking the PIN is the same thing, and Bitwarden's community has only discussed it, not built it (https://community.bitwarden.com/t/prevent-brute-force-attacks-on-the-pin-encrypted-master-key/54010).
- **Longer PINs:**
  - An 8-digit PIN raises the work 100×, which is still feasible against copied storage.
  - An alphanumeric passphrase strong enough to resist offline guessing defeats the purpose of a quick unlock for caregivers mid-shift.
  - NIST treats short activation secrets as fine **only** when hardware enforces the attempt limit, which is exactly what PRF provides.

### Why PRF **and** the PIN, not PRF alone

- Group homes often share one tablet.
- A passkey's user verification proves whoever knows **that device's** screen lock or biometric, not which caregiver it is.
- Mixing both secrets into the wrapping key gives:
  - copied storage is useless without the physical authenticator, so there's no offline guessing;
  - a coworker with the tablet's screen lock still needs this caregiver's PIN;
  - each PIN guess costs a hardware-verified passkey prompt.

### What ships (task #80)

- **Key derivation:** `wrapKey(key, pin, profileId, prf?)` derives `HKDF-SHA256(PBKDF2(PIN) ‖ PRF secret)`.
- **Record:** the device record stores the credential ID and PRF salt (neither is secret) and `prf: true`.
- **Setup:** when the PIN is set, if PRF is supported, the device creates a passkey for this profile on this device and evaluates PRF. If either step fails, it falls back to PIN-only and records that.
- **Unlock:** if `prf: true`, unlock asks for the passkey first, then checks the PIN. Wrong-PIN counting and the wipe after 5 wrong PINs stay.
- **Server:** no change. Nothing about the passkey or PRF output is sent. This is local key protection, not sign-in, so it doesn't conflict with "NO custom auth."
- **Fallback:** devices without PRF keep the current scheme. `security.md` records the residual risk:
  - offline guessing of a 6-digit PIN is feasible against copied storage;
  - mitigations are the 12-hour offline window, keys revoked server-side when a device is reported lost, and wiping on sign-out.

---

## 5. Alert limits for breathing rate and SpO2

**Decision:**
- Flag breathing at **8 or fewer, or 25 or more, breaths a minute**.
- Flag SpO2 **below 92%**.
- A nurse or supervisor can set a person's own limits.

Before this, both readings were recorded with no alert at all ("none are specified").

### Standards

- **NEWS2 (Royal College of Physicians), the standard UK early-warning score:**
  - A single parameter scoring 3 calls for urgent clinical review.
  - Respiration ≤ 8 or ≥ 25 scores 3.
  - SpO2 scale 1 scores 3 at ≤ 91% (2 at 92–93, 1 at 94–95).
  - Sources: https://gloshospitals.nhs.uk/media/documents/NEWS_2_CHART.pdf, https://www.iatrox.com/blog/news2-scoring-escalation-guide
- **Scale 2 is for confirmed hypercapnic respiratory failure.**
  - The target is 88–92% and must be a clinician's recorded decision.
  - That is why the SpO2 limit is per person, not changed for everyone with COPD.
  - Sources: https://thorax.bmj.com/content/74/10/941, https://pmc.ncbi.nlm.nih.gov/articles/PMC6817986
- **Consumer and caregiver guidance:** treats SpO2 below 90% as needing medical attention, and notes that targets shift with lung disease. Source: https://ubiehealth.com/doctors-note/normal-blood-oxygen-level-toolow-call-emergency-34101q7

### Why the urgent bands

- Guad's alerts go to supervisors in real time, so a limit should mean "act now".
- NEWS2's score-3 bands are the most widely used single-reading triggers.
- The 1- and 2-point bands are left to the person's care plan and the trend chart.
