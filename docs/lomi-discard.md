# Lomi recovery discard acknowledgement

The discard action retains the recovery controls, disabled while busy, until the encrypted store has completed its queued deletion. It stops recovery persistence during the operation and clears visible recovery only after successful deletion in the original valid context. Storage failure keeps recovery available with the existing storage error rather than presenting successful disappearance.

This closes the source ordering behind the phone reload failure in browser job 121964773483: the final post-reload assertion found a recovery after the discard controls had already disappeared. The existing desktop/phone explicit-discard/reload regression is unchanged; no timeout, retry or assertion is weakened. Final-head CI remains required. No editor browser, database or provider execution occurred.
