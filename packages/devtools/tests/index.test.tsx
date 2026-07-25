/** @jsxImportSource octane */
import { afterEach, describe, expect, it } from 'vitest';
import { octaneDevtools } from '../src/index';

type Listener = () => void;

// A structural fake of the runtime devtools hook (globalThis.__OCTANE_DEVTOOLS__),
// installed BEFORE octaneDevtools() is constructed so startBridge (called from
// render()) picks it up. Same fake shape as tests/bridge.test.ts, trimmed to
// what this test needs: a subscribe() call counter proving the bridge starts
// exactly once across renders.
function installFakeHook() {
	let subscribeCalls = 0;
	const hook = {
		getTree: () => [],
		inspect: () => null,
		subscribe: (_l: Listener) => {
			subscribeCalls += 1;
			return () => {};
		},
	};
	(globalThis as unknown as { __OCTANE_DEVTOOLS__?: unknown }).__OCTANE_DEVTOOLS__ = hook;
	return { getSubscribeCalls: () => subscribeCalls };
}

afterEach(() => {
	delete (globalThis as unknown as { __OCTANE_DEVTOOLS__?: unknown }).__OCTANE_DEVTOOLS__;
});

describe('octaneDevtools', () => {
	it('returns a plugin descriptor with id, name, and a render function', () => {
		const plugin = octaneDevtools();
		expect(plugin.id).toBe('octane');
		expect(plugin.name).toBe('Octane');
		expect(typeof plugin.render).toBe('function');
	});

	it('starts the bridge exactly once across repeated render() calls', () => {
		const { getSubscribeCalls } = installFakeHook();
		const plugin = octaneDevtools();

		const first = plugin.render();
		const second = plugin.render();

		// startBridge() calls hook.subscribe() exactly once per bridge start (see
		// src/bridge.ts). The `stop === null` guard in octaneDevtools() must keep
		// a second render() from starting a second bridge — without it this count
		// would be 2.
		expect(getSubscribeCalls()).toBe(1);
		expect(first).toBeTruthy();
		expect(second).toBeTruthy();
	});
});
