import { getContext, setContext } from 'svelte';
import type { PowerSyncDatabase } from '@powersync/web';
import type { Database } from '#lib/sync/schema.ts';
import { chartingLabels } from '#lib/config/charting-preset.ts';

export interface AppUser {
	profileId: string;
	agencyId: string;
	name: string;
	role: 'caregiver' | 'supervisor' | 'admin';
	homeIds: string[];
	timeZone: string;
	medCertified: boolean;
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
	lock: () => Promise<void> = async () => {};
	signOut: () => Promise<void> = async () => {};
	user: AppUser;
	db: PowerSyncDatabase | undefined;
	homeId = $state('');
	homes = $state<Database['homes'][]>([]);
	people = $state<Database['clients'][]>([]);
	notes = $state<Database['notes'][]>([]);
	goals = $state<Database['goals'][]>([]);
	noteGoals = $state<Database['note_goals'][]>([]);
	medications = $state<Database['medications'][]>([]);
	doses = $state<Database['mar_records'][]>([]);
	clocks = $state<Database['clock_records'][]>([]);
	shifts = $state<Database['schedule_slots'][]>([]);
	messages = $state<Database['messages'][]>([]);
	agencies = $state<Database['agencies'][]>([]);
	failed = $state<{ id: string; message: string }[]>([]);
	status = $state('Connecting…');
	pending = $state(0);
	ready = $state(false);
	error = $state('');
	labels = $derived(chartingLabels(this.agencies[0]?.charting_preset));
	currentPeople = $derived(this.people.filter((p) => p.active && p.home_id === this.homeId));
	private stop: Array<() => void> = [];
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
			if (!this.homes.some((h) => h.id === this.homeId)) this.homeId = this.homes[0]?.id ?? '';
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
		watch<Database['clock_records']>('SELECT * FROM clock_records', (r) => (this.clocks = r));
		watch<Database['schedule_slots']>(
			'SELECT * FROM schedule_slots ORDER BY day, shift',
			(r) => (this.shifts = r)
		);
		watch<Database['messages']>(
			'SELECT * FROM messages ORDER BY sent_at DESC LIMIT 100',
			(r) => (this.messages = r)
		);
		watch<Database['agencies']>('SELECT * FROM agencies', (r) => (this.agencies = r));
		watch<{ id: string; message: string }>(
			'SELECT id, message FROM failed_writes ORDER BY failed_at DESC',
			(r) => (this.failed = r)
		);
		const status = () => {
			const s = db.currentStatus;
			this.status = s.connected
				? s.lastSyncedAt
					? 'All changes synced'
					: 'Syncing…'
				: 'Offline · saved on this device';
			void db
				.getUploadQueueStats()
				.then((q) => (this.pending = q.count))
				.catch(() => {});
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
	}
}
export const provideSession = (user: AppUser) => setContext(CONTEXT, new CareSession(user));
export const useSession = () => getContext<CareSession>(CONTEXT);
