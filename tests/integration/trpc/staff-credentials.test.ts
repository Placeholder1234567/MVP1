// Staff training and certifications (trpc-router.md staff.credentials,
// staff.saveCredential, staff.removeCredential) and the credential-expiry
// sweep (notifications.md §2.22). Synthetic staff only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { remindCredentials, sweepCredentialReminders } =
	await import('../../../src/lib/server/services/notification/credential-reminders');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { addDays } = await import('../../../src/lib/domain');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	OTHER = randomUUID();
const HOME = randomUUID(),
	OTHER_HOME = randomUUID();
const [ADMIN, SUP, CARER, CARER2, GONE, OTHER_ADMIN] = Array.from({ length: 6 }, () =>
	randomUUID()
);
const uid = (id: string) => `cred-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{ id: AGENCY, name: 'Cred Test', slug: `cred-${AGENCY}`, timezone: 'UTC' },
			{ id: OTHER, name: 'Cred Other', slug: `cred-${OTHER}`, timezone: 'UTC' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak' },
			{ id: OTHER_HOME, agency_id: OTHER, name: 'Pine' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[ADMIN, AGENCY, 'admin', 'Ada Admin', HOME, true],
					[SUP, AGENCY, 'supervisor', 'Sam Supervisor', HOME, true],
					[CARER, AGENCY, 'caregiver', 'Cara Giver', HOME, true],
					[CARER2, AGENCY, 'caregiver', 'Cal Giver', HOME, true],
					[GONE, AGENCY, 'caregiver', 'Gone Giver', HOME, false],
					[OTHER_ADMIN, OTHER, 'admin', 'Other Admin', OTHER_HOME, true]
				] as const
			).map(([id, agency, role, name, home, active]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name,
				role,
				active,
				home_ids: [home]
			}))
		);
	});
});

afterAll(closeDb);

it('lets admins record and renew credentials, and refuses everyone else', async () => {
	const admin = await as(ADMIN);
	const { id } = await admin.staff.saveCredential({
		profileId: CARER,
		kind: 'cpr',
		issuedOn: addDays(today, -700),
		expiresOn: addDays(today, 10)
	});
	await admin.staff.saveCredential({ profileId: CARER, kind: 'other', name: 'Mandt' });
	// The same credential twice (any case) is a renewal, not a second row.
	await expect(
		admin.staff.saveCredential({ profileId: CARER, kind: 'other', name: 'cpr' })
	).rejects.toThrow('Renew that one instead');
	await expect(
		admin.staff.saveCredential({
			profileId: CARER,
			kind: 'first_aid',
			issuedOn: today,
			expiresOn: addDays(today, -1)
		})
	).rejects.toThrow();
	// Another agency's staff member is not found.
	await expect(admin.staff.saveCredential({ profileId: OTHER_ADMIN, kind: 'cpr' })).rejects.toThrow(
		'not found'
	);

	await expect(
		(await as(SUP)).staff.saveCredential({ profileId: CARER, kind: 'first_aid' })
	).rejects.toThrow();
	await expect(
		(await as(CARER)).staff.saveCredential({ profileId: CARER, kind: 'first_aid' })
	).rejects.toThrow();

	const renewed = addDays(today, 720);
	await admin.staff.saveCredential({ id, profileId: CARER, kind: 'cpr', expiresOn: renewed });
	const [row] = await withService((t) =>
		t.select().from(s.staffCredentials).where(eq(s.staffCredentials.id, id))
	);
	expect(row).toMatchObject({ expires_on: renewed, issued_on: null, recorded_by: ADMIN });
	// The renewal is in the audit log with the old date.
	const audit = await withService((t) =>
		t
			.select({ old: s.auditLog.old_values })
			.from(s.auditLog)
			.where(and(eq(s.auditLog.table_name, 'staff_credentials'), eq(s.auditLog.record_id, id)))
	);
	expect(
		audit.some((a) => (a.old as { expires_on?: string })?.expires_on === addDays(today, 10))
	).toBe(true);
});

it('shows supervisors everyone in the agency, and caregivers only their own', async () => {
	await (
		await as(ADMIN)
	).staff.saveCredential({ profileId: CARER2, kind: 'med_admin', expiresOn: addDays(today, -3) });

	const all = await (await as(SUP)).staff.credentials({});
	expect(new Set(all.map((c) => c.profileId))).toEqual(new Set([CARER, CARER2]));
	expect(all.find((c) => c.profileId === CARER2)).toMatchObject({
		name: 'Medication administration',
		status: 'expired'
	});

	// A caregiver asking for someone else still gets only their own.
	const mine = await (await as(CARER)).staff.credentials({ profileId: CARER2 });
	expect(mine.length).toBeGreaterThan(0);
	expect(mine.every((c) => c.profileId === CARER)).toBe(true);
	// RLS is the backstop: a caregiver's own query sees no one else's rows.
	const caregiver = (await getCurrentUser(uid(CARER)))!;
	const visible = await withUser(caregiver.claims, {}, (t) =>
		t.select({ profileId: s.staffCredentials.profile_id }).from(s.staffCredentials)
	);
	expect(visible.every((r) => r.profileId === CARER)).toBe(true);
	// Another agency sees nothing.
	expect(await (await as(OTHER_ADMIN)).staff.credentials({})).toEqual([]);
});

it('reminds the person and the admins once per stage, again after renewal, never the inactive', async () => {
	const admin = await as(ADMIN);
	const { id } = await admin.staff.saveCredential({
		profileId: CARER,
		kind: 'first_aid',
		expiresOn: addDays(today, 6)
	});
	await admin.staff.saveCredential({ profileId: GONE, kind: 'cpr', expiresOn: addDays(today, 2) });
	const reminders = () =>
		withService((t) =>
			t
				.select({
					id: s.notifications.id,
					to: s.notifications.profile_id,
					title: s.notifications.title
				})
				.from(s.notifications)
				.where(
					and(
						eq(s.notifications.agency_id, AGENCY),
						eq(s.notifications.type, 'credential_expiring'),
						eq(s.notifications.channel, 'in_app')
					)
				)
		);
	// Rows come back in no set order, so new ones are found by ID.
	const seen = async () => new Set((await reminders()).map((n) => n.id));
	const newSince = async (ids: Set<string>) => (await reminders()).filter((n) => !ids.has(n.id));
	const before = await seen();

	await withService((t) => remindCredentials(t, AGENCY, today));
	const first = await newSince(before);
	const firstAid = first.filter((n) => n.title.includes('First aid'));
	expect(firstAid.find((n) => n.to === CARER)?.title).toBe(
		`Your First aid expires on ${addDays(today, 6)}. Plan your renewal.`
	);
	expect(firstAid.find((n) => n.to === ADMIN)?.title).toBe(
		`A staff member's First aid expires on ${addDays(today, 6)}`
	);
	// Supervisors aren't sent these; the inactive person's credential is skipped.
	expect(first.some((n) => n.to === SUP)).toBe(false);
	expect(first.some((n) => n.to === GONE)).toBe(false);
	// The lapsed medication certificate reaches its owner and the admins.
	expect(first.filter((n) => n.title.includes('Medication administration expired')).length).toBe(2);

	// Running again sends nothing new.
	const after = await seen();
	await withService((t) => remindCredentials(t, AGENCY, today));
	expect(await newSince(after)).toEqual([]);

	// Once it lapses, both hear again; a renewal re-arms the reminders.
	await withService((t) => remindCredentials(t, AGENCY, addDays(today, 7)));
	const lapsed = await newSince(after);
	expect(
		lapsed
			.filter((n) => n.title.includes('First aid expired'))
			.map((n) => n.to)
			.sort()
	).toEqual([ADMIN, CARER].sort());
	await admin.staff.saveCredential({
		id,
		profileId: CARER,
		kind: 'first_aid',
		expiresOn: addDays(today, 20)
	});
	const renewedFrom = await seen();
	await withService((t) => remindCredentials(t, AGENCY, today));
	expect(
		(await newSince(renewedFrom))
			.filter((n) => n.title.includes(addDays(today, 20)))
			.map((n) => n.to)
			.sort()
	).toEqual([ADMIN, CARER].sort());
});

