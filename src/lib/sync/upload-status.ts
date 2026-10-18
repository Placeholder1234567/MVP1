/**
 * Latest queue observation wins; never claim completion while a check is pending.
 * A refresh that a newer one overtook resolves when the newest finishes, so a
 * caller that awaits refresh() (e.g. before a care export) always sees a settled state.
 */
export class UploadStatus {
	private revision = 0;
	private active = true;
	private latest: Promise<void> = Promise.resolve();
	constructor(
		private readCount: () => Promise<number>,
		private connection: () => { connected: boolean; synced: boolean },
		private emit: (pending: number | null, label: string) => void
	) {}
	cancel() {
		this.active = false;
		this.revision++;
	}
	refresh(): Promise<void> {
		if (!this.active) return Promise.resolve();
		const check = this.check(++this.revision);
		this.latest = check;
		return check;
	}
	private async check(mine: number): Promise<void> {
		this.emit(
			null,
			this.connection().connected ? 'Checking sync…' : 'Offline · saved on this device'
		);
		try {
			const count = await this.readCount();
			if (mine !== this.revision) return this.active ? this.latest : undefined;
			const state = this.connection();
			this.emit(
				count,
				!state.connected
					? 'Offline · saved on this device'
					: count || !state.synced
						? 'Syncing…'
						: 'All changes synced'
			);
		} catch {
			if (mine !== this.revision) return this.active ? this.latest : undefined;
			if (mine === this.revision)
				this.emit(
					null,
					this.connection().connected
						? 'Could not check sync status'
						: 'Offline · saved on this device'
				);
		}
	}
}
