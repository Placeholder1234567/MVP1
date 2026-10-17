# Care form safeguards

Care form navigation preserves unsaved work after a dismissed SPA discard prompt or native browser leave warning. Native leave requests do not invoke a second custom prompt or clear the dirty flag. Button-only incident choices, step progression, health kind selection, and MAR editor choices notify the shared workspace that the form changed.

Each child reports write progress immediately and clears it when the write finishes or the component unmounts. While a write is pending, native fieldsets disable all editable controls and secondary actions; the workspace blocks SPA navigation and disables local Back/tab controls. Browser leave warnings remain the browser's decision. Privacy locking retains its existing behavior and does not auto-sign anything.

Changing incident report facts or MAR correction details revokes an earlier confirmation. Returning to earlier incident steps also requires a fresh signature. A signature checkbox itself is excluded from this invalidation. Health type switching continues to clear the old quick form without a confirmation as specified in charting-ux §4.6.

The existing attendance-row UPDATE now refreshes the local upload queue status before reporting success and resetting selections, matching the INSERT path. Services remain additive; no records or source history are deleted.

Synthetic desktop/phone CI cases exercise button-only draft navigation, repeated cancelled native reloads, explicit signature renewal, real encrypted offline health and additive attendance writes, reconnection, and attendance JSON export contents. They use the real sync/upload path, without mocking clinical persistence. Deterministic busy timing is not asserted for local SQLite writes, which can finish before the browser can observe them. Browser tests run in CI only; local checks cover lint/types, production build, offline shell, and test discovery.
