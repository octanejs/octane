import { TauriUnavailableError, type UseTauriEventOptions } from '@octanejs/tauri';
import { emit, listen, type EventTarget as TauriEventTarget } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BareEventReader, EventBoundary, ReportingEventReader } from '../_fixtures/commands.tsrx';
import { flush, mount } from '../_helpers';

afterEach(async () => {
	// An unlisten issued during unmount reaches the bridge a microtask later.
	// Draining before clearMocks keeps it out of the next test's mock.
	await flush();
	clearMocks();
	delete (window as any).__TAURI_INTERNALS__;
	delete (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__;
});

/** Hand-rolled event plugin so a test can settle `listen` on its own schedule. */
function deferredEventPlugin() {
	const pendingListens: Array<() => void> = [];
	const unlistened: unknown[] = [];
	let listenCount = 0;

	mockIPC((cmd, args: any) => {
		if (cmd === 'plugin:event|listen') {
			listenCount++;
			return new Promise<number>((resolve) => {
				pendingListens.push(() => resolve(args.handler));
			});
		}
		if (cmd === 'plugin:event|unlisten') {
			unlistened.push(args);
			return null;
		}
		return null;
	});

	return {
		unlistened,
		get listenCount() {
			return listenCount;
		},
		settleAll() {
			for (const settle of pendingListens.splice(0)) settle();
		},
	};
}

function targetEventPlugin(deferred = false) {
	const active = new Map<number, TauriEventTarget>();
	const pendingListens: Array<() => void> = [];
	mockIPC((cmd, args: any) => {
		if (cmd === 'plugin:event|listen') {
			const subscribe = () => {
				active.set(args.handler, args.target);
				return args.handler;
			};
			return deferred
				? new Promise<number>((resolve) => pendingListens.push(() => resolve(subscribe())))
				: subscribe();
		}
		if (cmd === 'plugin:event|unlisten') active.delete(args.eventId);
		return null;
	});
	return {
		targets: () => [...active.values()],
		settleAll() {
			for (const settle of pendingListens.splice(0)) settle();
		},
	};
}

type Target = NonNullable<UseTauriEventOptions['target']>;
const targetChanges: Array<[string, Target, Target, TauriEventTarget, TauriEventTarget]> = [
	[
		'Any object to label',
		{ kind: 'Any' },
		'Any',
		{ kind: 'Any' },
		{ kind: 'AnyLabel', label: 'Any' },
	],
	[
		'Any label to object',
		'Any',
		{ kind: 'Any' },
		{ kind: 'AnyLabel', label: 'Any' },
		{ kind: 'Any' },
	],
	[
		'App object to label',
		{ kind: 'App' },
		'App',
		{ kind: 'App' },
		{ kind: 'AnyLabel', label: 'App' },
	],
	[
		'App label to object',
		'App',
		{ kind: 'App' },
		{ kind: 'AnyLabel', label: 'App' },
		{ kind: 'App' },
	],
	[
		'Window object to colon label',
		{ kind: 'Window', label: 'main' },
		'Window:main',
		{ kind: 'Window', label: 'main' },
		{ kind: 'AnyLabel', label: 'Window:main' },
	],
	[
		'colon label to Window object',
		'Window:main',
		{ kind: 'Window', label: 'main' },
		{ kind: 'AnyLabel', label: 'Window:main' },
		{ kind: 'Window', label: 'main' },
	],
	[
		'ordinary labels',
		'first',
		'second',
		{ kind: 'AnyLabel', label: 'first' },
		{ kind: 'AnyLabel', label: 'second' },
	],
];

describe('useTauriEvent', () => {
	it('uses the SDK host target distinction between string labels and target kinds', async () => {
		const plugin = targetEventPlugin();
		for (const [, initial, next, initialHost, nextHost] of targetChanges) {
			for (const [target, expected] of [
				[initial, initialHost],
				[next, nextHost],
			] as const) {
				const stop = await listen('tick', () => {}, { target });
				try {
					expect(plugin.targets()).toEqual([expected]);
				} finally {
					await stop();
					await flush();
					expect(plugin.targets()).toEqual([]);
				}
			}
		}
	});

	it.each(targetChanges)(
		'retargets the host subscription for %s',
		async (_name, initial, next, initialHost, nextHost) => {
			const plugin = targetEventPlugin();
			const onTick = vi.fn();
			const result = mount(EventBoundary, { event: 'tick', target: initial, nonce: 0, onTick });
			try {
				await flush();
				expect(plugin.targets()).toEqual([initialHost]);
				result.update(EventBoundary, { event: 'tick', target: next, nonce: 1, onTick });
				await flush();
				expect(result.find('#reader').textContent).toBe('1');
				expect(plugin.targets()).toEqual([nextHost]);
			} finally {
				result.unmount();
				await flush();
				expect(plugin.targets()).toEqual([]);
			}
		},
	);

	it.each<[string, Target, Target]>([
		['string to object', 'main', { kind: 'AnyLabel', label: 'main' }],
		['object to string', { kind: 'AnyLabel', label: 'main' }, 'main'],
	])(
		'preserves the requested host scope for equivalent labels (%s)',
		async (_name, initial, next) => {
			const plugin = targetEventPlugin();
			const onTick = vi.fn();
			const result = mount(EventBoundary, { event: 'tick', target: initial, onTick });
			try {
				await flush();
				expect(plugin.targets()).toEqual([{ kind: 'AnyLabel', label: 'main' }]);
				result.update(EventBoundary, { event: 'tick', target: next, nonce: 1, onTick });
				await flush();
				expect(result.find('#reader').textContent).toBe('1');
				expect(plugin.targets()).toEqual([{ kind: 'AnyLabel', label: 'main' }]);
			} finally {
				result.unmount();
				await flush();
				expect(plugin.targets()).toEqual([]);
			}
		},
	);

	it('releases the old target when its listen resolves after retargeting', async () => {
		const plugin = targetEventPlugin(true);
		const onTick = vi.fn();
		const result = mount(EventBoundary, { event: 'tick', target: { kind: 'Any' }, onTick });
		try {
			await flush();
			expect(plugin.targets()).toEqual([]);
			result.update(EventBoundary, { event: 'tick', target: 'Any', nonce: 1, onTick });
			await flush();
			expect(result.find('#reader').textContent).toBe('1');
			plugin.settleAll();
			await flush();
			expect(plugin.targets()).toEqual([{ kind: 'AnyLabel', label: 'Any' }]);
		} finally {
			result.unmount();
			plugin.settleAll();
			await flush();
			expect(plugin.targets()).toEqual([]);
		}
	});

	it('delivers payloads to the current handler', async () => {
		mockIPC(() => {}, { shouldMockEvents: true });
		const onTick = vi.fn();
		const result = mount(EventBoundary, { event: 'tick', onTick });
		await flush();

		await emit('tick', 'first');
		await flush();
		expect(onTick).toHaveBeenCalledWith('first');
		result.unmount();
	});

	it('subscribes when called with neither options nor a target', async () => {
		mockIPC(() => {}, { shouldMockEvents: true });
		const onTick = vi.fn();
		const result = mount(BareEventReader, { event: 'tick', onTick });
		await flush();

		await emit('tick', 'first');
		await flush();
		expect(onTick).toHaveBeenCalledWith('first');
		result.unmount();
	});

	it('keeps one subscription when a re-render supplies a fresh handler closure', async () => {
		const plugin = deferredEventPlugin();
		const onTick = vi.fn();
		const result = mount(EventBoundary, { event: 'tick', nonce: 0, onTick });
		await flush();
		plugin.settleAll();
		await flush();

		result.update(EventBoundary, { event: 'tick', nonce: 1, onTick });
		plugin.settleAll();
		await flush();

		expect(result.find('#reader').textContent).toBe('1');
		expect(plugin.listenCount).toBe(1);
		expect(plugin.unlistened).toHaveLength(0);
		result.unmount();
	});

	it('resubscribes when the event name changes', async () => {
		const plugin = deferredEventPlugin();
		const onTick = vi.fn();
		const result = mount(EventBoundary, { event: 'tick', onTick });
		await flush();
		plugin.settleAll();
		await flush();

		result.update(EventBoundary, { event: 'tock', onTick });
		plugin.settleAll();
		await flush();

		expect(plugin.listenCount).toBe(2);
		expect(plugin.unlistened).toEqual([{ event: 'tick', eventId: expect.any(Number) }]);
		result.unmount();
	});

	it('does not subscribe while disabled', async () => {
		const plugin = deferredEventPlugin();
		const result = mount(EventBoundary, { event: 'tick', enabled: false, onTick: vi.fn() });
		await flush();

		expect(plugin.listenCount).toBe(0);
		result.unmount();
	});

	it('detaches when unmount beats the pending unlisten function', async () => {
		const plugin = deferredEventPlugin();
		const result = mount(EventBoundary, { event: 'tick', onTick: vi.fn() });
		await flush();
		expect(plugin.listenCount).toBe(1);
		expect(plugin.unlistened).toHaveLength(0);

		// Drain the teardown before settling: the cleanup must have run while the
		// unlisten function was still unavailable, or the test proves nothing.
		result.unmount();
		await flush();
		expect(plugin.unlistened).toHaveLength(0);

		plugin.settleAll();
		await flush();
		expect(plugin.unlistened).toEqual([{ event: 'tick', eventId: expect.any(Number) }]);
	});

	it('reports a missing Tauri host to the error boundary', async () => {
		const result = mount(EventBoundary, { event: 'tick', onTick: vi.fn() });
		await flush();

		expect(result.find('#caught').textContent).toBe('TauriUnavailableError');
		result.unmount();
	});

	it('hands a failure to onError and leaves the component mounted', async () => {
		const onFailure = vi.fn();
		const result = mount(ReportingEventReader, {
			event: 'tick',
			onTick: vi.fn(),
			onFailure,
		});
		await flush();

		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(onFailure.mock.calls[0][0]).toBeInstanceOf(TauriUnavailableError);
		// Mounted without a boundary: had the hook thrown, the render would have
		// taken the root down instead of reaching this assertion.
		expect(result.find('#reader').textContent).toBe('ready');
		result.unmount();
	});

	it('resubscribes after a reported failure once the subscription is re-enabled', async () => {
		let listenCount = 0;
		mockIPC((cmd, args: any) => {
			if (cmd === 'plugin:event|listen') {
				listenCount++;
				return listenCount === 1
					? Promise.reject('event.listen not allowed by the capability file')
					: args.handler;
			}
			return null;
		});
		const onFailure = vi.fn();
		const result = mount(ReportingEventReader, {
			event: 'tick',
			onTick: vi.fn(),
			onFailure,
		});
		await flush();
		expect(onFailure).toHaveBeenCalledWith('event.listen not allowed by the capability file');

		result.update(ReportingEventReader, {
			event: 'tick',
			enabled: false,
			onTick: vi.fn(),
			onFailure,
		});
		await flush();
		result.update(ReportingEventReader, { event: 'tick', onTick: vi.fn(), onFailure });
		await flush();

		expect(listenCount).toBe(2);
		expect(onFailure).toHaveBeenCalledTimes(1);
		result.unmount();
	});
});
