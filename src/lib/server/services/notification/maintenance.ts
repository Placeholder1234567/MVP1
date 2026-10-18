// Scheduled maintenance announcements (notifications.md §2.18): an admin tells
// everyone active in the agency when Guad will be down and how to prepare.
// The wording comes from domain/maintenance.ts, never from typed text.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	MAINTENANCE_IMPACTS,
	maintenanceBody,
	maintenanceTitle,
	maintenanceWindowError,
	type MaintenanceImpact,
	type StaffRole
} from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { notify } from './index';
import { activeStaff, agencyTimezone, allAgencies, announced } from './maintenance.queries';

export const MaintenanceInput = z.object({
	/** Chosen by the device, so a double submit sends one announcement */
	id: z.uuid(),
	startsAt: z.coerce.date(),
	endsAt: z.coerce.date(),
	impact: z.enum(Object.keys(MAINTENANCE_IMPACTS) as [MaintenanceImpact, ...MaintenanceImpact[]])
});

export async function announceMaintenance(
	tx: Tx,
	agencyId: string,
	input: z.input<typeof MaintenanceInput>
): Promise<{ recipients: number; title: string; alreadySent: boolean }> {
	const m = MaintenanceInput.parse(input);
	const problem = maintenanceWindowError(m.startsAt, m.endsAt, new Date());
	if (problem) throw new ServiceError('VALIDATION_FAILED', problem);
	const { timezone, staff, sent } = await asService(tx, async (t) => ({
		timezone: await agencyTimezone(t, agencyId),
		staff: await activeStaff(t, agencyId),
		sent: await announced(t, agencyId, m.id)
	}));
	const title = maintenanceTitle(m.startsAt, m.endsAt, timezone ?? 'America/New_York');
	if (sent) return { recipients: staff.length, title, alreadySent: true };
	await notify(
		tx,
		agencyId,
		staff.map((s) => ({ id: s.id, role: s.role as StaffRole })),
		{
			type: 'system_maintenance',
			priority: 4,
			title,
			body: maintenanceBody(m.impact),
			referenceId: m.id,
			referenceType: 'maintenance'
		}
	);
	return { recipients: staff.length, title, alreadySent: false };
}

/** Agencies a platform-wide announcement goes to. Service role: operators only. */
export function platformAgencies(tx: Tx): Promise<string[]> {
	return asService(tx, (t) => allAgencies(t)).then((rows) => rows.map((r) => r.id));
}

/**
 * One announcement ID per agency, derived from the operator's run ID, so
 * running the same announcement again sends nothing new to any agency.
 */
export function platformAnnouncementId(runId: string, agencyId: string): string {
	const h = createHash('sha256').update(`${runId}:${agencyId}`).digest('hex');
	// RFC 4122 shape (version 5-style, variant 10xx) so it fits uuid columns.
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
