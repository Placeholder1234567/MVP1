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
			{
				id: agency,
				name: 'Synthetic Intake',
				subscription_tier: 'complete',
				slug: `intake-${agency}`
			},
			{
				id: other,
				name: 'Other Synthetic Intake',
				subscription_tier: 'complete',
				slug: `intake-${other}`
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Intake Home' },
			{ id: secondHome, agency_id: agency, name: 'Second Home' },
			{ id: foreignHome, agency_id: other, name: 'Other Home' }
		]);
		await tx.insert(s.profiles).values(
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
it('marks bounded comparisons incomplete instead of inventing definite matching facts', async () => {
	const large = randomUUID(),
		admin = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: large,
			name: 'Synthetic bounded placement',
			slug: `intake-${large}`,
			subscription_tier: 'complete'
		});
		await tx.insert(s.profiles).values({
			id: admin,
			agency_id: large,
			auth_uid: `intake-${admin}`,
			email: `${admin}@example.test`,
			name: 'Synthetic placement admin',
			role: 'admin'
		});
		await tx.insert(s.homes).values(
			Array.from({ length: 201 }, (_, i) => ({
				agency_id: large,
				name: `Synthetic bounded ${i}`
			}))
		);
	});
	const api = (await as(admin)).intake;
	const referral = await api.createReferral({
		placementNeeds: { medicationCertifiedStaff: 'not_required' }
	});
	const row = await api.getReferral({ id: referral.id });
	expect(row.placement.complete).toBe(false);
	expect(row.placement.homes).toHaveLength(200);
	expect(row.placement.homes.every((h) => h.guidance === 'needs_review')).toBe(true);
});
it('matches only explicit reviewed needs with current accessible room and caregiver facts', async () => {
	const certified = randomUUID(),
		gap = randomUUID(),
		archived = randomUUID(),
		staff = randomUUID(),
		vacant = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.homes).values([
			{ id: certified, agency_id: agency, name: 'Certified placement' },
			{ id: gap, agency_id: agency, name: 'Certification gap' },
			{ id: archived, agency_id: agency, name: 'Archived placement', archived_at: new Date() }
		]);
		await tx
			.update(s.profiles)
			.set({ home_ids: [home, certified, gap, archived] })
			.where(eq(s.profiles.id, supervisor));
		await tx.insert(s.profiles).values([
			{
				id: staff,
				agency_id: agency,
				auth_uid: `placement-${staff}`,
				email: `${staff}@example.test`,
				name: 'Synthetic Certified',
				role: 'caregiver',
				home_ids: [certified],
				med_certified: true
			},
			{
				agency_id: agency,
				auth_uid: `placement-${randomUUID()}`,
				email: `${randomUUID()}@example.test`,
				name: 'Inactive Synthetic',
				role: 'caregiver',
				home_ids: [gap],
				med_certified: true,
				active: false
			},
			{
				agency_id: agency,
				auth_uid: `placement-${randomUUID()}`,
				email: `${randomUUID()}@example.test`,
				name: 'Supervisor Synthetic',
				role: 'supervisor',
				home_ids: [gap],
				med_certified: true
			}
		]);
		await tx.insert(s.rooms).values([
			{ id: vacant, agency_id: agency, home_id: certified, name: 'Available' },
			{ agency_id: agency, home_id: certified, name: 'Reserved', status: 'reserved' },
			{ agency_id: agency, home_id: gap, name: 'Gap available' },
			{ agency_id: agency, home_id: archived, name: 'Archived available' }
		]);
	});
	const api = (await as(supervisor)).intake;
	const referral = await api.createReferral({
		notes: 'Synthetic narrative mentions medication support.'
	});
	let row = await api.getReferral({ id: referral.id });
	expect(row.placement_needs).toEqual({ medicationCertifiedStaff: 'unknown' });
	expect(row.placement.complete).toBe(true);
	expect(row.placement.homes.find((h) => h.homeId === certified)).toMatchObject({
		availableRooms: 1,
		certifiedCaregivers: 1,
		guidance: 'needs_review'
	});
	expect(
		row.placement.homes.some(
			(h) => h.homeId === archived || h.homeId === foreignHome || h.homeId === secondHome
		)
	).toBe(false);
	row = await api.updateReferral({
		id: referral.id,
		status: 'accepted',
		placementNeeds: { medicationCertifiedStaff: 'required' }
	});
	expect(row.placement.homes.find((h) => h.homeId === certified)?.guidance).toBe(
		'review_candidate'
	);
	expect(row.placement.homes.find((h) => h.homeId === gap)).toMatchObject({
		certifiedCaregivers: 0,
		guidance: 'certification_gap'
	});
	await api.updateReferral({ id: referral.id, notes: 'Ordinary update preserves reviewed needs.' });
	expect(
		(await api.getReferral({ id: referral.id })).placement_needs.medicationCertifiedStaff
	).toBe('required');
	await expect(
		api.updateReferral({
			id: referral.id,
			placementNeeds: { medicationCertifiedStaff: 'required', inferred: true }
		} as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await withService(async (tx) => {
		await tx.update(s.profiles).set({ med_certified: false }).where(eq(s.profiles.id, staff));
		await tx.update(s.rooms).set({ status: 'reserved' }).where(eq(s.rooms.id, vacant));
	});
	row = await api.getReferral({ id: referral.id });
	expect(row.placement.homes.find((h) => h.homeId === certified)).toMatchObject({
		availableRooms: 0,
		certifiedCaregivers: 0,
		guidance: 'no_available_room'
	});
	await withService(async (tx) => {
		await tx
			.update(s.profiles)
			.set({ home_ids: [home, certified] })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, supervisor)));
	});
	// Reuse the caller with its older claim: current profile ownership still wins.
	expect(
		(await api.getReferral({ id: referral.id })).placement.homes.some((h) => h.homeId === gap)
	).toBe(false);
	await withService(async (tx) => {
		await tx
			.update(s.profiles)
			.set({ home_ids: [home, certified, gap] })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, supervisor)));
	});
	// Explicit human admission remains authoritative; current guidance is returned, never an auto-placement.
	const admitted = await api.convertToClient({
		referralId: referral.id,
		homeId: gap,
		name: 'Synthetic reviewed admission'
	});
	expect(admitted.placement.homes.find((h) => h.homeId === gap)?.guidance).toBe(
		'certification_gap'
	);
	expect((await api.getReferral({ id: referral.id })).assigned_home_id).toBe(gap);
});
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
		() => api.addReferralNote({ referralId: randomUUID(), body: 'x' }),
		() => api.listReferralNotes({ referralId: randomUUID() }),
		() => api.convertToClient({ referralId: randomUUID(), homeId: home, name: 'Synthetic' }),
		() => api.listRooms({}),
		() => api.createRoom({ homeId: home, name: 'Forbidden' }),
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
it('keeps notes at each stage, oldest first, for the agency only', async () => {
	const api = (await as(supervisor)).intake;
	const row = await api.createReferral({ clientName: 'Synthetic Stage Notes' });
	const first = await api.addReferralNote({ referralId: row.id, body: 'First call (synthetic).' });
	expect(first).toMatchObject({ status: 'inquiry', authorName: 'Synthetic Intake Staff' });
	await api.updateReferral({ id: row.id, status: 'touring' });
	await api.addReferralNote({ referralId: row.id, body: 'Toured the home (synthetic).' });
	expect(
		(await api.listReferralNotes({ referralId: row.id })).map((n) => [n.status, n.body])
	).toEqual([
		['inquiry', 'First call (synthetic).'],
		['touring', 'Toured the home (synthetic).']
	]);
	await expect(api.addReferralNote({ referralId: row.id, body: '  ' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	const outsiderApi = (await as(outsider)).intake;
	await expect(outsiderApi.listReferralNotes({ referralId: row.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(
		outsiderApi.addReferralNote({ referralId: row.id, body: 'x' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('moves forward freely, but moving back or reopening needs a reason kept as a note', async () => {
	const api = (await as(supervisor)).intake;
	const row = await api.createReferral({ clientName: 'Synthetic Stage Moves' });
	// Skipping the tour (an emergency placement) and accepted <-> waitlist need no reason.
	await api.updateReferral({ id: row.id, status: 'accepted' });
	await api.updateReferral({ id: row.id, status: 'waitlist' });
	await api.updateReferral({ id: row.id, status: 'accepted' });
	await expect(api.updateReferral({ id: row.id, status: 'touring' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	await expect(
		api.updateReferral({ id: row.id, status: 'touring', reason: '   ' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await api.updateReferral({
		id: row.id,
		status: 'touring',
		reason: 'Family asked for a second visit (synthetic).'
	});
	await api.updateReferral({ id: row.id, status: 'declined' });
	await expect(api.updateReferral({ id: row.id, status: 'inquiry' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	const reopened = await api.updateReferral({
		id: row.id,
		status: 'inquiry',
		reason: 'Appeal granted (synthetic).'
	});
	expect(reopened.status).toBe('inquiry');
	expect(
		(await api.listReferralNotes({ referralId: row.id })).map((n) => [n.status, n.body])
	).toEqual([
		['touring', 'Moved from accepted: Family asked for a second visit (synthetic).'],
		['inquiry', 'Moved from declined: Appeal granted (synthetic).']
	]);
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
	// Admitted like any new person: initials and a first name for the app and Lomi.
	const [person] = await withService((tx) =>
		tx
			.select({ initials: s.clients.initials, firstName: s.clients.first_name })
			.from(s.clients)
			.where(eq(s.clients.id, result.clientId))
	);
	expect(person).toEqual({ initials: 'SR', firstName: 'Synthetic' });
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

it('creates room inventory, preserves configured capacity and edits without moving homes', async () => {
	const api = (await as(supervisor)).intake;
	const created = await api.createRoom({
		homeId: home,
		name: '  Accessible Room  ',
		capacity: 2,
		status: 'reserved'
	});
	expect(created.name).toBe('Accessible Room');
	expect(created.capacity).toBe(2);
	expect(created.occupied_by).toBeNull();
	expect(created.status).toBe('reserved');
	const edited = await api.updateRoom({
		id: created.id,
		name: 'Accessible Suite',
		capacity: 3,
		status: 'available'
	});
	expect(edited.home_id).toBe(home);
	expect(edited.name).toBe('Accessible Suite');
	expect(edited.capacity).toBe(3);
	expect((await api.listRooms({ homeId: home })).find((r) => r.id === created.id)?.capacity).toBe(
		3
	);
});

it('rejects invalid room configuration before creating or updating inventory', async () => {
	const api = (await as(supervisor)).intake;
	for (const capacity of [0, -1, 1.5, 21]) {
		await expect(
			api.createRoom({ homeId: home, name: 'Invalid capacity', capacity })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(api.updateRoom({ id: room, capacity })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
	}
	await expect(api.createRoom({ homeId: home, name: '   ' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	await expect(api.updateRoom({ id: room, name: '' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
});

it('isolates new inventory and configuration updates from other agencies', async () => {
	const api = (await as(supervisor)).intake;
	await expect(
		api.createRoom({ homeId: foreignHome, name: 'Foreign attempt' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const created = await api.createRoom({ homeId: home, name: 'Tenant isolation' });
	await expect(
		(await as(outsider)).intake.updateRoom({ id: created.id, name: 'Changed', capacity: 4 })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	expect((await api.listRooms({})).find((r) => r.id === created.id)?.name).toBe('Tenant isolation');
});

it('serializes concurrent case-insensitive room names within a home, allowing the same name in another home', async () => {
	const api = (await as(supervisor)).intake;
	const results = await Promise.allSettled(
		['Duplicate Suite', ' duplicate suite '].map((name) => api.createRoom({ homeId: home, name }))
	);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const another = await api.createRoom({ homeId: home, name: 'Rename Target' });
	await expect(api.updateRoom({ id: another.id, name: 'DUPLICATE SUITE' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	expect((await api.createRoom({ homeId: secondHome, name: 'Duplicate Suite' })).home_id).toBe(
		secondHome
	);
});

it('never treats capacity as multiple assignable beds and keeps the first assignment intact', async () => {
	const api = (await as(supervisor)).intake;
	const created = await api.createRoom({
		homeId: home,
		name: 'Shared physical space',
		capacity: 2
	});
	const id = await accepted();
	const first = await api.convertToClient({
		referralId: id,
		homeId: home,
		roomId: created.id,
		name: 'Synthetic First'
	});
	const second = await accepted();
	await expect(
		api.convertToClient({
			referralId: second,
			homeId: home,
			roomId: created.id,
			name: 'Synthetic Second'
		})
	).rejects.toMatchObject({ code: 'CONFLICT' });
	const inventory = (await api.listRooms({})).find((r) => r.id === created.id)!;
	expect(inventory.occupiedBy).toBe(first.clientId);
	expect(inventory.status).toBe('occupied');
	expect(inventory.capacity).toBe(2);
	expect((await api.getReferral({ id: second })).status).toBe('accepted');
});

it('rejects occupants from another home or agency and inactive clients', async () => {
	const api = (await as(supervisor)).intake;
	const created = await api.createRoom({ homeId: home, name: 'Occupancy boundaries' });
	const wrongHome = randomUUID(),
		foreignClient = randomUUID(),
		inactive = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.clients).values([
			{ id: wrongHome, agency_id: agency, home_id: secondHome, name: 'Synthetic Elsewhere' },
			{ id: foreignClient, agency_id: other, home_id: foreignHome, name: 'Synthetic Other Tenant' },
			{ id: inactive, agency_id: agency, home_id: home, name: 'Synthetic Inactive', active: false }
		]);
	});
	for (const occupiedBy of [wrongHome, foreignClient, inactive])
		await expect(api.updateRoom({ id: created.id, occupiedBy })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
	expect((await api.listRooms({})).find((r) => r.id === created.id)?.occupiedBy).toBeNull();
});
