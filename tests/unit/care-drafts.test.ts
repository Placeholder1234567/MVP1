import { afterEach, expect, it, vi } from 'vitest';
import {
	CareDraftStore,
	canResumeCareDraft,
	draftData,
	flushCareDrafts,
	type DraftDatabase
} from '../../src/lib/app/care-drafts.ts';
import { DeviceSchema } from '../../src/lib/sync/app-schema.ts';
import { syncedTables } from '../../src/lib/sync/schema.ts';
const day = '2026-10-17';
const health = { day, kind: 'vitals', fields: { pulse: 82 } };
function database() {
	const rows = new Map<string, string>();
	const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
		if (sql.startsWith('DELETE')) rows.delete(String(params[0]));
		else rows.set(String(params[0]), String(params[4]));
	});
	const db: DraftDatabase = {
		execute,
		getOptional: async <T>(_sql: string, params: unknown[] = []) =>
			(rows.has(String(params[0])) ? { data: rows.get(String(params[0])) } : null) as T | null
	};
	return { db, rows, execute };
}
afterEach(() => vi.useRealTimers());
it('uses a local-only device table excluded from the generated synced tables', () => {
	expect(DeviceSchema.props.care_drafts.localOnly).toBe(true);
	expect(syncedTables).not.toHaveProperty('care_drafts');
});
it('whitelists observations and never stores signatures or unrecognized health fields', () => {
	expect(
		draftData('health', {
			...health,
			signed: true,
			fields: { pulse: 82, signature: 'yes', temperature: undefined }
		})
	).toEqual(health);
	expect(draftData('health', { ...health, fields: { pulse: Infinity } })).toBeNull();
	expect(draftData('attendance', { day, services: ['invented'] })).toBeNull();
});
it('debounces, persists and recovers only the exact profile/client/section key', async () => {
	vi.useFakeTimers();
	const { db, execute } = database();
	const a = new CareDraftStore(() => db, 'profile-a', 'client-a', 'health', vi.fn());
	a.queue(health);
	a.queue({ ...health, fields: { pulse: 83 } });
	expect(execute).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(500);
	await a.flush();
	expect(execute).toHaveBeenCalledTimes(1);
	expect(await a.load()).toEqual({ ...health, fields: { pulse: 83 } });
	const other = new CareDraftStore(() => db, 'profile-b', 'client-a', 'health', vi.fn());
	expect(await other.load()).toBeNull();
	await a.clear();
	expect(await a.load()).toBeNull();
	a.dispose();
	other.dispose();
});
it('flushes the newest change before close, and a clear cannot be overwritten by a pending debounce', async () => {
	vi.useFakeTimers();
	const { db } = database();
	const store = new CareDraftStore(() => db, 'profile', 'client', 'health', vi.fn());
	store.queue(health);
	await flushCareDrafts();
	expect(await store.load()).toEqual(health);
	store.queue({ ...health, fields: { pulse: 84 } });
	await store.clear();
	await vi.advanceTimersByTimeAsync(1000);
	expect(await store.load()).toBeNull();
	store.dispose();
});
it('retains the newest in-memory payload after failure and retries without exposing data in errors', async () => {
	const { db, execute } = database();
	const status = vi.fn();
	const store = new CareDraftStore(() => db, 'profile', 'client', 'health', status);
	execute.mockRejectedValueOnce(new Error('synthetic storage failure'));
	store.queue(health);
	await store.flush();
	expect(status).toHaveBeenLastCalledWith(true);
	await flushCareDrafts();
	expect(status).toHaveBeenLastCalledWith(false);
	expect(await store.load()).toEqual(health);
	store.dispose();
});
it('keeps prior-day incident and attendance facts while blocking relabeling as today', () => {
	const prior = { day: '2026-10-16', services: ['Day program'] };
	expect(canResumeCareDraft('attendance', prior, day)).toBe(false);
	expect(canResumeCareDraft('incident', prior, day)).toBe(false);
	expect(draftData('attendance', prior)).toEqual(prior);
	expect(canResumeCareDraft('health', { ...health, day: '2026-10-16' }, day)).toBe(true);
});

it('incident recovery whitelists facts and drops every confirmation flag', () => {
	const form = {
		type: 'Other',
		time: '12:00',
		location: 'Bedroom',
		description: 'Synthetic observations',
		antecedent: '',
		injured: 'No injury seen',
		injuryDetail: '',
		staffAction: 'Synthetic response',
		medical: 'None needed',
		witnesses: '',
		severity: 'Low',
		told: [],
		signed: true
	};
	const data = draftData('incident', { day, form, step: 3, signed: true, done: true });
	expect(data).toMatchObject({ day, step: 3, form: { description: 'Synthetic observations' } });
	expect(data).not.toHaveProperty('signed');
	expect(data?.form).not.toHaveProperty('signed');
	expect(data).not.toHaveProperty('done');
});

it('does not acknowledge an old write as durable while a newer revision waits', async () => {
	const { db, execute } = database();
	let release!: () => void;
	let started!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const writing = new Promise<void>((resolve) => {
		started = resolve;
	});
	execute.mockImplementationOnce(async () => {
		started();
		await gate;
	});
	const status = vi.fn();
	const store = new CareDraftStore(() => db, 'profile', 'client', 'health', status);
	store.queue(health);
	const old = store.flush();
	await writing;
	store.queue({ ...health, fields: { pulse: 99 } });
	release();
	await old;
	expect(status).not.toHaveBeenCalledWith(false);
	await store.flush();
	expect(status).toHaveBeenLastCalledWith(false);
	expect(await store.load()).toEqual({ ...health, fields: { pulse: 99 } });
	store.dispose();
});
