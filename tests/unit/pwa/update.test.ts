// A tab reloads onto a new version when it takes over, including a tab that
// opened before the first version took control (first visit): that first
// takeover has nothing to leave, but every later one does.
import { afterEach, expect, it, vi } from 'vitest';

// Unit tests don't compile runes; a plain object stands in for $state.
vi.hoisted(() => Object.assign(globalThis, { $state: <T>(value: T) => value }));
const { watchForUpdate } = await import('../../../src/lib/pwa/update.svelte.ts');

function browser(controller: object | null) {
	const sw = Object.assign(new EventTarget(), {
		controller,
		getRegistration: async () => undefined
	});
	const reload = vi.fn();
	vi.stubGlobal('navigator', { serviceWorker: sw });
	vi.stubGlobal('location', { reload });
	vi.stubGlobal('document', { visibilityState: 'visible' });
	return { sw, reload };
}

afterEach(() => vi.unstubAllGlobals());

it('a first-visit tab ignores the first takeover but reloads on the next one', () => {
	const { sw, reload } = browser(null);
	const stop = watchForUpdate();
	sw.controller = {};
	sw.dispatchEvent(new Event('controllerchange'));
	expect(reload).not.toHaveBeenCalled();
	sw.dispatchEvent(new Event('controllerchange'));
	expect(reload).toHaveBeenCalledTimes(1);
	stop();
});

it('a tab that already had a version reloads on the takeover', () => {
	const { sw, reload } = browser({});
	const stop = watchForUpdate();
	sw.dispatchEvent(new Event('controllerchange'));
	expect(reload).toHaveBeenCalledTimes(1);
	stop();
});
