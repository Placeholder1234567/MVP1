import { getContext, setContext } from 'svelte';
import type { PowerSyncDatabase } from '@powersync/web';
import { syncedTables, type Database } from '#lib/sync/schema.ts';
import { retryStatement, type FailedWrite } from '#lib/sync/failed-writes.ts';
import { chartingLabels } from '#lib/config/charting-preset.ts';
import { isTheme, type Theme } from '#lib/domain/theme.ts';
import { unseenMessages } from '#lib/domain/message-reads.ts';
import { parseControlledRules } from '#lib/domain/controlled.ts';
import { parseIncidentRules } from '#lib/domain/charting.ts';
import { UploadStatus } from '#lib/sync/upload-status.ts';

export interface AppUser {
	profileId: string;
	agencyId: string;
	name: string;
	role: 'caregiver' | 'supervisor' | 'admin';
	homeIds: string[];
	timeZone: string;
	medCertified: boolean;
	/** The agency's plan features (entitlements.md §7): screens outside the plan are hidden. */
	features: readonly string[];
}
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
	try {
		return value ? (JSON.parse(value) as T) : fallback;
	} catch {
		return fallback;
	}
}
const CONTEXT = Symbol('care-session');

export class CareSession {
	privacyLocked = $state(false);
	lock: () => Promise<void> = async () => {};
	signOut: () => Promise<void> = async () => {};
	user: AppUser;
	db: PowerSyncDatabase | undefined;
	homeId = $state('');
	homes = $state<Database['homes'][]>([]);
	/** Homes still in use; archived ones keep their records but take no new work. */
	openHomes = $derived(this.homes.filter((h) => !h.archived_at));
	people = $state<Database['clients'][]>([]);
	notes = $state<Database['notes'][]>([]);
	goals = $state<Database['goals'][]>([]);
	noteGoals = $state<Database['note_goals'][]>([]);
	medications = $state<Database['medications'][]>([]);
	doses = $state<Database['mar_records'][]>([]);
	controlledCounts = $state<Database['controlled_counts'][]>([]);
	health = $state<Database['health_entries'][]>([]);
	incidents = $state<Database['incidents'][]>([]);
	attendance = $state<Database['attendance'][]>([]);
	healthInfo = $state<Database['client_health_info'][]>([]);
	coverage = $state<Database['coverage_requests'][]>([]);
	clocks = $state<Database['clock_records'][]>([]);
	shifts = $state<Database['schedule_slots'][]>([]);
	staff = $state<Database['profiles'][]>([]);
	messages = $state<Database['messages'][]>([]);
	messageReads = $state<Database['message_reads'][]>([]);
	agencies = $state<Database['agencies'][]>([]);
	notifications = $state<Database['notifications'][]>([]);
	notificationPreferences = $state<Database['notification_preferences'][]>([]);
	settings = $state<Database['user_settings'] | null>(null);
	/** A theme just chosen on this device, shown before the saved row syncs back. */
	themeChoice = $state<Theme | null>(null);
	theme = $derived<Theme>(
		this.themeChoice ?? (isTheme(this.settings?.theme) ? this.settings.theme : 'auto')
	);
	unreadAlerts = $derived(
		this.notifications.filter((n) => n.channel === 'in_app' && !n.read_at).length
	);
	/** Board messages for the current home that this person hasn't seen (finding 19). */
	get unseenMessageCount(): number {
		return unseenMessages(this.messages, this.messageReads, this.user.profileId, this.homeId)
			.length;
	}
	failed = $state<FailedWrite[]>([]);
	/** One-time messages from sync, e.g. a dose someone else also recorded. */
	notices = $state<{ id: string; message: string }[]>([]);
	status = $state('Connecting…');
	pending = $state(0);
	checkingSync = $state(true);
	ready = $state(false);
	error = $state('');
	labels = $derived(chartingLabels(this.agencies[0]?.charting_preset));
	/** The agency's controlled medication count rules (domain/controlled.ts). */
	controlledRules = $derived(parseControlledRules(this.agencies[0]?.settings));
	/** The agency's incident reporting rules (frontend-audit.md finding 8). */
	incidentRules = $derived(parseIncidentRules(this.agencies[0]?.settings));
	currentPeople = $derived(this.people.filter((p) => p.active && p.home_id === this.homeId));
	private stop: Array<() => void> = [];
	private uploads: UploadStatus | undefined;
	async refreshUploadStatus(): Promise<void> {
		await this.uploads?.refresh();
	}
	/**
	 * Queues a refused change again. Returns what happened, for the person:
	 * 'queued', 'wait' (the device hasn't caught up with the server yet) or
	 * 'gone' (nothing left to retry; the change can only be discarded).
	 */
	async retryFailed(write: FailedWrite): Promise<'queued' | 'wait' | 'gone'> {
		const db = this.db;
		if (!db) return 'wait';
		return db.writeTransaction(async (tx) => {
			const known = (t: string) =>
				Object.hasOwn(syncedTables, t)
					? syncedTables[t as keyof typeof syncedTables].columns.map((c) => c.name)
					: null;
			const exists = known(write.table_name)
				? (await tx.getOptional(`SELECT 1 FROM "${write.table_name}" WHERE id = ?`, [
						write.record_id
					])) !== null
				: false;
			const next = retryStatement(write, known, exists);
			if (!next) return 'gone';
			if ('wait' in next) return 'wait';
			await tx.execute(next.sql, next.params);
			await tx.execute('DELETE FROM failed_writes WHERE id = ?', [write.id]);
			return 'queued';
		});
	}
	async discardFailed(id: string) {
		await this.db?.execute('DELETE FROM failed_writes WHERE id = ?', [id]);
	}
	async dismissNotice(id: string) {
		await this.db?.execute('UPDATE sync_notices SET seen = 1 WHERE id = ?', [id]);
	}
	/** Whether the agency's plan includes a feature. */
	has(feature: string) {
		return this.user.features.includes(feature);
	}
	constructor(user: AppUser) {
		this.user = user;
	}
	connect(db: PowerSyncDatabase) {
		this.db = db;
		const abort = new AbortController();
		this.stop.push(() => abort.abort());
		const watch = <T>(sql: string, set: (rows: T[]) => void) =>
			db.watch(
				sql,
				[],
				{
					onResult: (r) => set((r.rows?._array ?? []) as T[]),
					onError: () => {
						this.error = 'Could not read saved data. Lock and unlock this device to try again.';
					}
				},
				{ signal: abort.signal }
			);
		watch<Database['homes']>('SELECT * FROM homes ORDER BY name', (r) => {
			this.homes =
				this.user.role === 'caregiver' ? r.filter((h) => this.user.homeIds.includes(h.id)) : r;
			if (!this.homes.some((h) => h.id === this.homeId))
				this.homeId = (this.homes.find((h) => !h.archived_at) ?? this.homes[0])?.id ?? '';
		});
		watch<Database['clients']>('SELECT * FROM clients ORDER BY name', (r) => (this.people = r));
		watch<Database['notes']>(
			'SELECT * FROM notes ORDER BY day DESC, created_at DESC',
			(r) => (this.notes = r)
		);
		watch<Database['goals']>('SELECT * FROM goals', (r) => (this.goals = r));
		watch<Database['note_goals']>('SELECT * FROM note_goals', (r) => (this.noteGoals = r));
		watch<Database['medications']>('SELECT * FROM medications', (r) => (this.medications = r));
		watch<Database['mar_records']>('SELECT * FROM mar_records', (r) => (this.doses = r));
		watch<Database['controlled_counts']>(
			'SELECT * FROM controlled_counts ORDER BY recorded_at',
			(r) => (this.controlledCounts = r)
		);
		watch<Database['health_entries']>(
			'SELECT * FROM health_entries ORDER BY recorded_at DESC',
			(r) => (this.health = r)
		);
		watch<Database['incidents']>(
			'SELECT * FROM incidents ORDER BY occurred_at DESC',
			(r) => (this.incidents = r)
		);
		watch<Database['attendance']>(
			'SELECT * FROM attendance ORDER BY day DESC',
			(r) => (this.attendance = r)
		);
		watch<Database['client_health_info']>(
			'SELECT * FROM client_health_info',
			(r) => (this.healthInfo = r)
		);
		watch<Database['coverage_requests']>(
			'SELECT * FROM coverage_requests ORDER BY day',
			(r) => (this.coverage = r)
		);
		watch<Database['clock_records']>('SELECT * FROM clock_records', (r) => (this.clocks = r));
		watch<Database['schedule_slots']>(
			'SELECT * FROM schedule_slots ORDER BY day, shift',
			(r) => (this.shifts = r)
		);
		watch<Database['messages']>(
			'SELECT * FROM messages ORDER BY sent_at DESC LIMIT 100',
			(r) => (this.messages = r)
		);
		watch<Database['message_reads']>(
			'SELECT * FROM message_reads WHERE message_id IN (SELECT id FROM messages ORDER BY sent_at DESC LIMIT 100)',
			(r) => (this.messageReads = r)
		);
		watch<Database['agencies']>('SELECT * FROM agencies', (r) => (this.agencies = r));
		watch<Database['notifications']>(
			'SELECT * FROM notifications ORDER BY created_at DESC',
			(r) => (this.notifications = r)
		);
		watch<Database['notification_preferences']>(
			'SELECT * FROM notification_preferences',
			(r) => (this.notificationPreferences = r)
		);
		watch<Database['user_settings']>(
			'SELECT * FROM user_settings LIMIT 1',
			(r) => (this.settings = r[0] ?? null)
		);
		watch<Database['profiles']>('SELECT * FROM profiles ORDER BY name', (r) => (this.staff = r));
		watch<FailedWrite>(
			'SELECT id, record_id, table_name, op, message, data, failed_at FROM failed_writes ORDER BY failed_at DESC',
			(r) => (this.failed = r)
		);
		watch<{ id: string; message: string }>(
			'SELECT id, message FROM sync_notices WHERE seen = 0 ORDER BY created_at',
			(r) => (this.notices = r)
		);
		const uploads = new UploadStatus(
			async () => (await db.getUploadQueueStats()).count,
			() => ({ connected: db.currentStatus.connected, synced: !!db.currentStatus.lastSyncedAt }),
			(pending, label) => {
				this.checkingSync = pending === null;
				if (pending !== null) this.pending = pending;
				this.status = label;
			}
		);
		this.uploads = uploads;
		this.stop.push(() => uploads.cancel());
		const status = () => {
			void uploads.refresh();
		};
		this.stop.push(db.registerListener({ statusChanged: status }));
		this.stop.push(db.onChange({ onChange: status }));
		status();
		this.ready = true;
	}
	dispose() {
		this.stop.forEach((fn) => fn());
		this.stop = [];
		this.ready = false;
		this.db = undefined;
		this.uploads = undefined;
	}
}
export const provideSession = (user: AppUser) => setContext(CONTEXT, new CareSession(user));
export const useSession = () => getContext<CareSession>(CONTEXT);
