import { and, eq } from 'drizzle-orm';
import type { RequestInfo, Tx } from '../../db';
import { auditLog, incidents, messagePhotos, messageReads, messages } from '../../db/schema';

/** Inserts unless a message with this ID exists (a retried upload). Returns true if inserted. */
export async function insertMessage(tx: Tx, row: typeof messages.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(messages)
		.values(row)
		.onConflictDoNothing({ target: messages.id })
		.returning({ id: messages.id });
	return inserted.length > 0;
}

/** The message's board, author and thread, if the caller can see it. */
export async function findMessage(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			homeId: messages.home_id,
			createdBy: messages.created_by,
			replyTo: messages.reply_to
		})
		.from(messages)
		.where(and(eq(messages.agency_id, agencyId), eq(messages.id, id)));
	return row;
}

/** Inserts a read receipt unless this reader already has one (another device) or the ID exists. */
export async function insertRead(tx: Tx, row: typeof messageReads.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(messageReads)
		.values(row)
		.onConflictDoNothing()
		.returning({ id: messageReads.id });
	return inserted.length > 0;
}

/** The incident's home, if the caller can see it. */
export async function findIncidentHome(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ homeId: incidents.home_id })
		.from(incidents)
		.where(and(eq(incidents.agency_id, agencyId), eq(incidents.id, id)));
	return row?.homeId ?? null;
}

/** A board photo's home and uploader, if the caller can see that board. */
export async function findPhoto(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			homeId: messagePhotos.home_id,
			uploadedBy: messagePhotos.uploaded_by,
			contentType: messagePhotos.content_type
		})
		.from(messagePhotos)
		.where(and(eq(messagePhotos.agency_id, agencyId), eq(messagePhotos.id, id)));
	return row;
}

/** Inserts unless the ID exists (a retried upload). Returns true if inserted. */
export async function insertPhoto(
	tx: Tx,
	row: typeof messagePhotos.$inferInsert
): Promise<boolean> {
	const inserted = await tx
		.insert(messagePhotos)
		.values(row)
		.onConflictDoNothing({ target: messagePhotos.id })
		.returning({ id: messagePhotos.id });
	return inserted.length > 0;
}

/** Opening a board photo is a PHI read (security.md "Audit Trail"). */
export async function recordPhotoView(
	tx: Tx,
	agencyId: string,
	viewerId: string,
	photoId: string,
	request: RequestInfo
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'photo_views',
		record_id: photoId,
		action: 'INSERT',
		performed_by: viewerId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { viewed: photoId }
	});
}
