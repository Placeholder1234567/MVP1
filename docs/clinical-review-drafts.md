# Supervisor incident review drafts

Incident review stays attached to the home where it was opened. Switching homes hides the previous incident and its draft; returning restores the in-memory entries. Opening another incident or cancelling checks both follow-up text and an unrecorded contact. Page navigation and native leave/reload guards preserve entries when the user cancels leaving. Drafts are not placed in browser storage.

While a request is pending, form controls and Cancel are disabled and route navigation is blocked. Changing the global home cannot redirect a request or show its completion message under the other home. A typed contact must be explicitly recorded or cleared before closing the incident, avoiding silently discarded contact text. Recording a contact does not send a message.

Synthetic desktop/phone browser coverage creates and signs a real test incident, checks contact-only and native-leave guards, switches homes with a draft, and delays the review transport before allowing the real backend request to complete. It verifies disabled controls, blocked route navigation and home-scoped completion messages. No production data, browser storage shortcuts, real messaging or deployment is used.
