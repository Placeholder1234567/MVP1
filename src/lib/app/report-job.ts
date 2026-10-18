/** In-memory completion guard. A response belongs to exactly one unlocked viewing context. */
export class ReportJobGuard {
	private generation = 0;
	private context = '';
	change(context: string): boolean {
		if (context === this.context) return false;
		this.context = context;
		this.generation++;
		return true;
	}
	capture(): () => boolean {
		const generation = this.generation;
		return () => generation === this.generation;
	}
}

export function reportCanConnect(online: boolean, visible: boolean, locked: boolean): boolean {
	return online && visible && !locked;
}

export function reportStillRunning(status: string | undefined): boolean {
	return status === 'queued' || status === 'processing';
}
