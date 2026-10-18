// Display theme (frontend-spec-1.md §10.1): each person saves their own choice
// in user_settings.theme, which keeps quiet hours untouched.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID();
const [ME, OTHER] = [randomUUID(), randomUUID()];
const uid = (id: string) => `theme-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const themeOf = async (id: string) =>
	(
		await withService((t) =>
			t
				.select({ theme: s.userSettings.theme, start: s.userSettings.quiet_hours_start })
				.from(s.userSettings)
				.where(eq(s.userSettings.profile_id, id))
		)
	)[0];

beforeAll(async () => {
	await withService(async (t) => {
		await t
			.insert(s.agencies)
			.values({ id: AGENCY, name: 'Theme Test', slug: `theme-${AGENCY}`, timezone: 'UTC' });
		await t.insert(s.profiles).values(
			[ME, OTHER].map((id) => ({
				id,
				agency_id: AGENCY,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic Staff',
				role: 'caregiver' as const
			}))
		);
	});
});

afterAll(() => closeDb());

it('saves the caller’s own theme and keeps their other settings', async () => {
	const me = await as(ME);
	expect(await me.auth.setTheme({ theme: 'dark' })).toEqual({ theme: 'dark' });
	expect(await themeOf(ME)).toEqual({ theme: 'dark', start: null });

	await me.notification.setQuietHours({ start: '22:00', end: '06:00' });
	await me.auth.setTheme({ theme: 'light' });
	expect(await themeOf(ME)).toEqual({ theme: 'light', start: '22:00:00' });
	expect(await themeOf(OTHER)).toBeUndefined();
});

it('rejects anything but light, dark and auto', async () => {
	await expect(
		(await as(ME)).auth.setTheme({ theme: 'guad-dark-off' as 'dark' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
