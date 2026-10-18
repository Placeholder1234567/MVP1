import { ATTENDANCE_SERVICES, HEALTH_FIELDS, HEALTH_KINDS } from '#lib/domain/index.ts';

export type DraftSection = 'health' | 'incident' | 'attendance';
export type DraftData = Record<string, unknown>;
export interface DraftDatabase {
	execute(sql: string, parameters?: unknown[]): Promise<unknown>;
	getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null | undefined>;
}
const flushers = new Set<(database?: DraftDatabase) => Promise<void>>();
/** Called before the encrypted OPFS file closes. Failures never prevent privacy locking. */
export async function flushCareDrafts(database?: DraftDatabase) {
	await Promise.allSettled([...flushers].map((flush) => flush(database)));
}
export const canResumeCareDraft = (section: DraftSection, data: DraftData, today: string) =>
	section === 'health' || data.day === today;
const object = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);
/** Whitelist form data, never signature/review confirmation or UI state. */
export function draftData(section: DraftSection, value: unknown): DraftData | null {
	if (!object(value) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day))
		return null;
	if (section === 'attendance') {
		if (
			!Array.isArray(value.services) ||
			value.services.some((s) => !(ATTENDANCE_SERVICES as readonly unknown[]).includes(s))
		)
			return null;
		return { day: value.day, services: [...new Set(value.services)] };
	}
	if (section === 'health') {
		if (
			typeof value.kind !== 'string' ||
			!HEALTH_KINDS.some((k) => k.key === value.kind) ||
			!object(value.fields)
		)
			return null;
		const allowed = new Set(
			Object.values(HEALTH_FIELDS)
				.flat()
				.map((f) => f.key)
		);
		const fields: Record<string, string | number | null> = {};
		for (const [key, field] of Object.entries(value.fields)) {
			if (!allowed.has(key) || field === undefined) continue;
			if (!(
				field === null ||
				(typeof field === 'string' && field.length <= 1000) ||
				(typeof field === 'number' && Number.isFinite(field))
			))
				return null;
			fields[key] = field;
		}
		return { day: value.day, kind: value.kind, fields };
	}
	if (!object(value.form)) return null;
	const form: DraftData = {};
	for (const key of [
		'type',
		'time',
		'location',
		'description',
		'antecedent',
		'injured',
		'injuryDetail',
		'staffAction',
		'medical',
		'witnesses',
		'severity'
	]) {
		const field = value.form[key];
		if (typeof field !== 'string' || field.length > 8000) return null;
		form[key] = field;
	}
	if (
		!Array.isArray(value.form.told) ||
		value.form.told.length > 20 ||
		value.form.told.some((v) => typeof v !== 'string' || v.length > 200)
	)
		return null;
	form.told = [...value.form.told];
	return { day: value.day, form, step: [1, 2, 3].includes(Number(value.step)) ? value.step : 1 };
}

export class CareDraftStore {
	private latest: string | null | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private tail = Promise.resolve();
	private revision = 0;
	private readonly flushRegistered = (database?: DraftDatabase) => this.flush(database);
	readonly id: string;
	readonly database: DraftDatabase | undefined;
	constructor(
		db: () => DraftDatabase | undefined,
		readonly profileId: string,
		readonly clientId: string,
		readonly section: DraftSection,
		private status: (error: boolean) => void
	) {
		this.database = db();
		this.id = `${profileId}:${clientId}:${section}`;
		flushers.add(this.flushRegistered);
	}
	async load(): Promise<DraftData | null> {
		const row = await this.database?.getOptional<{ data: string }>(
			'SELECT data FROM care_drafts WHERE id = ? AND profile_id = ? AND client_id = ? AND section = ?',
			[this.id, this.profileId, this.clientId, this.section]
		);
		if (!this.database) throw new Error('Draft storage unavailable');
		if (!row) return null;
		if (row.data.length > 128000) throw new Error('Draft unavailable');
		const payload = JSON.parse(row.data);
		if (payload.version !== 1) throw new Error('Draft version unavailable');
		const data = draftData(this.section, payload.data);
		if (!data) throw new Error('Draft unavailable');
		return data;
	}
	queue(value: DraftData) {
		const data = draftData(this.section, value);
		if (!data) {
			this.status(true);
			return;
		}
		const json = JSON.stringify({ version: 1, data });
		if (json.length > 128000) {
			this.status(true);
			return;
		}
		this.latest = json;
		this.revision++;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.flush(), 500);
	}
	async clear() {
		this.latest = null;
		this.revision++;
		return this.flush();
	}
	flush(database?: DraftDatabase): Promise<void> {
		if (database && database !== this.database) return Promise.resolve();
		clearTimeout(this.timer);
		this.tail = this.tail.then(async () => {
			const value = this.latest;
			const revision = this.revision;
			if (value === undefined) return;
			try {
				const db = this.database;
				if (!db) throw new Error('Draft storage unavailable');
				if (value === null)
					await db.execute('DELETE FROM care_drafts WHERE id = ? AND profile_id = ?', [
						this.id,
						this.profileId
					]);
				else
					await db.execute(
						'INSERT OR REPLACE INTO care_drafts (id, profile_id, client_id, section, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
						[this.id, this.profileId, this.clientId, this.section, value, new Date().toISOString()]
					);
				if (revision === this.revision) {
					this.latest = undefined;
					this.status(false);
				}
			} catch {
				this.status(true);
			}
		});
		return this.tail;
	}
	dispose() {
		clearTimeout(this.timer);
		void this.flush().finally(() => flushers.delete(this.flushRegistered));
	}
}
