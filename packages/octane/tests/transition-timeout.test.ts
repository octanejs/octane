import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, act } from './_helpers';
import { setTransitionFallbackTimeout, getTransitionFallbackTimeout } from '../src/index.js';
import {
	TimedEntangledSupersession,
	TimedHiddenDependentGroup,
	TimedHiddenRetrySupersession,
	TimedHiddenRejection,
	TimedNestedRefOrder,
	TimedResumeEffectRollback,
	TimeoutFallback,
} from './_fixtures/transition-timeout.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: any) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void, reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function fulfilled<T>(value: T): Promise<T> & { status: string; value: T } {
	const promise = Promise.resolve(value) as Promise<T> & { status: string; value: T };
	promise.status = 'fulfilled';
	promise.value = value;
	return promise;
}

// Pins the lifecycle a transition goes through when its promise outlives the
// fallback budget. Uses Vitest's fake-timer rig to advance the clock past
// the threshold deterministically.
describe('useTransition — transition-timeout fallback', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('eventually swaps to @pending after the configured timeout AND restores try DOM on resolve', async () => {
		// Mirrors ReactSuspenseWithNoopRenderer-test.js "eventually shows fallback
		// if transition takes too long". Set the timeout to 100ms so the test
		// doesn't have to fake-advance 5 real seconds; the contract is identical.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initial = deferred<string>();
			initial.resolve('first');
			const next = deferred<string>();
			const readyRef = { current: null as Element | null };
			const r = mount(TimeoutFallback, {
				initialPromise: initial.promise,
				nextPromise: next.promise,
				readyRef,
				readyValue: 'second',
			});
			await act(() => {});
			expect(readyRef.current).toBeNull();
			expect(r.find('.leaf').textContent).toBe('first');
			expect(r.find('#pending').textContent).toBe('0');
			expect(r.findAll('#fallback')).toHaveLength(0);

			// Kick off the transition — prior DOM stays mounted, pending=1, no fallback yet.
			await act(() => {
				r.click('#swap');
			});
			expect(r.find('.leaf').textContent).toBe('first');
			expect(r.find('#pending').textContent).toBe('1');
			expect(r.findAll('#fallback')).toHaveLength(0);

			// Advance time PAST the timeout — the runtime swaps to @pending.
			// isPending stays true (the transition is still in progress).
			await act(() => {
				vi.advanceTimersByTime(150);
			});
			expect(r.findAll('.leaf')).toHaveLength(0);
			expect(r.find('#fallback').textContent).toBe('pending-shown');
			expect(r.find('#pending').textContent).toBe('1');

			// Promise resolves AFTER the fallback was shown — the saved try-body
			// re-attaches with the resolved value AND isPending drops to false.
			await act(() => {
				next.resolve('second');
			});
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('.leaf').textContent).toBe('second');
			expect(readyRef.current).toBe(r.find('.leaf'));
			expect(r.find('#pending').textContent).toBe('0');
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('promise resolves BEFORE the timeout — fallback never shows, prior DOM kept all the way', async () => {
		// The fast-resolve path: the retry runs before the timeout fires, so
		// clearTimeout cancels the pending fallback swap.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initial = deferred<string>();
			initial.resolve('first');
			const next = deferred<string>();
			const readyRef = { current: null as Element | null };
			const r = mount(TimeoutFallback, {
				initialPromise: initial.promise,
				nextPromise: next.promise,
				readyRef,
				readyValue: 'second',
			});
			await act(() => {});
			expect(readyRef.current).toBeNull();

			await act(() => {
				r.click('#swap');
			});
			expect(r.find('.leaf').textContent).toBe('first');
			expect(r.find('#pending').textContent).toBe('1');

			// Resolve fast — well before the 100ms budget.
			await act(() => {
				vi.advanceTimersByTime(20); // 20ms < 100ms
				next.resolve('second');
			});
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('.leaf').textContent).toBe('second');
			expect(readyRef.current).toBe(r.find('.leaf'));
			expect(r.find('#pending').textContent).toBe('0');

			// Advance past where the timeout WOULD HAVE fired — no fallback flicker.
			await act(() => {
				vi.advanceTimersByTime(200);
			});
			expect(r.findAll('#fallback')).toHaveLength(0);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('re-attaches a fallback-hidden child ref before its parent ref', async () => {
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const next = deferred<string>();
			const childRef = { current: null as Element | null };
			const parentObservations: boolean[] = [];
			const parentRef = (element: Element | null) => {
				if (element !== null) {
					parentObservations.push(childRef.current === element.querySelector('#nested-ref-child'));
				}
			};
			const r = mount(TimedNestedRefOrder as any, {
				initialPromise: fulfilled('first'),
				nextPromise: next.promise,
				childRef,
				parentRef,
			});
			await act(() => {});
			expect(parentObservations).toEqual([true]);
			parentObservations.length = 0;

			await act(() => r.click('#nested-ref-swap'));
			await act(() => vi.advanceTimersByTime(150));
			expect(r.find('#nested-ref-fallback').textContent).toBe('loading');
			expect(childRef.current).toBeNull();

			await act(() => next.resolve('second'));
			expect(r.find('#nested-ref-parent').textContent).toBe('childsecond');
			expect(childRef.current).toBe(r.find('#nested-ref-child'));
			expect(parentObservations).toEqual([true]);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('setTransitionFallbackTimeout(Infinity) keeps the prior DOM forever (legacy hold)', async () => {
		// The opt-out path: setting the timeout to Infinity means the runtime
		// NEVER swaps to fallback. Useful for tests / UIs that prefer staleness
		// over visual disruption.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(Infinity);
		try {
			const initial = deferred<string>();
			initial.resolve('first');
			const next = deferred<string>();
			const r = mount(TimeoutFallback, {
				initialPromise: initial.promise,
				nextPromise: next.promise,
			});
			await act(() => {});
			await act(() => {
				r.click('#swap');
			});
			expect(r.find('.leaf').textContent).toBe('first');
			expect(r.find('#pending').textContent).toBe('1');

			// Advance time WAY past where any sensible timeout would fire.
			await act(() => {
				vi.advanceTimersByTime(60_000);
			});
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('.leaf').textContent).toBe('first');
			expect(r.find('#pending').textContent).toBe('1');

			// Eventually resolve — content swaps in cleanly.
			await act(() => {
				next.resolve('second');
			});
			expect(r.find('.leaf').textContent).toBe('second');
			expect(r.find('#pending').textContent).toBe('0');
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('keeps overlapping transition queues entangled after their fallbacks appear', async () => {
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initialA = deferred<string>();
			const initialB = deferred<string>();
			const pendingA = deferred<string>();
			const pendingB = deferred<string>();
			initialA.resolve('a1');
			initialB.resolve('b1');
			await Promise.resolve();
			const replacementA = Promise.resolve('a3') as Promise<string> & {
				status?: string;
				value?: string;
			};
			replacementA.status = 'fulfilled';
			replacementA.value = 'a3';
			const readyRef = { current: null as Element | null };
			const commitLog: string[] = [];

			const r = mount(TimedEntangledSupersession as any, {
				initialA: initialA.promise,
				initialB: initialB.promise,
				pendingA: pendingA.promise,
				pendingB: pendingB.promise,
				replacementA,
				readyRef,
				log: commitLog,
			});
			await act(() => {});
			r.click('#entangle-both');
			expect(r.find('#entangled-pending').textContent).toBe('1');
			expect(r.find('#entangled-a').textContent).toBe('A:a1');
			expect(r.find('#entangled-b').textContent).toBe('B:b1');

			await act(() => {
				vi.advanceTimersByTime(150);
			});
			expect(r.find('#entangled-a-fallback').textContent).toBe('A loading');
			expect(r.find('#entangled-b-fallback').textContent).toBe('B loading');

			// This transition overlaps A's queue from the still-pending fan-out.
			// It must not expose A's replacement until B can commit in the same reveal.
			r.click('#supersede-a');
			expect(r.find('#entangled-a-fallback').textContent).toBe('A loading');
			expect(r.find('#entangled-b-fallback').textContent).toBe('B loading');
			expect(r.find('#entangled-pending').textContent).toBe('1');
			expect(readyRef.current).toBeNull();
			expect(commitLog).toEqual([]);

			await act(() => {
				pendingB.resolve('b2');
			});
			expect(r.find('#entangled-a').textContent).toBe('A:a3');
			expect(r.find('#entangled-b').textContent).toBe('B:b2');
			expect(r.find('#entangled-pending').textContent).toBe('0');
			expect(readyRef.current).toBe(r.find('#entangled-a'));
			expect(commitLog).toEqual(['layout:a3']);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('invalidates a staged boundary when fresher hidden inputs suspend again', async () => {
		// Only the latest overlapping transition may finish; resolving an older
		// sibling must expose no intermediate state.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initialA = fulfilled('a1');
			const initialB = fulfilled('b1');
			const pendingA = deferred<string>();
			const pendingA2 = deferred<string>();
			const pendingB = deferred<string>();
			const readyRef = { current: null as Element | null };
			const commitLog: string[] = [];
			const r = mount(TimedEntangledSupersession as any, {
				initialA,
				initialB,
				pendingA: pendingA.promise,
				pendingA2: pendingA2.promise,
				pendingB: pendingB.promise,
				replacementA: fulfilled('a3'),
				readyRef,
				log: commitLog,
			});
			await act(() => {});
			r.click('#entangle-both');
			await act(() => vi.advanceTimersByTime(150));
			expect(r.find('#entangled-a-fallback').textContent).toBe('A loading');
			expect(r.find('#entangled-b-fallback').textContent).toBe('B loading');

			// A first proves a3 ready, then a newer transition replaces it with a4
			// which is pending. The old readiness must leave the global barrier.
			r.click('#supersede-a');
			r.click('#resuspend-a');
			await act(() => pendingB.resolve('b2'));
			expect(r.find('#entangled-a-fallback').textContent).toBe('A loading');
			expect(r.find('#entangled-b-fallback').textContent).toBe('B loading');
			expect(r.find('#entangled-pending').textContent).toBe('1');
			expect(readyRef.current).toBeNull();
			expect(commitLog).toEqual([]);

			await act(() => pendingA2.resolve('a4'));
			expect(r.find('#entangled-a').textContent).toBe('A:a4');
			expect(r.find('#entangled-b').textContent).toBe('B:b2');
			expect(r.find('#entangled-pending').textContent).toBe('0');
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('publishes fallback-hidden sibling refs and layouts after all reveal DOM in tree order', async () => {
		// Sibling boundaries reveal as one commit; lifecycle callbacks observe the
		// completed tree in source order.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const pendingA = deferred<string>();
			const pendingB = deferred<string>();
			const lifecycle: string[] = [];
			const revealLog: string[] = [];
			const commitLog: string[] = [];
			let r: ReturnType<typeof mount>;
			const readB = (phase: string) => {
				const fallbackVisible = r.findAll('#entangled-b-fallback').length !== 0;
				lifecycle.push(
					phase + ':' + (fallbackVisible ? 'fallback' : r.find('#entangled-b').textContent),
				);
			};
			const readyRef = (element: Element | null) => {
				if (element !== null) readB('ref');
			};
			r = mount(TimedEntangledSupersession as any, {
				initialA: fulfilled('a1'),
				initialB: fulfilled('b1'),
				pendingA: pendingA.promise,
				pendingA2: deferred<string>().promise,
				pendingB: pendingB.promise,
				replacementA: fulfilled('a3'),
				readyRef,
				log: commitLog,
				revealLog,
				onLayout: () => readB('layout'),
			});
			await act(() => {});
			revealLog.length = 0;
			r.click('#entangle-both');
			await act(() => vi.advanceTimersByTime(150));
			commitLog.length = 0;

			// Stage the right sibling first. The final commit still follows source
			// order A→B, and A's ref/layout cannot observe B's fallback.
			await act(() => pendingB.resolve('b2'));
			expect(revealLog).toEqual([]);
			await act(() => r.click('#supersede-a'));
			expect(lifecycle).toEqual(['ref:B:b2', 'layout:B:b2']);
			expect(revealLog).toEqual(['A', 'B']);
			expect(commitLog).toEqual(['layout:a3']);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('keeps every fallback staged through a dependent hidden retry', async () => {
		// Resolving one layer of an overlapping transition cannot reveal an
		// intermediate screen while a dependent use waits.
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initialA = fulfilled('a1');
			const initialB1 = fulfilled('old');
			const initialB2 = fulfilled('b1');
			const pendingA = deferred<string>();
			const pendingB1 = deferred<string>();
			const pendingB2 = deferred<string>();
			const refLog: string[] = [];
			const layoutLog: string[] = [];
			const readyRef = (element: Element | null) => refLog.push(element ? 'attach' : 'detach');
			const r = mount(TimedHiddenDependentGroup as any, {
				initialA,
				initialB1,
				pendingA: pendingA.promise,
				pendingB1: pendingB1.promise,
				secondFor: (key: string) => (key === 'old' ? initialB2 : pendingB2.promise),
				readyRef,
				log: layoutLog,
			});
			await act(() => {});
			r.click('#waterfall-start');
			await act(() => vi.advanceTimersByTime(150));
			refLog.length = 0;
			layoutLog.length = 0;

			await act(() => pendingA.resolve('a2'));
			await act(() => pendingB1.resolve('next'));
			expect(r.find('#waterfall-a-fallback').textContent).toBe('A loading');
			expect(r.find('#waterfall-b-fallback').textContent).toBe('B loading');
			expect(r.find('#waterfall-pending').textContent).toBe('1');
			expect(refLog).toEqual([]);
			expect(layoutLog).toEqual([]);

			await act(() => pendingB2.resolve('b2'));
			expect(r.find('#waterfall-a').textContent).toBe('A:a2');
			expect(r.find('#waterfall-b').textContent).toBe('B:b2');
			expect(r.find('#waterfall-pending').textContent).toBe('0');
			expect(refLog).toEqual(['attach']);
			expect(layoutLog).toEqual(['layout:A:a2', 'layout:B:b2']);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('commits catch refs and layouts when a fallback-hidden retry rejects', async () => {
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const rejected = deferred<string>();
			const refLog: string[] = [];
			const layoutLog: string[] = [];
			const catchRef = (element: Element | null) => {
				if (element !== null) refLog.push('attach:catch');
			};
			const r = mount(TimedHiddenRejection as any, {
				initialPromise: fulfilled('first'),
				rejectedPromise: rejected.promise,
				catchRef,
				log: layoutLog,
			});
			await act(() => {});
			r.click('#reject-swap');
			await act(() => vi.advanceTimersByTime(150));
			expect(r.find('#rejection-fallback').textContent).toBe('loading');

			await act(() => rejected.reject(new Error('boom')));
			expect(r.find('#timeout-catch').textContent).toBe('boom');
			expect(r.find('#rejection-pending').textContent).toBe('0');
			expect(refLog).toEqual(['attach:catch']);
			expect(layoutLog).toEqual(['layout:catch']);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('commits only the latest ref and insertion effect from superseded hidden retries', async () => {
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initialTail = deferred<string>();
			const initialOther = deferred<string>();
			const firstPendingTail = deferred<string>();
			const pendingTailA = deferred<string>();
			const pendingTailB = deferred<string>();
			const pendingOther = deferred<string>();
			initialTail.resolve('tail:initial');
			initialOther.resolve('other:initial');
			const refLog: string[] = [];
			const effectLog: string[] = [];
			const refA = (value: Element | null) => refLog.push('A:' + (value ? 'attach' : 'detach'));
			const refB = (value: Element | null) => refLog.push('B:' + (value ? 'attach' : 'detach'));

			const r = mount(TimedHiddenRetrySupersession as any, {
				initialTail: initialTail.promise,
				initialOther: initialOther.promise,
				firstPendingTail: firstPendingTail.promise,
				pendingTailA: pendingTailA.promise,
				pendingTailB: pendingTailB.promise,
				pendingOther: pendingOther.promise,
				refA,
				refB,
				effectLog,
			});
			await act(() => {});
			const preservedNode = r.find('#hidden-retry-ref');
			expect(refLog).toEqual([]);
			expect(effectLog).toEqual(['setup:old']);

			r.click('#hide-hidden-retry');
			await act(() => {
				vi.advanceTimersByTime(150);
			});
			expect(r.find('#hidden-retry-fallback').textContent).toBe('primary loading');
			expect(r.find('#hidden-retry-other-fallback').textContent).toBe('other loading');

			// Each retry mounts/updates the same ref-bearing node before a later
			// use() suspends. Neither speculative ref/effect may commit through the
			// visible fallback, and B supersedes A before the eventual reveal.
			r.click('#hidden-retry-a');
			expect(refLog).toEqual([]);
			expect(effectLog).toEqual(['setup:old']);
			r.click('#hidden-retry-b');
			expect(refLog).toEqual([]);
			expect(effectLog).toEqual(['setup:old']);

			await act(() => {
				pendingTailB.resolve('tail:b');
				pendingOther.resolve('other:ready');
			});
			expect(r.find('#hidden-retry-ref')).toBe(preservedNode);
			expect(r.find('#hidden-retry-ref').textContent).toBe('ref:b');
			expect(r.find('#hidden-retry-other').textContent).toBe('other:other:ready');
			expect(r.find('#hidden-retry-pending').textContent).toBe('0');
			expect(refLog).toEqual(['B:attach']);
			expect(effectLog).toEqual(['setup:old', 'cleanup:old', 'setup:b']);
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('rolls effect deps back when a held resume suspends again later in the tree', async () => {
		const prevTimeout = getTransitionFallbackTimeout();
		setTransitionFallbackTimeout(100);
		try {
			const initialA = deferred<string>();
			const initialB = deferred<string>();
			const pendingA = deferred<string>();
			const pendingB = deferred<string>();
			initialA.resolve('a1');
			initialB.resolve('b1');
			const log: string[] = [];
			const r = mount(TimedResumeEffectRollback as any, {
				initialA: initialA.promise,
				initialB: initialB.promise,
				pendingA: pendingA.promise,
				pendingB: pendingB.promise,
				log,
			});
			await act(() => {});
			expect(log).toEqual(['setup:old']);

			r.click('#resume-effect-swap');
			expect(r.find('#resume-effect-pending').textContent).toBe('1');
			expect(r.findAll('#resume-effect-fallback')).toHaveLength(0);

			// A's retry reaches the deps-changed effect, then B suspends later.
			// Its captured work is discarded and the old committed effect stays live.
			await act(() => pendingA.resolve('a2'));
			expect(log).toEqual(['setup:old']);
			expect(r.findAll('#resume-effect-fallback')).toHaveLength(0);

			// Replaying the same "new" deps after B resolves must still enqueue the
			// effect, proving the discarded retry did not advance the hook cell.
			await act(() => pendingB.resolve('b2'));
			expect(log).toEqual(['setup:old', 'cleanup:old', 'setup:new']);
			expect(r.find('#resume-effect-pending').textContent).toBe('0');
			r.unmount();
		} finally {
			setTransitionFallbackTimeout(prevTimeout);
		}
	});

	it('default timeout is 5000ms', () => {
		// Pin the default constant so a future change is intentional.
		expect(getTransitionFallbackTimeout()).toBe(5000);
	});
});
