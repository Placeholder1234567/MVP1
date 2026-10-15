export const IDLE_LOCK_MS = 15 * 60 * 1000;
export const BACKGROUND_LOCK_MS = 5 * 60 * 1000;

/** Deadlines use elapsed wall time so suspended browser timers cannot extend access. */
export function privacyLockDue(now: number, lastActivity: number, hiddenAt: number | null) {
	return (
		now < lastActivity ||
		now - lastActivity >= IDLE_LOCK_MS ||
		(hiddenAt !== null && (now < hiddenAt || now - hiddenAt >= BACKGROUND_LOCK_MS))
	);
}
