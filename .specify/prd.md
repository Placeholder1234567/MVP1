# Product Requirements Document -- Guad

> Version 1.0 | October 2026
> Guad ("friend" in Amharic) -- HIPAA-compliant IDD healthcare charting platform
> Lomi ("lemon" in Amharic) -- AI assistant for note drafting, shift coverage, daily summaries

---

## 1. Problem

Residential care agencies serving adults with intellectual and developmental disabilities (IDD) operate on a fragile stack of paper binders, spreadsheets, and disconnected software. Direct Support Professionals (DSPs) spend 15 to 20 minutes per shift note writing by hand or navigating dated web portals, often charting from memory after the shift ends rather than in the moment. Medications are tracked on paper MARs taped to kitchen cabinets. Goal data for Individualized Support Plans (ISPs) lives in separate binders. Incident reports are handwritten, photocopied, and faxed. When state auditors arrive, supervisors scramble to assemble records from multiple locations, hoping nothing was misfiled. The result is documentation that is late, incomplete, and disconnected from the care it describes.

Workforce coordination is equally brittle. A 6am callout -- a caregiver calling in sick for a morning shift -- wakes the scheduler, who then works through a personal contact list one call at a time, trying to find a trained replacement before the shift starts. Clock-ins are unverified: staff sign a paper log or a spreadsheet with no proof they were at the home. Payroll is assembled manually from these logs, a process that takes hours each pay period and introduces errors. Referrals and admissions are tracked in email threads or spreadsheets with no visibility into open beds across homes.

The dominant platform in this space, TherapServices.net, provides adequate clinical documentation but feels like an application from 2008. It offers no offline support, no voice input, no AI assistance, no integrated scheduling or timekeeping, and no mobile-first experience. Agencies tolerate it because nothing better exists for IDD-specific charting. Guad replaces the entire patchwork -- paper, spreadsheets, Therap, scheduling calls, paper timesheets -- with a single, fast, phone-first platform that works offline, drafts notes with AI, covers callouts automatically, and keeps the agency audit-ready at all times.

---

## 2. Users

### DSP / Caregiver
The front-line worker. DSPs live in group homes during their shifts (AM 07:00-15:00, PM 15:00-23:00, ON 23:00-07:00), providing direct support to 3-8 adults with IDD. They chart shift notes, administer medications, track ISP goals, record vitals, and report incidents. Their device is a personal phone, often on spotty cellular data. They need to document care quickly, accurately, and without leaving the people they support unattended. Guad must work in one hand, mid-shift, with or without an internet connection.

### Supervisor
Oversees 1-3 group homes. Supervisors review and approve clinical notes, manage weekly schedules, respond to incidents, follow up on medication refusals, and run reports for guardians and state auditors. They split time between homes and an office, working primarily on a laptop. They need a dashboard that surfaces what requires attention now -- open incidents, unsigned notes, unfilled shifts, out-of-range vitals -- without requiring them to check each home individually.

### Agency Admin
Manages the organization: creates homes, invites staff, assigns roles, configures settings, and handles compliance. Admins may also function as supervisors. They need setup tools, audit logs, analytics, and CSV exports for state reporting. They are the contract signer and the person accountable to regulators.

### Lomi (AI Actor)
Guad's built-in AI assistant. Lomi drafts clinical notes from voice transcripts, covers callouts by texting trained caregivers, and generates daily summaries for supervisors. Lomi is not a user in the authentication sense -- it is a system actor whose output is always labeled as AI-generated and always requires human review before it becomes part of the clinical record. Lomi proposes; humans approve.

---

## 3. User Stories

### Care Records (US-01 through US-15)

**US-01:** As a caregiver, I speak naturally about my shift into my phone and Lomi transcribes and drafts a structured clinical note, so that I can chart in under 5 minutes instead of 15-20 minutes of writing.

**US-02:** As a caregiver, I review Lomi's drafted note section by section (activities, meals, mood, health), editing any section before signing, so that the final note is accurate and in my own voice.

**US-03:** As a caregiver, I write a note manually without using voice or AI, so that I have a reliable fallback when I prefer typing or when AI is unavailable.

**US-04:** As a caregiver, I record ISP goal attempts using prompt-level buttons (Independent, Verbal, Gestural, Model, Partial physical, Full physical, Refused) directly within my shift note, so that goal tracking data is captured alongside daily observations.

