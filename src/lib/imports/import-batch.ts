import type { ImportPayload, ImportPreviewRow } from '../domain/csv-import';
export type ImportOutcome = {
	status: 'pending' | 'creating' | 'created' | 'unconfirmed' | 'not-attempted';
	id?: string;
};
/** A preview is one-shot: even ambiguous failures are never automatically retried. */
export class ImportBatch {
	started = false;
	stopRequested = false;
	readonly outcomes: ImportOutcome[];
	constructor(readonly rows: readonly ImportPreviewRow[]) {
		this.outcomes = rows.map(() => ({ status: 'pending' }));
	}
	stop() {
		this.stopRequested = true;
	}
	async apply(options: {
		online: () => boolean;
		create: (payload: ImportPayload) => Promise<{ id: string }>;
		changed: () => void;
	}): Promise<boolean> {
		if (
			this.started ||
			!options.online() ||
			!this.rows.length ||
			this.rows.some((row) => row.errors.length)
		)
			return false;
		this.started = true;
		for (let i = 0; i < this.rows.length; i++) {
			if (this.stopRequested || !options.online()) {
				for (let j = i; j < this.rows.length; j++) this.outcomes[j] = { status: 'not-attempted' };
				options.changed();
				break;
			}
			this.outcomes[i] = { status: 'creating' };
			options.changed();
			try {
				const created = await options.create(this.rows[i].payload);
				this.outcomes[i] = { status: 'created', id: created.id };
			} catch {
				this.outcomes[i] = { status: 'unconfirmed' };
				this.stopRequested = true;
			}
			options.changed();
		}
		return true;
	}
}
