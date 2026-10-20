import { z } from 'zod';
import { clinicalPeriod } from '../../../domain/clinical-export';
import {
	coverageCsv,
	COVERAGE_EVIDENCE_LIMITS,
	type CoverageReport,
	type CoverageRow
} from '../../../domain/coverage-export';
import { resolveFeatures } from '../../../entitlements/tier-features';
import { asService, type Tx, type RequestInfo } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth';
import { payrollLabels, recordExport } from './report.queries';
import * as q from './coverage.queries';

export const CoverageExport = z
	.object({
		homeId: z.uuid(),
		expectedProfileId: z.uuid(),
		fromDay: z.iso.date(),
		toDay: z.iso.date(),
		format: z.enum(['csv', 'json'])
	})
	.strict();

export async function exportCoverage(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof CoverageExport>,
	request: RequestInfo
) {
	const p = CoverageExport.parse(input);
	const viewer = await q.coverageViewer(tx, user.agencyId, user.profileId);
	if (
		!viewer ||
		p.expectedProfileId !== user.profileId ||
		viewer.authUid !== user.authUid ||
		viewer.role !== user.role ||
		viewer.role === 'caregiver' ||
		(viewer.role !== 'admin' && !(viewer.homeIds ?? []).includes(p.homeId))
	)
		throw new ServiceError(
			'FORBIDDEN',
			'This report is unavailable for your current account or home access'
		);
	const features = resolveFeatures(viewer.tier, viewer.enabledFeatures);
	if (!features.has('reports') || !features.has('coverage'))
		throw new ServiceError('FORBIDDEN', 'This report is not included in your agency plan');
	try {
		clinicalPeriod(p.fromDay, p.toDay, viewer.timeZone);
	} catch {
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Choose one to 93 valid calendar days in the agency time zone'
		);
	}
	const home = await q.coverageHome(tx, user.agencyId, p.homeId);
	if (!home) throw new ServiceError('NOT_FOUND', 'Report scope is unavailable');
	const requests = await q.coverageRequestsForReport(
		tx,
		user.agencyId,
		p.homeId,
		p.fromDay,
		p.toDay
	);
	const ids = requests.map((r) => r.id);
	const tooMany = () =>
		new ServiceError(
			'VALIDATION_FAILED',
			'Coverage report exceeds 1,000 source records. Choose a shorter period.'
		);
	if (requests.length > 1000) throw tooMany();
	const candidates = await q.coverageCandidatesForReport(tx, user.agencyId, ids);
	const activity = await q.coverageActivityForReport(tx, user.agencyId, p.homeId, ids);
	const notifications = await q.coverageNotificationsForReport(tx, user.agencyId, ids);
	if (requests.length + candidates.length + activity.length + notifications.length > 1000)
		throw tooMany();
	const staffIds = [
		...new Set(
			[
				...requests.flatMap((r) => [r.calledOutBy, r.filledBy]),
				...candidates.map((r) => r.staffId),
				...notifications.map((r) => r.staffId)
			].filter((id): id is string => !!id)
		)
	];
	const labels = await payrollLabels(tx, user.agencyId, staffIds, []);
	const byRequest = new Map(requests.map((r) => [r.id, r]));
	const row = (
		kind: string,
		requestId: string,
		values: Record<string, string | boolean | Date | null>
	): CoverageRow => {
		const r = byRequest.get(requestId)!;
		const result: CoverageRow = {
			kind,
			requestId,
			homeId: p.homeId,
			homeName: home.name,
			day: r.day,
			shift: r.shift
		};
		for (const [key, value] of Object.entries(values))
			result[key] = value instanceof Date ? value.toISOString() : value;
		if (typeof result.staffId === 'string')
			result.staffName = labels.staff.get(result.staffId) ?? null;
		return result;
	};
	const rows = [
		...requests.map((r) =>
			row('request', r.id, {
				...r,
				calledOutName: r.calledOutBy ? (labels.staff.get(r.calledOutBy) ?? null) : null,
				filledName: r.filledBy ? (labels.staff.get(r.filledBy) ?? null) : null
			})
		),
		...candidates.map((r) => row('candidate', r.requestId, r)),
		...activity.map((r) => row('activity', r.requestId, r)),
		...notifications.map((r) => row('notification', r.requestId!, r))
	];
	const report: CoverageReport = {
		version: 1,
		type: 'coverage',
		homeId: p.homeId,
		fromDay: p.fromDay,
		toDay: p.toDay,
		timeZone: viewer.timeZone,
		generatedAt: new Date().toISOString(),
		notificationVisibility: viewer.role === 'admin' ? 'agency' : 'own_recipient_only',
		dateBasis:
			'Coverage request shift start calendar day in the agency time zone; includes both selected days, including overnight shift starts',
		evidenceLimits: COVERAGE_EVIDENCE_LIMITS,
		rows
	};
	const content = p.format === 'csv' ? coverageCsv(report) : JSON.stringify(report, null, 2);
	if (Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Coverage report exceeds 8 MB. Choose a shorter period.'
		);
	// The profile lock stabilizes role/home access; re-read the joined plan
	// before publication without taking an admin-only agency row lock.
	const current = await q.coverageViewer(tx, user.agencyId, user.profileId);
	const currentFeatures = current
		? resolveFeatures(current.tier, current.enabledFeatures)
		: new Set();
	if (
		!current ||
		current.timeZone !== viewer.timeZone ||
		!currentFeatures.has('reports') ||
		!currentFeatures.has('coverage')
	)
		throw new ServiceError('FORBIDDEN', 'This report is unavailable for your current agency plan');
	// Only the append-only export audit insert is elevated, never source reads.
	await asService(tx, (t) =>
		recordExport(t, user.agencyId, user.profileId, p.format, rows.length, request, 'coverage', {
			homeId: p.homeId,
			fromDay: p.fromDay,
			toDay: p.toDay,
			staffIds,
			requestIds: ids,
			notificationVisibility: report.notificationVisibility
		})
	);
	return {
		content,
		filename: `guad-coverage.${p.format}`,
		rows: rows.length,
		contentType: p.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
	};
}
