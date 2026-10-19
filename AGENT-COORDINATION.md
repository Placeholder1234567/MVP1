# Shared agent coordination

This file and `coordination/notices/` are shared through GitHub, not through either agent's private computer or chat. Read the latest committed versions before edits and after fetching new work. A branch copy can be stale: compare it with current `main` and the open coordination PR. Neither agent's acknowledgment is assumed.

## Before working

1. Fetch current main and relevant branches. Read CLAUDE.md, applicable AGENTS.md, this file, both notice files and current open PRs. Inspect commit/PR evidence for work that has not reached main.
2. Check the other agent's latest notice ID against the acknowledgment in your own notice. Read changed paths and linked PRs before continuing. Acknowledge the exact notice ID in your own notice; never acknowledge on the other agent's behalf.
3. Claim one concrete task in your own notice before editing its implementation. Include branch, base SHA, reserved paths, status, next step and verification. Push the claim and recheck the other notice and branch head before substantial edits. If claims overlap, defer that scope and choose independent work; do not edit the other agent's checkout.
4. Use a separate branch/worktree per task. Recheck main, open PRs and notices before pushing or merging. Publish with a normal fast-forward or expected-head lease; never overwrite a newer notice or claim. Merge conflicts in coordination must preserve both agents' information.

These are advisory claims, not a distributed lock. A stale timestamp is not permission to take over: verify current branch/PR activity first. When ownership cannot be established, stop overlapping edits. An agent that has not read this protocol is not coordinated by it.

## Change notices

- Codex owns `coordination/notices/codex.md`; Claude owns `coordination/notices/claude.md`. Each edits only its own notice. If Claude's file does not exist yet, its participation is **unacknowledged**, not idle.
- Use a new unique notice ID when claiming/releasing work, changing reserved scope, publishing a meaningful follow-up, encountering a blocker, or merging. Include the previous ID and a short change summary. No per-file noise is necessary.
- Commit notices with the relevant work when practical, or as a small coordination-only commit before work. Each agent must inspect the other's branch notice as well as main when the notice is still in an open PR.
- A notice is delivered by git fetch/read, not by an automatic chat message. Active agents check before each editing batch and after pushes. Scheduled agents check at the start of each resumed run. This does **not** wake an idle agent, prove a background worker is running, or bypass usage limits.

Use this format in your own notice:

```markdown
# <Agent> notice

Notice ID: <agent>-<UTC timestamp>-<short unique suffix>
Previous notice: <ID or none>
Updated UTC: <timestamp>
Acknowledged other notice: <exact ID or unacknowledged>
Status: claimed | working | waiting-ci | blocked | released | merged
Task: <one concrete task>
Branch / PR: <links>
Base main: <SHA>
Reserved paths: <specific files/directories>
Changes since previous notice: <summary>
Verification: <exact head and checks, distinguishing pending from passed>
Next action / blockers: <concrete step>
```

## Current boundaries (observed 2026-10-19 UTC)

| Scope                                                      | Agent / evidence                                                                                 | Boundary                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Queued Care reports                                        | Codex, [PR117](https://github.com/Placeholder1234567/MVP1/pull/117)                              | Reports services/UI/tests and existing queue dispatch/cleanup adapters. Finish verification before new product features.                |
| Home archiving                                             | Claude-generated [PR168](https://github.com/Placeholder1234567/MVP1/pull/168), open when checked | Avoid home lifecycle, related schema/sync, write guards and picker changes. This is observed activity, not an accepted claim by Claude. |
| Compliance/product research and deactivated offline queues | Claude-generated [PR169](https://github.com/Placeholder1234567/MVP1/pull/169), open when checked | Avoid its research/spec changes and queue policy work. Recheck current activity.                                                        |
| Password setup/reset and policy                            | Claude-generated [PR170](https://github.com/Placeholder1234567/MVP1/pull/170), open when checked | Avoid identity/auth, reset/setup routes and password policy. Recheck current activity.                                                  |
| Shared coordination setup                                  | Codex, `codex/agent-coordination`                                                                | This file and Codex's own notice only. Claude's acknowledgment is pending.                                                              |

Also preserve the user's standing reservations around controlled medication, witness/auth/identity, session, layout/navigation and state-preset work until current activity establishes otherwise. This table is a dated snapshot, not permanent ownership; refresh it using actual evidence.

## Shared safeguards

Synthetic/ephemeral test data only; no desktop coding/browser automation, shared database migrations/resets/seeding, deployments, production providers, infrastructure provisioning, purchases or spending. No PHI, credentials, report content or private account tokens in these files.

Each PR requires all four gates on its exact final head before merging: core lint/types/units/spec/build/artifacts; database/auth/sync integration; desktop/phone/accessibility browser; performance. Do not weaken tests to conceal failures. Use an exact-head merge guard and verify the merge. A documentation-only PR does not waive the user's merge rule.

No implemented usage-limit restart controller or durable distributed worker lock is implied by this protocol. Keep resumable source and handoffs pushed, respect actual reset/retry-after times, and distinguish scheduled continuation from usage-limit recovery.
