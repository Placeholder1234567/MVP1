// The caller's own display settings (user_settings; RLS limits each person to
// their own row). Quiet hours live in the Notification Service.
import { z } from 'zod';
import { parseDisclosure, THEMES } from '../../../domain/index.ts';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { userSettings } from '../../db/schema';
import type { CurrentUser } from './auth.types';

export const ThemeInput = z.object({ theme: z.enum(THEMES) });

export async function saveTheme(tx: Tx, user: CurrentUser, input: z.input<typeof ThemeInput>) {
	const { theme } = ThemeInput.parse(input);
	await tx
		.insert(userSettings)
		.values({ agency_id: user.agencyId, profile_id: user.profileId, theme })
		.onConflictDoUpdate({
			target: userSettings.profile_id,
			set: { theme, updated_at: new Date() }
		});
	return { theme };
}

/** Progressive-disclosure flags the client may set (domain/onboarding.ts). */
export const DisclosureInput = z.object({ onboardingDone: z.boolean() }).partial().strict();

/** Merges the given flags into user_settings.disclosure, keeping the others. */
export async function saveDisclosure(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof DisclosureInput>
) {
	const change = DisclosureInput.parse(input);
	const [row] = await tx
		.select({ disclosure: userSettings.disclosure })
		.from(userSettings)
		.where(eq(userSettings.profile_id, user.profileId))
		.limit(1);
	const disclosure = { ...parseDisclosure(row?.disclosure), ...change };
	await tx
		.insert(userSettings)
		.values({ agency_id: user.agencyId, profile_id: user.profileId, disclosure })
		.onConflictDoUpdate({
			target: userSettings.profile_id,
			set: { disclosure, updated_at: new Date() }
		});
	return { disclosure };
}
