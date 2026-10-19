// Controlled medication count book (domain/controlled.ts, sql-patches/0003):
// receipts, counts, waste and disposal, witnesses and countersigning, through
// the real router as real users.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.PUBLIC_FIREBASE_PROJECT_ID ??= 'demo-guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { localTime } = await import('../../../src/lib/domain');
const identity = await import('../../../src/lib/server/identity');

const createCaller = createCallerFactory(appRouter);
const AGENCY = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const PERSON = randomUUID();
const MED = randomUUID();
const PLAIN = randomUUID();
const [CARA, DEV, UNCERTIFIED, SAM, MAPLE_CARER, WES] = Array.from({ length: 6 }, () =>
	randomUUID()
);
// Wes has a real emulator account, to sign in as a witness on Cara's device.
const WES_EMAIL = `controlled-wes-${WES}@example.test`;
const PASSWORD = 'test-only-password-1';
let wesUid = '';
async function emulatorSignIn(email: string): Promise<string> {
	const res = await fetch(
		`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true })
		}
	);
	const body = await res.json();
	if (!res.ok) throw new Error(body.error?.message ?? 'sign-in failed');
	return body.idToken;
}
const uid = (id: string) => `controlled-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);

beforeAll(async () => {
	wesUid = await identity.createIdentity({
		email: WES_EMAIL,
		displayName: 'Wes Witness',
		password: PASSWORD
	});
	await withService(async (t) => {
		await t.insert(s.agencies).values({
			id: AGENCY,
			name: 'Controlled Test Agency',
			subscription_tier: 'complete',
			slug: `controlled-${AGENCY}`
		});
		await t.insert(s.homes).values([
			{ id: OAK, agency_id: AGENCY, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: AGENCY, name: 'Maple', lat: 41, lng: -75, radius: 150 }
		]);
		const staff = (
			id: string,
			name: string,
			role: 'caregiver' | 'supervisor',
			homes: string[],
			med: boolean
		) => ({
			id,
			agency_id: AGENCY,
			auth_uid: uid(id),
			email: `${uid(id)}@example.test`,
			name,
			role,
			home_ids: homes,
			med_certified: med
		});
		await t.insert(s.profiles).values([
			staff(CARA, 'Cara Giver', 'caregiver', [OAK], true),
			staff(DEV, 'Dev Okafor', 'caregiver', [OAK], true),
			staff(UNCERTIFIED, 'Una Certified', 'caregiver', [OAK], false),
			staff(SAM, 'Sam Supervisor', 'supervisor', [OAK, MAPLE], true),
			staff(MAPLE_CARER, 'Mo Maple', 'caregiver', [MAPLE], true),
			{
				...staff(WES, 'Wes Witness', 'caregiver', [OAK], true),
				auth_uid: wesUid,
				email: WES_EMAIL
			}
		]);
		await t
			.insert(s.clients)
			.values({ id: PERSON, agency_id: AGENCY, home_id: OAK, name: 'Person Oak' });
		await t.insert(s.medications).values([
			{
				id: MED,
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Synthetic controlled med',
				prn_instructions: 'As needed for synthetic test'
			},
			{
				id: PLAIN,
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Synthetic plain med',
				scheduled_times: ['08:00']
			}
		]);
	});
});
afterAll(async () => {
	await identity.deleteIdentity(wesUid).catch(() => {});
	await closeDb();
});

const entry = (data: Record<string, unknown>) => ({ id: randomUUID(), medicationId: MED, ...data });

describe('controlled medications', () => {
	it('supervisors mark a medication controlled; only then does it take count entries', async () => {
		const cara = await as(CARA);
		await expect(
			cara.medication.countEntry(entry({ kind: 'receipt', quantity: 30, witnessId: DEV }))
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			cara.medication.update({ id: MED, controlled: true, controlledSchedule: 'II' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		const updated = await (
			await as(SAM)
		).medication.update({ id: MED, controlled: true, controlledSchedule: 'II', unitsPerDose: 1 });
		expect(updated).toMatchObject({ controlled: true, controlledSchedule: 'II', unitsPerDose: 1 });
	});

	it('receipts need a med-certified witness from the home, who countersigns', async () => {
		const cara = await as(CARA);
		const bad = (witnessId: string | null) =>
			cara.medication.countEntry(
				entry({ kind: 'receipt', quantity: 30, witnessId, recordedAt: at(5) })
			);
		for (const w of [null, CARA, UNCERTIFIED, MAPLE_CARER])
			await expect(bad(w)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		const receipt = entry({ kind: 'receipt', quantity: 30, witnessId: DEV, recordedAt: at(5) });
		expect(await cara.medication.countEntry(receipt)).toMatchObject({ created: true });
		expect(await cara.medication.countEntry(receipt)).toMatchObject({ created: false });

		const [ask] = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(
					and(eq(s.notifications.reference_id, receipt.id), eq(s.notifications.channel, 'in_app'))
				)
		);
		expect(ask).toMatchObject({ profile_id: DEV, type: 'controlled_countersign' });
		expect(ask.title).toBe(
			'Cara Giver asked you to countersign a controlled medication entry at Oak.'
		);

		await expect(cara.medication.countersign({ id: receipt.id })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		const signed = await (await as(DEV)).medication.countersign({ id: receipt.id });
		expect(signed.witnessedAt).toBeInstanceOf(Date);
		await expect((await as(DEV)).medication.countersign({ id: receipt.id })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('counts are checked against receipts, given doses and waste; a mismatch alerts supervisors', async () => {
		const cara = await as(CARA);
		const today = localTime(new Date(), 'America/New_York').day;
		// Doses given earlier, uploaded from a phone that was offline.
		const doses = await cara.sync.upload({
			transactionId: 1,
			ops: [4, 3.5].map((h) => ({
				op: 'PUT' as const,
				table: 'mar_records',
				id: randomUUID(),
				data: {
					client_id: PERSON,
					medication_id: MED,
					day: today,
					status: 'given',
					reason: 'Synthetic PRN reason',
					recorded_at: at(h).toISOString()
				}
			}))
		});
		expect(doses.rejected).toEqual([]);
		await cara.medication.countEntry(
			entry({
				kind: 'waste',
				quantity: 1,
				reason: 'Dropped or contaminated',
				witnessId: DEV,
				recordedAt: at(3)
			})
		);
		const ok = await cara.medication.countEntry(
			entry({ kind: 'count', quantity: 27, witnessId: DEV, recordedAt: at(2) })
		);
		expect(ok).toMatchObject({ expected: 27, discrepancy: false });
		const off = entry({ kind: 'count', quantity: 25, witnessId: SAM, recordedAt: at(1) });
		expect(await cara.medication.countEntry(off)).toMatchObject({
			expected: 27,
			discrepancy: true
		});
		const alerts = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(
					and(
						eq(s.notifications.reference_id, off.id),
						eq(s.notifications.type, 'controlled_count_discrepancy'),
						eq(s.notifications.channel, 'in_app')
					)
				)
		);
		expect(alerts.map((a) => a.profile_id)).toEqual([SAM]);
		expect(alerts[0]).toMatchObject({ priority: 1 });
	});

	it('the agency’s state preset decides who may witness', async () => {
		await (
			await as(SAM)
		).medication.countEntry(
			entry({ kind: 'count', quantity: 25, witnessId: CARA, recordedAt: at(0.5) })
		);
		await withService((t) =>
			t
				.update(s.agencies)
				.set({
					settings: {
						controlled_rules: {
							state: 'CA',
							countEvery: 'shift',
							witness: { receipt: true, count: true, waste: true, disposal: true },
							witnessQualification: 'any_staff',
							countersignHours: 24
						}
					}
				})
				.where(eq(s.agencies.id, AGENCY))
		);
		const r = await (
			await as(CARA)
		).medication.countEntry(
			entry({
				kind: 'disposal',
				quantity: 2,
				reason: 'Returned to the pharmacy',
				witnessId: UNCERTIFIED
			})
		);
		expect(r.created).toBe(true);
		await expect(
			(await as(UNCERTIFIED)).medication.countEntry(
				entry({ kind: 'count', quantity: 23, witnessId: CARA })
			)
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});

	it('a witness who signs in on the same device makes the entry witnessed at once', async () => {
		const cara = await as(CARA);
		const token = await emulatorSignIn(WES_EMAIL);
		const signed = entry({ kind: 'receipt', quantity: 5, witnessId: WES, witnessToken: token });
		expect(await cara.medication.countEntry(signed)).toMatchObject({
			created: true,
			witnessed: true
		});
		const [row] = await withService((t) =>
			t.select().from(s.controlledCounts).where(eq(s.controlledCounts.id, signed.id))
		);
		expect(row).toMatchObject({ witness_id: WES, witness_status: 'verified' });
		expect(row.witnessed_at).toBeInstanceOf(Date);
		const asks = await withService((t) =>
			t.select().from(s.notifications).where(eq(s.notifications.reference_id, signed.id))
		);
		expect(asks).toEqual([]);

		// One sign-in witnesses one entry.
		await expect(
			cara.medication.countEntry(
				entry({ kind: 'receipt', quantity: 5, witnessId: WES, witnessToken: token })
			)
		).rejects.toMatchObject({
			code: 'BAD_REQUEST',
			message: expect.stringMatching(/already used/)
		});

		// The token must belong to the named witness, and be real.
		const fresh = await emulatorSignIn(WES_EMAIL);
		for (const bad of [
			entry({ kind: 'receipt', quantity: 5, witnessId: DEV, witnessToken: fresh }),
			entry({ kind: 'receipt', quantity: 5, witnessId: WES, witnessToken: 'not-a-token' })
		])
			await expect(cara.medication.countEntry(bad)).rejects.toMatchObject({
				code: 'BAD_REQUEST'
			});
	});

	it('offline entries upload through sync.upload; entries are never edited', async () => {
		const cara = await as(CARA);
		const id = randomUUID();
		const r = await cara.sync.upload({
			transactionId: 1,
			ops: [
				{
					op: 'PUT',
					table: 'controlled_counts',
					id,
					data: {
						medication_id: MED,
						kind: 'count',
						quantity: '28',
						witness_id: DEV,
						recorded_at: new Date().toISOString(),
						recorded_by: SAM,
						witness_status: 'verified'
					}
				},
				{ op: 'PATCH', table: 'controlled_counts', id, data: { quantity: 99 } },
				{ op: 'DELETE', table: 'controlled_counts', id }
			]
		});
		expect(r.applied).toEqual([id]);
		expect(r.rejected.map((x) => x.code)).toEqual(['NOT_ALLOWED_OFFLINE', 'NOT_ALLOWED_OFFLINE']);
		const [row] = await withService((t) =>
			t.select().from(s.controlledCounts).where(eq(s.controlledCounts.id, id))
		);
		expect(row).toMatchObject({
			recorded_by: CARA,
			witness_id: DEV,
			witness_status: 'pending',
			// 23 after the disposal, plus Wes's witnessed receipt of 5
			expected: 28,
			discrepancy: false,
			home_id: OAK
		});
	});
});

describe('moving a person', () => {
	it('the count book moves with them and the next count still sees every receipt and dose', async () => {
		const mover = randomUUID();
		const med = randomUUID();
		await withService(async (t) => {
			await t
				.insert(s.clients)
				.values({ id: mover, agency_id: AGENCY, home_id: OAK, name: 'Person Moving' });
			await t.insert(s.medications).values({
				id: med,
				agency_id: AGENCY,
				client_id: mover,
				name: 'Synthetic moving controlled med',
				prn_instructions: 'As needed for synthetic test',
				controlled: true,
				controlled_schedule: 'II',
				units_per_dose: 1
			});
			await t.insert(s.controlledCounts).values({
				agency_id: AGENCY,
				home_id: OAK,
				client_id: mover,
				medication_id: med,
				kind: 'receipt',
				quantity: 30,
				recorded_by: SAM,
				recorded_by_name: 'Sam Supervisor',
				recorded_at: at(5)
			});
			// An older dose that no longer syncs to devices stays at Oak.
			await t.insert(s.marRecords).values({
				agency_id: AGENCY,
				home_id: OAK,
				client_id: mover,
				medication_id: med,
				day: localTime(at(4), 'America/New_York').day,
				status: 'given',
				is_prn: true,
				recorded_by: CARA,
				recorded_by_name: 'Cara Giver',
				recorded_at: at(4),
				device_sync: false
			});
		});
		await (await as(SAM)).client.update({ id: mover, homeId: MAPLE });

		const book = await withService((t) =>
			t
				.select({ home: s.controlledCounts.home_id })
				.from(s.controlledCounts)
				.where(eq(s.controlledCounts.medication_id, med))
		);
		expect(book).toEqual([{ home: MAPLE }]);

		const count = await (
			await as(MAPLE_CARER)
		).medication.countEntry({
			id: randomUUID(),
			medicationId: med,
			kind: 'count',
			quantity: 29,
			witnessId: SAM
		});
		expect(count).toMatchObject({ expected: 29, discrepancy: false });
	});
});
