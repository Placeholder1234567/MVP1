// Medication-due reminders (notifications.md §2.8): the sweep reminds the
// scheduled caregivers before a dose, alerts the supervisor once it is late,
// and sends each alert once.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import {
	doseAlertId,
	remindAgency
} from '../../../src/lib/server/services/notification/med-reminders';
import { setProvidersForTests } from '../../../src/lib/server/messaging';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	oak = randomUUID();
const carer = randomUUID(),
	nextCarer = randomUUID(),
	offCarer = randomUUID(),
	sup = randomUUID();
const person = randomUUID(),
	med = randomUUID();
const DAY = '2026-03-10';
const at = (time: string) => new Date(`${DAY}T${time}:00Z`);

beforeAll(async () => {
	const ok = vi.fn(async () => ({ providerMessageId: 'test' }));
	setProvidersForTests({ sms: ok, push: ok, email: ok });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Med Reminder Test',
			subscription_tier: 'complete',
			slug: `medrem-${agency}`,
			timezone: 'UTC'
		});
		await tx
			.insert(s.homes)
			.values({ id: oak, agency_id: agency, name: 'Oak House', lat: 40, lng: -75, radius: 150 });
		await tx.insert(s.profiles).values(
			(
				[
					[carer, 'caregiver'],
					[nextCarer, 'caregiver'],
					[offCarer, 'caregiver'],
					[sup, 'supervisor']
				] as const
			).map(([id, role]) => ({
				id,
				agency_id: agency,
				auth_uid: `medrem-${id}`,
				email: `${id}@example.test`,
				name: 'Synthetic Staff',
				role,
				home_ids: [oak]
			}))
		);
		await tx.insert(s.scheduleSlots).values([
			// The overnight shift running at 06:45 started the evening before.
			{
				agency_id: agency,
				home_id: oak,
				day: '2026-03-09',
				shift: 'on',
				assigned_to: carer,
				status: 'filled'
			},
			{
				agency_id: agency,
				home_id: oak,
				day: DAY,
				shift: 'am',
				assigned_to: nextCarer,
				status: 'filled'
			},
			{
				agency_id: agency,
				home_id: oak,
				day: DAY,
				shift: 'pm',
				assigned_to: offCarer,
				status: 'filled'
			}
		]);
		await tx
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: oak, name: 'Synthetic Person' });
		await tx.insert(s.medications).values({
			id: med,
			agency_id: agency,
			client_id: person,
			home_id: oak,
			name: 'Synthetic med',
			scheduled_times: ['07:10', '12:00']
		});
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

const sweep = (now: Date) => withService((tx) => remindAgency(tx, agency, 'UTC', now));
const inbox = (type: string) =>
	withService((tx) =>
		tx
			.select({
				profileId: s.notifications.profile_id,
				title: s.notifications.title,
				body: s.notifications.body,
				priority: s.notifications.priority,
				referenceId: s.notifications.reference_id
			})
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.type, type),
					eq(s.notifications.channel, 'in_app')
				)
			)
	);

it('reminds the caregivers on shift and on the dose shift, once', async () => {
	expect(await sweep(at('06:45'))).toEqual({ due: 1, overdue: 0 });
	expect(await sweep(at('06:50'))).toEqual({ due: 0, overdue: 0 });
	const rows = await inbox('med_due_reminder');
	expect(rows.map((r) => r.profileId).sort()).toEqual([carer, nextCarer].sort());
	expect(rows[0]).toMatchObject({
		title: 'Medication administration due at Oak House in 30 minutes.',
		body: null,
		priority: 3,
		referenceId: doseAlertId('med_due_reminder', { homeId: oak, day: DAY, time: '07:10' })
	});
});

it('alerts the supervisor when the dose is 30 minutes late, once', async () => {
	expect(await sweep(at('07:45'))).toEqual({ due: 0, overdue: 1 });
	expect(await sweep(at('07:50'))).toEqual({ due: 0, overdue: 0 });
	const rows = await inbox('med_overdue');
	expect(rows).toEqual([
		{
			profileId: sup,
			title: 'Medication administration overdue at Oak House.',
			body: 'A dose due at 07:10 has not been recorded.',
			priority: 2,
			referenceId: doseAlertId('med_overdue', { homeId: oak, day: DAY, time: '07:10' })
		}
	]);
});

it('stays quiet once the dose is recorded', async () => {
	await withService((tx) =>
		tx.insert(s.marRecords).values({
			agency_id: agency,
			client_id: person,
			home_id: oak,
			medication_id: med,
			day: DAY,
			scheduled_time: '12:00',
			status: 'given',
			recorded_by: nextCarer
		})
	);
	expect(await sweep(at('11:40'))).toEqual({ due: 0, overdue: 0 });
	expect(await sweep(at('12:40'))).toEqual({ due: 0, overdue: 0 });
});
