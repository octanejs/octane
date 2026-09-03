/**
 * React 19.2.7 parity: a transition keeps committed query content visible, while
 * an explicit urgent key change may reveal fallback. Pending state belongs to
 * the useTransition hook that started the update, not an independent probe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@octanejs/tanstack-query';
import { act } from 'octane';
import { mount, nextPaint } from '../_helpers';
import { TransitionSuspenseApp } from '../_fixtures/transition-suspense.tsrx';

let client: QueryClient;
beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.mount();
});

// Drain query-core's macrotask scheduler (setTimeout(0)) AND octane's passive
// effects several times so the observer's async notifications land.
async function flush() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('useSuspenseQuery — transition keeps prior content, no fallback flash (React parity)', () => {
	it('value=1 committed; transition to value=2 holds value=1 until value=2 resolves', async () => {
		// Per-value controlled promises. value=1 resolves immediately so the first
		// query commits content; value=2 stays pending until we resolve it.
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		const promises: Record<number, Promise<string>> = { 1: d1.promise, 2: d2.promise };
		const queryFn = (v: number) => promises[v];

		let setValue!: (v: number) => void;
		const bindSetValue = (fn: (v: number) => void) => {
			setValue = fn;
		};

		const r = mount(TransitionSuspenseApp, { client, queryFn, bindSetValue });

		// First render suspends → fallback while value=1's query is in flight.
		expect(r.find('#fallback').textContent).toBe('loading');

		await act(async () => {
			d1.resolve('one');
			await flush();
		});
		// value=1 content committed.
		expect(r.find('#data').textContent).toBe('data:one');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		// Observe the entire pending window so a transient fallback cannot pass a
		// settled-only assertion. The query key changes at transition priority.
		let fallbackEverSeen = false;
		let contentEverLost = false;
		const mo = new MutationObserver(() => {
			if (r.container.querySelector('#fallback')) fallbackEverSeen = true;
			if (!r.container.querySelector('#data')) contentEverLost = true;
		});
		mo.observe(r.container, { childList: true, subtree: true });

		await act(() => setValue(2));
		await flush();
		mo.disconnect();

		expect(fallbackEverSeen).toBe(false);
		expect(contentEverLost).toBe(false); // value=1 content never removed
		expect(r.find('#data').textContent).toBe('data:one'); // OLD content held
		expect(r.find('#data').getAttribute('data-pending')).toBe('pending');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		// Resolve value=2 → the held boundary commits the new content all at once
		// and isPending returns to idle. The fallback never showed at any point.
		await act(async () => {
			d2.resolve('two');
			await flush();
		});
		expect(r.find('#data').textContent).toBe('data:two');
		expect(r.find('#data').getAttribute('data-pending')).toBe('idle');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		r.unmount();
	});

	it('an urgent key change supersedes a held transition and reveals fallback', async () => {
		// Unlike a transition update, an explicit urgent key change must interrupt
		// the held screen. This is also the negative control for transition holds.
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		const d3 = deferred<string>();
		const promises: Record<number, Promise<string>> = {
			1: d1.promise,
			2: d2.promise,
			3: d3.promise,
		};
		const queryFn = (v: number) => promises[v];

		let setValue!: (v: number) => void;
		let setValueUrgent!: (v: number) => void;
		const bindSetValue = (fn: (v: number) => void) => {
			setValue = fn;
		};
		const bindSetValueUrgent = (fn: (v: number) => void) => {
			setValueUrgent = fn;
		};

		const r = mount(TransitionSuspenseApp, {
			client,
			queryFn,
			bindSetValue,
			bindSetValueUrgent,
		});
		expect(r.find('#fallback').textContent).toBe('loading');
		await act(async () => {
			d1.resolve('one');
			await flush();
		});
		expect(r.find('#data').textContent).toBe('data:one');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		// Watch the DOM through the whole move so a transient fallback flash (or any
		// removal of the value=1 content) is caught — the flash is not visible at a
		// settled checkpoint.
		let fallbackEverSeen = false;
		let contentEverLost = false;
		const mo = new MutationObserver(() => {
			if (r.container.querySelector('#fallback')) fallbackEverSeen = true;
			if (!r.container.querySelector('#data')) contentEverLost = true;
		});
		mo.observe(r.container, { childList: true, subtree: true });

		// Transition to value=2 → boundary HOLDS content-one on the value=2 fetch.
		await act(() => setValue(2));
		await flush();
		expect(r.find('#data').textContent).toBe('data:one');
		expect(fallbackEverSeen).toBe(false);

		// An urgent move to key3 supersedes key2. The old content stays mounted
		// but hidden while key3's fallback is visible.
		await act(() => setValueUrgent(3));
		await flush();
		expect(fallbackEverSeen).toBe(true);
		expect(r.find('#fallback').textContent).toBe('loading');
		expect((r.find('#data') as HTMLElement).style.display).toBe('none');
		expect(r.find('#pending').textContent).toBe('idle');

		// A stale key2 resolution cannot replace the current key3 fallback.
		await act(async () => {
			d2.resolve('two');
			await flush();
		});
		expect(r.find('#fallback').textContent).toBe('loading');
		await act(async () => {
			d3.resolve('three');
			await flush();
		});
		mo.disconnect();

		expect(fallbackEverSeen).toBe(true);
		expect(contentEverLost).toBe(false); // value=1 content was never removed
		expect(r.find('#data').textContent).toBe('data:three');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		r.unmount();
	});
});
