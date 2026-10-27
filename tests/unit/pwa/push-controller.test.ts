import { expect, it, vi } from 'vitest';
import { PushController, type PushDependencies } from '../../../src/lib/pwa/push-controller';
/** One-at-a-time runner standing in for the browser-wide Web Lock. */
function mutex(): PushDependencies['exclusive'] {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(work: () => Promise<T>) => {
		const run = tail.then(work, work);
		tail = run.catch(() => {});
		return run;
	};
}
function fixture() {
	const deps = {
		configured: true,
		available: vi.fn(() => true),
		permission: vi.fn(() => 'default'),
		requestPermission: vi.fn(async () => 'granted'),
		supported: vi.fn(async () => true),
		getToken: vi.fn(async () => 'synthetic-token'),
		deleteToken: vi.fn(async () => {}),
		unsubscribe: vi.fn(async () => {}),
		read: vi.fn<PushDependencies['read']>(async () => null),
		write: vi.fn<PushDependencies['write']>(async () => {}),
		mark: vi.fn<PushDependencies['mark']>(async () => {}),
		register: vi.fn<PushDependencies['register']>(async () => ({ id: 'registration' })),
		remove: vi.fn<PushDependencies['remove']>(async () => ({ removed: true })),
		exclusive: mutex()
	};
	return { deps, controller: new PushController('profile', deps) };
}
it('does not initialize the SDK or request permission when unconfigured or unsupported', async () => {
	const { deps, controller } = fixture();
	deps.configured = false;
	expect(await controller.enable()).toBe('not-configured');
	deps.configured = true;
	deps.available.mockReturnValue(false);
	expect(await controller.enable()).toBe('unsupported');
	expect(deps.requestPermission).not.toHaveBeenCalled();
	expect(deps.supported).not.toHaveBeenCalled();
	expect(deps.getToken).not.toHaveBeenCalled();
});
it('respects denied or dismissed permission without token acquisition', async () => {
	const { deps, controller } = fixture();
	deps.permission.mockReturnValue('denied');
	expect(await controller.enable()).toBe('denied');
	expect(deps.requestPermission).not.toHaveBeenCalled();
	deps.permission.mockReturnValue('default');
	deps.requestPermission.mockResolvedValue('default');
	expect(await controller.enable()).toBe('off');
	expect(deps.getToken).not.toHaveBeenCalled();
});
it('requests permission immediately from the action and persists only opaque registration IDs', async () => {
	const { deps, controller } = fixture();
	const action = controller.enable();
	expect(deps.requestPermission).toHaveBeenCalledOnce();
	expect(deps.supported).not.toHaveBeenCalled();
	expect(await action).toBe('registered');
	expect(deps.register).toHaveBeenCalledWith('synthetic-token', undefined);
	expect(deps.write).toHaveBeenCalledWith({ profileId: 'profile', id: 'registration' });
	expect(JSON.stringify(deps.write.mock.calls)).not.toContain('synthetic-token');
	expect(deps.mark).toHaveBeenLastCalledWith(true);
});
it('rotates only the previous registration belonging to this profile', async () => {
	const { deps, controller } = fixture();
	deps.read.mockResolvedValue({ profileId: 'profile', id: 'old' });
	expect(await controller.enable()).toBe('registered');
	expect(deps.register).toHaveBeenCalledWith('synthetic-token', 'old');
	deps.read.mockResolvedValue({ profileId: 'other', id: 'foreign' });
	expect(await controller.enable()).toBe('registered');
	expect(deps.deleteToken).toHaveBeenCalledOnce();
	expect(deps.register).toHaveBeenLastCalledWith('synthetic-token', undefined);
});
it('does not run concurrent permission prompts and drops tokens completing after logout', async () => {
	const { deps, controller } = fixture();
	let finish!: (value: string) => void;
	deps.getToken.mockReturnValue(new Promise((resolve) => (finish = resolve)));
	const enabling = controller.enable();
	await vi.waitFor(() => expect(deps.getToken).toHaveBeenCalled());
	expect(await controller.enable()).toBe('working');
	// Sign-out cancels at once; its cleanup runs after the setup step returns.
	const disabling = controller.disable();
	finish('late-token');
	expect(await enabling).toBe('off');
	await disabling;
	expect(deps.register).not.toHaveBeenCalled();
	expect(deps.deleteToken).toHaveBeenCalled();
});
it('revokes worker consent and unsubscribes even when server cleanup fails', async () => {
	const { deps, controller } = fixture();
	deps.read.mockResolvedValue({ profileId: 'profile', id: 'old' });
	deps.remove.mockRejectedValue(new Error('Synthetic failure'));
	await controller.disable();
	expect(deps.mark).toHaveBeenCalledWith(false);
	expect(deps.unsubscribe).toHaveBeenCalled();
	expect(deps.deleteToken).toHaveBeenCalled();
	expect(deps.write).not.toHaveBeenCalled();
});
it('removes a registration that finishes after cancellation in another tab', async () => {
	const { deps, controller } = fixture();
	let finish!: (value: { id: string }) => void;
	deps.register.mockReturnValue(new Promise((resolve) => (finish = resolve)));
	const action = controller.enable();
	await vi.waitFor(() => expect(deps.register).toHaveBeenCalled());
	controller.cancel();
	finish({ id: 'late-registration' });
	expect(await action).toBe('off');
	expect(deps.remove).toHaveBeenCalledWith('late-registration');
	expect(deps.mark).toHaveBeenLastCalledWith(false);
	expect(deps.write).not.toHaveBeenCalled();
});
it('never reports success when server registration or local consent persistence fails', async () => {
	const { deps, controller } = fixture();
	deps.register.mockRejectedValueOnce(new Error('Synthetic failure'));
	expect(await controller.enable()).toBe('failed');
	expect(deps.unsubscribe).toHaveBeenCalledOnce();
	deps.write.mockRejectedValueOnce(new Error('Storage unavailable'));
	expect(await controller.enable()).toBe('failed');
	expect(deps.remove).toHaveBeenCalledWith('registration');
	expect(deps.mark).toHaveBeenLastCalledWith(false);
});
it('reports uncertain opt-out when every revocation mechanism is unavailable', async () => {
	const { deps, controller } = fixture();
	deps.read.mockResolvedValue({ profileId: 'profile', id: 'old' });
	deps.mark.mockRejectedValue(new Error('Storage blocked'));
	deps.remove.mockRejectedValue(new Error('Offline'));
	deps.unsubscribe.mockRejectedValue(new Error('Browser unavailable'));
	deps.deleteToken.mockRejectedValue(new Error('Provider unavailable'));
	expect(await controller.disable()).toBe(false);
});

