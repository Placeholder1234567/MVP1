import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService, withUser } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import {
	dispatchNotifications,
	setSmsOptOut,
	smsCarrierSuppressed
} from '../../../src/lib/server/services/notification';
import { handleInboundSms } from '../../../src/lib/server/services/sms';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { runJob } from '../../../src/lib/server/jobs/registry';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
import { addDays, localTime, offerCode, SMS_REPLY_TEXT } from '../../../src/lib/domain';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	oak = randomUUID(),
	maple = randomUUID();
const cara = randomUUID(),
	eli = randomUUID(),
	bea = randomUUID(),
	sam = randomUUID();
const uid = (id: string) => `sms-${id}`;
const phone = () => `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const phones = { [eli]: phone(), [bea]: phone(), [cara]: phone() };
const caller = createCallerFactory(appRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const day = addDays(localTime(new Date(), 'America/New_York').day, 2);
const sms = vi.fn(async (_to: string, d: { notificationId: string }) => ({
	providerMessageId: `sms-${d.notificationId}`
}));
const text = (from: string, body: string) =>
	handleInboundSms({ originationNumber: from, messageBody: body, inboundMessageId: randomUUID() });
const lastReplyTo = (to: string) => sms.mock.calls.filter(([n]) => n === to).at(-1)?.[1];

beforeAll(async () => {
	setProvidersForTests({ sms, push: async () => ({ providerMessageId: 'push' }) });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'SMS Test',
			subscription_tier: 'complete',
			slug: `sms-${agency}`
		});
		await tx.insert(s.homes).values([
			{ id: oak, agency_id: agency, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: maple, agency_id: agency, name: 'Maple', lat: 41, lng: -75, radius: 150 }
		]);
		await tx.insert(s.profiles).values([
			...[eli, bea, cara].map((id) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				phone: phones[id],
				name: 'Synthetic Caregiver',
				role: 'caregiver' as const,
				home_ids: [oak, maple],
				med_certified: true
			})),
			{
				id: sam,
				agency_id: agency,
				auth_uid: uid(sam),
				email: `${sam}@example.test`,
				name: 'Synthetic Supervisor',
				role: 'supervisor' as const,
				home_ids: [oak, maple]
			}
		]);
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

it('answers a coverage offer by text, with the same rules as the app', async () => {
	await (await as(sam)).schedule.setSlot({ homeId: oak, day, shift: 'pm', profileId: cara });
	const request = await (await as(cara)).coverage.callout({ homeId: oak, day, shift: 'pm' });
	await runJob(
		'coverage-search',
		{ agencyId: agency, id: request.id },
		{ attempt: 0, final: true }
	);
	const code = offerCode(request.id);

	// The offer goes out by SMS with its code.
	await vi.waitFor(() =>
		expect(lastReplyTo(phones[eli])?.body).toContain(`Reply YES ${code} or NO ${code}`)
	);

	expect(await text('+15550000000', 'YES')).toBe('ignored');
	expect(sms.mock.calls.some(([n]) => n === '+15550000000')).toBe(false);

	expect(await text(phones[eli], 'maybe later')).toBe('unknown');
	expect(lastReplyTo(phones[eli])?.body).toBe(SMS_REPLY_TEXT.unknown);

	const wrong = code === '1234' ? '4321' : '1234';
	expect(await text(phones[eli], `YES ${wrong}`)).toBe('no_such_code');
	expect(await text(phones[bea], 'no')).toBe('declined');
	expect(await text(phones[eli], `yes ${code}`)).toBe('accepted');
	expect(lastReplyTo(phones[eli])?.body).toBe(SMS_REPLY_TEXT.accepted);

	const slots = await (await as(sam)).schedule.get({ homeId: oak, weekStart: day });
	expect(slots.slots.find((x) => x.day === day && x.shift === 'pm')?.assigned_to).toBe(eli);
	// Nothing left to answer.
	expect(await text(phones[eli], 'yes')).toBe('no_offers');
	expect(await text(phones[cara], 'yes')).toBe('no_offers');
});

it('needs the code when someone has several open offers', async () => {
	const supervisor = await as(sam);
	const ids: string[] = [];
	for (const shift of ['am', 'pm'] as const) {
		const r = await supervisor.schedule.postOpen({ homeId: maple, day, shift });
		await runJob('coverage-search', { agencyId: agency, id: r.id }, { attempt: 0, final: true });
		ids.push(r.id);
	}
	const open = (await (await as(bea)).coverage.offers()).filter((o) => ids.includes(o.id));
	expect(open).toHaveLength(2);
	if (offerCode(ids[0]) === offerCode(ids[1])) return; // 1-in-9000 collision: covered by 'ambiguous' anyway
	expect(await text(phones[bea], 'YES')).toBe('ambiguous');
	expect(lastReplyTo(phones[bea])?.body).toBe(SMS_REPLY_TEXT.ambiguous(2));
	expect(await text(phones[bea], `NO ${offerCode(ids[0])}`)).toBe('declined');
	const left = (await (await as(bea)).coverage.offers()).filter((o) => ids.includes(o.id));
	expect(left.map((o) => o.id)).toEqual([ids[1]]);
});

it('STOP turns SMS off, even for mandatory alerts; START turns it back on', async () => {
	expect(await text(phones[cara], 'STOP')).toBe('opted_out');
	const prefs = () =>
		withService((tx) =>
			tx
				.select()
				.from(s.notificationPreferences)
				.where(eq(s.notificationPreferences.profile_id, cara))
		);
	expect((await prefs()).every((p) => p.sms_enabled === false)).toBe(true);
	// An ordinary preference save must never clear the verified carrier STOP.
	await (
		await as(cara)
	).notification.updatePreferences({
		preferences: [{ notificationType: 'coverage_offer', smsEnabled: true }]
	});
	expect((await prefs()).find((p) => p.notification_type === 'coverage_offer')?.sms_enabled).toBe(
		true
	);
	const user = (await getCurrentUser(uid(cara)))!;
	expect(await withUser(user.claims, {}, (tx) => tx.select().from(s.smsCarrierConsents))).toEqual(
		[]
	);

	const id = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: cara,
			type: 'coverage_offer',
			title: 'Shift available',
			channel: 'sms',
			priority: 1
		})
	);
	// Coverage jobs from the preceding scenarios may still send to other staff.
	// STOP must prevent delivery to this recipient, not freeze every agency's queue.
	const stoppedRecipientCalls = () => sms.mock.calls.filter(([to]) => to === phones[cara]);
	const before = stoppedRecipientCalls().length;
	expect(await dispatchNotifications({ ids: [id] })).toMatchObject({ sent: 0, failed: 1 });
	expect(stoppedRecipientCalls()).toHaveLength(before);
	expect(sms.mock.calls.some(([, delivery]) => delivery.notificationId === id)).toBe(false);
	expect(await text(phones[cara], 'unknown reply')).toBe('unknown');
	expect(stoppedRecipientCalls()).toHaveLength(before);

	expect(await text(phones[cara], 'start')).toBe('opted_in');
	expect(lastReplyTo(phones[cara])?.body).toBe(SMS_REPLY_TEXT.started);
	const offer = (await prefs()).find((p) => p.notification_type === 'coverage_offer');
	expect(offer).toMatchObject({ sms_enabled: true, push_enabled: true });
	const [row] = await withService((tx) =>
		tx
			.select({ status: s.notifications.status })
			.from(s.notifications)
			.where(and(eq(s.notifications.id, id), eq(s.notifications.agency_id, agency)))
	);
	expect(row.status).toBe('failed');
	const next = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id: next,
			agency_id: agency,
			profile_id: cara,
			type: 'coverage_offer',
			title: 'Synthetic consent resumed',
			channel: 'sms',
			priority: 1
		})
	);
	expect(await dispatchNotifications({ ids: [next] })).toMatchObject({ sent: 1 });
	expect(sms.mock.calls.some(([, delivery]) => delivery.notificationId === next)).toBe(true);
	await expect(
		withService((tx) =>
			setSmsOptOut(tx, agency, { id: cara, role: 'caregiver' }, true, '+15550000000')
		)
	).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
});

it('answers a re-delivered text only once', async () => {
	const id = randomUUID();
	const send = () =>
		handleInboundSms({
			originationNumber: phones[cara],
			messageBody: 'maybe',
			inboundMessageId: id
		});
	const before = sms.mock.calls.length;
	expect(await send()).toBe('unknown');
	expect(await send()).toBe('duplicate');
	expect(sms.mock.calls.length).toBe(before + 1);
});

it('keeps ambiguous legacy opt-outs suppressed after a preference save until verified START', async () => {
	const id = randomUUID(),
		number = phone();
	await withService(async (tx) => {
		await tx.insert(s.profiles).values({
			id,
			agency_id: agency,
			auth_uid: uid(id),
			email: `${id}@example.test`,
			name: 'Synthetic legacy recipient',
			phone: number,
			role: 'caregiver',
			home_ids: [oak]
		});
		await tx.insert(s.notificationPreferences).values({
			agency_id: agency,
			profile_id: id,
			notification_type: 'coverage_offer',
			sms_enabled: false
		});
	});
	await (
		await as(id)
	).notification.updatePreferences({
		preferences: [{ notificationType: 'coverage_offer', smsEnabled: true }]
	});
	expect(await withService((tx) => smsCarrierSuppressed(tx, agency, number))).toBe(true);
	expect(await text(number, 'START')).toBe('opted_in');
	expect(await withService((tx) => smsCarrierSuppressed(tx, agency, number))).toBe(false);
});

it('does not convert a new ordinary SMS opt-out into carrier STOP or verified consent', async () => {
	const id = randomUUID(),
		number = phone();
	await withService((tx) =>
		tx.insert(s.profiles).values({
			id,
			agency_id: agency,
			auth_uid: uid(id),
			email: `${id}@example.test`,
			name: 'Synthetic new recipient',
			phone: number,
			role: 'caregiver',
			home_ids: [oak]
		})
	);
	await (
		await as(id)
	).notification.updatePreferences({
		preferences: [{ notificationType: 'coverage_offer', smsEnabled: false }]
	});
	expect(await withService((tx) => smsCarrierSuppressed(tx, agency, number))).toBe(false);
	const rows = await withService((tx) =>
		tx.select().from(s.smsCarrierConsents).where(eq(s.smsCarrierConsents.agency_id, agency))
	);
	expect(
		rows.find((row) => row.phone_hash === createHash('sha256').update(number).digest('hex'))?.state
	).toBe('unknown');
	const user = (await getCurrentUser(uid(id)))!;
	await expect(
		withUser(user.claims, {}, (tx) =>
			tx
				.insert(s.smsCarrierConsents)
				.values({ agency_id: agency, phone_hash: 'synthetic-forged', state: 'started' })
		)
	).rejects.toBeDefined();
});

it('shares carrier suppression by number within an agency and isolates agencies', async () => {
	const number = phone(),
		ids = [randomUUID(), randomUUID()],
		otherAgency = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: otherAgency,
			name: 'Synthetic other agency',
			slug: `sms-${otherAgency}`,
			subscription_tier: 'complete'
		});
		await tx.insert(s.profiles).values(
			ids.map((id) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic shared number',
				phone: number,
				role: 'caregiver' as const,
				home_ids: [oak]
			}))
		);
		await setSmsOptOut(tx, agency, { id: ids[0], role: 'caregiver' }, true, number);
	});
	await (
		await as(ids[1])
	).notification.updatePreferences({
		preferences: [{ notificationType: 'coverage_offer', smsEnabled: true }]
	});
	expect(await withService((tx) => smsCarrierSuppressed(tx, agency, number))).toBe(true);
	expect(await withService((tx) => smsCarrierSuppressed(tx, otherAgency, number))).toBe(false);
});
