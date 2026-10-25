// What a person sees when they reach something their agency's plan doesn't
// include (entitlements.md §9 "Upgrade Flow"). Shared by the server (the
// tRPC error message) and the app (the upgrade dialog). v1 has no
// self-service plan changes: admins contact support, everyone else their admin.
import type { FeatureFlag } from './tier-features.ts';

const MESSAGES: Record<FeatureFlag, string> = {
	scheduling: 'Scheduling requires an active subscription.',
	coverage: 'Shift coverage requires an active subscription.',
	timekeeping: 'Timekeeping requires an active subscription.',
	charting: 'Clinical charting requires a Professional or Complete subscription.',
	lomi_drafting: 'Lomi AI note drafting requires a Professional or Complete subscription.',
	lomi_summary: 'Lomi daily summaries require a Professional or Complete subscription.',
	mar: 'Medication administration records require a Professional or Complete subscription.',
	goals: 'ISP goal tracking requires a Professional or Complete subscription.',
	health: 'Health entry tracking requires a Professional or Complete subscription.',
	incidents: 'Incident reporting requires a Professional or Complete subscription.',
	note_review: 'Note review and approval requires a Professional or Complete subscription.',
	analytics: 'The analytics dashboard requires a Complete subscription.',
	analytics_advanced:
		'Advanced analytics and enhanced Lomi summaries require a Complete subscription.',
	reports: 'Full report generation requires a Professional or Complete subscription.',
	reports_basic: 'Basic CSV reports require an active subscription.',
	reports_scheduled: 'Scheduled reports require a Complete subscription.',
	audit_log: 'Audit log access requires a Complete subscription.',
	intake: 'Client intake management requires a Complete subscription.',
	messaging: 'Team messaging requires an active subscription.',
	notifications: 'Notifications require an active subscription.'
};

export function upgradeMessage(feature: string): string {
	return MESSAGES[feature as FeatureFlag] ?? 'This feature requires a subscription upgrade.';
}

/** Where admins ask for a plan change (entitlements.md §9). */
export const SUPPORT_EMAIL = 'support@guad.care';
