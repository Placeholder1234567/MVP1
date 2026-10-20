import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
const identity = vi.hoisted(() => ({ disable: vi.fn(async () => {}) }));
vi.mock('../../../src/lib/server/identity', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../src/lib/server/identity')>()),
	disableIdentity: identity.disable
}));
import { closeDb, withService, withUser } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { offboardAgency, updateAgency } from '../../../src/lib/server/services/agency';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
beforeEach(() => {
	identity.disable.mockReset();
	identity.disable.mockResolvedValue(undefined);
});
afterAll(() => closeDb());
async function fixture() {
	const agency = randomUUID(),
		other = randomUUID(),
		admin = randomUUID(),
		caregiver = randomUUID(),
		home = randomUUID(),
		client = randomUUID();
	const uid = (id: string) => `offboard-${id}`;
	const otherAdmin = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, other].map((id) => ({
				id,
				name: 'Synthetic offboarding',
				slug: `offboard-${id}`,
				subscription_tier: 'complete' as const
			}))
		);
		await tx.insert(s.profiles).values(
			[
				{ id: admin, role: 'admin' as const },
				{ id: caregiver, role: 'caregiver' as const }
			].map((person) => ({
				...person,
				agency_id: agency,
				auth_uid: uid(person.id),
				email: `${person.id}@example.test`,
				name: 'Synthetic staff',
				home_ids: [home]
			}))
		);
		await tx.insert(s.homes).values({ id: home, agency_id: agency, name: 'Synthetic home' });
		await tx
			.insert(s.profiles)
			.values({
				id: otherAdmin,
				agency_id: other,
				role: 'admin',
				auth_uid: uid(otherAdmin),
				email: `${otherAdmin}@example.test`,
				name: 'Synthetic other agency'
			});
		await tx
			.insert(s.clients)
			.values({ id: client, agency_id: agency, home_id: home, name: 'Synthetic person' });
		await tx.insert(s.notes).values({
			agency_id: agency,
			home_id: home,
			client_id: client,
			author_id: caregiver,
			author_name: 'Synthetic staff',
			day: '2026-10-20',
			shift: 'am',
			type: 'shift',
			content: { activities: 'Synthetic retained clinical record' }
		});
		await tx.insert(s.apiKeys).values({
			agency_id: agency,
			name: 'Synthetic key',
			key_hash: randomUUID(),
			key_prefix: 'synthetic'
		});
		await tx.insert(s.webhooks).values({
			agency_id: agency,
			url: 'https://example.test/hook',
			events: ['note.submitted'],
			secret_hash: randomUUID(),
			secret_sealed: 'synthetic-sealed'
		});
		await tx.insert(s.deviceKeys).values({
			agency_id: agency,
			profile_id: caregiver,
			device_id: randomUUID(),
			key_ciphertext: 'synthetic-sealed'
		});
		await tx
			.insert(s.deviceTokens)
			.values({ agency_id: agency, profile_id: caregiver, token: `synthetic-${randomUUID()}` });
	});
	const user = (await getCurrentUser(uid(admin)))!;
	const input = { agencyId: agency, operator: 'synthetic-operator', confirmAgencyId: agency };
	return { agency, other, otherAdmin, admin, caregiver, home, client, user, uid, input };
}
it('defaults to read-only and requires exact confirmation before blocking anything', async () => {
	const f = await fixture();
	expect(await offboardAgency(f.input)).toMatchObject({
		dryRun: true,
		phase: 'not_started',
		counts: { activeProfiles: 2, activeApiKeys: 1, activeWebhooks: 1 }
	});
	expect(identity.disable).not.toHaveBeenCalled();
	await expect(
		offboardAgency({ ...f.input, confirmAgencyId: f.other }, { dryRun: false })
	).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
	expect(await getCurrentUser(f.uid(f.admin))).not.toBeNull();
});
it('blocks old claims, revokes access objects and retains clinical and audit history across identity retries', async () => {
	const f = await fixture();
	identity.disable.mockRejectedValueOnce(new Error('synthetic provider failure'));
	const first = await offboardAgency(f.input, { dryRun: false });
	expect(first).toMatchObject({ phase: 'identity_pending', identityFailures: 1 });
	expect(await getCurrentUser(f.uid(f.admin))).toBeNull();
	expect(await getCurrentUser(f.uid(f.otherAdmin))).not.toBeNull();
	expect(await withUser(f.user.claims, {}, (tx) => tx.select().from(s.notes))).toEqual([]);
	expect(await withUser(f.user.claims, {}, (tx) => tx.select().from(s.profiles))).toEqual([]);
	const retained = await withService(async (tx) => ({
		agency: (await tx.select().from(s.agencies).where(eq(s.agencies.id, f.agency)))[0],
		notes: await tx.select().from(s.notes).where(eq(s.notes.agency_id, f.agency)),
		keys: await tx.select().from(s.apiKeys).where(eq(s.apiKeys.agency_id, f.agency)),
		hooks: await tx.select().from(s.webhooks).where(eq(s.webhooks.agency_id, f.agency)),
		devices: await tx.select().from(s.deviceKeys).where(eq(s.deviceKeys.agency_id, f.agency)),
		tokens: await tx.select().from(s.deviceTokens).where(eq(s.deviceTokens.agency_id, f.agency)),
		audits: await tx.select().from(s.auditLog).where(eq(s.auditLog.agency_id, f.agency)),
		other: (await tx.select().from(s.agencies).where(eq(s.agencies.id, f.other)))[0]
	}));
	expect(retained.agency.settings).toMatchObject({
		offboarding: { accessBlocked: true, retentionHold: true, phase: 'identity_pending' }
	});
	expect(retained.notes).toHaveLength(1);
	expect(retained.notes[0].content).toEqual({ activities: 'Synthetic retained clinical record' });
	expect(retained.keys.every((key) => key.revoked_at !== null)).toBe(true);
	expect(retained.hooks.every((hook) => !hook.active && hook.secret_sealed === null)).toBe(true);
	expect(
		retained.devices.every((device) => device.revoked_at !== null && device.key_ciphertext === '')
	).toBe(true);
	expect(retained.audits.length).toBeGreaterThan(0);
	expect(retained.tokens).toEqual([]);
	expect(retained.other.settings).not.toHaveProperty('offboarding');
	await expect(
		withService((tx) =>
			tx
				.update(s.profiles)
				.set({ active: true })
				.where(and(eq(s.profiles.agency_id, f.agency), eq(s.profiles.id, f.admin)))
		)
	).rejects.toBeDefined();
	const next = await offboardAgency(f.input, { dryRun: false });
	expect(next).toMatchObject({
		phase: 'complete',
		identityFailures: 0,
		operationId: first.operationId
	});
	const calls = identity.disable.mock.calls.length;
	expect(await offboardAgency(f.input, { dryRun: false })).toMatchObject({ phase: 'complete' });
	expect(identity.disable).toHaveBeenCalledTimes(calls);
});
it('keeps offboarding operator-only even for a current agency admin', async () => {
	const f = await fixture();
	await expect(
		withUser(f.user.claims, {}, (tx) =>
			updateAgency(tx, f.agency, { settings: { offboarding: { accessBlocked: true } } } as never)
		)
	).rejects.toBeDefined();
	await expect(
		withUser(f.user.claims, {}, (tx) =>
			tx
				.update(s.agencies)
				.set({ settings: { offboarding: { accessBlocked: true } } })
				.where(eq(s.agencies.id, f.agency))
		)
	).rejects.toBeDefined();
	expect(await getCurrentUser(f.uid(f.admin))).not.toBeNull();
});
it('claims a run exclusively and resumes safely after identity completion', async () => {
	const f = await fixture();
	let release!: () => void;
	identity.disable.mockImplementationOnce(
		async () =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const first = offboardAgency(f.input, { dryRun: false });
	await vi.waitFor(() => expect(release).toBeDefined());
	await expect(offboardAgency(f.input, { dryRun: false })).rejects.toThrow(
		'Offboarding is already in progress'
	);
	release();
	expect(await first).toMatchObject({ phase: 'complete', identityFailures: 0 });
	expect(identity.disable).toHaveBeenCalledTimes(2);
});