**US-05:** As a caregiver, I mark a goal as "not attempted" with a reason when a person was absent or the goal was not applicable, so that supervisors understand why data is missing.

**US-06:** As a caregiver, I document a behavior incident in ABC format (antecedent, behavior, consequence) using guided sections, so that behavior data is consistent and useful for behavior analysts.

**US-07:** As a caregiver, I record scheduled medication doses as given, refused, or held with a required reason for refusals and holds, so that the medication administration record is complete and supervisors are alerted to issues.

**US-08:** As a caregiver, I administer and record PRN (as-needed) medications with a reason for administration and a follow-up prompt to record the effect, so that PRN usage is documented with outcomes.

**US-09:** As a caregiver, I record vitals (blood pressure, pulse, temperature, weight) and see immediate inline alerts when values fall outside normal ranges, so that I am aware of potential health concerns in real time.

**US-10:** As a caregiver, I document seizures, illness episodes, and medical appointments using type-specific forms, so that health records are structured and searchable.

**US-11:** As a caregiver, I file an incident report through a 3-step wizard (what happened, assessment and response, severity and notifications) with severity-based notification routing, so that the right people are told within the required timeframes.

**US-12:** As a supervisor, I review submitted notes in a split-pane view, approve them or send them back with a required comment explaining what needs correction, so that clinical documentation meets quality standards before it becomes part of the permanent record.

**US-13:** As a caregiver, I see a "Fix" indicator on my Today screen when a note has been sent back, with the supervisor's comment displayed as a banner when I reopen it, so that I know exactly what to correct.

**US-14:** As a caregiver, I record daily attendance and services (in-home support, day program, community outing) for each person, so that service delivery is documented for billing and state reporting.

**US-15:** As a supervisor, I write case notes for care coordination, ISP meetings, and family communications, so that there is a chronological record of non-shift clinical activity.

### Scheduling (US-16 through US-22)

**US-16:** As a supervisor, I view a weekly schedule grid (7 days x 3 shifts) for each home with staff assignments, open shifts, and Lomi-offered shifts visually distinguished, so that I can see coverage status at a glance.

**US-17:** As a supervisor, I assign staff to shift slots from a dropdown that shows each person's weekly shift count, so that I can balance workloads while building the schedule.

**US-18:** As a supervisor, I post an open shift to Lomi, which automatically identifies trained and available caregivers nearby, texts them offers, and fills the slot when someone accepts, so that I do not have to make phone calls to find coverage.

**US-19:** As a caregiver, I call out from a scheduled shift through the app with a reason, triggering Lomi to begin coverage outreach immediately, so that I do not need to call my supervisor and my shift gets covered without waking anyone.

**US-20:** As a caregiver, I receive a shift offer from Lomi via the app (and optionally SMS) and accept or decline it, so that I can pick up extra shifts conveniently.

**US-21:** As a supervisor, I see a full coverage activity log showing every step Lomi took -- which candidates were contacted, their eligibility reasons, their replies, and timestamps -- so that I have an audit trail of every coverage decision.

**US-22:** As a supervisor, I am notified when Lomi cannot fill a shift after the timeout period, so that I can intervene manually before the shift starts.

### Timekeeping (US-23 through US-27)

**US-23:** As a caregiver, I clock in by tapping a button on my phone, and Guad verifies my GPS location against the home's coordinates, so that my presence at the home is confirmed without a paper sign-in sheet.

**US-24:** As a caregiver, I can still clock in when my location cannot be verified (GPS denied or outside geofence), with a clear message that my supervisor will see the unverified entry, so that I am never blocked from starting work.

**US-25:** As a supervisor, I see unverified and out-of-geofence clock-ins in my attention list and can acknowledge them, so that payroll accuracy is maintained without blocking staff.

**US-26:** As a supervisor, I create manual clock entries for missed punches with a required reason, and the affected staff member sees the override on their profile, so that timesheets are correctable with a clear audit trail.

**US-27:** As a supervisor, I export payroll-ready timesheets as CSV with hours broken down by verified, unverified, and manual entries, so that payroll processing requires no additional calculation.

### Client Intake (US-28 through US-32)

**US-28:** As a supervisor, I create a referral record with contact information and source, so that inquiries are tracked from first contact through placement.

**US-29:** As a supervisor, I advance referrals through a pipeline (inquiry, touring, accepted, waitlist, declined, placed) with notes at each stage, so that the admissions process has clear status visibility.

