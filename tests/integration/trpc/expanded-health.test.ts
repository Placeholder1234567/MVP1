import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { localTime } from '../../../src/lib/domain/time';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	otherAgency = randomUUID(),
	home = randomUUID(),
	otherHome = randomUUID();
const person = randomUUID(),
	otherPerson = randomUUID(),
	staff = randomUUID(),
	supervisor = randomUUID();
const uid = (id: string) => `expanded-health-${id}`;
const caller = createCallerFactory(appRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				name: 'Synthetic expanded health',
				slug: `health-${agency}`,
				subscription_tier: 'complete'
			},
			{
				id: otherAgency,
				name: 'Other synthetic agency',
				slug: `health-${otherAgency}`,
				subscription_tier: 'complete'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Synthetic home' },
			{ id: otherHome, agency_id: otherAgency, name: 'Other home' }
		]);
		await tx.insert(s.clients).values([
			{ id: person, agency_id: agency, home_id: home, name: 'Synthetic person' },
			{
				id: otherPerson,
				agency_id: otherAgency,
				home_id: otherHome,
				name: 'Other synthetic person'
			}
		]);
		await tx.insert(s.profiles).values(
			(
				[
					['caregiver', staff],
					['supervisor', supervisor]
				] as const
			).map(([role, id]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: `Health ${role}`,
				role,
				home_ids: [home]
			}))
		);
	});
});
afterAll(closeDb);

it('persists expanded numeric readings through online and queued writes and exports without inferred alerts', async () => {
	const care = await as(staff),
		office = await as(supervisor);
	const data = { respiration: 12.5, oxygen: 97.2, glucose: 104 };
	const online = await care.health.create({ clientId: person, kind: 'vitals', data });
	expect(online.data).toEqual(data);
	expect(online.flags).toEqual([]);
	const queued = randomUUID();
	const upload = await care.sync.upload({
		transactionId: 50,
		ops: [
			{
				op: 'PUT',
				table: 'health_entries',
				id: queued,
				data: {
					client_id: person,
					kind: 'vitals',
					data: JSON.stringify({ respiration: 0, oxygen: 0, glucose: 0 })
				}
			}
		]
	});
	expect(upload.rejected).toEqual([]);
	expect(
		(await care.health.list({ clientId: person })).find((row) => row.id === queued)
	).toMatchObject({ data: { respiration: 0, oxygen: 0, glucose: 0 }, flags: ['glucose'] });
	for (const data of [{ oxygen: 101 }, { respiration: false }, { glucose: ' ' }, { glucose: 'HI' }])
		await expect(
			care.health.create({ clientId: person, kind: 'vitals', data })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const user = (await getCurrentUser(uid(staff)))!;
	const day = localTime(new Date(), user.timeZone).day;
	const report = await office.report.exportClinical({
		type: 'health',
		homeId: home,
		clientId: person,
		fromDay: day,
		toDay: day,
		format: 'json'
	});
	expect(
		JSON.parse(report.content).rows.find((row: { id: string }) => row.id === online.id)
	).toMatchObject({ kind: 'vitals', data, flags: [] });
	const alerts = await withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.reference_id, online.id),
					eq(s.notifications.type, 'health_alert')
				)
			)
	);
	expect(alerts).toEqual([]);
});

// Intentionally runs in CI on the migrated schema; never skip when the additive enum is present.
it('flags a weight 5 lb or more from the last one, and glucose outside 70 to 249', async () => {
	const care = await as(staff);
	const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
	const first = await care.health.create({
		clientId: person,
		kind: 'vitals',
		data: { weight: 150 },
		recordedAt: at(30)
	});
	expect(first.flags).toEqual([]);
	const small = await care.health.create({
		clientId: person,
		kind: 'vitals',
		data: { weight: 153 },
		recordedAt: at(20)
	});
	expect(small.flags).toEqual([]);
	const big = await care.health.create({
		clientId: person,
		kind: 'vitals',
		data: { weight: 147, glucose: 260 },
		recordedAt: at(10)
	});
	expect(big.flags).toEqual(['glucose', 'weight_change']);
});

it('stores explicit bowel observations as their own kind, including offline replay and report export', async () => {
	const care = await as(staff),
		office = await as(supervisor);
	const data = {
		status: 'Observed',
		time: '09:30',
		consistency: 'Synthetic observed description',
		notes: 'Human entered'
	};
	const online = await care.health.create({ clientId: person, kind: 'bowel', data });
	expect(online).toMatchObject({ kind: 'bowel', data, flags: [] });
	const id = randomUUID();
	const payload = {
		transactionId: 51,
		ops: [
			{
				op: 'PUT' as const,
				table: 'health_entries',
				id,
				data: {
					client_id: person,
					kind: 'bowel',
					data: JSON.stringify({ status: 'Not observed', time: '10:30' })
				}
			}
		]
	};
	for (let i = 0; i < 2; i++) expect((await care.sync.upload(payload)).rejected).toEqual([]);
	const list = await care.health.list({ clientId: person, kind: 'bowel' });
	expect(list.filter((row) => row.id === id)).toHaveLength(1);
	expect(list.find((row) => row.id === id)).toMatchObject({
		kind: 'bowel',
		data: { status: 'Not observed', time: '10:30' },
		flags: []
	});
	const user = (await getCurrentUser(uid(staff)))!;
	const day = localTime(new Date(), user.timeZone).day;
	const report = await office.report.exportClinical({
		type: 'health',
		homeId: home,
		clientId: person,
		fromDay: day,
		toDay: day,
		format: 'json'
	});
	expect(
		JSON.parse(report.content).rows.find((row: { id: string }) => row.id === online.id)
	).toMatchObject({ kind: 'bowel', data });
});

it('rejects ambiguous bowel data and preserves tenant and feature boundaries in online and queued paths', async () => {
	const care = await as(staff);
	for (const data of [
		{},
		{ status: 'Not observed', consistency: 'Contradiction' },
		{ status: 'Unknown' }
	])
		await expect(
			care.health.create({ clientId: person, kind: 'bowel', data })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(
		care.health.create({ clientId: otherPerson, kind: 'bowel', data: { status: 'Declined' } })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const id = randomUUID();
	const result = await care.sync.upload({
		transactionId: 52,
		ops: [
			{
				op: 'PUT',
				table: 'health_entries',
				id,
				data: {
					client_id: person,
					kind: 'bowel',
					data: JSON.stringify({ status: 'Declined', consistency: 'Contradiction' })
				}
			}
		]
	});
	expect(result.applied).toEqual([]);
	expect(result.rejected).toMatchObject([{ id, code: 'VALIDATION_FAILED' }]);
	const user = (await getCurrentUser(uid(staff)))!;
	const noFeature = caller({ user: { ...user, features: [] }, request: {} });
	await expect(
		noFeature.health.create({ clientId: person, kind: 'bowel', data: { status: 'Declined' } })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	expect(
		(
			await noFeature.sync.upload({
				transactionId: 53,
				ops: [
					{
						op: 'PUT',
						table: 'health_entries',
						id: randomUUID(),
						data: { client_id: person, kind: 'bowel', data: '{"status":"Declined"}' }
					}
				]
			})
		).rejected
	).toMatchObject([{ code: 'FEATURE_NOT_INCLUDED' }]);
});
