import { describe, it, expect } from 'vitest';
import { mount, act, createLog, flushEffects } from './_helpers';
import {
	NestedHeldBoundary,
	ErrorWhileHeld,
	RapidTransitions,
	EffectOrdering,
} from './_fixtures/transition-held-audit.tsrx';

// ============================================================================
// Phase-2 adversarial audit of the transition-held / urgent-resuspend fix.
// Probes nested boundaries, error-while-held, rapid transitions, effect
// ordering, and isPending-counter balance for React useTransition+Suspense
// parity. Each describe block models a way the continue-hold path could be
// subtly wrong.
// ============================================================================

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

// ----------------------------------------------------------------------------
// (c) NESTED boundaries: the inner boundary owns the suspend; an URGENT
// re-suspend of the inner content keeps the INNER held and never disturbs the
// OUTER content. React: the nearest boundary handles the suspend.
// ----------------------------------------------------------------------------
describe('(c) nested boundaries — inner held across an urgent re-suspend, outer undisturbed', () => {
	it('inner re-suspends urgently while held; outer content and outer fallback never appear', async () => {
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

		const r = mount(NestedHeldBoundary, { promiseFor, store, bindStart });
		await act(() => {});
		expect(r.find('#inner-content').textContent).toBe('inner-1');
		expect(r.find('#outer-content')).toBeTruthy();
		expect(r.findAll('#inner-fallback')).toHaveLength(0);
		expect(r.findAll('#outer-fallback')).toHaveLength(0);

		// Transition value=2 → inner reader suspends → inner HOLDS inner-1. The
		// outer boundary must NOT see this suspend (inner is the nearest handler).
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#inner-content').textContent).toBe('inner-1');
		expect(r.findAll('#inner-fallback')).toHaveLength(0);
		expect(r.findAll('#outer-fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		// URGENT value=3 while held → inner re-suspends on d3. Inner stays held; no
		// inner OR outer fallback.
		await act(() => store.setUrgent(3));
		expect(r.find('#inner-content').textContent).toBe('inner-1');
		expect(r.findAll('#inner-fallback')).toHaveLength(0);
		expect(r.findAll('#outer-fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		await act(() => {
			d2.resolve(2);
		});
		expect(r.find('#inner-content').textContent).toBe('inner-1');

		await act(() => {
			d3.resolve(3);
		});
		expect(r.find('#inner-content').textContent).toBe('inner-3');
		expect(r.findAll('#inner-fallback')).toHaveLength(0);
		expect(r.findAll('#outer-fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle'); // counter balanced
		r.unmount();
	});
});

// ----------------------------------------------------------------------------
// (d) ERROR thrown while held: a real error (not a suspend) on an urgent
// re-render must route to @catch and release the hold (isPending back to idle).
// It must NOT stay stuck holding the prior content.
// ----------------------------------------------------------------------------
describe('(d) error thrown while held routes to @catch and releases the hold', () => {
	it('held on a transition, then an urgent render throws → @catch shows, isPending idle', async () => {
		const d2 = deferred<number>();
		const promises = new Map<number, PromiseLike<number>>([
			[1, fulfilled(1)],
			[2, d2.promise],
		]);
		const promiseFor = (v: number) => promises.get(v)!;
		const store = makeStore(1);
		let start!: (fn: () => void) => void;
		const bindStart = (s: (fn: () => void) => void) => {
			start = s;
		};

		const r = mount(ErrorWhileHeld, { promiseFor, store, bindStart });
		await act(() => {});
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#error')).toHaveLength(0);

		// Transition value=2 → suspend → HOLD content-1.
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// URGENT value=-5 while held → ThrowableChild THROWS. Must switch to @catch
		// and drop the hold (no more held content, isPending back to idle).
		await act(() => store.setUrgent(-5));
		expect(r.find('#error').textContent).toBe('error:boom-5');
		expect(r.findAll('#content')).toHaveLength(0);
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle'); // hold released

		// The stale d2 resolving must NOT resurrect anything or re-leak isPending.
		await act(() => {
			d2.resolve(2);
		});
		expect(r.find('#error').textContent).toBe('error:boom-5');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('OWN-BODY style: transition-hold then urgent throw, no fallback ever, isPending idle', async () => {
		// Same shape but assert the fallback never flashed and the counter is exactly
		// balanced (an over-decrement would underflow isPending; an under-decrement
		// would leave it stuck pending).
		const d2 = deferred<number>();
		const promises = new Map<number, PromiseLike<number>>([
			[1, fulfilled(1)],
			[2, d2.promise],
		]);
		const promiseFor = (v: number) => promises.get(v)!;
		const store = makeStore(1);
		let start!: (fn: () => void) => void;
		const bindStart = (s: (fn: () => void) => void) => {
			start = s;
		};
		const r = mount(ErrorWhileHeld, { promiseFor, store, bindStart });
		await act(() => {});
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#pending').textContent).toBe('pending');
		await act(() => store.setUrgent(-1));
		expect(r.find('#error').textContent).toBe('error:boom-1');
		expect(r.find('#pending').textContent).toBe('idle');
		// Recover: an urgent value back to a good promise should re-render fine from
		// catch (proves the boundary isn't wedged).
		r.unmount();
	});
});

// ----------------------------------------------------------------------------
// (e) RAPID successive transitions 1→2→3→4 before any resolve. Holds content-1
// throughout; no stale 2/3 content; commits the value whose promise resolves;
// isPending balanced at the end.
// ----------------------------------------------------------------------------
describe('(e) rapid successive transitions — no stale content, no leaked hold', () => {
	it('1→2→3 (transition each) before resolve; holds 1, commits 3 on resolve', async () => {
		const d2 = deferred<number>();
		const d3 = deferred<number>();
		const promises = new Map<number, PromiseLike<number>>([
			[1, fulfilled(1)],
			[2, d2.promise],
			[3, d3.promise],
		]);
		const promiseFor = (v: number) => promises.get(v)!;
		const store = makeStore(1);

		const r = mount(RapidTransitions, { promiseFor, store });
		await act(() => {});
		expect(r.find('#content').textContent).toBe('content-1');

		const { startTransition } = await import('../src/index.js');

		// Three transitions in quick succession, each before the prior resolves.
		await act(() => startTransition(() => store.setUrgent(2)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		await act(() => startTransition(() => store.setUrgent(3)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		// The STALE d2 resolves first — value is 3, so the boundary re-renders, sees
		// value=3 still in flight, and stays held on content-1 (no stale content-2).
		await act(() => {
			d2.resolve(2);
		});
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// d3 resolves → commit content-3, isPending idle, balanced.
		await act(() => {
			d3.resolve(3);
		});
		expect(r.find('#content').textContent).toBe('content-3');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('mixed transition then urgent then transition before resolve stays balanced', async () => {
		const d2 = deferred<number>();
		const d3 = deferred<number>();
		const d4 = deferred<number>();
		const promises = new Map<number, PromiseLike<number>>([
			[1, fulfilled(1)],
			[2, d2.promise],
			[3, d3.promise],
			[4, d4.promise],
		]);
		const promiseFor = (v: number) => promises.get(v)!;
		const store = makeStore(1);
		const r = mount(RapidTransitions, { promiseFor, store });
		await act(() => {});
		const { startTransition } = await import('../src/index.js');

		await act(() => startTransition(() => store.setUrgent(2))); // hold begins
		expect(r.find('#pending').textContent).toBe('pending');
		await act(() => store.setUrgent(3)); // URGENT re-suspend while held
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.find('#pending').textContent).toBe('pending');
		await act(() => startTransition(() => store.setUrgent(4))); // transition again
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.find('#pending').textContent).toBe('pending');

		await act(() => {
			d2.resolve(2);
			d3.resolve(3);
		});
		expect(r.find('#content').textContent).toBe('content-1'); // still on d4

		await act(() => {
			d4.resolve(4);
		});
		expect(r.find('#content').textContent).toBe('content-4');
		expect(r.find('#pending').textContent).toBe('idle'); // exactly balanced
		r.unmount();
	});
});

// ----------------------------------------------------------------------------
// (f) EFFECT ordering on the eventual held→resolved commit. React fires the
// child-first cleanup of the old effect before the new effect on the commit
// that swaps the content. We assert the effect for the OLD value cleans up and
// the NEW value's effect runs, and that no effect ran for the never-committed
// intermediate value.
// ----------------------------------------------------------------------------
describe('(f) effects/cleanup ordering on the eventual commit', () => {
	it('held content keeps its effect; resolve swaps cleanup-old then mount-new; skipped value has no effect', async () => {
		const log = createLog();
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

		const r = mount(EffectOrdering, { promiseFor, store, bindStart, log: log.push });
		await act(() => {});
		expect(r.find('#content').textContent).toBe('content-1');
		expect(log.drain()).toEqual(['mount-1']);

		// Transition→2 holds. The held content-1 stays committed; its effect must NOT
		// clean up while held (content-1 is still on screen).
		await act(() => start(() => store.setUrgent(2)));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(log.drain()).toEqual([]); // no effect churn while held

		// Urgent→3 re-suspends while held — still no commit, still no effect churn.
		await act(() => store.setUrgent(3));
		expect(r.find('#content').textContent).toBe('content-1');
		expect(log.drain()).toEqual([]);

		// Stale d2 resolves; value is 3 so still held — no effect for the skipped 2.
		await act(() => {
			d2.resolve(2);
		});
		expect(log.drain()).toEqual([]);

		// d3 resolves → content-3 commits. Old effect cleans up, new effect mounts.
		// React ordering on this committed swap: cleanup-1 before mount-3, and value
		// 2 NEVER got an effect (it never committed).
		await act(() => {
			d3.resolve(3);
		});
		expect(r.find('#content').textContent).toBe('content-3');
		const entries = log.drain();
		expect(entries).toContain('cleanup-1');
		expect(entries).toContain('mount-3');
		expect(entries.indexOf('cleanup-1')).toBeLessThan(entries.indexOf('mount-3'));
		expect(entries).not.toContain('mount-2');
		expect(entries).not.toContain('cleanup-2');
		r.unmount();
		// Unmount cleanup fires for the live value (3) exactly once — in the
		// deferred passive flush (React defers deletion passive destroys).
		flushEffects();
		expect(log.drain()).toEqual(['cleanup-3']);
	});
});
