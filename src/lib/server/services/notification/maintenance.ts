// Scheduled maintenance announcements (notifications.md §2.18): an admin tells
// everyone active in the agency when Guad will be down and how to prepare.
// The wording comes from domain/maintenance.ts, never from typed text.
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
import { activeStaff, agencyTimezone, announced } from './maintenance.queries';

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
