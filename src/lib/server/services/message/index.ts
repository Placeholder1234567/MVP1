// Message Service (services.md): the home message board. Append-only.
import { z } from 'zod';
import { asService, type RequestInfo, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { mediaStorage } from '../../storage';
import { PHOTO_MAX_BYTES, stripJpegMetadata } from '../../../domain/index.ts';
import type { CurrentUser } from '../auth/index.ts';
import { findVisibleClient } from '../charting/index.ts';
import {
	findIncidentHome,
	findMessage,
	findPhoto,
	insertMessage,
	insertPhoto,
	insertRead,
	recordPhotoView
} from './message.queries';

export const NewMessage = z.object({
	id: z.uuid(),
	homeId: z.uuid(),
	/** The person this message is about, if any; must live in this home */
	clientId: z.uuid().nullish(),
	/** The message this replies to; a reply to a reply joins the same thread */
	replyTo: z.uuid().nullish(),
	/** The incident this thread follows up on; must be from this home */
	incidentId: z.uuid().nullish(),
	/** A photo the author uploaded to this board (uploadPhoto) */
	photoId: z.uuid().nullish(),
	body: z.string().trim().min(1, 'Write a message first').max(2000),
	/** When the caregiver pressed send, possibly offline */
	sentAt: z.coerce.date().optional()
});

/** Posts to a home's board. Idempotent by message ID (a retried upload). */
export async function sendMessage(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewMessage>
): Promise<{ created: boolean }> {
	const m = NewMessage.parse(input);
	if (m.sentAt && m.sentAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The message time is in the future');
	}
	if (m.clientId) {
		const client = await findVisibleClient(tx, agencyId, m.clientId);
		if (!client || client.homeId !== m.homeId)
			throw new ServiceError('VALIDATION_FAILED', 'That person is not at this home');
	}
	let replyTo: string | null = null;
	if (m.replyTo) {
		const parent = await findMessage(tx, agencyId, m.replyTo);
		if (!parent || parent.homeId !== m.homeId)
			throw new ServiceError('VALIDATION_FAILED', 'That message is not on this board');
		replyTo = parent.replyTo ?? m.replyTo;
	}
	if (m.incidentId && (await findIncidentHome(tx, agencyId, m.incidentId)) !== m.homeId)
		throw new ServiceError('VALIDATION_FAILED', 'That incident is not from this home');
	if (m.photoId) {
		const photo = await findPhoto(tx, agencyId, m.photoId);
		if (!photo || photo.homeId !== m.homeId || photo.uploadedBy !== user.profileId)
			throw new ServiceError('VALIDATION_FAILED', 'That photo is not yours to share here');
	}
	const created = await insertMessage(tx, {
		id: m.id,
		agency_id: agencyId,
		home_id: m.homeId,
		client_id: m.clientId ?? null,
		reply_to: replyTo,
		incident_id: m.incidentId ?? null,
		photo_id: m.photoId ?? null,
		from_name: user.name,
		body: m.body,
		sent_at: m.sentAt ?? new Date(),
		created_by: user.profileId
	});
	return { created };
}

export const ReadReceipt = z.object({
	id: z.uuid(),
	messageId: z.uuid(),
	/** When the board showed the message, possibly offline */
	readAt: z.coerce.date().optional()
});

/**
 * Records that the caller has seen a message (frontend-audit.md finding 19).
 * Idempotent: a second device or a retried upload is a no-op, and authors
 * don't get receipts for their own messages.
 */
export async function markRead(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof ReadReceipt>
): Promise<{ created: boolean }> {
	const r = ReadReceipt.parse(input);
	const message = await findMessage(tx, agencyId, r.messageId);
	if (!message) throw new ServiceError('NOT_FOUND', 'Message not found');
	if (message.createdBy === user.profileId) return { created: false };
	const now = Date.now();
	const readAt = r.readAt && r.readAt.getTime() <= now + 5 * 60_000 ? r.readAt : new Date(now);
	const created = await insertRead(tx, {
		id: r.id,
		agency_id: agencyId,
		home_id: message.homeId,
		message_id: r.messageId,
		profile_id: user.profileId,
		reader_name: user.name,
		read_at: readAt
	});
	return { created };
}

export const PhotoUpload = z.object({
	/** Chosen by the device, so a retried upload stores one photo */
	id: z.uuid(),
	homeId: z.uuid(),
	/** The JPEG, base64; the device shrinks it to 1600 px first */
	data: z.base64().max(Math.ceil(PHOTO_MAX_BYTES / 3) * 4),
	width: z.number().int().min(1).max(10_000).optional(),
	height: z.number().int().min(1).max(10_000).optional()
});

const photoPath = (agencyId: string, id: string) => `photos/${agencyId}/${id}.jpg`;

/**
 * Stores a photo for a home's board (frontend-audit.md finding 19, fix 3).
 * Online only. Only JPEGs are kept, without metadata segments, so no camera
 * location or device details are stored. The message that shows it is
 * written separately (offline too) with its photoId.
 */
export async function uploadPhoto(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof PhotoUpload>
): Promise<{ id: string; bytes: number }> {
	const p = PhotoUpload.parse(input);
	if (user.role === 'caregiver' && !user.homeIds.includes(p.homeId))
		throw new ServiceError('FORBIDDEN', 'You can only share photos on your homes’ boards');
	const raw = Buffer.from(p.data, 'base64');
	if (raw.length > PHOTO_MAX_BYTES)
		throw new ServiceError('VALIDATION_FAILED', 'That photo is too large');
	const clean = stripJpegMetadata(raw);
	if (!clean) throw new ServiceError('VALIDATION_FAILED', 'Choose a photo (JPEG)');
	const existing = await findPhoto(tx, agencyId, p.id);
	if (existing) {
		if (existing.uploadedBy !== user.profileId)
			throw new ServiceError('VALIDATION_FAILED', 'Photo ID already used');
		return { id: p.id, bytes: clean.length };
	}
	await mediaStorage().put(photoPath(agencyId, p.id), Buffer.from(clean), 'image/jpeg');
	await insertPhoto(tx, {
		id: p.id,
		agency_id: agencyId,
		home_id: p.homeId,
		uploaded_by: user.profileId,
		content_type: 'image/jpeg',
		bytes: clean.length,
		width: p.width ?? null,
		height: p.height ?? null
	});
	return { id: p.id, bytes: clean.length };
}

/** A board photo for someone who can read that board. Each view is recorded. */
export async function getPhoto(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	request: RequestInfo
): Promise<{ contentType: string; data: string }> {
	const photo = await findPhoto(tx, agencyId, id);
	if (!photo) throw new ServiceError('NOT_FOUND', 'Photo not found');
	const body = await mediaStorage().get(photoPath(agencyId, id));
	if (!body) throw new ServiceError('NOT_FOUND', 'Photo not found');
	// audit_log takes no user writes (rls.sql): the trusted server records it.
	await asService(tx, (t) => recordPhotoView(t, agencyId, user.profileId, id, request));
	return { contentType: photo.contentType, data: body.toString('base64') };
}
