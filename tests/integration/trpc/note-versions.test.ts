// Earlier note versions (frontend-audit.md finding 14) come from the audit
// trail: supervisors see each signed version, caregivers can't, and the read
// is itself audited.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const agency = randomUUID(),
	oak = randomUUID(),
	carer = randomUUID(),
	sup = randomUUID(),
	person = randomUUID();
const uid = (id: string) => `note-versions-${id}`;
const as = async (id: string) =>
	createCaller({ user: await getCurrentUser(uid(id)), request: { ip: '203.0.113.9' } });

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Note Versions Test',
			subscription_tier: 'complete',
			slug: `notever-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.homes).values({ id: oak, agency_id: agency, name: 'Oak House' });
		await tx.insert(s.profiles).values(
			(
				[
					[carer, 'caregiver'],
					[sup, 'supervisor']
				] as const
			).map(([id, role]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: role === 'caregiver' ? 'Cara Synthetic' : 'Sam Synthetic',
				role,
				home_ids: [oak]
			}))
		);
		await tx
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: oak, name: 'Synthetic Person' });
	});
});
afterAll(closeDb);

it('shows each signed version to supervisors and records the read', async () => {
	const caregiver = await as(carer);
	const supervisor = await as(sup);
	const id = randomUUID();
	await caregiver.note.create({
		id,
		clientId: person,
		type: 'shift',
		content: { activities: 'Ate lunch.' }
	});
	await caregiver.note.sign({ id });
	await supervisor.note.sendBack({ id, comment: 'What did they eat?' });
	await caregiver.note.update({ id, content: { activities: 'Ate a full lunch of soup.' } });
	await caregiver.note.sign({ id });

	await expect(caregiver.note.versions({ id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
	const { versions } = await supervisor.note.versions({ id });
	expect(versions.map((v) => [v.number, v.content.activities, v.by])).toEqual([
		[1, 'Ate lunch.', 'Cara Synthetic'],
		[2, 'Ate a full lunch of soup.', 'Cara Synthetic']
	]);
	const views = await withService((tx) =>
		tx
			.select({
				by: s.auditLog.performed_by,
				ip: s.auditLog.ip_address,
				values: s.auditLog.new_values
			})
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'audit_views')))
	);
	expect(views).toEqual([
		{ by: sup, ip: '203.0.113.9', values: { viewed: 'note_versions', note: id } }
	]);
	await expect(supervisor.note.versions({ id: randomUUID() })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