/**
 * Two profiles' controllers on one browser: shared opt-in, registration file,
 * token and subscription, and one lock, as on a shared phone.
 */
function sharedBrowser() {
	const browser = {
		enabled: false,
		registration: null as { profileId: string; id: string } | null,
		token: null as string | null,
		subscribed: false
	};
	let tokens = 0;
	const exclusive = mutex();
	const holds: Partial<Record<'unsubscribe' | 'getToken', Promise<void>>> = {};
	const deps = (profile: string) => ({
		configured: true,
		available: () => true,
		permission: () => 'granted',
		requestPermission: vi.fn(async () => 'granted'),
		supported: async () => true,
		getToken: vi.fn(async () => {
			await holds.getToken;
			browser.subscribed = true;
			return (browser.token = `token-${profile}-${++tokens}`);
		}),
		deleteToken: vi.fn(async () => {
			browser.token = null;
		}),
		unsubscribe: vi.fn(async () => {
			await holds.unsubscribe;
			browser.subscribed = false;
		}),
		read: async () => browser.registration,
		write: async (value: { profileId: string; id: string } | null) => {
			browser.registration = value;
		},
		mark: async (enabled: boolean) => {
			browser.enabled = enabled;
		},
		register: vi.fn(async () => ({ id: `registration-${profile}` })),
		remove: vi.fn(async () => ({ removed: true })),
		exclusive
	});
	return { browser, holds, deps };
}
function held() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

it('an older profile’s sign-out leaves a newer profile’s push on this browser alone', async () => {
	const { browser, deps } = sharedBrowser();
	const newer = deps('newer');
	expect(await new PushController('newer', newer).enable()).toBe('registered');
	const older = deps('older');
	expect(await new PushController('older', older).disable()).toBe(true);
	expect(browser).toMatchObject({
		enabled: true,
		registration: { profileId: 'newer', id: 'registration-newer' },
		subscribed: true
	});
	expect(browser.token).toMatch(/^token-newer-/);
	expect(older.unsubscribe).not.toHaveBeenCalled();
	expect(older.deleteToken).not.toHaveBeenCalled();
	expect(older.remove).not.toHaveBeenCalled();
});

it('a sign-out still cleaning up holds a newer setup until it finishes, then cannot undo it', async () => {
	const { browser, holds, deps } = sharedBrowser();
	const olderDeps = deps('older');
	const older = new PushController('older', olderDeps);
	expect(await older.enable()).toBe('registered');
	// The older profile signs out; its provider cleanup hangs (the 4 s logout case).
	const unsubscribing = held();
	holds.unsubscribe = unsubscribing.promise;
	const signingOut = older.disable();
	await vi.waitFor(() => expect(olderDeps.unsubscribe).toHaveBeenCalled());
	// The next person turns push on: the prompt is still immediate, the rest waits.
	const newerDeps = deps('newer');
	const enabling = new PushController('newer', newerDeps).enable();
	expect(newerDeps.requestPermission).toHaveBeenCalledOnce();
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(newerDeps.getToken).not.toHaveBeenCalled();
	unsubscribing.release();
	expect(await signingOut).toBe(true);
	expect(await enabling).toBe('registered');
	expect(browser).toMatchObject({
		enabled: true,
		registration: { profileId: 'newer' },
		subscribed: true
	});
	expect(browser.token).toMatch(/^token-newer-/);
});

