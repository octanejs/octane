import { describe, it, expect, vi } from 'vitest';
import { mount, act, createLog } from './_helpers';
import { flushSync } from '../src/index.js';
import {
	TransitionBasics,
	DeferredSpawnListenerApp,
	TransitionKeepsDom,
	AsyncActionKeepsCommittedState,
	StandaloneStartTransition,
	DeferredValueWithSuspense,
	UrgentPreemptsTransition,
	EntangledTransitions,
	IsPendingThroughReplay,
	NestedTransitions,
	DeferredValueInTransition,
	UrgentSupersedesTransition,
	AsyncStartTransition,
	AsyncTransitionKeepsDom,
	TransitionAtomicity,
	TransitionResumeAtomicity,
	TransitionNamespacedAttr,
	TransitionControlledInput,
	TransitionRadioGroup,
	TransitionKeyedRemoval,
	TransitionListToEmpty,
	TransitionKeyedAddition,
	TransitionKeyedEmptyFill,
	TransitionArrayModeExit,
	TransitionOutsideBoundary,
} from './_fixtures/transitions.tsrx';

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

describe('useTransition — basics', () => {
	it('returns [isPending=false, start]; start runs fn and tags renders as transition', async () => {
		const r = mount(TransitionBasics);
		expect(r.find('#n').textContent).toBe('0');
		expect(r.find('#pending').textContent).toBe('idle');

		// Urgent setter: synchronous, no transition.
		r.click('#bump-urgent');
		expect(r.find('#n').textContent).toBe('1');
		expect(r.find('#pending').textContent).toBe('idle');

		// Transition setter: isPending flips true synchronously (in the same
		// commit that increments n), then back to false after the microtask.
		r.click('#bump-transition');
		expect(r.find('#n').textContent).toBe('11');
		expect(r.find('#pending').textContent).toBe('pending');
		await act(() => {});
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

describe('useTransition — keeps prior DOM during suspended transition', () => {
	it('on swap, OLD value stays visible while NEW promise loads; isPending=true throughout', async () => {
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		// d1 already resolved up front so initial render commits without suspense.
		d1.resolve('one');
		await Promise.resolve();
		const r = mount(TransitionKeepsDom, { initialPromise: d1.promise, nextPromise: d2.promise });
		await act(() => {});
		expect(r.find('#value').textContent).toBe('one');
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.findAll('#fallback')).toHaveLength(0);

		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			// Swap inside startTransition. d2 is still pending — the render suspends
			// but DOM stays mounted (no fallback) and isPending flips true.
			r.click('#swap');
			expect(r.find('#value').textContent).toBe('one'); // OLD value held
			expect(r.findAll('#fallback')).toHaveLength(0); // no fallback flash
			expect(r.find('#pending').textContent).toBe('pending');

			// Resolve d2 — DOM updates to new value, isPending returns to idle.
			await act(() => {
				d2.resolve('two');
			});
			expect(r.find('#value').textContent).toBe('two');
			expect(r.find('#pending').textContent).toBe('idle');
			expect(
				error.mock.calls.filter(([message]) =>
					String(message).includes('Cannot update a component'),
				),
			).toEqual([]);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	it('initial mount that suspends — even inside a transition — still shows fallback', async () => {
		// First load has no prior content to keep. Transition or not, the
		// pending fallback must show on initial suspend.
		const d = deferred<string>();
		const r = mount(TransitionKeepsDom, { initialPromise: d.promise, nextPromise: d.promise });
		expect(r.find('#fallback').textContent).toBe('fallback');
		await act(() => {
			d.resolve('first');
		});
		expect(r.find('#value').textContent).toBe('first');
		r.unmount();
	});
});

describe('useTransition — async Action commit atomicity', () => {
	it('keeps parent state and suspended child on the committed screen until the Action settles', async () => {
		const initial = deferred<string>();
		const next = deferred<string>();
		const stage = deferred<void>();
		initial.resolve('overview-content');
		await Promise.resolve();
		const r = mount(AsyncActionKeepsCommittedState, {
			initialSelection: { id: 'overview', promise: initial.promise },
			nextSelection: { id: 'activity', promise: next.promise },
			stageGate: stage.promise,
		});
		await act(() => {});
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#parent-selection').textContent).toBe('overview');
		expect(r.find('#reducer-selection').textContent).toBe('overview');
		expect(r.find('#action-count').textContent).toBe('0');
		expect(r.find('#action-value').textContent).toBe('overview-content');

		r.click('#swap-action');
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.find('#parent-selection').textContent).toBe('overview');
		expect(r.find('#reducer-selection').textContent).toBe('overview');
		expect(r.find('#action-count').textContent).toBe('0');
		expect(r.find('#action-value').textContent).toBe('overview-content');
		expect(r.findAll('#action-fallback')).toHaveLength(0);

		// A transition explicitly started after await joins the Action batch.
		await act(() => stage.resolve());
		expect(r.find('#parent-selection').textContent).toBe('overview');
		expect(r.find('#reducer-selection').textContent).toBe('overview');
		expect(r.find('#action-value').textContent).toBe('overview-content');

		// A discrete urgent update still commits and the queued functional update
		// rebases on top of it when the Action settles.
		r.click('#urgent-count');
		expect(r.find('#action-count').textContent).toBe('1');

		await act(() => next.resolve('activity-content'));
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#parent-selection').textContent).toBe('activity');
		expect(r.find('#reducer-selection').textContent).toBe('activity');
		expect(r.find('#action-count').textContent).toBe('11');
		expect(r.find('#action-value').textContent).toBe('activity-content');
		expect(r.findAll('#action-fallback')).toHaveLength(0);
		r.unmount();
	});
});

describe('startTransition — standalone function', () => {
	it('matches useTransition.start for suspense behavior', async () => {
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		d1.resolve('alpha');
		await Promise.resolve();
		const r = mount(StandaloneStartTransition, {
			initialPromise: d1.promise,
			nextPromise: d2.promise,
		});
		await act(() => {});
		expect(r.find('#value').textContent).toBe('alpha');

		r.click('#swap');
		expect(r.find('#value').textContent).toBe('alpha'); // kept
		expect(r.findAll('#fallback')).toHaveLength(0);

		await act(() => {
			d2.resolve('beta');
		});
		expect(r.find('#value').textContent).toBe('beta');
		r.unmount();
	});
});

describe('useDeferredValue — transition-priority deferral', () => {
	it('returns previous value with isStale=true; deferred commit suspends without tearing down', async () => {
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		d1.resolve('first');
		await Promise.resolve();
		const r = mount(DeferredValueWithSuspense, { promise: d1.promise });
		await act(() => {});
		expect(r.find('#value').textContent).toBe('first');
		expect(r.find('#value').className).toBe('fresh');

		// Update with a new pending promise. The FIRST render returns the prior
		// value via useDeferredValue (no suspend; stale flag set). A microtask
		// later, useDeferredValue commits the new value via startTransition;
		// that suspends but keeps the prior DOM.
		r.update(DeferredValueWithSuspense, { promise: d2.promise });
		expect(r.find('#value').textContent).toBe('first'); // prior value
		expect(r.find('#value').className).toBe('stale'); // stale flag
		expect(r.findAll('#fallback')).toHaveLength(0); // no fallback flash

		await act(() => {
			d2.resolve('second');
		});
		expect(r.find('#value').textContent).toBe('second');
		expect(r.find('#value').className).toBe('fresh');
		expect(r.findAll('#fallback')).toHaveLength(0);
		r.unmount();
	});
});

describe('useTransition — urgent preempts', () => {
	it('an urgent setter after a transition setter forces fallback on suspend', async () => {
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		d1.resolve('alpha');
		await Promise.resolve();
		const r = mount(UrgentPreemptsTransition, {
			initialPromise: d1.promise,
			nextPromise: d2.promise,
		});
		await act(() => {});
		const value = r.find('#value') as HTMLElement;
		expect(value.textContent).toBe('alpha');

		// Urgent swap: no transition wrapping → suspending render falls back to
		// the pending arm immediately while retaining the committed primary host.
		r.click('#swap-urgent');
		expect(r.find('#fallback').textContent).toBe('fallback');
		expect(r.find('#value')).toBe(value);
		expect(value.isConnected).toBe(true);
		expect(value.style.display).toBe('none');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// React edge-case ports — cited inline with their `it(...)` titles from
// facebook/react. These exercise behaviors that distinguish "transitions
// work for one promise" from "transitions correctly entangle multiple
// suspensions".
// ---------------------------------------------------------------------------

describe('Transitions — multiple-suspend edge cases', () => {
	it('entangles sibling boundaries: holds ALL prior content until every sibling resolves, then reveals together', async () => {
		// Port of ReactTransition-test.js:456 "when multiple transitions update
		// overlapping queues, all the transitions across all the queues are
		// entangled". A single startTransition causes two
		// sibling try-blocks to suspend; isPending stays true until both promises
		// resolve, AND — per React's atomic-commit contract — BOTH siblings keep
		// their old content until BOTH resolve, then reveal together. The user
		// never sees a half-updated screen mid-transition. octane matches this via
		// the entangled-commit barrier (HELD_TRANSITIONS / STAGED_REVEALS): a held
		// boundary whose data resolves first DEFERS its reveal until the whole
		// group is data-ready. (Was SUSPENSE_DIVERGENCE.md #1 — now closed.)
		const da1 = deferred<string>(),
			db1 = deferred<string>();
		const da2 = deferred<string>(),
			db2 = deferred<string>();
		da1.resolve('a1');
		db1.resolve('b1');
		await Promise.resolve();
		const r = mount(EntangledTransitions, {
			initialA: da1.promise,
			initialB: db1.promise,
			nextA: da2.promise,
			nextB: db2.promise,
		});
		await act(() => {});
		expect(r.find('.ent-a').textContent).toBe('A:a1');
		expect(r.find('.ent-b').textContent).toBe('B:b1');
		expect(r.find('#pending').textContent).toBe('0');

		// Trigger entangled transition.
		r.click('#swap-both');
		expect(r.find('#pending').textContent).toBe('1');
		// OLD values held; no fallback shown for either sibling.
		expect(r.find('.ent-a').textContent).toBe('A:a1');
		expect(r.find('.ent-b').textContent).toBe('B:b1');
		expect(r.findAll('.ent-a-load')).toHaveLength(0);
		expect(r.findAll('.ent-b-load')).toHaveLength(0);

		// Resolve A only: A's reveal is DEFERRED (held in the entangled group). BOTH
		// siblings still show their OLD content; isPending still 1.
		await act(() => {
			da2.resolve('a2');
		});
		expect(r.find('.ent-a').textContent).toBe('A:a1'); // HELD until B is ready too
		expect(r.find('.ent-b').textContent).toBe('B:b1');
		expect(r.find('#pending').textContent).toBe('1');

		// Resolve B: now the whole group is data-ready → A and B reveal TOGETHER,
		// isPending drops.
		await act(() => {
			db2.resolve('b2');
		});
		expect(r.find('.ent-a').textContent).toBe('A:a2');
		expect(r.find('.ent-b').textContent).toBe('B:b2');
		expect(r.find('#pending').textContent).toBe('0');
		r.unmount();
	});

	it('isPending stays true across replay when a second use() suspends in the same body', async () => {
		// Port of ReactUse-test.js:2118 "does not get stuck in pending state
		// after `use` suspends". The body has TWO use() calls; the first
		// resolves and triggers replay, the second then suspends. isPending
		// must remain true through both suspensions, and the DOM must stay
		// mounted (no fallback) for the entire transition.
		const a1 = deferred<string>(),
			b1 = deferred<string>();
		const a2 = deferred<string>(),
			b2 = deferred<string>();
		a1.resolve('A1');
		b1.resolve('B1');
		await Promise.resolve();
		const r = mount(IsPendingThroughReplay, {
			initialA: a1.promise,
			initialB: b1.promise,
			nextA: a2.promise,
			nextB: b2.promise,
		});
		await act(() => {});
		expect(r.find('#value').textContent).toBe('A1/B1');
		expect(r.find('#pending').textContent).toBe('0');

		r.click('#swap');
		// First use(a2) is pending. DOM held, isPending true.
		expect(r.find('#value').textContent).toBe('A1/B1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('1');

		// Resolve A2: replay re-enters the body. First use() returns A2 from
		// cache. Second use(b2) now suspends. DOM must STILL stay held.
		await act(() => {
			a2.resolve('A2');
		});
		expect(r.find('#value').textContent).toBe('A1/B1'); // still old
		expect(r.findAll('#fallback')).toHaveLength(0); // NO fallback flash
		expect(r.find('#pending').textContent).toBe('1'); // still pending

		await act(() => {
			b2.resolve('B2');
		});
		expect(r.find('#value').textContent).toBe('A2/B2');
		expect(r.find('#pending').textContent).toBe('0');
		r.unmount();
	});

	it('nested startTransition — BOTH useTransition hooks see isPending=true', async () => {
		// Port of ReactTransition-test.js:944 "tracks two pending flags for
		// nested startTransition". Both flags must be true while the inner
		// transition is processing, both flip to false on commit.
		const r = mount(NestedTransitions, { target: 42 });
		expect(r.find('#pending-a').textContent).toBe('A:0');
		expect(r.find('#pending-b').textContent).toBe('B:0');
		expect(r.find('#n').textContent).toBe('0');

		r.click('#nest');
		// Synchronously after the click: setN(42) committed at transition prio.
		// Both useTransition hooks observe the global pending count > 0.
		expect(r.find('#n').textContent).toBe('42');
		expect(r.find('#pending-a').textContent).toBe('A:1');
		expect(r.find('#pending-b').textContent).toBe('B:1');

		// After the microtask drain: both transitions release, both flags flip.
		await act(() => {});
		expect(r.find('#pending-a').textContent).toBe('A:0');
		expect(r.find('#pending-b').textContent).toBe('B:0');
		r.unmount();
	});

	it('urgent setState during a suspended transition discards the transition (no clobber on resolve)', async () => {
		// Port of ReactUse-test.js:1794 "updates while component is suspended
		// should not be mistaken for render phase updates". When a transition
		// suspends on promise B and an urgent setter swaps to promise C, the
		// transition is superseded: isPending drops, C commits, and when B
		// eventually resolves nothing happens (the retry no-ops because we
		// cleared `pendingThenable` on the urgent commit).
		const initial = deferred<string>();
		const transP = deferred<string>();
		const urgentP: any = Promise.resolve('C');
		urgentP.status = 'fulfilled';
		urgentP.value = 'C';
		initial.resolve('A');
		await Promise.resolve();
		const r = mount(UrgentSupersedesTransition, {
			initialPromise: initial.promise,
			transitionPromise: transP.promise,
			urgentPromise: urgentP,
		});
		await act(() => {});
		expect(r.find('#value').textContent).toBe('A');
		expect(r.find('#pending').textContent).toBe('0');

		// Start the transition (suspends on B).
		r.click('#swap-trans');
		expect(r.find('#value').textContent).toBe('A'); // old held
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('1');

		// Urgent supersede: setPromise(C). C is pre-tagged fulfilled so the
		// urgent render commits SYNCHRONOUSLY with C visible. The held suspend
		// counter is released immediately; the transition's own outstanding
		// counter drains on the next microtask.
		r.click('#swap-urgent');
		expect(r.find('#value').textContent).toBe('C'); // urgent committed
		expect(r.findAll('#fallback')).toHaveLength(0);
		// Drain the startTransition's queued microtask decrement — same shape as
		// React's tests, which await act() between flushSync and the assertion.
		await act(() => {});
		expect(r.find('#pending').textContent).toBe('0'); // transition discarded

		// Now resolve the OLD transition promise B. Nothing should happen:
		// the retry's pendingThenable check returns early because we cleared it
		// when the urgent render committed.
		await act(() => {
			transP.resolve('B');
		});
		expect(r.find('#value').textContent).toBe('C'); // still C, not B
		expect(r.find('#pending').textContent).toBe('0');
		r.unmount();
	});

	it('useDeferredValue does NOT defer when called during a transition render', async () => {
		// Port of ReactDeferredValue-test.js:171 "does not defer during a
		// transition". When the source render is already transition-priority,
		// useDeferredValue should commit the new value in the SAME pass
		// (Original and Deferred both update together).
		const r = mount(DeferredValueInTransition);
		expect(r.find('#original').textContent).toBe('Original: 1');
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');

		// Bump via transition — both should update together.
		r.click('#bump');
		expect(r.find('#original').textContent).toBe('Original: 2');
		expect(r.find('#deferred').textContent).toBe('Deferred: 2'); // NOT 1!
		r.unmount();
	});

	it("deferred-swap 'deferred lane' tag does not leak to useTransition listener renders", async () => {
		// Regression (PR review): spawnDeferredSwap's DEFERRED_SPAWN flag must
		// wrap ONLY the scheduleRender for the deferred block. startTransition
		// synchronously notifies useTransition listeners (tickTransitionCount)
		// before running its callback; those listeners scheduleRender their own
		// blocks. If the flag covered the whole startTransition call, the
		// probe's render would be tagged as a deferred pass and a
		// useDeferredValue mounting in it would wrongly skip its preview state.
		const log = createLog();
		let setValue!: (v: number) => void;
		const r = mount(DeferredSpawnListenerApp, {
			expose: (s: any) => (setValue = s),
			log: log.push,
		});
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');
		expect(r.find('#probe-idle').textContent).toBe('idle');

		// Urgent update → useDeferredValue defers and spawns its swap. The swap's
		// startTransition flips isPending true, mounting the probe's inner
		// useDeferredValue in the SAME flush as the deferred pass.
		flushSync(() => setValue(2));
		expect(r.find('#deferred').textContent).toBe('Deferred: 1');
		await act(() => {});
		expect(r.find('#deferred').textContent).toBe('Deferred: 2');
		const entries = log.drain();
		r.unmount();
		// The probe is NOT part of the deferred pass — its preview must render.
		expect(entries[0]).toBe('render:Preview');
	});
});

describe('useTransition — async actions (React 19)', () => {
	it('holds isPending true until the async action promise resolves, then commits', async () => {
		const gate = deferred<void>();
		const r = mount(AsyncStartTransition, { gate: gate.promise });
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#n').textContent).toBe('0');

		// Click — the action runs its synchronous slice, then awaits the gate.
		r.click('#go');
		expect(r.find('#pending').textContent).toBe('pending');

		// Drain microtasks WITHOUT settling the action promise. The old code
		// dropped isPending on a fixed microtask here; the fix keeps it pending
		// until the returned promise settles. n must not have changed yet.
		await act(() => {});
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.find('#n').textContent).toBe('0');

		// Settle the action — the awaited setter commits and isPending drops.
		await act(() => {
			gate.resolve();
		});
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#n').textContent).toBe('1');
		r.unmount();
	});

	it('drops isPending when the async action promise rejects (decrements exactly once)', async () => {
		const gate = deferred<void>();
		const r = mount(AsyncStartTransition, { gate: gate.promise });

		r.click('#go');
		expect(r.find('#pending').textContent).toBe('pending');
		await act(() => {});
		expect(r.find('#pending').textContent).toBe('pending');

		// Reject the gate — the action's promise rejects; isPending must still
		// drop (settle handles both fulfil and reject), and the setter never ran.
		await act(() => {
			gate.reject(new Error('action failed'));
		});
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#n').textContent).toBe('0');
		r.unmount();
	});

	it('post-await setters keep transition priority (suspending render holds prior DOM, no fallback)', async () => {
		const gate = deferred<void>();
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		// d1 resolved up front so the initial mount commits without suspense.
		d1.resolve('one');
		await Promise.resolve();
		const r = mount(AsyncTransitionKeepsDom, {
			initialPromise: d1.promise,
			nextPromise: d2.promise,
			gate: gate.promise,
		});
		await act(() => {});
		expect(r.find('#value').textContent).toBe('one');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// Run the async action. After the gate resolves, the post-await
		// setPromise schedules a render that reads the still-pending d2 and
		// suspends. TRANSITION_DEPTH is already 0 here — only the async-action
		// priority window keeps this render at transition priority, so the prior
		// DOM ('one') must stay and NO fallback may appear. Before the fix this
		// render was urgent and would flash #fallback.
		r.click('#go');
		await act(() => {
			gate.resolve();
		});
		expect(r.find('#value').textContent).toBe('one'); // OLD value held
		expect(r.findAll('#fallback')).toHaveLength(0); // proves transition priority
		expect(r.find('#pending').textContent).toBe('pending');

		// Resolve the new promise — DOM updates and isPending returns to idle.
		await act(() => {
			d2.resolve('two');
		});
		expect(r.find('#value').textContent).toBe('two');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

describe('useTransition — the old screen stays whole', () => {
	it('keeps each committed screen whole across successive suspended transitions', async () => {
		for (const label of ['first', 'second']) {
			const initial = deferred<string>();
			const next = deferred<string>();
			const log = createLog();
			initial.resolve(`${label}-zero`);
			await Promise.resolve();
			const r = mount(TransitionOutsideBoundary, {
				load: (step: number) => (step === 0 ? initial.promise : next.promise),
				log: log.push,
			});
			await act(() => {});
			expect(r.find('#shell').textContent).toBe('shell-0');
			expect(r.find('#value').textContent).toBe(`${label}-zero`);
			expect(log.drain()).toEqual(['effect:0']);

			r.click('#bump');
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('#shell').textContent).toBe('shell-0');
			expect(r.find('#value').textContent).toBe(`${label}-zero`);
			await act(() => {});
			expect(log.drain()).toEqual([]);

			await act(() => next.resolve(`${label}-one`));
			expect(r.find('#shell').textContent).toBe('shell-1');
			expect(r.find('#value').textContent).toBe(`${label}-one`);
			expect(log.drain()).toEqual(['effect:1']);
			r.unmount();
		}
	});

	it('a parent that renders in place does not update before its suspended child', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const promises = [first.promise, second.promise];
		const load = (version: number) => promises[version];

		const r = mount(TransitionAtomicity, { load });
		await act(() => {
			first.resolve('one');
		});
		expect(r.find('#panel').getAttribute('data-version')).toBe('0');
		expect(r.find('#heading').textContent).toBe('v0');
		expect(r.find('#value').textContent).toBe('one');

		// The transition bumps to v1 and the child suspends on the new promise.
		// The panel is the same component, so today it patches its own attribute
		// and heading on the way down and leaves them ahead of the held value.
		r.click('#bump');
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#value').textContent).toBe('one');
		expect(r.find('#panel').getAttribute('data-version')).toBe('0');
		expect(r.find('#heading').textContent).toBe('v0');

		// Once the promise settles the whole screen moves to v1 together.
		await act(() => {
			second.resolve('two');
		});
		expect(r.find('#panel').getAttribute('data-version')).toBe('1');
		expect(r.find('#heading').textContent).toBe('v1');
		expect(r.find('#value').textContent).toBe('two');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('a boundary replaying its body does not commit one resolved value beside an old one', async () => {
		const entries = new Map<string, Deferred<string>>();
		const load = (name: string, step: number) => {
			const key = `${name}${step}`;
			let entry = entries.get(key);
			if (entry === undefined) {
				entry = deferred<string>();
				entries.set(key, entry);
			}
			return entry.promise;
		};
		load('a', 0);
		load('b', 0);
		entries.get('a0')!.resolve('a0');
		entries.get('b0')!.resolve('b0');

		const r = mount(TransitionResumeAtomicity, { load });
		await act(() => {});
		expect(r.find('#a').textContent).toBe('a0');
		expect(r.find('#b').textContent).toBe('b0');

		// Both leaves move to step 1 and both suspend, so the boundary holds.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#a').textContent).toBe('a0');
		expect(r.find('#b').textContent).toBe('b0');

		// Only the first leaf's data arrives. The replay renders it and then
		// suspends again on the second, which must leave the boundary untouched
		// rather than showing the new value next to the old one.
		await act(() => {
			entries.get('a1')!.resolve('a1');
		});
		expect(r.find('#a').textContent).toBe('a0');
		expect(r.find('#b').textContent).toBe('b0');
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// Second one lands and both step together.
		await act(() => {
			entries.get('b1')!.resolve('b1');
		});
		expect(r.find('#a').textContent).toBe('a1');
		expect(r.find('#b').textContent).toBe('b1');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('restores a namespaced attribute onto the same attribute, not a plain copy', async () => {
		const XLINK = 'http://www.w3.org/1999/xlink';
		const entries = new Map<number, Deferred<string>>();
		const load = (step: number) => {
			let entry = entries.get(step);
			if (entry === undefined) {
				entry = deferred<string>();
				entries.set(step, entry);
			}
			return entry.promise;
		};
		load(0);
		entries.get(0)!.resolve('zero');

		const r = mount(TransitionNamespacedAttr, { load });
		await act(() => {});
		const use = r.find('#use-el');
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#icon-0');

		// The transition patches the attribute and then the sibling suspends, so
		// the undo has to put '#icon-0' back on the namespaced attribute itself.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#icon-0');
		expect(use.getAttribute('xlink:href')).toBe('#icon-0');
		// A plain restore alongside the namespaced one would show up as a second
		// attribute with a null namespace.
		expect(use.attributes.length).toBe(2);
		expect(use.getAttributeNode('xlink:href')!.namespaceURI).toBe(XLINK);

		await act(() => {
			entries.get(1)!.resolve('one');
		});
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#icon-1');
		expect(use.getAttributeNode('xlink:href')!.namespaceURI).toBe(XLINK);
		expect(r.find('#value').textContent).toBe('one');
		r.unmount();
	});

	it('holds a controlled input and checkbox, records included', async () => {
		const entries = new Map<number, Deferred<string>>();
		const load = (step: number) => {
			let entry = entries.get(step);
			if (entry === undefined) {
				entry = deferred<string>();
				entries.set(step, entry);
			}
			return entry.promise;
		};
		load(0);
		entries.get(0)!.resolve('zero');

		const r = mount(TransitionControlledInput, { load });
		await act(() => {});
		const text = r.find('#text') as HTMLInputElement;
		const box = r.find('#box') as HTMLInputElement;
		expect(text.value).toBe('step-0');
		expect(box.checked).toBe(false);

		// The transition projects step 1 onto both controls and then the sibling
		// suspends, so both have to go back to step 0.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(text.value).toBe('step-0');
		expect(text.defaultValue).toBe('step-0');
		expect(box.checked).toBe(false);
		expect(box.defaultChecked).toBe(false);

		// The per-element record has to come back too. If it still believed it had
		// projected 'step-1', re-projecting that same value would be skipped as
		// unchanged and the input would stay on step-0 forever.
		await act(() => {
			entries.get(1)!.resolve('one');
		});
		expect(text.value).toBe('step-1');
		expect(box.checked).toBe(true);
		expect(r.find('#value').textContent).toBe('one');
		r.unmount();
	});

	it('holds a radio group, including the cousin the platform cleared', async () => {
		const entries = new Map<number, Deferred<string>>();
		const load = (step: number) => {
			let entry = entries.get(step);
			if (entry === undefined) {
				entry = deferred<string>();
				entries.set(step, entry);
			}
			return entry.promise;
		};
		load(0);
		entries.get(0)!.resolve('zero');

		const r = mount(TransitionRadioGroup, { load });
		await act(() => {});
		const a = r.find('#r-a') as HTMLInputElement;
		const b = r.find('#r-b') as HTMLInputElement;
		expect(a.checked).toBe(false);
		expect(b.checked).toBe(true);

		// Step 1 checks a, which makes the platform clear b before b's own
		// binding runs. The boundary then suspends, so the group has to go back
		// to b — not to nothing selected.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(a.checked).toBe(false);
		expect(b.checked).toBe(true);

		await act(() => {
			entries.get(1)!.resolve('one');
		});
		expect(a.checked).toBe(true);
		expect(b.checked).toBe(false);
		r.unmount();
	});

	it('brings back a keyed row the transition dropped before the boundary held', async () => {
		// Step 0 is a pre-fulfilled thenable so the FIRST mount commits without
		// suspending: the rows' effects must actually mount for the cleanup
		// assertion below to mean anything. (A first mount that suspends loses
		// those mount effects today — that is a separate pre-existing bug.)
		const step1 = deferred<string>();
		const fulfilled = { status: 'fulfilled', value: 'zero', then: (cb: any) => cb('zero') };
		const load = (step: number) => (step === 0 ? fulfilled : step1.promise);
		const log = createLog();
		const ids = () => r.findAll('#list li').map((li) => li.id);

		const r = mount(TransitionKeyedRemoval, { load, log: log.push });
		await act(() => {});
		expect(ids()).toEqual(['row-a', 'row-b', 'row-c']);
		expect(r.find('#row-b').textContent).toBe('b!');
		expect(log.drain()).toEqual(['mount:a', 'mount:b', 'mount:c']);

		// The list drops b, then the sibling suspends and the boundary holds. The
		// row has to come back, keep the state it had, and not have torn down.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(ids()).toEqual(['row-a', 'row-b', 'row-c']);
		expect(r.find('#row-b').textContent).toBe('b!');
		expect(log.drain()).toEqual([]);

		// Once the sibling settles the removal goes through for real.
		await act(() => {
			step1.resolve('one');
		});
		expect(ids()).toEqual(['row-a', 'row-c']);
		await act(() => {});
		expect(log.drain()).toEqual(['cleanup:b']);
		r.unmount();
	});

	it('holds a list that emptied, and swaps to @empty only on commit', async () => {
		const step1 = deferred<string>();
		const fulfilled = { status: 'fulfilled', value: 'zero', then: (cb: any) => cb('zero') };
		const load = (step: number) => (step === 0 ? fulfilled : step1.promise);
		const log = createLog();

		const r = mount(TransitionListToEmpty, { load, log: log.push });
		await act(() => {});
		expect(r.findAll('#list li').map((li) => li.id)).toEqual(['row-a', 'row-b']);
		expect(log.drain()).toEqual(['mount:a', 'mount:b']);

		// The whole list clears and @empty mounts, then the sibling suspends. The
		// rows come back and the empty branch goes — with no cleanups run.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.findAll('#list li').map((li) => li.id)).toEqual(['row-a', 'row-b']);
		expect(r.findAll('#empty')).toHaveLength(0);
		expect(log.drain()).toEqual([]);

		await act(() => {
			step1.resolve('one');
		});
		expect(r.findAll('#list li').map((li) => li.id)).toEqual(['empty']);
		expect(r.find('#empty').textContent).toBe('nothing');
		await act(() => {});
		expect(log.drain()).toEqual(['cleanup:a', 'cleanup:b']);
		r.unmount();
	});

	it('tears down a row the aborted attempt freshly mounted, effects unfired', async () => {
		// Step 0 unwraps synchronously so the FIRST mount never suspends — this
		// test is about the transition's aborted attempt, not initial mount.
		const fulfilled = {
			status: 'fulfilled',
			value: 'zero',
			then: (fn: (v: string) => void) => void fn('zero'),
		} as unknown as Promise<string>;
		const d1 = deferred<string>();
		const load = (step: number) => (step === 0 ? fulfilled : d1.promise);
		const log = createLog();
		const ids = () => r.findAll('#list li').map((li) => li.id);

		const r = mount(TransitionKeyedAddition, { load, log: log.push });
		await act(() => {});
		expect(ids()).toEqual(['row-a']);
		expect(log.drain()).toEqual(['mount:a']);

		// The attempt mounts d, then the sibling suspends and the boundary holds.
		// d's DOM comes out — and its queued mount effect must go with it, or it
		// fires for a row that is not on screen and can never be cleaned up.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(ids()).toEqual(['row-a']);
		await act(() => {});
		expect(log.drain()).toEqual([]);

		// The real commit mounts d fresh, exactly once.
		await act(() => {
			d1.resolve('one');
		});
		expect(ids()).toEqual(['row-a', 'row-d']);
		expect(log.drain()).toEqual(['mount:d']);

		r.unmount();
		await act(() => {});
		expect(log.drain()).toEqual(['cleanup:a', 'cleanup:d']);
	});

	it('holds an empty list empty when the attempt filled it before suspending', async () => {
		const fulfilled = {
			status: 'fulfilled',
			value: 'zero',
			then: (fn: (v: string) => void) => void fn('zero'),
		} as unknown as Promise<string>;
		const d1 = deferred<string>();
		const load = (step: number) => (step === 0 ? fulfilled : d1.promise);
		const log = createLog();
		const ids = () => r.findAll('#list li').map((li) => li.id);

		const r = mount(TransitionKeyedEmptyFill, { load, log: log.push });
		await act(() => {});
		expect(ids()).toEqual([]);

		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(ids()).toEqual([]);
		await act(() => {});
		expect(log.drain()).toEqual([]);

		await act(() => {
			d1.resolve('one');
		});
		expect(ids()).toEqual(['row-d']);
		expect(log.drain()).toEqual(['mount:d']);
		r.unmount();
	});

	it('a slot leaving array mode tears down inline, and the hold re-asserts the screen', async () => {
		const fulfilled = {
			status: 'fulfilled',
			value: 'zero',
			then: (fn: (v: string) => void) => void fn('zero'),
		} as unknown as Promise<string>;
		const d1 = deferred<string>();
		const load = (step: number) => (step === 0 ? fulfilled : d1.promise);
		const log = createLog();

		const r = mount(TransitionArrayModeExit, { load, log: log.push });
		await act(() => {});
		expect(r.findAll('#host li').map((li) => li.id)).toEqual(['row-a', 'row-b']);
		expect(log.drain()).toEqual(['render:tail:0', 'mount:a', 'mount:b']);

		// The flip discards the slot itself, so its teardown runs inline with the
		// attempt — layout cleanups before the tail's render. The hold then
		// re-asserts the whole old screen: the rows come back as fresh mounts.
		// Their state does not survive (the flip destroyed it, and a kind flip is
		// not journaled), but the held screen is whole, which the old plain-text
		// tear never was.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(log.drain()).toEqual([
			'cleanup:a',
			'cleanup:b',
			'render:tail:1',
			'render:tail:0',
			'mount:a',
			'mount:b',
		]);
		expect(r.find('#host').textContent).toBe('ab');
		expect(r.find('#value').textContent).toBe('zero');

		await act(() => {
			d1.resolve('one');
		});
		// The promotion replays the flip for real: same inline teardown order.
		expect(r.find('#host').textContent).toBe('plain');
		expect(r.find('#value').textContent).toBe('one');
		expect(log.drain()).toEqual(['cleanup:a', 'cleanup:b', 'render:tail:1']);

		// Every mount above has exactly one matching cleanup; nothing left over.
		r.unmount();
		await act(() => {});
		expect(log.drain()).toEqual([]);
	});

	it('holds the shell outside the boundary, and does not leak the aborted attempt', async () => {
		const fulfilled = {
			status: 'fulfilled',
			value: 'zero',
			then: (fn: (v: string) => void) => void fn('zero'),
		} as unknown as Promise<string>;
		const d1 = deferred<string>();
		const loadCalls: number[] = [];
		const load = (step: number) => {
			loadCalls.push(step);
			return step === 0 ? fulfilled : d1.promise;
		};
		const log = createLog();

		const r = mount(TransitionOutsideBoundary, { load, log: log.push });
		await act(() => {});
		expect(r.find('#shell').textContent).toBe('shell-0');
		expect(r.find('#value').textContent).toBe('zero');
		expect(log.drain()).toEqual(['effect:0']);

		// The shell is outside the boundary. The whole screen holds: shell text,
		// held value, and no effect from the aborted attempt.
		r.click('#bump');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#shell').textContent).toBe('shell-0');
		expect(r.find('#value').textContent).toBe('zero');
		await act(() => {});
		expect(log.drain()).toEqual([]);

		// Shell and content arrive together, effect fires once for the landing step.
		await act(() => {
			d1.resolve('one');
		});
		expect(r.find('#shell').textContent).toBe('shell-1');
		expect(r.find('#value').textContent).toBe('one');
		expect(log.drain()).toEqual(['effect:1']);
		// The held screen never re-fetches: in production compiles, one creation
		// per step, ever — the cue re-render dep-hits the swapped-back step-0
		// entry and the promotion dep-hits the swapped-forward step-1 entry. The
		// dev compile keeps its documented safety net (repeat creations reuse the
		// tracked thenable), so it only pins that both steps were created.
		if (process.env.OCTANE_TEST_COMPILE_MODE === 'prod') {
			expect(loadCalls).toEqual([0, 1]);
		} else {
			expect(loadCalls[0]).toBe(0);
			expect(loadCalls).toContain(1);
		}
		r.unmount();
	});
});
