// Agency Service (services.md): the caller's agency and its configuration.
import { z } from 'zod';
import { INCIDENT_TYPES, RULE_WHEN_MAX } from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { createStaffAccount } from '../auth/index.ts';
import { seedDefaultTemplates } from '../goal/index.ts';
import { agencyBySlug, findAgency, insertAgency, updateAgencyRow } from './agency.queries';

export async function getAgency(tx: Tx, agencyId: string) {
	const a = await findAgency(tx, agencyId);
	if (!a) return null;
	return {
		id: a.id,
		name: a.name,
		slug: a.slug,
		chartingPreset: a.charting_preset,
		settings: a.settings ?? {},
		subscriptionTier: a.subscription_tier ?? 'starter',
		enabledFeatures: a.enabled_features ?? [],
		timezone: a.timezone,
		createdAt: a.created_at,
		updatedAt: a.updated_at
	};
}

/**
 * Settings an admin may change. Unknown keys are kept, so settings added by
 * later features survive; the known ones are checked.
 */
export const AgencySettings = z
	.object({
		mfa_required_roles: z.array(z.enum(['caregiver', 'supervisor'])).optional(),
		/** Who must be told about which incidents, and by when (domain/charting.ts). */
		incident_rules: z
			.object({
				guardianWhen: z.string().trim().min(1).max(RULE_WHEN_MAX),
				nurseTypes: z.array(z.enum(INCIDENT_TYPES)),
				nurseWhen: z.string().trim().min(1).max(RULE_WHEN_MAX),
				stateSeverities: z.array(z.enum(['Low', 'Medium', 'High'])),
				stateTypes: z.array(z.enum(INCIDENT_TYPES)),
				stateWhen: z.string().trim().min(1).max(RULE_WHEN_MAX)
			})
			.strict()
			.optional()
	})
	.passthrough();

export const AgencyChanges = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	/** Labels and form order only, never schema, API or validation (CLAUDE.md). */
	chartingPreset: z.enum(['therap', 'default']).optional(),
	timezone: z
		.string()
		.refine((tz) => {
			try {
				new Intl.DateTimeFormat('en', { timeZone: tz });
				return true;
			} catch {
				return false;
			}
		}, 'Unknown time zone')
		.optional(),
	settings: AgencySettings.optional()
});

/** Plan (subscription tier, features) is not changed here: that is billing's job. */
export async function updateAgency(tx: Tx, agencyId: string, input: z.infer<typeof AgencyChanges>) {
	const data = AgencyChanges.parse(input);
	const current = await findAgency(tx, agencyId);
	if (!current) throw new ServiceError('NOT_FOUND', 'Agency not found');
	const row = await updateAgencyRow(tx, agencyId, {
		name: data.name,
		charting_preset: data.chartingPreset,
		timezone: data.timezone,
		settings: data.settings
			? { ...((current.settings as object | null) ?? {}), ...data.settings }
			: undefined
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Agency not found');
	return getAgency(tx, agencyId);
}

// ─── Provisioning (services.md §2 provisionAgency) ──────────────────────────
// Run by the Guad operator (scripts/provision-agency.ts), never from the app:
// there is no in-app role above an agency's admin.

export const NewAgency = z.object({
	name: z.string().trim().min(1).max(100),
	slug: z
		.string()
		.trim()
		.regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, 'Use 3-50 lowercase letters, digits and dashes'),
	tier: z.enum(['starter', 'professional', 'complete']),
	timezone: AgencyChanges.shape.timezone.unwrap().default('America/New_York'),
	chartingPreset: z.enum(['therap', 'default']).default('default'),
	adminEmail: z.email().max(254),
	adminName: z.string().trim().min(1).max(100)
});

/**
 * Creates an agency with its default goal templates and invites its first
 * admin (sign-in with no password; the setup link is emailed after commit).
 */
export async function provisionAgency(tx: Tx, input: z.input<typeof NewAgency>) {
	const data = NewAgency.parse(input);
	if (await agencyBySlug(tx, data.slug))
		throw new ServiceError('RULE_VIOLATION', 'That slug is already taken');
	const agency = await insertAgency(tx, {
		name: data.name,
		slug: data.slug,
		subscription_tier: data.tier,
		timezone: data.timezone,
		charting_preset: data.chartingPreset
	});
	const templates = await seedDefaultTemplates(tx, agency.id);
	const admin = await createStaffAccount(tx, agency.id, {
		email: data.adminEmail,
		name: data.adminName,
		role: 'admin',
		homeIds: []
	});
	return { agencyId: agency.id, adminProfileId: admin.id, templates };
}
