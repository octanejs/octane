import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, act } from './_helpers';
import { setTransitionFallbackTimeout, getTransitionFallbackTimeout } from '../src/index.js';
import {
	HeldUrgentResuspend,
	HeldUrgentBodyResuspend,
	FreshUrgentSuspend,
} from './_fixtures/transition-held-urgent-resuspend.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}
function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

// A minimal external store of a single number — modelling a query observer that
// can notify (re-render) at URGENT priority on a macrotask.
function makeStore(initial: number) {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		setUrgent: (v: number) => {
			value = v;
			for (const l of listeners) l();
		},
		subscribe: (l: () => void) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}

// A per-value promise registry: value=1 already fulfilled (synchronous commit
// for the initial content); 2 and 3 are controlled deferreds.
function makeRegistry() {
	const d2 = deferred<number>();
	const d3 = deferred<number>();
	const promises = new Map<number, PromiseLike<number>>([
		[1, fulfilled(1)],
		[2, d2.promise],
		[3, d3.promise],
	]);
	return { promiseFor: (v: number) => promises.get(v)!, d2, d3 };
}

// ============================================================================
// React useTransition parity: a transition-HELD boundary keeps the prior
// content even when its still-committed content RE-SUSPENDS at URGENT (async)
// priority. Pre-fix octane flashed the @pending fallback because the urgent
// re-render took handleSuspense's softDetach path instead of the hold path.
//
// Per ReactSuspenseWithNoopRenderer-test "does not show fallback if previous
// content is showing" + the useTransition contract that, once prior content is
// being shown, React keeps holding it across re-suspensions of that content
// until the new tree is ready — it does not flash the fallback in between.
// ============================================================================

