// Management procedures (trpc-router.md: staff.*, client.*, home.create/update,
// agency.update, auth.updateProfile), through the real router as real users.
// staff.invite creates real accounts in the Auth emulator.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const identity = await import('../../../src/lib/server/identity');
const { setProvidersForTests } = await import('../../../src/lib/server/messaging');
const { getAuth } = await import('firebase-admin/auth');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	STARTER = randomUUID(),
	OTHER = randomUUID();
const OAK = randomUUID(),
	ELM = randomUUID(),
	FOREIGN_HOME = randomUUID();
const [ADMIN, SUP, CARA, ELM_CARER, STARTER_SUP, OTHER_ADMIN] = Array.from({ length: 6 }, () =>
	randomUUID()
);
const uid = (id: string) => `admin-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const email = vi.fn(async () => ({ providerMessageId: 'invite' }));
const createdUids: string[] = [];

beforeAll(async () => {
	setProvidersForTests({ email });
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{ id: AGENCY, name: 'Admin Test', slug: `admin-${AGENCY}`, subscription_tier: 'complete' },
			{ id: STARTER, name: 'Starter Test', slug: `admin-${STARTER}`, subscription_tier: 'starter' },
			{ id: OTHER, name: 'Other Test', slug: `admin-${OTHER}`, subscription_tier: 'complete' }
		]);
		await t.insert(s.homes).values([
			{ id: OAK, agency_id: AGENCY, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: ELM, agency_id: AGENCY, name: 'Elm', lat: 41, lng: -75, radius: 150 },
			{ id: FOREIGN_HOME, agency_id: OTHER, name: 'Foreign', lat: 40, lng: -75, radius: 150 }
		]);
		const staff = (
			id: string,
			agency: string,
			role: 'caregiver' | 'supervisor' | 'admin',
			homes: string[]
		) => ({
			id,
			agency_id: agency,
			auth_uid: uid(id),
			email: `${uid(id)}@example.test`,
			name: 'Synthetic Staff',
			role,
			home_ids: homes
		});
		await t
			.insert(s.profiles)
			.values([
				staff(ADMIN, AGENCY, 'admin', []),
				staff(SUP, AGENCY, 'supervisor', [OAK, ELM]),
				staff(CARA, AGENCY, 'caregiver', [OAK]),
				staff(ELM_CARER, AGENCY, 'caregiver', [ELM]),
				staff(STARTER_SUP, STARTER, 'supervisor', []),
				staff(OTHER_ADMIN, OTHER, 'admin', [])
			]);
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	for (const u of createdUids) await identity.deleteIdentity(u).catch(() => {});
	await closeDb();
});

describe('staff.*', () => {
	let invitedId: string;

	it('only admins invite; the invitee gets an account, a profile and a setup email', async () => {
		const input = {
			email: `Invitee-${randomUUID()}@Example.test`,
			name: 'New Synthetic Caregiver',
			role: 'caregiver' as const,
			homeIds: [OAK],
			medCertified: true
		};
		for (const id of [CARA, SUP])
			await expect((await as(id)).staff.invite(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });

		const invited = await (await as(ADMIN)).staff.invite(input);
		invitedId = invited.id;
		expect(invited).toMatchObject({ email: input.email.toLowerCase(), role: 'caregiver' });
		const [row] = await withService((t) =>
			t.select().from(s.profiles).where(eq(s.profiles.id, invited.id))
		);
		expect(row).toMatchObject({ agency_id: AGENCY, initials: 'NC', home_ids: [OAK] });
		createdUids.push(row.auth_uid);
		const account = await getAuth().getUser(row.auth_uid);
		expect(account.email).toBe(input.email.toLowerCase());
		await vi.waitFor(() => expect(email).toHaveBeenCalled());
		const [to, delivery] = email.mock.calls.at(-1) as unknown as [string, { body: string }];
		expect(to).toBe(input.email.toLowerCase());
		expect(delivery.body).toMatch(/https?:\/\//);

		await expect((await as(ADMIN)).staff.invite(input)).rejects.toMatchObject({
			code: 'CONFLICT'
		});
		await expect(
			(await as(ADMIN)).staff.invite({
				...input,
				email: `x-${randomUUID()}@example.test`,
				homeIds: [FOREIGN_HOME]
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});

	it('lists staff for supervisors, without identity details', async () => {
		const list = await (await as(SUP)).staff.list({ role: 'caregiver' });
		expect(list.map((p) => p.id)).toEqual(expect.arrayContaining([CARA, ELM_CARER, invitedId]));
		expect(list.every((p) => !('authUid' in p))).toBe(true);
		await expect((await as(CARA)).staff.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
		// Other agencies' staff are invisible.
		expect((await (await as(OTHER_ADMIN)).staff.list()).map((p) => p.id)).toEqual([OTHER_ADMIN]);
	});

	it('deactivating disables the sign-in; reactivating restores it', async () => {
		const admin = await as(ADMIN);
		const [row] = await withService((t) =>
			t.select({ uid: s.profiles.auth_uid }).from(s.profiles).where(eq(s.profiles.id, invitedId))
		);
		await admin.staff.update({ id: invitedId, active: false });
		await vi.waitFor(async () => expect((await getAuth().getUser(row.uid)).disabled).toBe(true));
		await admin.staff.update({ id: invitedId, active: true, role: 'supervisor' });
		await vi.waitFor(async () => expect((await getAuth().getUser(row.uid)).disabled).toBe(false));
		expect((await admin.staff.get({ id: invitedId })).role).toBe('supervisor');
	});

	it("won't let an admin remove their own access, or anyone else change roles", async () => {
		const admin = await as(ADMIN);
		await expect(admin.staff.update({ id: ADMIN, role: 'supervisor' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
		await expect(admin.staff.update({ id: ADMIN, active: false })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
		await expect((await as(SUP)).staff.update({ id: CARA, role: 'admin' })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	});

	it('promotion ends the person’s sessions, so the next sign-in applies the new role’s MFA rule', async () => {
		const admin = await as(ADMIN);
		const [row] = await withService((t) =>
			t.select({ uid: s.profiles.auth_uid }).from(s.profiles).where(eq(s.profiles.id, invitedId))
		);
		const before = (await getAuth().getUser(row.uid)).tokensValidAfterTime;
		await new Promise((r) => setTimeout(r, 1100));
		await admin.staff.update({ id: invitedId, role: 'admin' });
		await vi.waitFor(async () =>
			expect((await getAuth().getUser(row.uid)).tokensValidAfterTime).not.toBe(before)
		);
		await admin.staff.update({ id: invitedId, role: 'supervisor' });
	});

	it('two admins demoting each other at once leave one admin', async () => {
		const agency = randomUUID(),
			a = randomUUID(),
			b = randomUUID();
		await withService(async (t) => {
			await t.insert(s.agencies).values({
				id: agency,
				name: 'Two Admins',
				slug: `two-${agency}`,
				subscription_tier: 'complete'
			});
			await t.insert(s.profiles).values(
				[a, b].map((id) => ({
					id,
					agency_id: agency,
					auth_uid: uid(id),
					email: `${uid(id)}@example.test`,
					name: 'Synthetic Admin',
					role: 'admin' as const
				}))
			);
		});
		const [first, second] = [await as(a), await as(b)];
		const results = await Promise.allSettled([
			first.staff.update({ id: b, role: 'supervisor' }),
			second.staff.update({ id: a, role: 'supervisor' })
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const admins = await withService((t) =>
			t
				.select({ id: s.profiles.id })
				.from(s.profiles)
				.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.role, 'admin')))
		);
		expect(admins).toHaveLength(1);
	});
});

describe('database backstops (sql-patches/0012)', () => {
	it('caregivers can’t add people, and admins can’t change their own plan', async () => {
		const caregiver = { agency_id: AGENCY, role: 'caregiver' as const, profile_id: CARA };
		await expect(
			withUser(caregiver, {}, (t) =>
				t.insert(s.clients).values({ agency_id: AGENCY, home_id: OAK, name: 'Synthetic Person' })
			)
		).rejects.toThrow();
		const admin = { agency_id: AGENCY, role: 'admin' as const, profile_id: ADMIN };
		await expect(
			withUser(admin, {}, (t) =>
				t.update(s.agencies).set({ subscription_tier: 'starter' }).where(eq(s.agencies.id, AGENCY))
			)
		).rejects.toThrow();
		const [agency] = await withService((t) =>
			t.select().from(s.agencies).where(eq(s.agencies.id, AGENCY))
		);
		expect(agency.subscription_tier).toBe('complete');
	});
});

describe('auth.updateProfile', () => {
	it('edits only the caller’s own name, phone and avatar', async () => {
		const cara = await as(CARA);
		const r = await cara.auth.updateProfile({ name: 'Cara Synthetic', phone: '+15555550123' });
		expect(r).toMatchObject({ name: 'Cara Synthetic', initials: 'CS', phone: '+15555550123' });
		await expect(cara.auth.updateProfile({ phone: '555-0123' })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
		expect((await cara.auth.me()).role).toBe('caregiver');
	});
});

describe('client.*', () => {
	let clientId: string;

	it('supervisors create a person with health info; caregivers see only their homes', async () => {
		await expect(
			(await as(CARA)).client.create({ name: 'Nope', homeId: OAK })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		const created = await (
			await as(SUP)
		).client.create({
			name: 'Synthetic Person',
			homeId: OAK,
			healthInfo: { allergies: 'Synthetic allergy', dob: '1990-01-01' }
		});
		clientId = created.id;
		expect((await (await as(CARA)).client.list()).map((c) => c.id)).toContain(clientId);
		expect((await (await as(ELM_CARER)).client.list()).map((c) => c.id)).not.toContain(clientId);
		await expect((await as(ELM_CARER)).client.get({ id: clientId })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		const full = await (await as(CARA)).client.get({ id: clientId });
		expect(full).toMatchObject({ initials: 'SP', firstName: 'Synthetic' });
		expect(full.healthInfo).toMatchObject({ allergies: 'Synthetic allergy', dob: '1990-01-01' });
		expect(full.goals).toEqual([]);
	});

	it('updates health info and moves homes; only admins archive', async () => {
		const sup = await as(SUP);
		const health = await sup.client.updateHealth({ clientId, diet: 'Synthetic diet' });
		expect(health).toMatchObject({ allergies: 'Synthetic allergy', diet: 'Synthetic diet' });
		// A recent dose moves with the person; it used to make the move fail.
		const dose = randomUUID();
		await withService(async (t) => {
			const med = randomUUID();
			await t
				.insert(s.medications)
				.values({ id: med, agency_id: AGENCY, client_id: clientId, name: 'Synthetic med' });
			await t.insert(s.marRecords).values({
				id: dose,
				agency_id: AGENCY,
				client_id: clientId,
				medication_id: med,
				day: '2026-10-01',
				status: 'given',
				is_prn: true
			});
		});
		const room = randomUUID();
		await withService((t) =>
			t.insert(s.rooms).values({
				id: room,
				agency_id: AGENCY,
				home_id: OAK,
				name: 'Synthetic room',
				occupied_by: clientId,
				status: 'occupied'
			})
		);
		await sup.client.update({ id: clientId, homeId: ELM });
		const [moved] = await withService((t) =>
			t.select().from(s.marRecords).where(eq(s.marRecords.id, dose))
		);
		expect(moved).toMatchObject({ home_id: ELM, status: 'given' });
		// Their room at the old home is free again.
		const [freed] = await withService((t) => t.select().from(s.rooms).where(eq(s.rooms.id, room)));
		expect(freed).toMatchObject({ occupied_by: null, status: 'available' });
		expect((await (await as(ELM_CARER)).client.list()).map((c) => c.id)).toContain(clientId);
		await expect(sup.client.archive({ id: clientId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
		expect((await (await as(ADMIN)).client.archive({ id: clientId })).active).toBe(false);
		expect((await sup.client.list({ active: true })).map((c) => c.id)).not.toContain(clientId);
	});

	it('leaves out nested clinical data the plan does not include', async () => {
		const sup = await as(STARTER_SUP);
		const home = await withService(async (t) => {
			const id = randomUUID();
			await t.insert(s.homes).values({ id, agency_id: STARTER, name: 'Starter Home' });
			return id;
		});
		const created = await sup.client.create({
			name: 'Starter Person',
			homeId: home,
			healthInfo: { allergies: 'Hidden' }
		});
		const full = await sup.client.get({ id: created.id });
		expect(full).toMatchObject({ healthInfo: null, goals: [], medications: [] });
	});
});

describe('home.* and agency.update', () => {
	it('admins create and edit homes', async () => {
		await expect((await as(SUP)).home.create({ name: 'Nope' })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		const admin = await as(ADMIN);
		const home = await admin.home.create({ name: 'Synthetic Home', lat: 40.1, lng: -75.2 });
		expect(home.radius).toBe(150);
		expect((await admin.home.update({ id: home.id, radius: 300 })).radius).toBe(300);
		await expect(
			(await as(OTHER_ADMIN)).home.update({ id: home.id, radius: 50 })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('admins change the preset, time zone and settings, keeping unknown settings', async () => {
		await withService((t) =>
			t
				.update(s.agencies)
				.set({ settings: { other_key: 1 } })
				.where(eq(s.agencies.id, AGENCY))
		);
		const admin = await as(ADMIN);
		const r = await admin.agency.update({
			chartingPreset: 'therap',
			timezone: 'America/Chicago',
			settings: { mfa_required_roles: ['caregiver'] }
		});
		expect(r).toMatchObject({
			chartingPreset: 'therap',
			timezone: 'America/Chicago',
			settings: { other_key: 1, mfa_required_roles: ['caregiver'] }
		});
		await expect(admin.agency.update({ timezone: 'Mars/Olympus' })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
		await expect((await as(SUP)).agency.update({ name: 'x' })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	});
});

describe('incident reporting rules', () => {
	it('admins set who must be told; new reports and the device follow them', async () => {
		const person = randomUUID();
		await withService((t) =>
			t.insert(s.clients).values({ id: person, agency_id: AGENCY, home_id: OAK, name: 'Synthetic' })
		);
		const admin = await as(ADMIN);
		const incident_rules = {
			guardianWhen: 'Within 12 hours',
			nurseTypes: ['Seizure' as const],
			nurseWhen: 'Within 1 hour',
			stateSeverities: ['Medium' as const, 'High' as const],
			stateTypes: [],
			stateWhen: 'Within 24 hours'
		};
		await expect(
			admin.agency.update({ settings: { incident_rules: { ...incident_rules, nurseWhen: '' } } })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			admin.agency.update({
				settings: { incident_rules: { ...incident_rules, nurseTypes: ['Sneeze'] } }
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		const saved = await admin.agency.update({ settings: { incident_rules } });
		expect(saved.settings).toMatchObject({ incident_rules });
		const r = await (
			await as(CARA)
		).incident.create({
			clientId: person,
			type: 'Fall',
			severity: 'Medium',
			occurredAt: new Date(Date.now() - 60_000),
			description: 'Synthetic fall'
		});
		expect(r.mustNotify).toEqual([
			{ who: 'Supervisor', when: 'Right away' },
			// No hours were saved, so the default reminder hours apply.
			{ who: 'Family or guardian', when: 'Within 12 hours', hours: 24 },
			{ who: 'State reporting system', when: 'Within 24 hours', hours: null }
		]);
	});
});

describe('staff.resetMfa', () => {
	it('lets an admin reset someone else’s second factor, audited', async () => {
		await withService((t) =>
			t.update(s.profiles).set({ mfa_enabled: true }).where(eq(s.profiles.id, SUP))
		);
		await expect((await as(SUP)).staff.resetMfa({ id: CARA })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		const admin = await as(ADMIN);
		await expect(admin.staff.resetMfa({ id: ADMIN })).rejects.toMatchObject({ code: 'CONFLICT' });
		expect(await admin.staff.resetMfa({ id: SUP })).toEqual({ id: SUP, mfaEnabled: false });
		expect((await admin.staff.get({ id: SUP })).mfaEnabled).toBe(false);
		const audit = await withService((t) =>
			t.select().from(s.auditLog).where(eq(s.auditLog.record_id, SUP))
		);
		expect(audit.find((a) => a.table_name === 'mfa_resets')).toMatchObject({
			performed_by: ADMIN,
			action: 'UPDATE'
		});
	});
});
