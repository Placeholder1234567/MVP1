import { z } from 'zod';

const text = z.string().max(8000);
const sections = z
	.record(z.string().max(60), text)
	.refine((value) => Object.keys(value).length <= 20);
const keys = z.array(z.string().max(1000)).max(60);
export const LomiBinding = z
	.object({
		agencyId: z.uuid(),
		profileId: z.uuid(),
		homeId: z.uuid(),
		clientId: z.uuid(),
		day: z.iso.date(),
		shift: z.enum(['am', 'pm', 'on']),
		type: z.enum(['shift', 'behavior'])
	})
	.strict();
export type LomiBinding = z.infer<typeof LomiBinding>;
const result = z
	.object({
		content: sections,
		flags: z.array(z.object({ phrase: text, tip: text }).strict()).max(60),
		incident: z.object({ detected: z.boolean(), summary: text }).strict(),
		fallback: z.boolean(),
		goalReferences: z
			.array(z.object({ goalId: z.uuid(), evidence: text }).strict())
			.max(60)
			.optional()
	})
	.strict();
export const LomiLedger = z
	.object({
		content: sections,
		currentResult: result,
		manuallyEdited: keys,
		owned: keys,
		kept: keys,
		skipped: keys,
		additions: sections,
		followup: text,
		undo: sections.nullable(),
		usedAi: z.boolean(),
		pending: z
			.object({
				updates: z.array(z.object({ section: z.string().max(60), text }).strict()).max(20),
				fallback: z.boolean()
			})
			.strict()
			.nullable(),
		pendingSource: text
	})
	.strict();
export type LomiLedger = z.infer<typeof LomiLedger>;
const recovery = z
	.object({
		day: z.iso.date(),
		binding: LomiBinding,
		noteId: z.uuid().nullable(),
		said: text.min(1),
		original: result,
		ledger: LomiLedger,
		phase: z.enum(['review', 'used'])
	})
	.strict();
export type LomiRecovery = z.infer<typeof recovery>;
export function lomiRecoveryData(value: unknown): LomiRecovery | null {
	const parsed = recovery.safeParse(value);
	if (!parsed.success) return null;
	const data = parsed.data;
	if (data.day !== data.binding.day) return null;
	const allowed = new Set(
		data.binding.type === 'shift'
			? ['activities', 'meals', 'mood', 'health']
			: ['before', 'behavior', 'response', 'outcome', 'duration']
	);
	const maps = [
		data.original.content,
		data.ledger.content,
		data.ledger.currentResult.content,
		data.ledger.additions,
		data.ledger.undo ?? {}
	];
	if (
		maps.some((map) => Object.keys(map).some((key) => !allowed.has(key))) ||
		[data.ledger.manuallyEdited, data.ledger.owned, data.ledger.skipped].some((list) =>
			list.some((key) => !allowed.has(key))
		) ||
		data.ledger.pending?.updates.some((update) => !allowed.has(update.section))
	)
		return null;
	return data;
}
/** All scope values are identifiers; the data itself stays in encrypted SQLite. */
export function lomiRecoveryScope(binding: LomiBinding) {
	return [binding.agencyId, binding.homeId, binding.day, binding.shift, binding.type].join(':');
}
export function sameLomiBinding(a: LomiBinding, b: LomiBinding) {
	return (
		a.profileId === b.profileId &&
		a.clientId === b.clientId &&
		lomiRecoveryScope(a) === lomiRecoveryScope(b)
	);
}
/** After Use, edits in the actual note become protected caregiver-owned sections. */
export function retainParentEdits(
	saved: LomiRecovery,
	content: Record<string, string>
): LomiRecovery {
	const changed = [
		...new Set([...Object.keys(saved.ledger.content), ...Object.keys(content)])
	].filter((key) => (saved.ledger.content[key] ?? '') !== (content[key] ?? ''));
	return {
		...saved,
		ledger: {
			...saved.ledger,
			content: { ...content },
			manuallyEdited: [...new Set([...saved.ledger.manuallyEdited, ...changed])],
			owned: [...new Set([...saved.ledger.owned, ...changed])]
		}
	};
}
