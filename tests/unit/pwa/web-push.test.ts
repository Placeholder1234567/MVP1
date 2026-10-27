// Sign-out cleanup in web-push.ts (one browser, possibly several tabs): an
// older profile's teardown must not cancel, replace or announce over a newer
// profile's push setup. Synthetic only; no provider, SDK or real browser.
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('$app/env/public', () => ({
	PUBLIC_FIREBASE_API_KEY: '',
	PUBLIC_FIREBASE_PROJECT_ID: '',
	PUBLIC_FIREBASE_APP_ID: '',
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '',
	PUBLIC_FIREBASE_VAPID_KEY: '',
	PUBLIC_AUTH_EMULATOR_URL: ''
}));
vi.mock('../../../src/lib/auth/firebase', () => ({ firebaseAuth: () => ({ app: {} }) }));
vi.mock('../../../src/lib/trpc', () => ({ trpc: {} }));
vi.mock('../../../src/lib/pwa/push-storage', () => ({
	readPushOwner: vi.fn(async () => ({ profileId: 'newer', id: 'registration-newer' })),
	writePushRegistration: vi.fn(async () => {}),
	markPushEnabled: vi.fn(async () => {})
}));

class Channel {
	static all: Channel[] = [];
	sent: unknown[] = [];
	onmessage: ((event: { data: unknown }) => void) | null = null;
	constructor() {
		Channel.all.push(this);
	}
	postMessage(data: unknown) {
		this.sent.push(data);
	}
}
vi.stubGlobal('BroadcastChannel', Channel);
const events: Array<{ type: string; detail: unknown }> = [];
vi.stubGlobal('dispatchEvent', (event: CustomEvent) => {
	events.push({ type: event.type, detail: event.detail });
	return true;
});

const web = await import('../../../src/lib/pwa/web-push');
const storage = await import('../../../src/lib/pwa/push-storage');

afterEach(() => {
	events.length = 0;
	for (const c of Channel.all) c.sent.length = 0;
});

it('an older profile’s sign-out keeps the newer profile’s controller and stays out of its setup', async () => {
	const newer = web.webPushController('newer', true);
	const cancel = vi.spyOn(newer, 'cancel');
	expect(await web.stopWebPush('older')).toBe(true);
	// Same controller object still in charge, never cancelled.
	expect(web.webPushController('newer', true)).toBe(newer);
	expect(cancel).not.toHaveBeenCalled();
	// The registration on this browser is the newer profile's, so nothing browser-wide changed.
	expect(storage.markPushEnabled).not.toHaveBeenCalled();
	expect(storage.writePushRegistration).not.toHaveBeenCalled();
	// Other tabs and this page hear which profile was turned off.
	expect(Channel.all[0].sent).toEqual([{ off: 'older' }]);
	expect(events).toEqual([{ type: web.PUSH_DISABLED, detail: 'older' }]);
});

it('another tab turning off an older profile cancels nothing here for the newer one', async () => {
	const newer = web.webPushController('newer', true);
	const cancel = vi.spyOn(newer, 'cancel');
	Channel.all[0].onmessage?.({ data: { off: 'older' } });
	expect(cancel).not.toHaveBeenCalled();
	expect(storage.markPushEnabled).not.toHaveBeenCalled();
	Channel.all[0].onmessage?.({ data: { off: 'newer' } });
	expect(cancel).toHaveBeenCalledOnce();
	expect(events.map((e) => e.detail)).toEqual(['older', 'newer']);
});

it('the newer profile’s own sign-out releases its controller', async () => {
	const newer = web.webPushController('newer', true);
	vi.mocked(storage.readPushOwner).mockResolvedValue(null);
	await web.stopWebPush('newer');
	expect(web.webPushController('newer', true)).not.toBe(newer);
});

it('sign-out reports uncertainty after 4 s behind a held setup, keeps its place and then finishes', async () => {
	vi.useFakeTimers();
	try {
		vi.mocked(storage.readPushOwner).mockResolvedValue({
			profileId: 'newer',
			id: 'registration-newer'
		});
		vi.mocked(storage.markPushEnabled).mockClear();
		// Another push step (say a setup waiting on the provider) holds the lock.
		let release!: () => void;
		const holding = web.exclusive(() => new Promise<void>((r) => (release = r)));
		const stopping = web.stopWebPush('newer');
		await vi.advanceTimersByTimeAsync(4000);
		expect(await stopping).toBe(false);
		// Still queued, not skipped: nothing has changed yet.
		expect(storage.markPushEnabled).not.toHaveBeenCalled();
		release();
		await holding;
		await vi.waitFor(() => expect(storage.markPushEnabled).toHaveBeenCalledWith(false));
	} finally {
		vi.useRealTimers();
	}
});

it('an older sign-out leaves the browser alone when its registration can’t be read', async () => {
	const newer = web.webPushController('newer', true);
	const cancel = vi.spyOn(newer, 'cancel');
	vi.mocked(storage.readPushOwner).mockRejectedValue(new Error('Storage blocked'));
	vi.mocked(storage.markPushEnabled).mockClear();
	expect(await web.stopWebPush('older')).toBe(false);
	expect(storage.markPushEnabled).not.toHaveBeenCalled();
	expect(cancel).not.toHaveBeenCalled();
	// The profile using this tab can still turn its own push off.
	expect(await web.stopWebPush('newer')).toBe(true);
	expect(storage.markPushEnabled).toHaveBeenCalledWith(false);
});
