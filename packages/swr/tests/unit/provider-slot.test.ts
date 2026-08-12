import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { cache } from '../../src/_internal/index';
import { SWRProviderProbe } from '../upstream/root/fixtures.tsrx';

// Octane framework-contract probe: proves SWRConfig's layout effect receives a stable
// compiler slot. Not React-parity evidence — unpaired on purpose.

let container: HTMLElement;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	cache.clear();
});

describe('SWRConfig Octane provider slot', () => {
	it('mounts and tears down an isolated SWRConfig provider with a stable effect slot', () => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
		const provider = vi.fn(function () {
			return new Map();
		});
		expect(function () {
			root!.render(SWRProviderProbe as never, { provider });
			flushSync(function () {});
			drainPassiveEffects();
			flushSync(function () {});
		}).not.toThrow();
		expect(container.querySelector('[data-testid="provider"]')?.textContent).toBe('configured');
		expect(provider).toHaveBeenCalledOnce();
	});
});
