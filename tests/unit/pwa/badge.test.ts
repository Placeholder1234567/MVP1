import { expect, it, vi } from 'vitest';
import { showBadge } from '../../../src/lib/pwa/badge';

it('sets the count, clears at zero and ignores browsers without the API', async () => {
	const nav = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
	await showBadge(3, nav);
	await showBadge(0, nav);
	expect(nav.setAppBadge).toHaveBeenCalledWith(3);
	expect(nav.clearAppBadge).toHaveBeenCalledOnce();
	await expect(showBadge(2, {})).resolves.toBeUndefined();
	await expect(
		showBadge(2, { setAppBadge: () => Promise.reject(new Error('not installed')) })
	).resolves.toBeUndefined();
});