describe('transition-held boundary keeps prior content across an URGENT re-suspend (React parity)', () => {
	it('DESCENDANT re-suspends urgently while held → old content stays, NO fallback flash, isPending true throughout', async () => {
		const { promiseFor, d2, d3 } = makeRegistry();
		const store = makeStore(1);
		let start!: (fn: () => void) => void;
		const bindStart = (s: (fn: () => void) => void) => {
			start = s;
		};

		const r = mount(HeldUrgentResuspend, { promiseFor, store, bindStart });
		await act(() => {});
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		// Transition to value=2 → descendant re-renders at transition priority and
		// suspends on d2 → the boundary HOLDS content-1.
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		// While STILL held (d2 unresolved), an URGENT external-store update sets
		// value=3 → the descendant re-renders at URGENT priority and re-suspends on
		// d3. React keeps the prior content visible; octane (pre-fix) flashed the
		// @pending fallback here. The held content must stay, with NO fallback.
		await act(() => store.setUrgent(3));
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.find('#pending').textContent).toBe('pending');

		// The stale d2 resolves — but the live value is 3, so the boundary stays
		// held (content-1) waiting on d3. Still no fallback.
		await act(() => {
			d2.resolve(2);
		});
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#content').textContent).toBe('content-1');

		// d3 resolves → the held try resumes, content-3 commits all at once, and
		// isPending returns to idle.
		await act(() => {
			d3.resolve(3);
		});
		expect(r.find('#content').textContent).toBe('content-3');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('OWN-BODY re-suspends urgently while held → old content stays, NO fallback flash', async () => {
		const { promiseFor, d2, d3 } = makeRegistry();
		const store = makeStore(1);
		let start!: (fn: () => void) => void;
		const bindStart = (s: (fn: () => void) => void) => {
			start = s;
		};

		const r = mount(HeldUrgentBodyResuspend, { promiseFor, store, bindStart });
		await act(() => {});
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// Transition value=2 → the try body re-suspends → held.
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		// Urgent store update value=3 → the try BODY re-suspends at urgent priority
		// while held. Must keep holding, no fallback flash.
		await act(() => store.setUrgent(3));
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.find('#pending').textContent).toBe('pending');

		await act(() => {
			d2.resolve(2);
		});
		expect(r.findAll('#fallback')).toHaveLength(0);

		await act(() => {
			d3.resolve(3);
		});
		expect(r.find('#content').textContent).toBe('content-3');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

// ============================================================================
// Guard: a FRESH urgent suspend (no prior committed content) STILL shows the
// fallback. React shows the fallback for urgent suspense; the hold is only for
// already-committed content during a transition. This must NOT regress.
// ============================================================================

describe('NON-held urgent suspend still shows the @pending fallback (React parity)', () => {
	it('a fresh urgent render that suspends with no prior content shows the fallback', async () => {
		const d = deferred<number>();
		const promises = new Map<number, PromiseLike<number>>([[1, d.promise]]);
		const promiseFor = (v: number) => promises.get(v)!;

		const r = mount(FreshUrgentSuspend, { promiseFor, value: 1 });
		await act(() => {});
		// No prior content was ever committed → fallback is shown immediately.
		expect(r.findAll('#content')).toHaveLength(0);
		expect(r.find('#fallback').textContent).toBe('fallback');

		await act(() => {
			d.resolve(1);
		});
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#content').textContent).toBe('content-1');
		r.unmount();
	});
});

// ============================================================================
// The transition-fallback timeout safety valve still fires when a held
// boundary re-suspends urgently and never resolves. Continuing the hold across
// an urgent re-suspend must NOT disable the "eventually show fallback" budget —
// it re-arms it against the NEW in-flight thenable.
// ============================================================================

describe('held-then-urgent-resuspend still honours the transition-fallback timeout', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('a never-resolving urgent re-suspend of held content eventually swaps to @pending', async () => {
		const prev = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			// value=1 fulfilled; 2 and 3 are deferreds we never resolve.
			const d2 = deferred<number>();
			const d3 = deferred<number>();
			const promises = new Map<number, PromiseLike<number>>([
				[1, fulfilled(1)],
				[2, d2.promise],
				[3, d3.promise],
			]);
			const promiseFor = (v: number) => promises.get(v)!;
			const store = makeStore(1);
			let start!: (fn: () => void) => void;
			const bindStart = (s: (fn: () => void) => void) => {
				start = s;
			};

			const r = mount(HeldUrgentResuspend, { promiseFor, store, bindStart });
			await act(() => {});
			expect(r.find('#content').textContent).toBe('content-1');

			// Transition → hold on d2 (arms the 100ms timeout).
			await act(() => start(() => store.setUrgent(2)));
			expect(r.find('#content').textContent).toBe('content-1');
			expect(r.findAll('#fallback')).toHaveLength(0);

			// Advance 60ms (under budget), then an URGENT re-suspend on d3 — the
			// timeout is RE-ARMED for d3 (a fresh 100ms budget from this point).
			await act(() => {
				vi.advanceTimersByTime(60);
			});
			await act(() => store.setUrgent(3));
			expect(r.find('#content').textContent).toBe('content-1'); // still held
			expect(r.findAll('#fallback')).toHaveLength(0);

			// 60ms more (120ms total from the first hold, but only 60ms since the
			// d3 re-arm) → still under d3's budget, still held, no fallback.
			await act(() => {
				vi.advanceTimersByTime(60);
			});
			expect(r.find('#content').textContent).toBe('content-1');
			expect(r.findAll('#fallback')).toHaveLength(0);

			// Cross d3's 100ms budget → the safety valve fires and the @pending
			// fallback shows. isPending stays true (transition still in progress).
			await act(() => {
				vi.advanceTimersByTime(60);
			});
			expect(r.findAll('#content')).toHaveLength(0);
			expect(r.find('#fallback').textContent).toBe('fallback');
			expect(r.find('#pending').textContent).toBe('pending');

			// Finally resolving d3 restores the content with content-3.
			await act(() => {
				d3.resolve(3);
			});
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('#content').textContent).toBe('content-3');
			expect(r.find('#pending').textContent).toBe('idle');
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prev);
		}
	});
});
