// Messaging usage for admins (notifications.md "Cost Tracking"): texts,
// emails and pushes sent this month, and an estimate of the text cost.
// Counts only; the plan's included texts aren't defined yet, so there is no
// usage alert (notifications.md "80% of the plan's included SMS").

/** About a cent per text (infrastructure.md "Vendors": AWS End User Messaging). */
export const SMS_COST_CENTS = 1;

/** The first day of `day`'s month (YYYY-MM-DD). */
export const monthStart = (day: string) => `${day.slice(0, 8)}01`;

/** "$1.23" for this many texts, at SMS_COST_CENTS each. */
export function smsCostEstimate(texts: number): string {
	return `$${((Math.max(0, texts) * SMS_COST_CENTS) / 100).toFixed(2)}`;
}
