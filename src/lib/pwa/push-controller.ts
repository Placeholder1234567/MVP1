import type { PushRegistration } from './push-storage';
export type PushStatus =
	'not-configured' | 'unsupported' | 'denied' | 'off' | 'working' | 'registered' | 'failed';
export interface PushDependencies {
	configured: boolean;
	available: () => boolean;
	permission: () => string;
	requestPermission: () => Promise<string>;
	supported: () => Promise<boolean>;
	getToken: () => Promise<string>;
	deleteToken: () => Promise<void>;
	unsubscribe: () => Promise<void>;
	read: () => Promise<PushRegistration | null>;
	write: (value: PushRegistration | null) => Promise<void>;
	mark: (enabled: boolean) => Promise<void>;
	register: (token: string, previousId?: string) => Promise<{ id: string }>;
	remove: (id: string) => Promise<unknown>;
}
export class PushController {
	private revision = 0;
	private working = false;
	constructor(
		private profileId: string,
		private deps: PushDependencies
	) {}
	cancel(): void {
		this.revision++;
	}
	async enable(): Promise<PushStatus> {
		if (this.working) return 'working';
		const d = this.deps;
		if (!d.configured) return 'not-configured';
		if (!d.available()) return 'unsupported';
		if (d.permission() === 'denied') return 'denied';
		this.working = true;
		const mine = ++this.revision;
		let created: string | undefined;
		let tokenRequested = false;
		try {
			// Invoke directly from the button gesture, before awaiting SDK imports or requests.
			const permission = await d.requestPermission();
			if (mine !== this.revision) return 'off';
			if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
			if (!(await d.supported())) return 'unsupported';
			if (mine !== this.revision) return 'off';
			const previous = await d.read();
			await d.mark(false);
			if (previous && previous.profileId !== this.profileId) await d.deleteToken();
			if (mine !== this.revision) return 'off';
			tokenRequested = true;
			const token = await d.getToken();
			if (mine !== this.revision) {
				await d.deleteToken();
				return 'off';
			}
			if (!token) throw new Error('No registration');
			const result = await d.register(
				token,
				previous?.profileId === this.profileId ? previous.id : undefined
			);
			created = result.id;
			if (mine !== this.revision) throw new Error('Registration cancelled');
			await d.write({ profileId: this.profileId, id: result.id });
			if (mine !== this.revision) throw new Error('Registration cancelled');
			await d.mark(true);
			if (mine !== this.revision) throw new Error('Registration cancelled');
			return 'registered';
		} catch {
			await d.mark(false).catch(() => {});
			if (created) await d.remove(created).catch(() => {});
			await d.unsubscribe().catch(() => {});
			if (tokenRequested) await d.deleteToken().catch(() => {});
			return mine === this.revision ? 'failed' : 'off';
		} finally {
			this.working = false;
		}
	}
	async disable(): Promise<boolean> {
		this.revision++;
		const d = this.deps;
		let stopped = false;
		try { await d.mark(false); stopped = true; } catch { /* Try endpoint revocation too. */ }
		const previous = await d.read().catch(() => null);
		if (previous?.profileId === this.profileId) {
			try {
				await d.remove(previous.id);
				stopped = true;
				await d.write(null);
			} catch {
				/* Retain opaque ID for a later cleanup attempt. */
			}
		}
		try { await d.unsubscribe(); stopped = true; } catch { /* Keep worker/server result. */ }
		if (d.configured && previous) {
			try { await d.deleteToken(); stopped = true; } catch { /* Cleanup can be retried. */ }
		}
		return stopped;
	}
}
