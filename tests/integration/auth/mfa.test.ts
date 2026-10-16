import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { checkMfa, getCurrentUser } from '../../../src/lib/server/services/auth';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	strict = randomUUID();
const admin = randomUUID(),
	newSup = randomUUID(),
	oldSup = randomUUID(),
	carer = randomUUID(),
	strictCarer = randomUUID();
const uid = (id: string) => `mfa-${id}`;
const user = async (id: string) => (await getCurrentUser(uid(id)))!;

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{ id: agency, name: 'MFA Test', subscription_tier: 'complete', slug: `mfa-${agency}` },
			{
				id: strict,
				name: 'MFA Strict',
				subscription_tier: 'complete',
				slug: `mfa-${strict}`,
				settings: { mfa_required_roles: ['caregiver'] }
			}
		]);
		const old = new Date(Date.now() - 45 * 86_400_000);
		await tx.insert(s.profiles).values(
			(
				[
					[admin, agency, 'admin', new Date()],
					[newSup, agency, 'supervisor', new Date()],
					[oldSup, agency, 'supervisor', old],
					[carer, agency, 'caregiver', new Date()],
					[strictCarer, strict, 'caregiver', new Date()]
				] as const
			).map(([id, agencyId, role, created]) => ({
				id,
				agency_id: agencyId,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic Staff',
				role,
				created_at: created
			}))
		);
	});
});

afterAll(closeDb);

it('blocks admins and supervisors past the grace period without a second factor', async () => {
	expect(await checkMfa(await user(admin), false)).toEqual({ kind: 'required', satisfied: false });
	expect(await checkMfa(await user(oldSup), false)).toEqual({ kind: 'required', satisfied: false });
});

it('lets new supervisors and caregivers in, and honors the agency setting', async () => {
	expect(await checkMfa(await user(newSup), false)).toMatchObject({
		kind: 'grace',
		satisfied: true
	});
	expect(await checkMfa(await user(carer), false)).toEqual({ kind: 'optional', satisfied: true });
	expect(await checkMfa(await user(strictCarer), false)).toEqual({
		kind: 'required',
		satisfied: false
	});
});

it('accepts a TOTP sign-in and records that the profile has MFA', async () => {
	expect(await checkMfa(await user(admin), true)).toEqual({ kind: 'required', satisfied: true });
	const [row] = await withService((tx) =>
		tx.select({ mfa: s.profiles.mfa_enabled }).from(s.profiles).where(eq(s.profiles.id, admin))
	);
	expect(row.mfa).toBe(true);
});