it('waits for 09:00 in the agency time zone', async () => {
	const sweepAt = (hour: number) =>
		sweepCredentialReminders(new Date(`${today}T${String(hour).padStart(2, '0')}:30:00Z`));
	await (
		await as(ADMIN)
	).staff.saveCredential({ profileId: CARER2, kind: 'cpr', expiresOn: addDays(today, 25) });
	const count = () =>
		withService(
			async (t) =>
				(
					await t
						.select({ id: s.notifications.id })
						.from(s.notifications)
						.where(
							and(
								eq(s.notifications.agency_id, AGENCY),
								inArray(s.notifications.profile_id, [CARER2]),
								eq(s.notifications.type, 'credential_expiring')
							)
						)
				).length
		);
	const before = await count();
	await sweepAt(8);
	expect(await count()).toBe(before);
	await sweepAt(9);
	expect(await count()).toBeGreaterThan(before);
});

it('lets admins remove a credential', async () => {
	const admin = await as(ADMIN);
	const { id } = await admin.staff.saveCredential({
		profileId: CARER2,
		kind: 'other',
		name: 'Seizure care'
	});
	await expect((await as(SUP)).staff.removeCredential({ id })).rejects.toThrow();
	await admin.staff.removeCredential({ id });
	expect((await admin.staff.credentials({ profileId: CARER2 })).some((c) => c.id === id)).toBe(
		false
	);
	await expect(admin.staff.removeCredential({ id })).rejects.toThrow('not found');
});

