// Staff training and certifications (schema.ts staff_credentials,
// domain/credentials.ts; trpc-router.md `staff.credentials`,
// `staff.saveCredential`, `staff.removeCredential`). Admins record and
// renew them; supervisors see everyone's; caregivers see their own. The
// credential-expiry sweep (notification service) sends the reminders.
import { z } from 'zod';
import {
	CREDENTIAL_KINDS,
	credentialName,
	credentialStatus,
	localTime
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from './auth.types';
import {
	credentialOwner,
	deleteCredential,
	insertCredential,
	sameName,
	selectCredentials,
	staffProfile,
	updateCredential
} from './credentials.queries';

export const CredentialFilter = z.object({ profileId: z.uuid().optional() });

export const CredentialInput = z
	.object({
		/** Present when renewing or correcting one already recorded */
		id: z.uuid().optional(),
		profileId: z.uuid(),
		kind: z.enum(CREDENTIAL_KINDS),
		/** Required for 'other'; ignored for the named kinds */
		name: z.string().trim().max(120).optional(),
		issuedOn: z.iso.date().nullish(),
		expiresOn: z.iso.date().nullish()
	})
	.refine((c) => c.kind !== 'other' || !!c.name, {
		message: 'Name the training',
		path: ['name']
	})
	.refine((c) => !c.issuedOn || !c.expiresOn || c.expiresOn >= c.issuedOn, {
		message: 'The expiry date is before the issue date',
		path: ['expiresOn']
	});

/**
 * Credentials with their status today. Caregivers get only their own (RLS
 * enforces it too); supervisors and admins can ask for one person or all.
 */
export async function listCredentials(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof CredentialFilter> = {}
) {
	const { profileId } = CredentialFilter.parse(input);
	const own = user.role === 'caregiver';
	const rows = await selectCredentials(tx, user.agencyId, own ? user.profileId : profileId);
	const today = localTime(new Date(), user.timeZone).day;
	return rows.map((r) => ({ ...r, status: credentialStatus(r.expiresOn, today) }));
}

export async function saveCredential(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof CredentialInput>
) {
	if (user.role !== 'admin')
		throw new ServiceError('FORBIDDEN', 'Only admins can record training and certifications');
	const c = CredentialInput.parse(input);
	if (!(await staffProfile(tx, user.agencyId, c.profileId)))
		throw new ServiceError('NOT_FOUND', 'Staff member not found');
	if (c.id) {
		const owner = await credentialOwner(tx, user.agencyId, c.id);
		if (!owner || owner.profileId !== c.profileId)
			throw new ServiceError('NOT_FOUND', 'Credential not found');
	}
	const name = credentialName(c.kind, c.name);
	if (await sameName(tx, user.agencyId, c.profileId, name, c.id ?? null))
		throw new ServiceError(
			'RULE_VIOLATION',
			`They already have ${name} recorded. Renew that one instead.`
		);
	const row = {
		kind: c.kind,
		name,
		issued_on: c.issuedOn ?? null,
		expires_on: c.expiresOn ?? null,
		recorded_by: user.profileId
	};
	const saved = c.id
		? await updateCredential(tx, user.agencyId, c.id, row)
		: await insertCredential(tx, { ...row, agency_id: user.agencyId, profile_id: c.profileId });
	if (!saved) throw new ServiceError('NOT_FOUND', 'Credential not found');
	return { id: saved.id };
}

export async function removeCredential(tx: Tx, user: CurrentUser, id: string) {
	if (user.role !== 'admin')
		throw new ServiceError('FORBIDDEN', 'Only admins can remove training and certifications');
	if (!(await deleteCredential(tx, user.agencyId, z.uuid().parse(id))))
		throw new ServiceError('NOT_FOUND', 'Credential not found');
	return { id };
}
