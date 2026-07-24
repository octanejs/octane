import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBridge } from '../src/bridge';
import { OctaneDevtoolsEventClient } from '../src/client';

type Listener = () => void;

// A structural fake of the runtime devtools hook (globalThis.__OCTANE_DEVTOOLS__).
// Using a fake keeps this a focused unit test of the bridge's wiring; the real
// hook is covered by packages/octane/tests/devtools-hook.test.ts.
function installFakeHook() {
	const subs = new Set<Listener>();
	const detail = {
		id: 1,
		name: 'App',
		hooks: [{ kind: 'state', value: 0 }],
		context: [],
		effectCount: 0,
	};
	const hook = {
		version: 1,
		getTree: () => [{ id: 1, name: 'App', kind: 'root', children: [] }],
		inspect: (id: number) => (id === 1 ? detail : null),
		subscribe: (l: Listener) => {
			subs.add(l);
			return () => subs.delete(l);
		},
		_fire: () => subs.forEach((l) => l()),
	};
	(globalThis as any).__OCTANE_DEVTOOLS__ = hook;
	return { hook, detail };
}

afterEach(() => {
	delete (globalThis as any).__OCTANE_DEVTOOLS__;
});

describe('bridge', () => {
	it('emits a coalesced tree snapshot when the runtime flushes', async () => {
		const { hook } = installFakeHook();
		const client = new OctaneDevtoolsEventClient();
		const stop = startBridge(client);
		const emit = vi.spyOn(client, 'emit');

		// Two synchronous flushes must coalesce into a single microtask emission.
		hook._fire();
		hook._fire();
		await Promise.resolve();

		expect(emit).toHaveBeenCalledTimes(1);
		expect(emit).toHaveBeenCalledWith('tree', {
			nodes: [{ id: 1, name: 'App', kind: 'root', children: [] }],
		});
		stop();
	});

	it('answers an inspect-request emitted by another client with the node detail', async () => {
		const { detail } = installFakeHook();
		const client = new OctaneDevtoolsEventClient(); // app-side client, driven by the bridge
		const stop = startBridge(client);

		// The panel side is a separate client instance on the same shared bus
		// (tests/setup.ts), exercising the real round trip end to end.
		const panel = new OctaneDevtoolsEventClient();
		const received = vi.fn();
		panel.on('inspect', (e) => received(e.payload));

		panel.emit('inspect-request', { id: 1 });
		await Promise.resolve();

		expect(received).toHaveBeenCalledWith(detail);
		stop();
	});

	it('is a no-op when the runtime hook is absent', () => {
		const client = new OctaneDevtoolsEventClient();
		const emit = vi.spyOn(client, 'emit');
		const stop = startBridge(client);
		expect(emit).not.toHaveBeenCalled();
		expect(typeof stop).toBe('function');
		stop();
	});
});