**US-30:** As a supervisor, I view available rooms across all homes in a single list, so that I can quickly identify where there is capacity for a new admission.

**US-31:** As a supervisor, I convert an accepted referral into a client record and assign them to a home and room in one action, so that the transition from referral to active client is seamless.

**US-32:** As a supervisor, I see suggested home placements based on open rooms, caregiver certifications, and client needs, so that placement decisions are informed by current capacity and capabilities.

### Cross-Cutting (US-33 through US-40)

**US-33:** As an agency admin, I complete first-run setup by creating my agency, naming my first home with a geofence location, and setting my role, so that the platform is ready for use within minutes.

**US-34:** As a user, I sign in and am routed to the appropriate experience -- bottom-dock mobile view for caregivers, sidebar dashboard for supervisors and admins -- so that each role sees the interface designed for their workflow.

**US-35:** As an agency admin, I select a charting preset ("Therap" or "Default") that changes all UI labels and form ordering to match my staff's familiarity, without affecting the underlying data or API, so that agencies migrating from Therap see familiar terminology.

**US-36:** As a supervisor, I tap "Summarize today" and Lomi generates a 2-4 sentence plain-English summary of the day's status across notes, incidents, medications, coverage, and health alerts, so that I get a quick situational overview without reading every individual record.

**US-37:** As a caregiver or supervisor, I send and read messages in a home-scoped team channel where Lomi also posts coverage updates, so that shift handoff communication and coverage announcements happen in one place.

**US-38:** As a supervisor, I view 4-week trend analytics for coverage fill rate, documentation completeness, Lomi draft usage, medication compliance, and incident frequency, so that I can identify patterns and intervene before problems grow.

**US-39:** As a supervisor, I download CSV reports for notes, incidents, MAR records, goal progress, attendance, coverage logs, and clock-ins, so that I can satisfy audit requests and share records with guardians and regulators.

**US-40:** As a caregiver, I use all core features (charting, medications, health entries, incident reports, clock-in, messaging) while offline, with changes syncing automatically when connectivity returns, so that documentation is never delayed by network issues.

---

## 4. Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Time to chart a shift note | < 5 minutes (voice-to-signed) | Timestamp difference between note creation and sign event |
| Coverage fill rate | > 90% of callouts filled by Lomi | Filled coverage requests / total coverage requests |
| Mean time to fill a callout | < 30 minutes | Average elapsed time from coverage request to filled status |
| Note send-back rate | < 10% of submitted notes returned by supervisor | Returned notes / submitted notes, rolling 4 weeks |
| Clock-in GPS verification rate | > 95% of clock-ins verified within geofence | Verified clock-ins / total clock-ins |
| Audit readiness | < 2 minutes to pull any record for an auditor | Timed test: supervisor locates and exports a specific record type for a specific client and date range |
| Offline uptime for core features | 100% availability for charting, MAR, health, incidents, clock-in | Automated monitoring: no "online-only" blocking screens for core pillar features |
| Agency onboarding time | < 30 days from signup to full daily use | Days from agency creation to consistent daily note volume matching client count |

---

## 5. Non-Goals (v1)

1. **No native mobile apps.** Guad is a Progressive Web App (PWA) only. No iOS App Store or Google Play submissions. The PWA handles offline, push notifications (FCM), and Add to Home Screen.

2. **No billing or invoicing.** Guad tracks attendance and services for billing documentation but does not generate invoices, process payments, or integrate with billing systems.

3. **No payroll processing.** Guad produces payroll-ready CSV exports with verified hours. Actual payroll calculation, tax withholding, and direct deposit are handled by the agency's payroll provider.

4. **No clinical decision support.** Lomi drafts notes and flags vague language but does not diagnose, recommend treatments, suggest medication changes, or provide clinical guidance.

5. **No family portal.** Guardians and family members do not have direct access to Guad. Reports and updates are shared via CSV exports, email, or printed documents.

6. **English only.** All UI text, AI prompts, and system messages are in English. Localization and multilingual support are deferred.

7. **No custom form builder.** Note sections, health entry types, and incident report fields are fixed. Agencies cannot add custom fields or create custom forms.

8. **No direct state system integration.** Guad exports data in CSV and standard formats. Direct API integration with state reporting systems (e.g., state incident reporting portals, Medicaid EVV systems) is deferred to post-v1 OpenAPI work.

