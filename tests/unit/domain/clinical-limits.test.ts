import { beforeEach, expect, it, vi } from 'vitest';
import type { CurrentUser } from '../../../src/lib/server/services/auth';
import type { Tx } from '../../../src/lib/server/db';
const { rows, audit, scope, history } = vi.hoisted(() => ({
	rows: vi.fn(),
	audit: vi.fn(),
	scope: vi.fn(),
	history: vi.fn()
}));
vi.mock('../../../src/lib/server/services/report/clinical.queries', () => ({
	clinicalRows: rows,
	clinicalScope: scope,
	clinicalNoteHistory: history
}));
vi.mock('../../../src/lib/server/services/report/report.queries', () => ({ recordExport: audit }));
vi.mock('../../../src/lib/server/db', () => ({
	asService: (_tx: unknown, fn: (t: unknown) => unknown) => fn(_tx)
}));
import { exportClinical } from '../../../src/lib/server/services/report/clinical';
const tx = {} as Tx;
const user = {
	role: 'supervisor',
	agencyId: 'agency',
	profileId: 'profile',
	timeZone: 'America/New_York',
	features: ['reports', 'charting', 'health']
} as CurrentUser;
const input = {
	type: 'health' as const,
	homeId: '11111111-1111-4111-8111-111111111111',
	fromDay: '2026-03-08',
	toDay: '2026-03-08',
	format: 'json' as const
};
beforeEach(() => {
	vi.clearAllMocks();
	scope.mockResolvedValue(true);
	rows.mockResolvedValue([]);
	history.mockResolvedValue([]);
});

it('rejects row and UTF-8 byte caps without auditing or returning a partial export', async () => {
	rows.mockResolvedValue(Array(1001).fill({}));
	await expect(exportClinical(tx, user, input, {})).rejects.toMatchObject({
		code: 'VALIDATION_FAILED'
	});
	rows.mockResolvedValue([{ text: 'ሰ'.repeat(3 * 1024 * 1024) }]);
	await expect(exportClinical(tx, user, input, {})).rejects.toMatchObject({
		code: 'VALIDATION_FAILED'
	});
	expect(audit).not.toHaveBeenCalled();
});

it('requires role, report feature and source feature before querying', async () => {
	for (const changed of [
		{ ...user, role: 'caregiver' as const },
		{ ...user, features: ['reports'] as const },
		{ ...user, features: ['health'] as const }
	])
		await expect(exportClinical(tx, changed as CurrentUser, input, {})).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	expect(scope).not.toHaveBeenCalled();
});

it('applies the source-row cap to goal history before calculating grouped progress', async () => {
	rows.mockResolvedValue(Array(1001).fill({ goalId: 'same-goal', trials: ['Independent'] }));
	await expect(
		exportClinical(
			tx,
			{ ...user, features: [...user.features, 'goals'] },
			{ ...input, type: 'goals' },
			{}
		)
	).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
	expect(audit).not.toHaveBeenCalled();
	expect(history).not.toHaveBeenCalled();
});

it('enforces the escaped HTML size and signature-event caps', async () => {
	rows.mockResolvedValue([{ text: '<'.repeat(2 * 1024 * 1024) }]);
	await expect(exportClinical(tx, user, { ...input, format: 'html' }, {})).rejects.toMatchObject({
		code: 'VALIDATION_FAILED'
	});
	rows.mockResolvedValue([{ id: 'note' }]);
	history.mockResolvedValue(Array(5001).fill({ noteId: 'note' }));
	await expect(exportClinical(tx, user, { ...input, type: 'notes' }, {})).rejects.toMatchObject({
		code: 'VALIDATION_FAILED'
	});
	expect(audit).not.toHaveBeenCalled();
});

it('queries the DST-adjusted half-open interval and fails closed when auditing fails', async () => {
	audit.mockRejectedValueOnce(new Error('audit unavailable'));
	await expect(exportClinical(tx, user, input, {})).rejects.toThrow('audit unavailable');
	expect(rows).toHaveBeenCalledWith(
		tx,
		'agency',
		expect.objectContaining({
			from: new Date('2026-03-08T05:00:00Z'),
			to: new Date('2026-03-09T04:00:00Z'),
			toDayExclusive: '2026-03-09'
		})
	);
});
