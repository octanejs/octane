import { TauriUnavailableError } from '@octanejs/tauri';
import { emit } from '@tauri-apps/api/event';
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

describe('useTauriEvent', () => {
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
