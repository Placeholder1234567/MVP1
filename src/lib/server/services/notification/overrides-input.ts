import { z } from 'zod';
import { MANDATORY, NOTIFICATION_TYPES } from '../../../domain/notifications';
import { validQuietHours } from '../../../domain/quiet-hours';

/** Agency admins cannot disable mandatory safety notifications. */
export const NotificationOverridesInput = z
	.object({
		disabledTypes: z
			.array(z.enum(NOTIFICATION_TYPES))
			.max(NOTIFICATION_TYPES.length)
			.refine((types) => new Set(types).size === types.length, 'Choose each type once.')
			.refine(
				(types) => types.every((t) => !MANDATORY.has(t)),
				'Safety alerts cannot be disabled.'
			),
		requireSummaryEmail: z.boolean(),
		quietHours: z
			.object({ start: z.string(), end: z.string() })
			.strict()
			.refine(
				(w) => validQuietHours(w.start, w.end),
				'Choose a quiet period between 4 and 10 hours.'
			)
			.nullable()
	})
	.strict()
	.refine(
		(r) => !(r.requireSummaryEmail && r.disabledTypes.includes('daily_summary')),
		'Daily summaries cannot be disabled while their email is required.'
	);
