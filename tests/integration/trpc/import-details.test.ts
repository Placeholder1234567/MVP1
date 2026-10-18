import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { parseImportCsv, previewImport } from '../../../src/lib/domain/csv-import';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
afterAll(closeDb);
it('roundtrips imported demographics, health details, behaviors and ordered steps through real management APIs', async () => {
	const agency = randomUUID(),
		home = randomUUID(),
		profile = randomUUID();
	await withService(async (tx) => {
		await tx
			.insert(s.agencies)
			.values({
				id: agency,
				name: 'Synthetic import agency',
				slug: `import-${agency}`,
				subscription_tier: 'complete'
			});
		await tx.insert(s.homes).values({ id: home, agency_id: agency, name: 'Synthetic import home' });
		await tx
			.insert(s.profiles)
			.values({
				id: profile,
				agency_id: agency,
				auth_uid: `import-${profile}`,
				email: `import-${profile}@example.test`,
				name: 'Synthetic supervisor',
				role: 'supervisor',
				home_ids: [home]
			});
	});
	const api = createCallerFactory(appRouter)({
		user: await getCurrentUser(`import-${profile}`),
		request: {}
	});
	const csv = (headers: string[], values: string[]) =>
		parseImportCsv(
			headers.join(',') + '\n' + values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')
		);
	const context = { homes: [{ id: home, name: 'Synthetic import home' }], people: [] };
	const row = previewImport(
		'people',
		csv(
			[
				'home_id',
				'name',
				'first_name',
				'info',
				'dob',
				'guardian',
				'allergies',
				'conditions',
				'diet',
				'doctor',
				'behaviors'
			],
			[
				home,
				'Synthetic import person',
				'',
				'',
				'2000-02-29',
				'Synthetic guardian',
				'Synthetic allergy',
				'Synthetic condition',
				'Synthetic diet',
				'Synthetic doctor',
				JSON.stringify(['Quiet space', 'Cards, gestures'])
			]
		),
		context
	)[0];
	expect(row.errors).toEqual([]);
	if (row.payload.kind !== 'people') throw new Error('Unexpected import kind');
	const person = await api.client.create(row.payload.input);
	const saved = await api.client.get({ id: person.id });
	expect(saved).toMatchObject({
		behaviors: ['Quiet space', 'Cards, gestures'],
		healthInfo: {
			dob: '2000-02-29',
			guardian: 'Synthetic guardian',
			allergies: 'Synthetic allergy',
			conditions: 'Synthetic condition',
			diet: 'Synthetic diet',
			doctor: 'Synthetic doctor'
		}
	});
	const goal = previewImport(
		'goals',
		csv(
			['client_id', 'area', 'text', 'frequency', 'target', 'steps'],
			[
				person.id,
				'Daily living',
				'Synthetic imported goal',
				'',
				'',
				JSON.stringify(['First, prepare', 'Then finish'])
			]
		),
		{ ...context, people: [{ id: person.id, name: person.name, homeId: home, active: true }] }
	)[0];
	expect(goal.errors).toEqual([]);
	if (goal.payload.kind !== 'goals') throw new Error('Unexpected import kind');
	const created = await api.goal.create(goal.payload.input);
	expect(
		(await api.goal.list({ clientId: person.id })).find((g) => g.id === created.id)?.steps
	).toEqual(['First, prepare', 'Then finish']);
});
