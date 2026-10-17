// New agencies (services.md §2 provisionAgency; scripts/provision-agency.ts).
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAuth } from 'firebase-admin/auth';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { deleteIdentity } from '../../../src/lib/server/identity';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
import { provisionAgency } from '../../../src/lib/server/services/agency';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const email = vi.fn(async () => ({ providerMessageId: 'invite' }));
setProvidersForTests({ email });
const uids: string[] = [];

afterAll(async () => {
	setProvidersForTests(undefined);
	for (const u of uids) await deleteIdentity(u).catch(() => {});
	await closeDb();
});

it('creates the agency, its default goal templates and an invited admin', async () => {
	const slug = `prov-${randomUUID().slice(0, 8)}`;
	const adminEmail = `${slug}-Admin@Example.test`;
	const r = await withService((tx) =>
		provisionAgency(tx, {
			name: 'Synthetic Provisioned Agency',
			slug,
			tier: 'professional',
			timezone: 'America/Chicago',
			adminEmail,
			adminName: 'Synthetic Admin'
		})
	);
	const [agency] = await withService((tx) =>
		tx.select().from(s.agencies).where(eq(s.agencies.id, r.agencyId))
	);
	expect(agency).toMatchObject({
		slug,
		subscription_tier: 'professional',
		timezone: 'America/Chicago',
		charting_preset: 'default'
	});
	const templates = await withService((tx) =>
		tx.select().from(s.goalTemplates).where(eq(s.goalTemplates.agency_id, r.agencyId))
	);
	expect(templates).toHaveLength(r.templates);
	expect(templates.every((t) => t.is_default)).toBe(true);
	const [admin] = await withService((tx) =>
		tx.select().from(s.profiles).where(eq(s.profiles.id, r.adminProfileId))
	);
	expect(admin).toMatchObject({ role: 'admin', email: adminEmail.toLowerCase(), active: true });
	uids.push(admin.auth_uid);
	expect((await getAuth().getUser(admin.auth_uid)).email).toBe(adminEmail.toLowerCase());
	expect(email).toHaveBeenCalledWith(adminEmail.toLowerCase(), expect.anything());
});

it('refuses a taken slug before creating anything', async () => {
	const slug = `prov-${randomUUID().slice(0, 8)}`;
	const base = { name: 'X', slug, tier: 'starter' as const, adminName: 'Synthetic Admin' };
	const first = await withService((tx) =>
		provisionAgency(tx, { ...base, adminEmail: `${slug}-a@example.test` })
	);
	const [p] = await withService((tx) =>
		tx
			.select({ uid: s.profiles.auth_uid })
			.from(s.profiles)
			.where(eq(s.profiles.id, first.adminProfileId))
	);
	uids.push(p.uid);
	await expect(
		withService((tx) => provisionAgency(tx, { ...base, adminEmail: `${slug}-b@example.test` }))
	).rejects.toThrow('That slug is already taken');
	await expect(getAuth().getUserByEmail(`${slug}-b@example.test`)).rejects.toMatchObject({
		code: 'auth/user-not-found'
	});
});
