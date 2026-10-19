import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../db';
import { agencies, deviceTokens, profiles, userSettings } from '../../db/schema';
import type { CurrentUser } from '../auth';
import { ServiceError } from '../../errors';
import { notificationOverrides } from '../../../domain/notification-overrides';
import { DEFAULT_QUIET_HOURS } from '../../../domain/notifications';
import { validQuietHours } from '../../../domain/quiet-hours';

export const QuietHoursInput = z
	.object({ start: z.string(), end: z.string() })
	.refine(
		({ start, end }) => validQuietHours(start, end),
		'Choose a quiet period between 4 and 10 hours.'
	);
const own = (user: CurrentUser) =>
	and(eq(userSettings.agency_id, user.agencyId), eq(userSettings.profile_id, user.profileId));
export async function quietHours(tx: Tx, user: CurrentUser) {
	const [settings] = await tx
		.select({ start: userSettings.quiet_hours_start, end: userSettings.quiet_hours_end })
		.from(userSettings)
		.where(own(user));
	const [agency] = await tx
		.select({ timeZone: agencies.timezone, settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, user.agencyId));
	const agencyWindow = notificationOverrides(agency.settings).quietHours;
	return {
		start:
			agencyWindow?.start ??
			(settings?.start && settings?.end ? settings.start.slice(0, 5) : DEFAULT_QUIET_HOURS.start),
		end:
			agencyWindow?.end ??
			(settings?.start && settings?.end ? settings.end.slice(0, 5) : DEFAULT_QUIET_HOURS.end),
		timeZone: agency.timeZone,
		agencySet: !!agencyWindow
	};
}
export async function saveQuietHours(
	tx: Tx,
	user: CurrentUser,
	input: z.infer<typeof QuietHoursInput>
) {
	const value = QuietHoursInput.parse(input);
	if ((await quietHours(tx, user)).agencySet)
		throw new ServiceError('RULE_VIOLATION', 'Your agency sets quiet hours.');
	await tx
		.insert(userSettings)
		.values({
			agency_id: user.agencyId,
			profile_id: user.profileId,
			quiet_hours_start: value.start,
			quiet_hours_end: value.end
		})
		.onConflictDoUpdate({
			target: userSettings.profile_id,
			set: { quiet_hours_start: value.start, quiet_hours_end: value.end, updated_at: new Date() }
		});
	return quietHours(tx, user);
}
const tokenOwner = (user: CurrentUser) =>
	and(eq(deviceTokens.agency_id, user.agencyId), eq(deviceTokens.profile_id, user.profileId));
const deviceView = {
	id: deviceTokens.id,
	platform: deviceTokens.platform,
	lastSeenAt: deviceTokens.last_seen_at,
	createdAt: deviceTokens.created_at
};
export async function listPushDevices(tx: Tx, user: CurrentUser) {
	return tx
		.select(deviceView)
		.from(deviceTokens)
		.where(tokenOwner(user))
		.orderBy(desc(deviceTokens.created_at))
		.limit(100);
}
export const PushDeviceInput = z.object({
	token: z.string().regex(/^[A-Za-z0-9_:.-]{20,4096}$/),
	platform: z.enum(['web', 'ios', 'android']),
	previousId: z.uuid().optional()
});
export async function registerPushDevice(
	tx: Tx,
	user: CurrentUser,
	input: z.infer<typeof PushDeviceInput>
) {
	const value = PushDeviceInput.parse(input);
	if (process.env.PUSH_DRIVER !== 'fcm')
		throw new ServiceError(
			'RULE_VIOLATION',
			'Push registration is not configured. Your in-app alerts remain available.'
		);
	// Serialize this user's registrations to keep a bounded device list.
	await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, user.agencyId), eq(profiles.id, user.profileId)))
		.for('update');
	const [existing] = await tx
		.select({ id: deviceTokens.id })
		.from(deviceTokens)
		.where(and(tokenOwner(user), eq(deviceTokens.token, value.token)));
	if (value.previousId && value.previousId !== existing?.id) {
		// Token rotation replaces only this account's previous registration, transactionally.
		await removePushDevice(tx, user, value.previousId);
	}
	if (existing) {
		await tx
			.update(deviceTokens)
			.set({ platform: value.platform, last_seen_at: new Date(), updated_at: new Date() })
			.where(and(tokenOwner(user), eq(deviceTokens.id, existing.id)));
		return { id: existing.id };
	}
	if ((await listPushDevices(tx, user)).length >= 10)
		throw new ServiceError('RULE_VIOLATION', 'Remove an old push device before adding another.');
	const [created] = await tx
		.insert(deviceTokens)
		.values({
			agency_id: user.agencyId,
			profile_id: user.profileId,
			token: value.token,
			platform: value.platform,
			last_seen_at: new Date()
		})
		.onConflictDoNothing({ target: deviceTokens.token })
		.returning({ id: deviceTokens.id });
	// A token already owned elsewhere can never be reassigned by this endpoint.
	if (!created)
		throw new ServiceError(
			'RULE_VIOLATION',
			'This push registration could not be added. Refresh device registration and try again.'
		);
	return created;
}
export async function removePushDevice(tx: Tx, user: CurrentUser, id: string) {
	const removed = await tx
		.delete(deviceTokens)
		.where(and(tokenOwner(user), eq(deviceTokens.id, id)))
		.returning({ id: deviceTokens.id });
	return { removed: removed.length > 0 };
}
