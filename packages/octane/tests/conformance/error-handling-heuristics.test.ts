import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, act, flushEffects, createLog } from '../_helpers';
import { createRoot, flushSync } from '../../src/index.js';
import {
	NonHandlingInnerBoundary,
	RethrowingInnerBoundary,
	RethrowingOnlyBoundary,
	NonErrorCapture,
	ThrowWithSiblings,
	BrokenRoot,
	OkRoot,
	CaughtBoundaryRoot,
	UnmountingBoundary,
	RenderPhaseUpdateWithError,
	TransitionSwapThrowBranch,
	TransitionSwapThrowValue,
} from './_fixtures/error-handling-heuristics.tsrx';

// Ports of ReactIncrementalErrorHandling-test.internal.js (React 19.2.7)
// outcomes onto octane's @try/@catch. Octane's scheduler is fully synchronous,
// so React's concurrent-only mechanics (yielding mid-render, lane retries,
// interleaved updates) have no octane analog — those cases are triaged in the
// trailing block; what's ported here is the observable error-routing contract.

afterEach(() => {
	vi.restoreAllMocks();
});

describe('nearest HANDLING boundary selection', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:756 — 'propagates an
	// error from a noop error boundary during synchronous mounting' (the :677
	// full-deferred, :715 partial-deferred, and :795 batched variants differ only
	// in concurrent scheduling and collapse onto this sync port).
	//
	// React's "noop" boundary has componentDidCatch but rethrows, so it does not
	// actually HANDLE the error and must not stop propagation. Octane's `@catch`
	// always handles, so the closest structural analog is a `@try` with NO
	// `@catch` arm at all (only `@pending`): it participates in the boundary
	// chain but cannot handle a render error, and the error must keep
	// propagating to the outer boundary.
	it('propagates a render error through a boundary that has no @catch arm', () => {
		const log = createLog();
		const r = mount(NonHandlingInnerBoundary, { log: log.push });
		expect(r.find('.outer-caught').textContent).toBe('Caught an error: Hello');
		// The non-handling inner boundary committed nothing — neither its body
		// nor its @pending arm.
		expect(r.findAll('.pending')).toHaveLength(0);
		expect(r.findAll('.never')).toHaveLength(0);
		expect(r.findAll('.outer-ok')).toHaveLength(0);
		// The thrower rendered once. (React renders it TWICE — the synchronous
		// render-one-more-time retry, see :362 — a concurrent-recovery mechanism
		// octane's sync scheduler doesn't have; see the triage block.)
		expect(log.drain()).toEqual(['Thrower render']);
		r.unmount();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:756 — the rethrow
	// mapping: a `@catch` arm whose render RETHROWS the caught error behaves
	// like React's rethrowing componentDidCatch — the ORIGINAL error keeps
	// propagating to the next boundary out.
	it('propagates the original error when a @catch arm rethrows it', () => {
		const log = createLog();
		const r = mount(RethrowingInnerBoundary, { log: log.push });
		expect(r.find('.outer-caught').textContent).toBe('Caught an error: Hello');
		expect(r.findAll('.outer-ok')).toHaveLength(0);
		expect(log.drain()).toEqual(['Thrower render']);
		r.unmount();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:756/:712 — when the
	// rethrowing boundary is the LAST one, nothing handles the error: no
	// fallback commits and the boundary's content is fully torn down
	// (`expect(ReactNoop.getChildrenAsJSX()).toEqual(null)`). Octane reports the
	// escaped error via console.error from the mount-time catch-arm failure
	// path (switchToCatch) rather than rethrowing to the caller — the routing
	// outcome (no content, no fallback, error surfaced) is what's asserted.
	it('tears down the boundary content when a rethrown error escapes all boundaries', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const log = createLog();
		const r = mount(RethrowingOnlyBoundary, { log: log.push });
		// Neither the try body nor any catch content committed.
		expect(r.findAll('.never')).toHaveLength(0);
		expect(r.find('.app').children).toHaveLength(0);
		// The escaped error was surfaced (octane: console.error with the error).
		expect(consoleError).toHaveBeenCalled();
		const reported = consoleError.mock.calls.flat();
		expect(reported.some((a) => a instanceof Error && a.message === 'Hello')).toBe(true);
		r.unmount();
	});
});

describe('error values and sibling unwind', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:1456 — 'error
	// boundaries capture non-errors'. A thrown non-Error value reaches the
	// boundary as-is (no wrapping).
	it('delivers a thrown non-Error value to @catch unchanged', () => {
		const r = mount(NonErrorCapture);
		expect(r.find('.caught').textContent).toBe('Caught an error: oops');
		r.unmount();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:1532 — 'continues
	// working on siblings of a component that throws'. React unwinds to the
	// boundary; the throwing child's siblings never commit (their renders/
	// effects never fire and their DOM never appears) and the boundary shows
	// the error message.
	it('siblings of a throwing child never commit; the boundary shows the error', async () => {
		const log = createLog();
		const r = mount(ThrowWithSiblings, { log: log.push });
		expect(r.find('.caught').textContent).toBe('Caught an error: Hello');
		expect(r.findAll('.sibling')).toHaveLength(0);
		await act(async () => {});
		flushEffects();
		const entries = log.drain();
		expect(entries).toContain('Thrower render');
		expect(entries).not.toContain('Sibling render');
		expect(entries).not.toContain('Sibling effect');
		r.unmount();
	});
});

describe('roots stay usable after uncaught errors', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:883 — 'can schedule
	// updates after uncaught error in render on mount' (and :1320, 'recovers
	// from uncaught reconciler errors' — same outcome for a mount-time throw).
	it('can schedule updates on the same root after an uncaught mount error', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		// Octane's initial render of a new body is synchronous — the uncaught
		// mount error surfaces directly from render() (React: waitForThrow).
		expect(() => root.render(BrokenRoot, { fail: true })).toThrow('Hello');
		expect(container.querySelector('.fine')).toBeNull();

		root.render(OkRoot, { label: 'Foo' });
		flushSync(() => {});
		expect(container.querySelector('.ok')!.textContent).toBe('Foo');
		root.unmount();
		container.remove();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:906 — 'can schedule
	// updates after uncaught error in render on update'.
	it('can schedule updates on the same root after an uncaught update error', () => {
		const r = mount(BrokenRoot, { fail: false });
		expect(r.find('.fine').textContent).toBe('fine');
		expect(() => r.update(BrokenRoot, { fail: true })).toThrow('Hello');

		r.update(OkRoot, { label: 'Foo' });
		expect(r.find('.ok').textContent).toBe('Foo');
		r.unmount();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:1338 (rendered
	// output is null after 'unmounts components with uncaught errors'; also
	// :712, :1441) — when an error is not handled by ANY boundary, React
	// removes the ENTIRE tree from the DOM (the documented "if an error isn't
	// caught by any error boundary, React removes the whole tree" contract).
	// octane matches: drainQueue's unhandled-error path unmounts the failed
	// ROOT block before rethrowing from the flush; unrelated roots batched in
	// the same flush keep draining.
	it('unmounts the entire tree when an uncaught update error escapes all boundaries', () => {
		const r = mount(BrokenRoot, { fail: false });
		let threw = false;
		try {
			r.update(BrokenRoot, { fail: true });
		} catch {
			threw = true;
		}
		const html = r.html();
		r.unmount();
		expect(threw).toBe(true);
		expect(html).toBe('');
	});
});

describe('multi-root isolation under errors', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:1041 — 'continues work
	// on other roots despite caught errors'.
	it('a caught error in one root does not stop work on another root', () => {
		const containerA = document.createElement('div');
		const containerB = document.createElement('div');
		document.body.appendChild(containerA);
		document.body.appendChild(containerB);
		const rootA = createRoot(containerA);
		const rootB = createRoot(containerB);

		flushSync(() => {
			rootA.render(CaughtBoundaryRoot, undefined);
			rootB.render(OkRoot, { label: 'b:1' });
		});

		expect(containerA.querySelector('.caught')!.textContent).toBe('Caught an error: Hello');
		expect(containerB.querySelector('.ok')!.textContent).toBe('b:1');

		rootA.unmount();
		rootB.unmount();
		containerA.remove();
		containerB.remove();
	});

	// Per ReactIncrementalErrorHandling-test.internal.js:1076 — 'continues work
	// on other roots despite uncaught errors' (first stanza; the later stanzas
	// repeat the same isolation across more root permutations).
	it('an uncaught error in one root does not stop work on another root', () => {
		const containerA = document.createElement('div');
		const containerB = document.createElement('div');
		document.body.appendChild(containerA);
		document.body.appendChild(containerB);
		const rootA = createRoot(containerA);
		const rootB = createRoot(containerB);

		// Commit both roots first (initial renders are synchronous), then batch
		// two UPDATES — same-body renders go through the shared render queue,
		// which is where root isolation must hold.
		flushSync(() => {
			rootA.render(BrokenRoot, { fail: false });
			rootB.render(OkRoot, { label: 'b:1' });
		});
		expect(containerA.querySelector('.fine')!.textContent).toBe('fine');
		expect(containerB.querySelector('.ok')!.textContent).toBe('b:1');

		expect(() =>
			flushSync(() => {
				rootA.render(BrokenRoot, { fail: true });
				rootB.render(OkRoot, { label: 'b:2' });
			}),
		).toThrow('Hello');

		// Root B committed despite root A's uncaught error in the same flush.
		expect(containerB.querySelector('.ok')!.textContent).toBe('b:2');

		rootA.unmount();
		rootB.unmount();
		containerA.remove();
		containerB.remove();
	});
});

describe('batched updates despite errors in scheduling', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:837 — 'applies batched
	// updates regardless despite errors in scheduling' (and :850 nested /
	// :868 flushSync variants — octane has a single sync batching surface, so
	// they collapse onto this port). An exception thrown from the BATCHING
	// callback itself, after updates were scheduled, must not discard those
	// updates — the last render wins once the queue flushes.
	it('updates scheduled before a throw in the batching callback still apply', () => {
		const r = mount(OkRoot, { label: 'a:1' });
		expect(() =>
			flushSync(() => {
				r.root.render(OkRoot, { label: 'a:2' });
				r.root.render(OkRoot, { label: 'a:3' });
				throw new Error('Hello');
			}),
		).toThrow('Hello');
		// Drain the still-queued work (React: await waitForAll([])).
		flushSync(() => {});
		expect(r.find('.ok').textContent).toBe('a:3');
		r.unmount();
	});
});

describe('unmount-phase errors', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:961 — 'should not
	// attempt to recover an unmounting error boundary': a boundary that is
	// itself being unmounted must not catch a descendant's unmount error (no
	// fallback ever renders). Per :1338 — 'unmounts components with uncaught
	// errors': an error in one component's teardown must not stop the rest of
	// the tree from unmounting. And per :936 — 'can schedule updates after
	// uncaught error during unmounting': the runtime stays usable afterwards.
	//
	// Surfacing divergence, documented: React rethrows unmount errors to the
	// caller (an AggregateError under act); octane reports each cleanup error
	// via console.error and completes the unmount without throwing.
	it('a throwing cleanup does not stop the unmount, is not caught by the dying boundary, and the runtime stays usable', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const log = createLog();
		const r = mount(UnmountingBoundary, { log: log.push });
		await act(async () => {});
		flushEffects();
		expect(log.drain()).toContain('child effect');

		r.unmount();

		const entries = log.drain();
		// The throwing cleanup ran…
		expect(entries).toContain('child cleanup [!]');
		// …its error surfaced…
		const reported = consoleError.mock.calls.flat();
		expect(reported.some((a) => a instanceof Error && a.message === 'unmount error')).toBe(true);
		// …the rest of the tree still unmounted…
		expect(entries).toContain('sibling cleanup');
		// …and the unmounting boundary did NOT recover into its fallback.
		await act(async () => {});
		expect(document.querySelector('.caught')).toBeNull();

		// Per :936 — new work can be scheduled after the unmount error.
		const r2 = mount(OkRoot, { label: 'Foo' });
		expect(r2.find('.ok').textContent).toBe('Foo');
		r2.unmount();
	});
});

describe('render-phase update in the same render as an error', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:1838 — "does not
	// infinite loop if there's a render phase update in the same render as an
	// error". React bounds its error-recovery retries when the throwing render
	// also scheduled a render-phase update (numberOfThrows < 100); the error
	// still surfaces to the caller. Octane must equally surface the error
	// without looping.
	it('surfaces the error without looping when the throwing render also scheduled an update', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		let setter: (n: number) => void = () => {};
		let throws = 0;
		const props = {
			shouldThrow: false,
			register: (s: (n: number) => void) => {
				setter = s;
			},
			fireSetState: () => setter(1),
			onThrow: () => {
				throws++;
			},
		};
		const r = mount(RenderPhaseUpdateWithError, props);
		expect(r.find('.child').textContent).toBe('All good:0');

		let error: Error | undefined;
		try {
			r.update(RenderPhaseUpdateWithError, { ...props, shouldThrow: true });
		} catch (e) {
			error = e as Error;
		}
		expect(error?.message).toBe('Oops!');
		expect(throws).toBeLessThan(100);
		consoleError.mockRestore();
		r.unmount();
	});
});

