/** Latest queue observation wins; never claim completion while a check is pending. */
export class UploadStatus {
	private revision = 0;
	private active = true;
	constructor(
		private readCount: () => Promise<number>,
		private connection: () => { connected: boolean; synced: boolean },
		private emit: (pending: number | null, label: string) => void
	) {}
	cancel() {
		this.active = false;
		this.revision++;
	}
	async refresh(): Promise<void> {
		if (!this.active) return;
		const mine = ++this.revision;
		this.emit(
			null,
			this.connection().connected ? 'Checking sync…' : 'Offline · saved on this device'
		);
		try {
			const count = await this.readCount();
			if (mine !== this.revision) return;
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
