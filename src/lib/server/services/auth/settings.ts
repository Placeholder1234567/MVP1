// The caller's own display settings (user_settings; RLS limits each person to
// their own row). Quiet hours live in the Notification Service.
import { z } from 'zod';
import { THEMES } from '../../../domain/index.ts';
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
