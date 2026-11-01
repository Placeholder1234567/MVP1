# Decisions: open owner questions (November 2026)

Decided 2026-11-01 after the owner asked for research-based answers to the questions left open in the M1 evidence. **Product research, not legal advice.** The intake decision is in decisions-2026-10.md §6, and the time-zone decision is in PR #320.

---

## 1. Which plan gets scheduled reports?

**Decision: Complete only, as built.** `reports_scheduled` is a Complete feature that requires `reports` (entitlements.md row 20).

product-2026-10.md §E separates compliance access from convenience. Compliance access means the per-person record export, disclosure accounting and the full agency export. That is ungated, because 45 CFR 164.524/164.528 and the information-blocking rules (45 CFR 171) bar paywalling it. Scheduled delivery is convenience, so it can sit in the top tier. Every plan with `reports` can still run the same care reports by hand.

## 2. Should "nearby staff" use where caregivers live?

**Decision: no location data for now. "Nearby" means trained at that home.**

- **What the code does.** `findCandidates` (domain/eligibility.ts) only offers a shift to active staff assigned to that home. Assignment is how agencies already express who works locally. Ranking within that group by home distance adds little.
- **What collecting it would cost.** A staff home ZIP is employee location data:
  - New York Civil Rights Law §52-c requires written notice at hire.
  - California's CCPA covers employee data, and its automated-decision rules reach shift-offer ranking.
  - The research option (product-2026-10.md §C) would also need a ZIP-centroid dataset, consent copy, deletion on deactivation and an agency notice template.
- **Data minimization.** HIPAA's minimum-necessary principle and the NIST Privacy Framework both favour not collecting data the feature does not need.
- **Revisit when** agencies ask for cross-home floating pools, where staff are not assigned to the home. Then build the optional, banded ZIP field exactly as §C describes.

## 3. What to do about the remaining dependency advisories?

**Decision: accept moderate and low findings with no compatible fix, under this policy, and review them monthly.**

- **CI blocks high and critical.** `npm audit --omit=dev --audit-level=high` runs in the core CI job. A new high-severity production advisory turns main red, as `re2js` did and was fixed in #317.
- **Moderate and low findings are fixed when a compatible patch exists.** That means a lock-only update within the parent's semver range, made by the npm CLI and passing all five CI checks. No `npm audit fix --force`, forced overrides, parent downgrades or threshold changes.
- **Current accepted findings (2026-10-31, Node 24.22 / npm 11.9):**
  - **Production: 6 moderate records from 2 advisories.** [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) affects `glob` (patched 14.0.2). [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects `minimatch` (patched 11.0.1). Both arrive only through the optional `@google-cloud/firestore` → `google-gax`/`gaxios` → `rimraf@5` → `glob@10` → `minimatch@9` chain, where every package is already at its newest in-range version. No app code imports glob, rimraf, minimatch or Firestore; Firebase Admin is used for app, auth and messaging only. Both advisories need attacker-controlled glob patterns or abort signals, which Guad never passes.
  - **Development: 34 records total (30 moderate, 4 low, 0 high or critical).** They come from build, test and CLI tooling (Firebase CLI, OpenTelemetry, legacy esbuild under Drizzle Kit, Svelte tooling), plus the same glob/minimatch chain. None ships in the production image, because the Dockerfile prunes dev dependencies.
- **Review.** Dependabot (`.github/dependabot.yml`, PR #318) opens grouped weekly PRs. Re-run both audits monthly and when Dependabot's alerts change. Any finding that reaches high, or gets a compatible fix, is handled then.

## 4. Questions that need something only the owner can supply

These remain deferred (completion-milestone.md). Each needs an input research cannot replace.

| Question | What blocks it | What is ready |
|---|---|---|
| Self-serve signup | The BAA and MSA text must come from a lawyer, and accepting real agencies without one is a HIPAA breach risk (45 CFR 164.504(e)). | product-2026-10.md §A has the full sandbox → go-live design. `agency:provision` covers sales-led onboarding today. |
| Billing | A payment-processor account (Stripe or similar), prices and a refund policy. | The plan tiers and features (entitlements.md) are built. Billing would set the tier that `agency:set-plan` sets by hand today. |
| Spanish | Clinical and legal wording (MAR, incident, consent copy) needs review by a qualified medical translator. Machine translation of medication instructions is a patient-safety risk. | Labels flow through a few config files (charting presets, domain label maps), which makes later extraction into a message catalogue feasible. |
| Lomi with real AI, speech-to-text and staff | Vertex AI and Speech-to-Text credentials, spend approval and staff volunteers. | docs/ai-acceptance.md defines the evaluation plan and the pass rules. |
| Placement matching beyond medication certification | Which assessment tools to name (ICAP, SIS-A, state scales), and counsel's view on using sex or age (Section 1557). | product-2026-10.md §B lists the structured inputs and the rule that only physical facts may filter. |
