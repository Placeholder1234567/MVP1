import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	other = randomUUID(),
	home = randomUUID(),
	secondHome = randomUUID(),
	foreignHome = randomUUID(),
	supervisor = randomUUID(),
	caregiver = randomUUID(),
	outsider = randomUUID(),
	room = randomUUID(),
	spare = randomUUID();
const caller = createCallerFactory(appRouter);
const as = async (id: string) =>
	caller({ user: await getCurrentUser(`intake-${id}`), request: {} });
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{ id: agency, name: 'Synthetic Intake', slug: `intake-${agency}` },
			{ id: other, name: 'Other Synthetic Intake', slug: `intake-${other}` }
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Intake Home' },
			{ id: secondHome, agency_id: agency, name: 'Second Home' },
			{ id: foreignHome, agency_id: other, name: 'Other Home' }
		]);
		await tx
			.insert(s.profiles)
			.values(
				[supervisor, caregiver, outsider].map((id) => ({
					id,
					agency_id: id === outsider ? other : agency,
					auth_uid: `intake-${id}`,
					email: `${id}@example.test`,
					name: 'Synthetic Intake Staff',
					role: id === caregiver ? ('caregiver' as const) : ('supervisor' as const),
					home_ids: [id === outsider ? foreignHome : home]
				}))
			);
		await tx.insert(s.rooms).values([
			{ id: room, agency_id: agency, home_id: home, name: 'Synthetic Room' },
			{ id: spare, agency_id: agency, home_id: home, name: 'Spare Room' }
		]);
	});
});
afterAll(closeDb);
const accepted = async () => {
	const api = (await as(supervisor)).intake;
	const row = await api.createReferral({
		clientName: 'Synthetic Admission',
		contactName: 'Synthetic Contact',
		source: 'Test'
	});
	await api.updateReferral({ id: row.id, status: 'accepted', assignedHomeId: home });
	return row.id;
};
it('blocks caregivers from every intake procedure', async () => {
	const api = (await as(caregiver)).intake;
	for (const call of [
		() => api.createReferral({}),
		() => api.listReferrals({}),
		() => api.getReferral({ id: randomUUID() }),
		() => api.updateReferral({ id: randomUUID(), status: 'accepted' }),
		() => api.convertToClient({ referralId: randomUUID(), homeId: home, name: 'Synthetic' }),
		() => api.listRooms({}),
		() => api.updateRoom({ id: room, status: 'reserved' })
	])
		await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('isolates referral reads, writes and home assignments by agency', async () => {
	const id = await accepted(),
		api = (await as(outsider)).intake,
		own = (await as(supervisor)).intake;
	expect(await api.listReferrals({})).toEqual([]);
	expect(await api.listRooms({})).toEqual([]);
	await expect(api.getReferral({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(api.updateReferral({ id, status: 'declined' })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(api.updateRoom({ id: room, status: 'reserved' })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(own.updateReferral({ id, assignedHomeId: foreignHome })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(
		own.convertToClient({ referralId: id, homeId: foreignHome, name: 'Synthetic' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('requires acceptance and prevents direct placement or reopening', async () => {
	const api = (await as(supervisor)).intake,
		row = await api.createReferral({});
	await expect(
		api.convertToClient({ referralId: row.id, homeId: home, name: 'Synthetic' })
	).rejects.toMatchObject({ code: 'CONFLICT' });
	await expect(api.updateReferral({ id: row.id, status: 'placed' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	await api.updateReferral({ id: row.id, status: 'accepted' });
	const result = await api.convertToClient({
		referralId: row.id,
		homeId: home,
		name: 'Synthetic Without Room'
	});
	expect(result.clientId).toBeTruthy();
	await expect(api.updateReferral({ id: row.id, status: 'accepted' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
});
it('admits only once under simultaneous requests and creates matching health information', async () => {
	const api = (await as(supervisor)).intake,
		id = await accepted();
	const results = await Promise.allSettled(
		[1, 2].map(() =>
			api.convertToClient({ referralId: id, homeId: home, name: 'Synthetic Concurrent Client' })
		)
	);
	const successes = results.filter((r) => r.status === 'fulfilled');
	expect(successes).toHaveLength(1);
	const clientId = successes[0].value.clientId;
	await withService(async (tx) => {
		const [health] = await tx
			.select()
			.from(s.clientHealthInfo)
			.where(
				and(eq(s.clientHealthInfo.agency_id, agency), eq(s.clientHealthInfo.client_id, clientId))
			);
		expect(health.home_id).toBe(home);
	});
	expect((await api.getReferral({ id })).status).toBe('placed');
});
it('respects reservations and room home before admitting, without creating partial records', async () => {
	const api = (await as(supervisor)).intake,
		id = await accepted();
	await api.updateRoom({ id: room, status: 'reserved' });
	await expect(
		api.convertToClient({ referralId: id, homeId: home, roomId: room, name: 'Synthetic Reserved' })
	).rejects.toMatchObject({ code: 'CONFLICT' });
	await expect(
		api.convertToClient({
			referralId: id,
			homeId: secondHome,
			roomId: room,
			name: 'Synthetic Wrong Home'
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	expect((await api.getReferral({ id })).status).toBe('accepted');
	await api.updateRoom({ id: room, status: 'available' });
});
it('lets only one referral take a room and enforces consistent occupancy and release', async () => {
	const api = (await as(supervisor)).intake,
		ids = await Promise.all([accepted(), accepted()]);
	const results = await Promise.allSettled(
		ids.map((referralId) =>
			api.convertToClient({ referralId, homeId: home, roomId: room, name: 'Synthetic Room Race' })
		)
	);
	const successes = results.filter((r) => r.status === 'fulfilled');
	expect(successes).toHaveLength(1);
	const clientId = successes[0].value.clientId;
	expect((await api.listRooms({ status: 'occupied' })).find((r) => r.id === room)?.occupiedBy).toBe(
		clientId
	);
	await expect(api.updateRoom({ id: spare, occupiedBy: clientId })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	await expect(api.updateRoom({ id: room, status: 'available' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	await expect(api.updateRoom({ id: spare, status: 'occupied' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	const released = await api.updateRoom({ id: room, occupiedBy: null });
	expect(released.status).toBe('available');
	expect(released.occupied_by).toBeNull();
	expect((await api.updateRoom({ id: spare, occupiedBy: clientId })).status).toBe('occupied');
});
