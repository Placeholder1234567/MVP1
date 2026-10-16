import { expect, it, vi } from 'vitest';
import { PushController, type PushDependencies } from '../../../src/lib/pwa/push-controller';
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
		remove: vi.fn<PushDependencies['remove']>(async () => ({ removed: true }))
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
	await controller.disable();
	finish('late-token');
	expect(await enabling).toBe('off');
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