9. **No video or photo attachments in notes.** Clinical notes are text-only. Photo and video capture for wound documentation or behavioral observation is not supported in v1.

10. **No real-time location tracking.** GPS is captured only at clock-in and clock-out events for Electronic Visit Verification (EVV) compliance. Guad does not continuously track caregiver location.

---

## 6. Subscription Tiers

| Capability | Starter | Professional | Complete |
|---|---|---|---|
| **Scheduling** (weekly grid, shift assignments, open shift posting) | Included | Included | Included |
| **Timekeeping** (GPS clock-in/out, missed punch detection, payroll export) | Included | Included | Included |
| **Lomi Coverage** (automated callout-to-fill via SMS) | Included | Included | Included |
| **Team Messaging** (home-scoped message board) | Included | Included | Included |
| **Care Records** (shift notes, behavior notes, MAR, health, incidents, goals, attendance) | -- | Included | Included |
| **Lomi Note Drafting** (voice-to-text, AI-drafted clinical notes) | -- | Included | Included |
| **Lomi Daily Summary** (AI-generated supervisor overview) | -- | Basic (text only) | Enhanced (with highlights and recommendations) |
| **Client Intake** (referral pipeline, room availability, placement matching) | -- | -- | Included |
| **Analytics** (4-week trend charts for coverage, documentation, care) | -- | -- | Included |
| **CSV Reports** (all report types) | Clock-ins and coverage only | All Care Records reports | All reports |
| **Audit Log Access** (admin compliance review) | -- | -- | Included |

---

## 7. Feature Entitlement Matrix

| Feature | Starter | Professional | Complete |
|---|---|---|---|
| View and manage weekly schedule | Yes | Yes | Yes |
| Assign staff to shifts | Yes | Yes | Yes |
| Post open shifts to Lomi | Yes | Yes | Yes |
| Caregiver callout with Lomi coverage | Yes | Yes | Yes |
| Accept/decline shift offers | Yes | Yes | Yes |
| Coverage activity log | Yes | Yes | Yes |
| GPS clock-in / clock-out | Yes | Yes | Yes |
| Missed punch detection | Yes | Yes | Yes |
| Manual clock entry (supervisor) | Yes | Yes | Yes |
| Payroll CSV export | Yes | Yes | Yes |
| Coverage log CSV export | Yes | Yes | Yes |
| Team messaging | Yes | Yes | Yes |
| First-run setup and sign-in | Yes | Yes | Yes |
| Charting preset selection | Yes | Yes | Yes |
| Notification preferences | Yes | Yes | Yes |
| Offline core features | Yes | Yes | Yes |
| Shift notes (voice or manual) | -- | Yes | Yes |
| Behavior notes (ABC format) | -- | Yes | Yes |
| Lomi AI note drafting | -- | Yes | Yes |
| Note review / approve / send back | -- | Yes | Yes |
| MAR (scheduled and PRN) | -- | Yes | Yes |
| Health entries (vitals, seizure, illness, appointment) | -- | Yes | Yes |
| Incident reports (3-step wizard) | -- | Yes | Yes |
| ISP goal tracking with prompt levels | -- | Yes | Yes |
| Attendance and service recording | -- | Yes | Yes |
| Case notes | -- | Yes | Yes |
| Health summary view | -- | Yes | Yes |
| Lomi daily summary (basic) | -- | Yes | Yes |
| Care Records CSV reports | -- | Yes | Yes |
| Create and track referrals | -- | -- | Yes |
| Room availability view | -- | -- | Yes |
| Referral-to-client conversion | -- | -- | Yes |
| Placement matching suggestions | -- | -- | Yes |
| Lomi daily summary (enhanced) | -- | -- | Yes |
| Analytics dashboard (4-week trends) | -- | -- | Yes |
| Full audit log access | -- | -- | Yes |
| All CSV report types | -- | -- | Yes |

---

## Appendix: Terminology Cross-Reference

For agencies using the Therap charting preset, the following terms map to Guad defaults:

| Guad Default | Therap Preset |
|---|---|
| Shift Note | T-Log |
| Behavior Note | GER (General Event Report) |
| Goal Tracking | ISP Data Collection |
| Goals (nav label) | ISP Data |
| Medications | eMAR |
| Incident Report | GER (Incident) |
| Approve Note | Approve T-Log |
| Send Back | Return T-Log |