it('keeps med certification in step with the medication administration certificate', async () => {
	const admin = await as(ADMIN);
	const certified = async (id: string) =>
		(
			await withService((t) =>
				t.select({ on: s.profiles.med_certified }).from(s.profiles).where(eq(s.profiles.id, id))
			)
		)[0].on;
	const NEW = randomUUID();
	await withService((t) =>
		t.insert(s.profiles).values({
			id: NEW,
			agency_id: AGENCY,
			auth_uid: uid(NEW),
			email: `${uid(NEW)}@example.test`,
			name: 'New Giver',
			role: 'caregiver',
			home_ids: [HOME]
		})
	);
	expect(await certified(NEW)).toBe(false);

	// Recording a valid certificate certifies them; a lapsed one doesn't.
	const { id } = await admin.staff.saveCredential({
		profileId: NEW,
		kind: 'med_admin',
		expiresOn: addDays(today, 365)
	});
	expect(await certified(NEW)).toBe(true);
	await admin.staff.saveCredential({
		id,
		profileId: NEW,
		kind: 'med_admin',
		expiresOn: addDays(today, -1)
	});
	expect(await certified(NEW)).toBe(false);
	// The checkbox can't override a lapsed certificate.
	await expect(admin.staff.update({ id: NEW, medCertified: true })).rejects.toThrow(
		`expired on ${addDays(today, -1)}`
	);
	// Other changes still save.
	await admin.staff.update({ id: NEW, medCertified: false, homeIds: [HOME] });

	// The sweep turns certification off when a certificate lapses, before 09:00 too.
	await admin.staff.saveCredential({ id, profileId: NEW, kind: 'med_admin', expiresOn: today });
	expect(await certified(NEW)).toBe(true);
	const tomorrow = addDays(today, 1);
	const { revoked } = await sweepCredentialReminders(new Date(`${tomorrow}T02:00:00Z`));
	expect(revoked).toBeGreaterThanOrEqual(1);
	expect(await certified(NEW)).toBe(false);
	// Signed-in permissions follow, so the server refuses their doses.
	expect((await getCurrentUser(uid(NEW)))?.medCertified).toBe(false);
});
