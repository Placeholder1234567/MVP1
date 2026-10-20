# Implementation audit

Technical checkpoint: 2026-10-20 09:53 UTC. This describes repository evidence at that time, not production readiness or an always-current project tracker. Recheck main, open PRs and final-commit checks before acting.

## Validated increments

Sign-out preservation (PR227), carrier STOP/preference separation (PR232), verified-consent-only required supervisor SMS (PR233), operator offboarding/access hold (PR235), and encrypted Lomi reload recovery (PR234) merged after all four required gates passed on their final commits. PR234 final `83d8764752f2795639eae385698ce57d3678150f` merged as `79030962c1c30ad0be02b88194f850341809aca8`: core/database/RLS run39400052108, browser39400052332 (131 production plus 2 development passes), performance39400052075. Recovery retains explicit resume, protected caregiver edits, scoped encrypted storage, separate Use/signature and delayed-writer invalidation on signing.

Offboarding was tested only with synthetic identities and isolated databases; no real agency was offboarded. Queued Care reports (PR117) are implemented and must retain account/home/RLS, current-person, atomic-publication and revision-cleanup safeguards.

## Pending intake validation at this checkpoint

PR236 implements explicitly reviewed medication-certified-staff needs and bounded current room/caregiver facts. Supervisors use fresh current home assignments; admins are agency-wide. Unknown/incomplete information requires review. It does not infer needs from narrative, guarantee shift coverage or automatically admit a client. Core/database/RLS/performance passed on the scope-fix commit. Its browser run timed out in both new cases and was cancelled before a full result. A follow-up gives Stage and Admission home explicit select-label associations and bounds individual test actions without removing assertions. All four checks must pass on that new final head before merge. No local validation is claimed for edits made while the workspace terminal was disconnected.

## Confirmed next work and targets to reconcile

1. **Coverage-log export:** frontend-spec-3.md section 4.5 calls for callouts, offers and fill outcomes. The in-app clinical report source enum does not implement coverage. Reuse actual recorded requests, sends, replies and fills; eligible candidates are not proof an offer was sent, and provider acceptance is not delivery. Preserve tenant/current-home authorization, bounded queries/output, explicit download, export audit and phone-number privacy. Do not reconstruct missing history.
2. **Progressive disclosure:** frontend-spec-2.md section 6.5 explicitly states usage-threshold reveals are not built. Getting-started tips exist, but voice/Lomi remain available from the start. The target table differs from MVP behavior; reconcile this before gating existing tools or claiming progressive disclosure complete. Carry-forward/history defaults are separate work, not implied by counters.
3. **Report presentation/history:** services.md documents that agency PDF branding is not added. Broader glyph support needs appropriate licensed fonts and validation; keep the deliberate CSV/HTML fallback for unsupported text. Historical goal/prescription definitions or signatures absent from source records cannot be invented.
4. **Avoid duplicate exports:** audit metadata CSV exists through `audit.export`; timesheet exports include clock entries. They are not missing merely because they use different procedure/page names. Intake-report expansion is not confirmed by the available-report table and needs a concrete requirement before implementation.

## Release evidence

Synthetic Chromium desktop/phone, axe, isolated Postgres/PowerSync/Auth-emulator and performance checks cannot establish physical Safari/Firefox encrypted-storage behavior, installed-device push, real provider delivery, external penetration testing, signed BAAs/covered model/region verification, infrastructure retention/disposal or offline-device erasure. Those remain evidence requirements. No deployment, provider spending or shared-database operation is authorized by this checkpoint.
