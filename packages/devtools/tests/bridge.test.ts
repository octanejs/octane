import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBridge } from '../src/bridge';
import { OctaneDevtoolsEventClient, type NodeDetail } from '../src/client';

type Listener = () => void;

// A structural fake of the runtime devtools hook (globalThis.__OCTANE_DEVTOOLS__).
// Using a fake keeps this a focused unit test of the bridge's wiring; the real
// hook is covered by packages/octane/tests/devtools-hook.test.ts.
function installFakeHook() {
	const subs = new Set<Listener>();
	const detail: NodeDetail = {
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
		getTransitionState: () => ({ pendingCount: 0, boundaries: [] }),
		_fire: () => subs.forEach((l) => l()),
	};
	(globalThis as any).__OCTANE_DEVTOOLS__ = hook;
	return { hook, detail };
}

afterEach(() => {
	delete (globalThis as any).__OCTANE_DEVTOOLS__;
});

describe('bridge', () => {
	it('refreshes selected native reads and clears a retired selection without resending an unchanged tree', async () => {
		vi.useFakeTimers();
		try {
			const { hook, detail } = installFakeHook();
			let current: NodeDetail | null = {
				...detail,
				nativeReads: {
					ownerId: 1,
					committed: {
						mixed: false,
						reads: [{ observedVersion: 1, currentVersion: 1, source: null }],
					},
					pending: [],
					retry: [],
				},
			};
			hook.inspect = () => current;
			const app = new OctaneDevtoolsEventClient();
			const panel = new OctaneDevtoolsEventClient();
			const received = vi.fn();
			const cleared = vi.fn();
			const offInspect = panel.on('inspect', (event) => received(event.payload));
			const offClear = panel.on('inspect-clear', (event) => cleared(event.payload));
			const stop = startBridge(app);
			try {
				const emitted = vi.spyOn(app, 'emit');
				panel.emit('inspect-request', { id: 1 });
				await Promise.resolve();
				expect(received).toHaveBeenLastCalledWith(current);
				current = {
					...current!,
					nativeReads: {
						...current!.nativeReads!,
						committed: {
							mixed: false,
							reads: [{ observedVersion: 2, currentVersion: 2, source: null }],
						},
					},
				};
				hook._fire();
				await vi.advanceTimersByTimeAsync(400);
				expect(received).toHaveBeenCalledTimes(2);
				expect(received).toHaveBeenLastCalledWith(current);
				expect(emitted.mock.calls.filter(([event]) => event === 'tree')).toHaveLength(0);
				hook._fire();
				await vi.advanceTimersByTimeAsync(400);
				expect(received).toHaveBeenCalledTimes(2);
				current = null;
				hook._fire();
				await vi.advanceTimersByTimeAsync(400);
				expect(cleared).toHaveBeenCalledExactlyOnceWith({ id: 1 });
			} finally {
				stop();
				offInspect();
				offClear();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('coalesces bursts of flushes into one throttled emit and dedupes unchanged data', async () => {
		vi.useFakeTimers();
		try {
			const { hook } = installFakeHook();
			let tree = [{ id: 1, name: 'App', kind: 'root', children: [] as unknown[] }];
			(hook as unknown as { getTree: () => unknown }).getTree = () => tree;
			const client = new OctaneDevtoolsEventClient();
			const stop = startBridge(client); // initial emit caches the current tree
			const emit = vi.spyOn(client, 'emit');

			// Change the tree, then flush several times synchronously.
			tree = [{ id: 2, name: 'Next', kind: 'root', children: [] }];
			hook._fire();
			hook._fire();
			hook._fire();

			// Throttled: nothing is emitted synchronously in the burst.
			expect(emit.mock.calls.filter((c) => c[0] === 'tree')).toHaveLength(0);

			// After the throttle window, exactly ONE `tree` emit carrying the new value.
			await vi.advanceTimersByTimeAsync(400);
			const treeCalls = emit.mock.calls.filter((c) => c[0] === 'tree');
			expect(treeCalls).toHaveLength(1);
			expect(treeCalls[0][1]).toEqual({
				nodes: [{ id: 2, name: 'Next', kind: 'root', children: [] }],
			});

			// A further flush with unchanged data emits no new `tree` (deduped).
			hook._fire();
			await vi.advanceTimersByTimeAsync(400);
			expect(emit.mock.calls.filter((c) => c[0] === 'tree')).toHaveLength(1);

			stop();
		} finally {
			vi.useRealTimers();
		}
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

	it('emits a profile snapshot from the profiler global on flush', () => {
		const { hook } = installFakeHook();
		(globalThis as any).__OCTANE_PROFILER__ = {
			summary: () => [
				{
					componentId: 'c1',
					component: 'App',
					file: 'a.tsrx',
					attempts: 2,
					completed: 2,
					suspended: 0,
					errored: 0,
					bails: 0,
					totalTime: 5,
					totalSelfTime: 3,
					averageSelfTime: 1.5,
					maxInclusiveTime: 4,
					averageQueueDelay: 0,
					dominantCause: 'mount',
				},
			],
			getEvents: () => [
				{
					type: 'component-render',
					component: 'App',
					phase: 'mount',
					outcome: 'completed',
					duration: 4,
					selfDuration: 3,
					queueDelay: 0,
					causes: [{ type: 'mount' }],
					startTime: 0,
				},
			],
		};
		const client = new OctaneDevtoolsEventClient();
		const emit = vi.spyOn(client, 'emit');
		const stop = startBridge(client);
		hook._fire();
		expect(emit).toHaveBeenCalledWith(
			'profile',
			expect.objectContaining({
				summaries: [expect.objectContaining({ component: 'App', totalSelfTime: 3 })],
				recentEvents: [
					expect.objectContaining({ component: 'App', phase: 'mount', causes: ['mount'] }),
				],
			}),
		);
		stop();
		delete (globalThis as any).__OCTANE_PROFILER__;
	});

	it('does not emit profile when the profiler global is absent', () => {
		const { hook } = installFakeHook();
		const client = new OctaneDevtoolsEventClient();
		const emit = vi.spyOn(client, 'emit');
		const stop = startBridge(client);
		hook._fire();
		expect(emit).not.toHaveBeenCalledWith('profile', expect.anything());
		stop();
	});

	it('emits a transition snapshot from the hook on flush', () => {
		const { hook } = installFakeHook();
		(hook as any).getTransitionState = () => ({
			pendingCount: 1,
			boundaries: [{ id: 1, branch: 2, state: 'pending', hasResolved: false, label: 'List' }],
		});
		const client = new OctaneDevtoolsEventClient();
		const emit = vi.spyOn(client, 'emit');
		const stop = startBridge(client);
		hook._fire();
		expect(emit).toHaveBeenCalledWith('transition', {
			pendingCount: 1,
			boundaries: [{ id: 1, branch: 2, state: 'pending', hasResolved: false, label: 'List' }],
		});
		stop();
	});
});