describe('aborted off-screen (WIP) render is discarded', () => {
	// Per ReactIncrementalErrorHandling-test.internal.js:1764/:1792 — 'uncaught
	// errors should be discarded if the render is aborted'. React's direct
	// scenario (interleave an update into a yielded concurrent render) can't
	// exist under octane's sync scheduler; the octane analog of "aborted
	// render's WIP is discarded" is the per-swap off-screen WIP: a transition
	// swap whose NEW subtree throws must dispose the WIP completely — no
	// partial new content, no leaked wip markers, none of the discarded
	// subtree's effects — and route the error to the boundary.
	it('discards the WIP when a transition branch swap throws (branch-slot path)', async () => {
		const log = createLog();
		const r = mount(TransitionSwapThrowBranch, { log: log.push });
		await act(async () => {});
		flushEffects(); // commit A's mount effect so its unmount cleanup is armed
		expect(r.find('.content').textContent).toBe('A');

		r.click('#go');
		await act(async () => {});
		flushEffects();

		// The error routed to the boundary — catch arm committed.
		expect(r.find('.caught').textContent).toBe('Caught an error: Oops');
		expect(r.findAll('.content')).toHaveLength(0);
		// No leaked off-screen markers or partial WIP content.
		expect(r.html()).not.toContain('wip');
		const entries = log.drain();
		// WIP model: the NEW subtree rendered off-screen BEFORE the committed
		// content was torn down (B's render precedes A's unmount cleanup — the
		// old content was only removed when the boundary swapped to @catch).
		expect(entries.indexOf('B render')).toBeGreaterThanOrEqual(0);
		expect(entries.indexOf('A cleanup')).toBeGreaterThan(entries.indexOf('B render'));
		// The discarded WIP's effects never ran.
		expect(entries).not.toContain('B layout effect');
		expect(entries).not.toContain('B passive effect');
		// The transition is not stuck pending after the error.
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	// Same contract through the `{cond ? <B/> : <A/>}` value-hole shape (the
	// childSlot component-identity swap / off-screen probe path).
	it('discards the WIP when a transition value-hole swap throws (child-slot path)', async () => {
		const log = createLog();
		const r = mount(TransitionSwapThrowValue, { log: log.push });
		await act(async () => {});
		flushEffects();
		expect(r.find('.content').textContent).toBe('A');

		r.click('#go');
		await act(async () => {});
		flushEffects();

		expect(r.find('.caught').textContent).toBe('Caught an error: Oops');
		expect(r.findAll('.content')).toHaveLength(0);
		expect(r.html()).not.toContain('wip');
		const entries = log.drain();
		expect(entries.indexOf('B render')).toBeGreaterThanOrEqual(0);
		expect(entries.indexOf('A cleanup')).toBeGreaterThan(entries.indexOf('B render'));
		expect(entries).not.toContain('B layout effect');
		expect(entries).not.toContain('B passive effect');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// Triage — full accounting of ReactIncrementalErrorHandling-test.internal.js
// (45 its). "Ported" = an it above; "covered" = existing octane test;
// "N/A" = no octane analog (reason given).
// ---------------------------------------------------------------------------
//
// :68   'recovers from errors asynchronously' — N/A concurrent scheduling
//        (waitFor mid-render + sync retry heuristic); the catch OUTCOME is
//        covered by tests/try-catch.test.ts ('catches a child render error').
// :167  'recovers from errors asynchronously (legacy, no
//        getDerivedStateFromError)' — N/A: legacy class componentDidCatch
//        commit-then-setState two-pass; octane's @catch is single-surface.
// :253  "retries at a lower priority if there's additional pending work" —
//        N/A: lane-priority retry; octane has no lanes.
// :296  'does not include offscreen work when retrying after an error' — N/A:
//        gated on enableLegacyHidden (non-default flag).
// :362  'retries one more time before handling error' — N/A: the
//        render-one-more-time-synchronously retry exists to rule out errors
//        caused by concurrent data mutation during a yieldy render
//        (recoverFromConcurrentError / getLanesToRetrySynchronouslyOnError).
//        Octane never yields mid-render, so the mechanism's premise (state
//        raced underneath the WIP tree) cannot occur; octane catches on the
//        first throw. Note React applies the retry even in flushSync renders,
//        so the double render IS observable in React — deliberately not
//        pinned here as a GAP because it is a recovery heuristic, not a
//        programming-model contract (the committed outcome is identical).
// :398  'retries one more time if an error occurs during a render that
//        expires midway through the tree' — N/A: expiration lanes.
// :448  'calls componentDidCatch multiple times for multiple errors' — N/A:
//        class componentDidCatch error ACCUMULATION (setState per error across
//        one commit); octane's @catch holds one error and tears the try body
//        down on the first. The single effect-error-caught outcome is covered
//        by conformance/error-effects.test.ts.
// :497  'catches render error in a boundary during full deferred mounting' —
//        covered: tests/try-catch.test.ts mount-time catch.
// :528  'catches render error in a boundary during partial deferred mounting'
//        — N/A concurrent variant of :497 (covered as above).
// :578  'catches render error in a boundary during synchronous mounting' —
//        covered: tests/try-catch.test.ts (same sync mount outcome; the
//        retry log lines are the :362 heuristic).
// :627  'catches render error in a boundary during batched mounting' —
//        covered: same outcome as :578; batching is octane's default
//        (tests/act.test.ts).
// :677  'propagates an error from a noop error boundary during full deferred
//        mounting' — PORTED (nearest-handling describe, all three its).
// :715  '… during partial deferred mounting' — collapses onto :756 port.
// :756  '… during synchronous mounting' — PORTED (the sync variant is the
//        octane-shaped one; cited on the ports).
// :795  '… during batched mounting' — collapses onto :756 port.
// :837  'applies batched updates regardless despite errors in scheduling' —
//        PORTED ('batched updates despite errors in scheduling').
// :850  'applies nested batched updates despite errors in scheduling' —
//        collapses onto :837 port (octane has one sync batching surface).
// :868  'defers additional sync work to a separate event after an error' —
//        collapses onto :837 port (octane defers via the microtask queue;
//        the observable outcome — a:3 wins — is the same assertion).
// :883  'can schedule updates after uncaught error in render on mount' —
//        PORTED ('roots stay usable…' first it).
// :906  'can schedule updates after uncaught error in render on update' —
//        PORTED ('roots stay usable…' second it).
// :936  'can schedule updates after uncaught error during unmounting' —
//        PORTED (folded into the unmount-phase it; surfacing divergence
//        documented there).
// :961  'should not attempt to recover an unmounting error boundary' —
//        PORTED (unmount-phase it: dying boundary never shows fallback).
// :1005 'can unmount an error boundary before it is handled' — N/A: class
//        componentDidUpdate-throw racing a parent setState in the same
//        commit; octane effect errors route post-commit and the boundary
//        skip-if-disposed outcome is exercised by the :961 port.
// :1041 'continues work on other roots despite caught errors' — PORTED.
// :1076 'continues work on other roots despite uncaught errors' — PORTED
//        (first stanza; later stanzas repeat the same isolation).
// :1162 'unwinds the context stack correctly on error' — N/A: gated legacy
//        context (!disableLegacyContext); the file's own comment says it is
//        legacy-context-specific and deletable.
// :1232 'catches reconciler errors in a boundary during mounting' — N/A as
//        stated: `<InvalidType/>` (undefined element type) is a React
//        ELEMENT-VALIDATION error; octane has no createElement-type
//        validation layer at that seam (undefined/null are renderable-empty
//        values in holes, and a statically-written `<Undefined/>` is a
//        compile-time TS error in .tsrx). The general "runtime-internal
//        errors reach @catch like user throws" outcome is exercised by the
//        ports above (TypeError from a rethrown value, non-Error capture).
// :1272 'catches reconciler errors in a boundary during update' — N/A, same
//        reason as :1232.
// :1320 'recovers from uncaught reconciler errors' — PORTED outcome (root
//        usable after an uncaught mount error; cited on the :883 port).
// :1338 'unmounts components with uncaught errors' — SPLIT: teardown
//        continues past a throwing cleanup — PORTED (unmount-phase it);
//        root tree removed on uncaught error — PINNED as the it.fails GAP;
//        AggregateError surfacing — N/A (act/jest host surface).
// :1402 'does not interrupt unmounting if detaching a ref throws' — belongs
//        to the refs cluster (plan §3 Tier 7 refs row). Octane's ref-detach
//        teardown paths are exercised by conformance/refs-destruction.test.ts
//        and tests/compiled-ref-detach.test.ts; the throw-during-detach
//        variant is not duplicated here.
// :1444 'handles error thrown by host config while working on failed root' —
//        N/A: ReactNoop host-config fault injection.
// :1449 'handles error thrown by top-level callback' — N/A: ReactNoop
//        render-callback API; octane's root.render takes no callback.
// :1456 'error boundaries capture non-errors' — PORTED.
// :1532 'continues working on siblings of a component that throws' — PORTED.
// :1591 'calls the correct lifecycles on the error boundary after catching an
//        error (mixed)' — N/A: class lifecycle ordering regression
//        (componentDidCatch vs componentDidUpdate detection).
// :1634 'provides component stack to the error boundary with
//        componentDidCatch' — N/A: errorInfo.componentStack is a class-
//        boundary API; @catch (err, reset) exposes no component stack.
// :1676 'does not provide component stack to the error boundary with
//        getDerivedStateFromError' — N/A, same surface.
// :1706 'provides component stack even if overriding prepareStackTrace' —
//        N/A, same surface.
// :1764 'uncaught errors should be discarded if the render is aborted' —
//        direct scenario N/A (requires interleaving an update into a yielded
//        concurrent render); octane analog PORTED as the WIP-discard its.
// :1792 'uncaught errors are discarded if the render is aborted, case 2' —
//        N/A/PORTED as above.
// :1838 "does not infinite loop if there's a render phase update in the same
//        render as an error" — PORTED.
// :1900 'regression test: should fatal if error is thrown at the root' —
//        N/A: gated on the persistent (non-mutation) host config.
