# Lomi charting entry

A visible Talk to Lomi link in the workspace header opens a current-home person picker. Choosing a person opens the existing shift-note composer at its Lomi section. The route requires charting access and uses the existing session-scoped people list; privacy lock removes picker rows. No drafts, clinical observations or provider calls are created just by opening the picker.

The existing draft/review/edit/sign flow remains. Voice requires configured transcription and local fallback is not represented as a real model. This increment improves discovery only; it does not establish model quality or complete the broader seamless-charting milestone.

Desktop/phone CI regressions cover the visible entry, home-specific choices, direct composer arrival, no draft with empty observations, accessibility and overflow. Final-head core, DB/RLS, production/development browser and performance gates are required before merge. No editor browser or DB execution.
