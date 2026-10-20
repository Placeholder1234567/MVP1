import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { draftLocally } from '../../src/lib/domain/lomi';
import {
	lomiRecoveryData,
	retainParentEdits,
	type LomiRecovery
} from '../../src/lib/app/lomi-recovery-data';
import { LomiRecoveryStore, clearLomiRecovery } from '../../src/lib/app/lomi-recovery';
import { flushCareDrafts, type DraftDatabase } from '../../src/lib/app/care-drafts';
function record(): LomiRecovery {
	const original = draftLocally('Went for a walk. Ate dinner. Seemed relaxed.', 'shift');
	return {
		day: '2026-10-20',
		binding: {
			agencyId: randomUUID(),
			profileId: randomUUID(),
			homeId: randomUUID(),
			clientId: randomUUID(),
			day: '2026-10-20',
			shift: 'pm',
			type: 'shift'
		},
		noteId: null,
		said: 'Went for a walk. Ate dinner. Seemed relaxed.',
		original,
		phase: 'review',
		ledger: {
			content: { ...original.content },
			currentResult: original,
			manuallyEdited: ['activities'],
			owned: ['mood'],
			skipped: ['health'],
			kept: [],
			additions: { meals: 'Ate a second serving.' },
			followup: 'Caregiver clarification',
			undo: { activities: 'Previous wording' },
			usedAi: false,
			pending: { updates: [{ section: 'meals', text: 'A proposed update' }], fallback: true },
			pendingSource: 'followup'
		}
	};
}
function database() {
	const rows = new Map<string, string>();
	const execute = vi.fn(async (sql: string, parameters: unknown[] = []) => {
		if (sql.startsWith('DELETE')) rows.delete(String(parameters[0]));
		else rows.set(String(parameters[0]), String(parameters[4]));
	});
	const db: DraftDatabase = {
		execute,
		getOptional: async <T>(_sql: string, p: unknown[] = []) =>
			(rows.has(String(p[0])) ? { data: rows.get(String(p[0])) } : null) as T | null
	};
	return { db, rows, execute };
}
afterEach(() => vi.useRealTimers());
it('validates only bounded review data, never signatures or unsupported sections', () => {
	const saved = record();
	expect(lomiRecoveryData(saved)).toEqual(saved);
	expect(lomiRecoveryData({ ...saved, signature: true })).toBeNull();
	expect(lomiRecoveryData({ ...saved, day: '2026-10-21' })).toBeNull();
	expect(lomiRecoveryData({ ...saved, said: 'x'.repeat(8001) })).toBeNull();
	expect(
		lomiRecoveryData({ ...saved, ledger: { ...saved.ledger, content: { signature: 'yes' } } })
	).toBeNull();
	expect(
		lomiRecoveryData({ ...saved, ledger: { ...saved.ledger, owned: ['unexpected'] } })
	).toBeNull();
});
it('round-trips original observations and the edit ledger using the encrypted local-only draft table', async () => {
	vi.useFakeTimers();
	const { db, execute } = database(),
		saved = record();
	const store = new LomiRecoveryStore(() => db, saved.binding, vi.fn());
	store.queue(saved);
	await flushCareDrafts(db);
	expect(await store.load()).toEqual(saved);
	expect(execute.mock.calls[0][0]).toContain('care_drafts');
	for (const binding of [
		{ ...saved.binding, profileId: randomUUID() },
		{ ...saved.binding, clientId: randomUUID() },
		{ ...saved.binding, homeId: randomUUID() },
		{ ...saved.binding, agencyId: randomUUID() },
		{ ...saved.binding, day: '2026-10-21' },
		{ ...saved.binding, shift: 'am' as const },
		{ ...saved.binding, type: 'behavior' as const }
	]) {
		const other = new LomiRecoveryStore(() => db, binding, vi.fn());
		expect(await other.load()).toBeNull();
		other.dispose();
	}
	store.dispose();
});
it('rejects a mismatched stored binding even if a row is copied to this key', async () => {
	vi.useFakeTimers();
	const { db, rows } = database(),
		saved = record();
	const store = new LomiRecoveryStore(() => db, saved.binding, vi.fn());
	store.queue(saved);
	await store.flush();
	const key = [...rows.keys()][0];
	rows.set(
		key,
		JSON.stringify({
			version: 1,
			data: { ...saved, binding: { ...saved.binding, homeId: randomUUID() } }
		})
	);
	await expect(store.load()).rejects.toThrow('Saved review unavailable');
	store.dispose();
});
it('protects actual note edits after Use, including emptied and restored sections', () => {
	const saved = { ...record(), phase: 'used' as const };
	const edited = retainParentEdits(saved, {
		...saved.ledger.content,
		activities: 'Caregiver wording',
		meals: ''
	});
	const reverted = retainParentEdits(edited, saved.ledger.content);
	expect(reverted.said).toBe(saved.said);
	expect(reverted.original).toEqual(saved.original);
	expect(reverted.ledger.manuallyEdited).toEqual(expect.arrayContaining(['activities', 'meals']));
	expect(reverted.ledger.owned).toEqual(expect.arrayContaining(['activities', 'meals', 'mood']));
});
it('signature cleanup invalidates active writers and cannot be undone by an in-flight write', async () => {
	vi.useFakeTimers();
	const { db, rows, execute } = database(),
		saved = record();
	const write = execute.getMockImplementation()!;
	let release!: () => void;
	execute.mockImplementationOnce(async (...args) => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		return write(...args);
	});
	const store = new LomiRecoveryStore(() => db, saved.binding, vi.fn());
	store.queue(saved);
	const flushing = store.flush();
	await vi.waitFor(() => expect(release).toBeDefined());
	const clearing = clearLomiRecovery(db, saved.binding);
	store.queue({ ...saved, said: 'Late response must not return' });
	release();
	await flushing;
	await clearing;
	await vi.advanceTimersByTimeAsync(1000);
	await store.flush();
	expect(rows.size).toBe(0);
	store.dispose();
});
