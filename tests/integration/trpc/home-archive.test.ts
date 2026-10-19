// home.archive / home.restore: a closed home keeps its records but takes no
// new work, and can't be archived while anything still depends on it.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { addDays, localTime } from '../../../src/lib/domain';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	oak = randomUUID(),
	elm = randomUUID();
const ada = randomUUID(),
	sam = randomUUID(),
	cara = randomUUID(),
	dev = randomUUID(),
	person = randomUUID();
const uid = (id: string) => `archive-${id}`;
const caller = createCallerFactory(appRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const tomorrow = addDays(localTime(new Date(), 'America/New_York').day, 1);

const profile = (id: string, role: 'admin' | 'supervisor' | 'caregiver', homeIds: string[]) => ({
	id,
	agency_id: agency,
	auth_uid: uid(id),
	email: `${id}@example.test`,
	name: `Test ${role}`,
	role,
	home_ids: homeIds
});

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Archive Test',
			subscription_tier: 'complete',
			slug: `archive-${agency}`
		});
		await tx.insert(s.homes).values([
			{ id: oak, agency_id: agency, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: elm, agency_id: agency, name: 'Elm', lat: 41, lng: -75, radius: 150 }
		]);
		await tx
			.insert(s.profiles)
			.values([
				profile(ada, 'admin', []),
				profile(sam, 'supervisor', [oak, elm]),
				profile(cara, 'caregiver', [oak, elm]),
				profile(dev, 'caregiver', [elm])
			]);
		await tx
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: oak, name: 'Synthetic' });
	});
});

afterAll(closeDb);

describe('home archive', () => {
	it('only admins archive, and not while the home is in use', async () => {
		await expect((await as(sam)).home.archive({ id: oak })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		const admin = await as(ada);
		await (
			await as(sam)
		).schedule.setSlot({ homeId: oak, day: tomorrow, shift: 'am', profileId: cara });
		await expect(admin.home.archive({ id: oak })).rejects.toThrow(
			/1 person living there.*1 upcoming shift/
		);

		// Empty slots don't hold a home open.
		await (await as(sam)).schedule.clearSlot({ homeId: oak, day: tomorrow, shift: 'am' });
		await (await as(sam)).client.update({ id: person, active: false });
		const archived = await admin.home.archive({ id: oak });
		expect(archived.archivedAt).toBeInstanceOf(Date);
	});

	it('takes no new work at an archived home', async () => {
		const sup = await as(sam);
		await expect(
			sup.schedule.setSlot({ homeId: oak, day: tomorrow, shift: 'pm', profileId: cara })
		).rejects.toThrow(/archived/);
		await expect((await as(cara)).clock.clockIn({ homeId: oak })).rejects.toThrow(/archived/);
		await expect(sup.client.create({ name: 'New Person', homeId: oak })).rejects.toThrow(
			/archived/
		);
		// Bringing someone back would put them at a home no one can staff.
		await expect(sup.client.update({ id: person, active: true })).rejects.toThrow(/archived/);
		await expect(
			sup.intake.createRoom({ homeId: oak, name: 'Room 1', capacity: 1 })
		).rejects.toThrow(/archived/);

		const admin = await as(ada);
		await expect(admin.staff.update({ id: dev, homeIds: [elm, oak] })).rejects.toThrow(/archived/);
		// Staff already assigned keep it on their list while other changes save.
		await admin.staff.update({ id: cara, homeIds: [oak, elm], medCertified: true });

		// The board is read-only too, but a message written before the home
		// closed (queued offline) still lands.
		const [late, early] = [randomUUID(), randomUUID()];
		const board = await (
			await as(cara)
		).sync.upload({
			transactionId: 1,
			ops: [
				{ op: 'PUT', table: 'messages', id: late, data: { home_id: oak, body: 'After' } },
				{
					op: 'PUT',
					table: 'messages',
					id: early,
					data: {
						home_id: oak,
						body: 'Before',
						sent_at: new Date(Date.now() - 3_600_000).toISOString()
					}
				}
			]
		});
		expect(board.applied).toEqual([early]);
		expect(board.rejected[0]).toMatchObject({ code: 'RULE_VIOLATION' });

		// Its records stay readable.
		expect((await sup.client.get({ id: person })).homeId).toBe(oak);
		expect((await sup.home.list()).find((h) => h.id === oak)?.archivedAt).toBeInstanceOf(Date);
	});

	it('restores, and the database refuses to delete a home', async () => {
		const restored = await (await as(ada)).home.restore({ id: oak });
		expect(restored.archivedAt).toBeNull();
		const row = await (await as(cara)).clock.clockIn({ homeId: oak });
		expect(row.home_id ?? row.homeId).toBe(oak);
		// Before this, deleting a home silently removed its schedule and messages.
		await (await as(sam)).schedule.clearSlot({ homeId: elm, day: tomorrow, shift: 'on' });
		await expect(
			withService((tx) => tx.delete(s.homes).where(eq(s.homes.id, elm)))
		).rejects.toMatchObject({ cause: { code: '23503' } }); // foreign key violation
	});
});
