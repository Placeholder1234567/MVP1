# Push-device list response guard

PushDevices binds list reads to the requesting agency, profile, role and feature context. Privacy lock, context changes, navigation and disposal invalidate pending reads and clear loaded rows. Offline or hidden views invalidate reads while retaining already loaded same-context data. Refresh is explicit and requires an online, visible, unlocked view.

Four desktop/phone CI regressions hold real pushDevices responses across privacy lock and destination navigation, then verify explicit recovery, offline reading, accessibility and overflow. The fixture has no registrations; this is not proof of nonempty roster rendering or physical-device delivery.

Scope: list reads only. Device removal feedback and asynchronous browser-wide push cleanup remain separate unresolved work. No provider, RLS, consent or dispatch semantics change.

Validation at commit 3738e2b: core and database CI and performance passed. Browser run 40260249604 passed 215 tests with 18 exclusions; it failed the existing phone my-hours test before development tests ran. All four new push-list cases passed. Main later includes Claude's longer separation between desktop/phone missed-punch fixtures. Final-head all-four checks remain required before merge.
