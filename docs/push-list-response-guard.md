# Push-device list response guard

PushDevices binds list reads to the requesting agency, profile, role and feature context. Privacy lock, context changes, navigation and disposal invalidate pending reads and clear loaded rows. Offline or hidden views invalidate reads while retaining already loaded same-context data. Refresh is explicit and requires an online, visible, unlocked view.

Four desktop/phone CI regressions hold real pushDevices responses across privacy lock and destination navigation, then verify explicit recovery, offline reading, accessibility and overflow. The fixture has no registrations; this is not proof of nonempty roster rendering or physical-device delivery.

Scope: list reads only. Device removal feedback and asynchronous browser-wide push cleanup remain separate unresolved work. No provider, RLS, consent or dispatch semantics change.

Validation at commit 3738e2b: core and database CI and performance passed. Browser run 40260249604 passed 215 tests with 18 exclusions; it failed the existing phone my-hours test before development tests ran. All four new push-list cases passed. Main later includes Claude's longer separation between desktop/phone missed-punch fixtures. Final-head all-four checks remain required before merge.

## List and removal concurrency follow-up

Removal now requires an online, visible, unlocked view with no list read or removal in progress. Its button uses the same conditions. Accepting the confirmation invalidates the list generation defensively. A refresh cannot overlap removal, so an older list response cannot restore a deleted row through this interaction.

The guarded browser runner (`GUAD_E2E=1`, demo project and loopback services) requests two additional emulator-only caregiver accounts during seed. Each owns one opaque synthetic registration. Desktop and phone use separate accounts, and successful removal consumes that project's fixture; the ephemeral CI database is discarded afterwards. Other suites do not use these accounts. The console push driver remains enforced; no real registration, browser permission or provider send is needed, and no production test API is added.

The new desktop/phone regression holds a real nonempty list response, verifies removal is disabled and a forced click issues no mutation, then holds the real removal response and verifies refresh is disabled. Explicit refresh must confirm the registration remains absent. Loaded rows remain readable offline with actions disabled. Accessibility and overflow assertions remain included. These regressions must pass in GitHub CI before this follow-up is merged; they have not been executed in the editor.

Initial follow-up head 9f41e1c passed browser and performance CI but its database job 121641242086 failed the existing concurrent dispatch test: the global slow email fake saw two calls. Earlier notify tests launch asynchronous post-commit jobs, so the fake is now selected only for the test's exact notification ID; all once-only, sent/skipped and persisted-result assertions remain. This isolates unrelated background deliveries without changing production dispatch. A final-head database pass is still required and will detect duplicate sends of the target itself.

This follow-up does not claim to fix removal completion feedback after context changes, or browser-wide push cleanup during account transitions. Server mutations may finish after interruption; there is no automatic retry or reversal.
