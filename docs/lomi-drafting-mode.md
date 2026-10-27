# Lomi drafting availability

The composer now uses the existing capabilities query to explain, before drafting, when AI is not connected and observations will be sorted into sections without rewriting. Unknown/offline capability state does not assert that a provider is connected; a configured provider is not a guarantee of response quality or uptime. Existing result-level fallback warnings remain. The capability completion is ignored outside the original valid composer context. No additional provider/API requests, credentials, persistence or permissions are introduced.

The desktop/phone entry regression checks the notice in the existing emulator fixture before drafting. No live-provider behavior or quality is claimed. Final-head CI is required before merge.
