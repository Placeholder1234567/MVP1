import { CareDraftStore, type DraftDatabase } from './care-drafts';
import {
	lomiRecoveryData,
	lomiRecoveryScope,
	sameLomiBinding,
	type LomiBinding,
	type LomiRecovery
} from './lomi-recovery-data';
const active = new Set<LomiRecoveryStore>();
export class LomiRecoveryStore {
	private readonly store: CareDraftStore;
	private invalidated = false;
	readonly database: DraftDatabase | undefined;
	constructor(
		db: () => DraftDatabase | undefined,
		readonly binding: LomiBinding,
		status: (error: boolean) => void
	) {
		this.database = db();
		this.store = new CareDraftStore(
			() => this.database,
			binding.profileId,
			binding.clientId,
			'lomi',
			status,
			lomiRecoveryScope(binding)
		);
		active.add(this);
	}
	async load(): Promise<LomiRecovery | null> {
		const row = await this.store.load();
		if (!row) return null;
		const parsed = lomiRecoveryData(row);
		if (!parsed || !sameLomiBinding(parsed.binding, this.binding))
			throw new Error('Saved review unavailable');
		return parsed;
	}
	queue(value: LomiRecovery) {
		if (this.invalidated || !sameLomiBinding(value.binding, this.binding)) return;
		this.store.queue(value);
	}
	clear() {
		return this.store.clear();
	}
	flush() {
		return this.store.flush();
	}
	dispose() {
		void this.store.flush().finally(() => {
			this.store.dispose();
			active.delete(this);
		});
	}
	async discard() {
		this.invalidated = true;
		await this.store.clear();
	}
}
export async function clearLomiRecovery(db: DraftDatabase | undefined, binding: LomiBinding) {
	if (!db) return;
	const matching = [...active].filter(
		(store) => store.database === db && sameLomiBinding(store.binding, binding)
	);
	if (matching.length) {
		await Promise.all(matching.map((store) => store.discard()));
		return;
	}
	const store = new LomiRecoveryStore(
		() => db,
		binding,
		() => {}
	);
	try {
		await store.discard();
	} finally {
		store.dispose();
	}
}
