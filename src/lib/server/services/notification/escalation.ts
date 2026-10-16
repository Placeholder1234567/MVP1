// Escalation engine (notifications.md §8). notify() starts a chain for types
// in ESCALATION_CHAINS by queueing step 1 as a delayed task named after the
// event, so a chain is queued once however many people were notified. When a
// step fires and nobody has acknowledged the event, it sends that step's
// channel to the step's recipients, marks the event escalated, and queues the
// next step; after the last step the event is escalation_exhausted.
import { escalationStep, escalationTaskName, secondsUntilStep } from '../../../domain/index.ts';
import { withService, type Tx } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { queueDeliveries } from './dispatch';
import { eventRows, setEventStatus } from './escalation.queries';
import { activeStaffByRole, insertNotifications } from './notification.queries';

export interface EscalationPayload {
	agencyId: string;
	type: string;
	referenceId: string | null;
	/** One in-app row of the event (identifies it when there's no reference) */
	notificationId: string;
	step: number;
}

const eventKey = (p: Pick<EscalationPayload, 'type' | 'referenceId' | 'notificationId'>) =>
	`${p.type}-${p.referenceId ?? p.notificationId}`;

/** Queues the next step of an event's chain, if the type has one. */
export async function queueEscalation(p: EscalationPayload): Promise<void> {
	const delaySeconds = secondsUntilStep(p.type, p.step);
	if (delaySeconds === undefined) return;
	await enqueue('notifications-escalate', p, {
		delaySeconds,
		taskName: escalationTaskName(eventKey(p), p.step)
	});
}

export type EscalationOutcome = 'escalated' | 'exhausted' | 'acknowledged' | 'gone';

export async function escalate(p: EscalationPayload): Promise<{ outcome: EscalationOutcome }> {
	const step = escalationStep(p.type, p.step);
	if (!step) return { outcome: 'gone' };
	const last = !escalationStep(p.type, p.step + 1);
	const result = await withService(async (tx) => {
		const event = await eventRows(tx, p.agencyId, p.type, p.referenceId, p.notificationId);
		if (!event.length) return { outcome: 'gone' as const };
		if (event.some((r) => r.readAt)) return { outcome: 'acknowledged' as const };
		const recipients = await recipientsFor(tx, p.agencyId, step.to, event);
		const known = new Set(event.map((r) => r.profileId));
		const base = {
			agency_id: p.agencyId,
			type: p.type,
			// Every escalation is urgent: it skips quiet hours (notifications.md §3.4).
			priority: 1 as const,
			title: event[0].title,
			reference_id: p.referenceId,
			reference_type: event[0].referenceType
		};
		const inserted = await insertNotifications(
			tx,
			recipients.flatMap((id) => [
				// People new to the event (admins) also get it in their inbox, where
				// reading it acknowledges the event and stops the chain.
				...(known.has(id)
					? []
					: [
							{
								...base,
								profile_id: id,
								channel: 'in_app',
								status: 'sent' as const,
								sent_at: new Date()
							}
						]),
				{ ...base, profile_id: id, channel: step.channel }
			])
		);
		await setEventStatus(
			tx,
			p.agencyId,
			event.map((r) => r.id),
			last ? 'escalation_exhausted' : 'escalated'
		);
		return { outcome: last ? ('exhausted' as const) : ('escalated' as const), inserted };
	});
	if ('inserted' in result && result.inserted) await queueDeliveries(result.inserted);
	if (result.outcome === 'escalated') await queueEscalation({ ...p, step: p.step + 1 });
	console.log(`escalation ${p.type} step ${p.step}: ${result.outcome}`);
	return { outcome: result.outcome };
}

async function recipientsFor(
	tx: Tx,
	agencyId: string,
	to: 'same' | 'admins',
	event: { profileId: string }[]
): Promise<string[]> {
	if (to === 'same') return [...new Set(event.map((r) => r.profileId))];
	return (await activeStaffByRole(tx, agencyId, 'admin')).map((a) => a.id);
}
