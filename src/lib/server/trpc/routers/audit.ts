import { z } from 'zod';
import { AuditFilterInput, getAudit, listAudit } from '../../services/audit/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';

// trpc-router.md `audit.*`: admins, Complete plan (audit_log feature).
const admin = featureRoleProcedure('audit_log', 'admin');

export const auditRouter = router({
	list: admin
		.input(AuditFilterInput.partial().optional())
		.query(({ ctx, input }) => listAudit(ctx.db, ctx.user.agencyId, input ?? {})),

	get: admin
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) =>
			getAudit(ctx.db, ctx.user.agencyId, ctx.user.profileId, input.id, ctx.request)
		)
});
