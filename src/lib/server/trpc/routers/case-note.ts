import {
	addCaseNote,
	CaseNoteFilter,
	listCaseNotes,
	NewCaseNote
} from '../../services/client/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';

// trpc-router.md `caseNote.*`: supervisors and admins, charting feature.
const supervisor = featureRoleProcedure('charting', 'supervisor');

export const caseNoteRouter = router({
	create: supervisor
		.input(NewCaseNote)
		.mutation(({ ctx, input }) =>
			addCaseNote(
				ctx.db,
				ctx.user.agencyId,
				{ profileId: ctx.user.profileId, name: ctx.user.name },
				input
			)
		),

	list: supervisor
		.input(CaseNoteFilter.partial({ limit: true, offset: true }))
		.query(({ ctx, input }) => listCaseNotes(ctx.db, ctx.user.agencyId, input))
});
