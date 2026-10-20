# Intake placement comparison

`placement_needs.medicationCertifiedStaff` records an explicitly reviewed need: unknown, required or not required. Creation and migration default to unknown; updates that omit the field preserve it. Notes are never interpreted as clinical eligibility.

Comparison re-reads the caller's active profile within its agency transaction. Supervisors receive only currently assigned open homes; admins receive open agency homes. This explicit filter is required because the existing home-read RLS policy is broader for supervisors. A cached caller with an older home claim does not restore a revoked assignment. Every query also retains tenant predicates and normal caller RLS, without service-role widening.

Facts count available unoccupied room records and active assigned caregivers marked medication-certified. They do not establish scheduled coverage, credential expiry, accessibility or overall clinical suitability. At most 200 homes, 10,000 available rooms and 10,000 relevant certified caregivers are scanned. Any truncation marks the comparison incomplete, counts as lower bounds and all homes as needing review.

Opening, saving or explicitly refreshing the referral returns current comparison facts. Admission recomputes them after the existing accepted-referral and home/room checks, preserving serialization and occupancy safeguards. It never chooses a home or completes admission automatically. Explicit human admission without a room remains supported; the returned guidance is not a substitute for clinical and staffing review.

Migration 0023 is generated from the Drizzle schema. Validation uses fresh isolated CI databases and synthetic desktop/phone cases; no shared database migration, provider operation or actual admission outside test fixtures is performed by development work.
