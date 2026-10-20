# Implementation audit

This is a technical checkpoint against repository code and specifications, not a production-readiness certificate. Recheck current main and PR outcomes before changing implementation.

## Validated increments

Sign-out preservation (PR227), carrier STOP/preference separation (PR232), verified-consent-only required supervisor SMS (PR233), and operator offboarding/access hold (PR235) merged after all four required checks passed on their final commits. Offboarding was tested only with synthetic identities and isolated databases; no real agency was offboarded. Queued Care reports (PR117) are implemented and must retain their account/home/RLS, current-person, atomic-publication and revision-cleanup safeguards.

## Pending validation

- PR234 implements encrypted local-only original Lomi observations and edit-ledger recovery. Explicit resume, protected caregiver edits, account/home/person/period/note binding, separate Use/signature and signature-clear writer invalidation remain required. Current core/database/performance checks pass; final browser validation is pending.
- PR236 implements explicit medication-certified-staff needs and bounded current home/room/caregiver facts. Supervisors use fresh current home assignments; admins are agency-wide. Unknown or incomplete information requires review. It does not infer needs from narrative, guarantee shift coverage or automatically admit a client. Current core/database/performance checks pass; final browser validation is pending.

## Further targets to reconcile

1. Frontend-spec-2.md section 6.5 explicitly states that usage-threshold feature reveals are not built. Getting-started tips exist, but voice/Lomi remain available from the start. The threshold table differs from current MVP behavior; reconcile those product targets before gating existing tools or claiming progressive disclosure complete. Carry-forward and history-based defaults in that table are separate changes, not implied by tracking counters.
2. In-app report source/font/history targets need a current schema/service audit. Immediate and queued Care exports exist; the in-app clinical source enum does not include coverage, intake or audit. External report capabilities are distinct. Unsupported PDF text has a deliberate CSV/HTML fallback; do not silently draw missing characters. Do not invent historical goal/prescription definitions or signatures absent from source records.
3. Keep documentation current with actual interfaces. Historical prototype descriptions and target-only procedure names are not implementation gaps by themselves; inspect code and tests before adding duplicate endpoints.

## Release evidence

Synthetic Chromium desktop/phone, axe, isolated Postgres/PowerSync/Auth-emulator and performance checks cannot establish physical Safari/Firefox encrypted-storage behavior, installed-device push, real provider delivery, external penetration testing, signed BAAs/covered model/region verification, infrastructure retention/disposal or offline-device erasure. Those remain evidence requirements. No deployment, provider spending or shared-database operation is authorized by this technical checkpoint.