it('a sign-out queued behind a newer setup finds it the owner and leaves it in place', async () => {
	const { browser, holds, deps } = sharedBrowser();
	const older = new PushController('older', deps('older'));
	expect(await older.enable()).toBe('registered');
	const tokenHeld = held();
	holds.getToken = tokenHeld.promise;
	const newerDeps = deps('newer');
	const enabling = new PushController('newer', newerDeps).enable();
	await vi.waitFor(() => expect(newerDeps.getToken).toHaveBeenCalled());
	// The older profile's (late) sign-out arrives while the newer setup is mid-way.
	const olderDeps = deps('older');
	const signingOut = new PushController('older', olderDeps).disable();
	tokenHeld.release();
	expect(await enabling).toBe('registered');
	expect(await signingOut).toBe(true);
	expect(olderDeps.unsubscribe).not.toHaveBeenCalled();
	expect(olderDeps.deleteToken).not.toHaveBeenCalled();
	expect(browser).toMatchObject({ enabled: true, registration: { profileId: 'newer' } });
	expect(browser.token).toMatch(/^token-newer-/);
});

it('when the browser’s registration can’t be read, an older sign-out changes nothing and says so', async () => {
	const { browser, deps } = sharedBrowser();
	expect(await new PushController('newer', deps('newer')).enable()).toBe('registered');
	const older = deps('older');
	older.read = async () => {
		throw new Error('Storage blocked');
	};
	// Unknown is not "nobody's": it may be the newer profile's, so leave it.
	expect(await new PushController('older', older).disable()).toBe(false);
	expect(browser).toMatchObject({
		enabled: true,
		registration: { profileId: 'newer' },
		subscribed: true
	});
	expect(older.unsubscribe).not.toHaveBeenCalled();
	expect(older.deleteToken).not.toHaveBeenCalled();
});

it('turning one’s own push off reports failure, not success, when the registration can’t be read', async () => {
	const { deps, controller } = fixture();
	deps.read.mockRejectedValue(new Error('Storage blocked'));
	// Unknown ownership is never treated as proven: nothing changes, retry later.
	expect(await controller.disable()).toBe(false);
	expect(deps.mark).not.toHaveBeenCalled();
	expect(deps.unsubscribe).not.toHaveBeenCalled();
	expect(deps.deleteToken).not.toHaveBeenCalled();
});

it('a setup that can’t read the registration fails without touching a newer profile’s push', async () => {
	const { browser, deps } = sharedBrowser();
	expect(await new PushController('newer', deps('newer')).enable()).toBe('registered');
	const older = deps('older');
	older.read = async () => {
		throw new Error('Storage blocked');
	};
	expect(await new PushController('older', older).enable()).toBe('failed');
	expect(older.getToken).not.toHaveBeenCalled();
	expect(older.unsubscribe).not.toHaveBeenCalled();
	expect(older.deleteToken).not.toHaveBeenCalled();
	expect(browser).toMatchObject({
		enabled: true,
		registration: { profileId: 'newer' },
		subscribed: true
	});
	expect(browser.token).toMatch(/^token-newer-/);
});

it('a stale tab’s own sign-out queued behind another tab’s newer setup leaves it alone when unreadable', async () => {
	const { browser, holds, deps } = sharedBrowser();
	// Tab 1 still shows profile A; tab 2 is setting up profile B.
	const tokenHeld = held();
	holds.getToken = tokenHeld.promise;
	const enabling = new PushController('B', deps('B')).enable();
	await vi.waitFor(() => expect(browser.enabled).toBe(false));
	const staleA = deps('A');
	// Once B has written its registration, storage fails for the stale tab.
	staleA.read = async () => {
		if (browser.registration?.profileId === 'B') throw new Error('Storage blocked');
		return browser.registration;
	};
	const signingOut = new PushController('A', staleA).disable();
	tokenHeld.release();
	expect(await enabling).toBe('registered');
	expect(await signingOut).toBe(false);
	expect(staleA.unsubscribe).not.toHaveBeenCalled();
	expect(staleA.deleteToken).not.toHaveBeenCalled();
	expect(browser).toMatchObject({
		enabled: true,
		registration: { profileId: 'B' },
		subscribed: true
	});
});
