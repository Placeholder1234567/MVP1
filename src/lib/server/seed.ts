// Development seed data, synthetic only (migration-plan.md §8). Creates one
// demo agency with two homes, five staff who can sign in through the local
// Auth emulator, and a few people with medications.
//
//   npm run dev:auth   (Auth emulator on 127.0.0.1:9099)
//   npm run db:seed
//
// Every account below uses DEV_PASSWORD. It exists only in the emulator.
import { randomUUID } from 'node:crypto';
import { closeDb, withService } from './db';
import { agencies, clients, deviceTokens, homes, medications, profiles, rooms } from './db/schema';
import { DEMO_STAFF, DEV_PASSWORD } from './demo-accounts';
import { createIdentity, deleteIdentity } from './identity';

export { DEV_PASSWORD } from './demo-accounts';
// Only the guarded browser runner requests these disposable accounts. Separate
// profiles keep destructive desktop/phone tests independent of suite order.
// Each browser-test viewport gets one registered device per removal test.
const PUSH_FIXTURES = ['push', 'push-held'].flatMap((prefix) =>
	['desktop', 'phone'].map((project) => ({
		name: `Synthetic ${prefix === 'push' ? 'Push' : 'Held Push'} ${project}`,
		email: `${prefix}-${project}@guad.test`,
		role: 'caregiver' as const,
		homes: ['oak'] as const,
		med: false
	}))
);
const STAFF = [...DEMO_STAFF, ...(process.env.GUAD_E2E === '1' ? PUSH_FIXTURES : [])];

async function main() {
	if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
		throw new Error(
			'Refusing to seed: FIREBASE_AUTH_EMULATOR_HOST is not set (seed only runs against the emulator)'
		);
	}
	const agencyId = randomUUID();
	const homeIds = { oak: randomUUID(), maple: randomUUID() };

	// Identities first, so a failure leaves no half-made database rows.
	const created: string[] = [];
	const staff: Array<(typeof STAFF)[number] & { uid: string; profileId: string }> = [];
	try {
		for (const s of STAFF) {
			const uid = await createIdentity({
				email: s.email,
				displayName: s.name,
				password: DEV_PASSWORD
			});
			created.push(uid);
			staff.push({ ...s, uid, profileId: randomUUID() });
		}
	} catch (e) {
		for (const uid of created) await deleteIdentity(uid).catch(() => {});
		throw new Error(
			`Could not create emulator accounts (already seeded? restart the emulator to clear them): ${(e as Error).message}`,
			{ cause: e }
		);
	}

	await withService(async (tx) => {
		await tx.insert(agencies).values({
			id: agencyId,
			name: 'Sunrise Demo Agency',
			subscription_tier: 'complete',
			slug: `sunrise-${agencyId.slice(0, 8)}`
		});
		await tx.insert(homes).values([
			{
				id: homeIds.oak,
				agency_id: agencyId,
				name: 'Oak House',
				address: '1 Demo Lane',
				lat: 39.9526,
				lng: -75.1652,
				radius: 150
			},
			{
				id: homeIds.maple,
				agency_id: agencyId,
				name: 'Maple House',
				address: '2 Demo Lane',
				lat: 39.9612,
				lng: -75.1544,
				radius: 150
			}
		]);
		await tx.insert(profiles).values(
			staff.map((s) => ({
				id: s.profileId,
				agency_id: agencyId,
				auth_uid: s.uid,
				email: s.email,
				name: s.name,
				role: s.role,
				home_ids: s.homes.map((h) => homeIds[h]),
				med_certified: s.med
			}))
		);
		if (process.env.GUAD_E2E === '1') {
			await tx.insert(deviceTokens).values(
				staff
					.filter((s) => PUSH_FIXTURES.some((f) => f.email === s.email))
					.map((s) => ({
						agency_id: agencyId,
						profile_id: s.profileId,
						// Opaque synthetic registration; never provisioned with a provider.
						token: `synthetic-e2e-${randomUUID()}`,
						platform: 'web'
					}))
			);
		}
		const people = [
			{ name: 'Marcus Demo', first: 'Marcus', home: homeIds.oak },
			{ name: 'Rosa Demo', first: 'Rosa', home: homeIds.oak },
			{ name: 'Theo Demo', first: 'Theo', home: homeIds.maple }
		].map((p) => ({
			id: randomUUID(),
			agency_id: agencyId,
			home_id: p.home,
			name: p.name,
			first_name: p.first
		}));
		await tx.insert(clients).values(people);
		await tx.insert(rooms).values([
			{
				agency_id: agencyId,
				home_id: homeIds.oak,
				name: 'Oak room 1',
				status: 'occupied',
				occupied_by: people[0].id
			},
			{
				agency_id: agencyId,
				home_id: homeIds.oak,
				name: 'Oak room 2',
				status: 'occupied',
				occupied_by: people[1].id
			},
			{ agency_id: agencyId, home_id: homeIds.oak, name: 'Oak room 3' },
			{
				agency_id: agencyId,
				home_id: homeIds.maple,
				name: 'Maple room 1',
				status: 'occupied',
				occupied_by: people[2].id
			},
			{ agency_id: agencyId, home_id: homeIds.maple, name: 'Maple room 2' }
		]);
		await tx.insert(medications).values([
			{
				agency_id: agencyId,
				client_id: people[0].id,
				name: 'Demo med A',
				dose: '10 mg',
				route: 'oral',
				scheduled_times: ['08:00', '20:00']
			},
			{
				agency_id: agencyId,
				client_id: people[1].id,
				name: 'Demo med B',
				dose: '5 mg',
				route: 'oral',
				scheduled_times: ['08:00']
			},
			{
				agency_id: agencyId,
				client_id: people[2].id,
				name: 'Demo PRN',
				dose: '200 mg',
				route: 'oral',
				prn_instructions: 'For headache, max 3 a day'
			}
		]);
	});

	console.log(`Seeded "Sunrise Demo Agency" with ${staff.length} staff. Sign in with any of:`);
	for (const s of staff) console.log(`  ${s.email.padEnd(22)} ${s.role}`);
	console.log(
		'Password: DEV_PASSWORD in src/lib/server/demo-accounts.ts (also listed on the local sign-in page)'
	);
}

main()
	.catch((e) => {
		console.error(e.message);
		process.exitCode = 1;
	})
	.finally(closeDb);
