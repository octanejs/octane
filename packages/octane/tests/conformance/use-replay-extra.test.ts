import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { ExcitingText, SyncThenableBoundary } from './_fixtures/use-replay-extra.tsrx';

// Ports from facebook/react ReactUse-test.js (React 19.2.7) — the remaining
// hook-replay-after-suspend and thenable-unwrapping heuristics not already
// pinned by tests/suspense.test.ts and conformance/suspense-extra.test.ts.

/** Stable promise per key + request log (the React fixture's text cache). */
function makeTextCache(log: (s: string) => void) {
	const cache = new Map<string, { promise: Promise<string>; resolve: (v: string) => void }>();
	const getText = (text: string): Promise<string> => {
		let entry = cache.get(text);
		if (!entry) {
			log(`Async text requested [${text}]`);
			let resolve!: (v: string) => void;
			const promise = new Promise<string>((res) => {
				resolve = res;
			});
			entry = { promise, resolve };
			cache.set(text, entry);
		}
		return entry.promise;
	};
	const resolveText = (text: string): void => {
		getText(text);
		cache.get(text)!.resolve(text);
	};
	return { getText, resolveText };
}

describe('conformance: use() replay + thenable unwrapping (ReactUse-test.js)', () => {
	it('when replaying a suspended component, reuses the hooks computed during the previous attempt (Memo)', async () => {
		// Per ReactUse-test.js:875 — the useMemo ABOVE the suspending use() is
		// computed on the first attempt and REUSED on the replay (no recompute);
		// the useMemo BELOW it runs exactly once, after the value resolves.
		// (The React fixture's promise is uncached, so React logs a second
		// request on replay; our cache keeps the promise stable — the
		// hook-reuse assertions are identical.)
		const log = createLog();
		const { getText, resolveText } = makeTextCache(log.push);
		const r = mount(ExcitingText, { text: 'Hello', getText, log: log.push });
		// Suspends while we wait for the async service to respond.
		expect(log.drain()).toEqual(['Compute uppercase: Hello', 'Async text requested [HELLO!]']);
		expect(r.find('#fallback').textContent).toBe('loading');

		await act(() => resolveText('HELLO!'));
		// The uppercase computation did NOT run again — only the memo below the
		// use() (which could not run until the value arrived).
		expect(log.drain()).toEqual(['Add sparkles: HELLO!']);
		expect(r.find('#out').textContent).toBe('* HELLO! *');
		r.unmount();
	});

	it('unwraps thenable that fulfills synchronously without suspending', () => {
		// Per ReactUse-test.js:765 — a thenable whose then() calls resolve
		// synchronously finishes rendering synchronously, with no fallback
		// committed. (Outcome-level: octane routes the first read through its
		// boundary and converges within the same synchronous flush, so the
		// committed DOM never shows the fallback — same observable as React,
		// which unwraps without throwing at all.)
		const thenable = {
			then(resolve: (v: string) => void) {
				// Resolves synchronously, without waiting a microtask.
				resolve('Hi');
			},
		};
		const r = mount(SyncThenableBoundary, { thenable });
		// Rendered synchronously — no fallback in the committed output.
		expect(r.find('#out').textContent).toBe('Hi');
		expect(r.findAll('#fallback')).toHaveLength(0);
		r.unmount();
	});
});

// ============================================================================
// Accounting — ReactUse-test.js, cases scoped to this port wave:
//   :94 "if suspended fiber is pinged in a microtask, retry immediately
//        without unwinding the stack" — N/A: `@gate TODO` — intentionally
//        DISABLED in default React builds ("This behavior was intentionally
//        disabled to derisk the rollout of `use`"); not a default behavior.
//   :133 "if suspended fiber is pinged in a microtask, it does not block a
//        transition from completing" — N/A: the fixture renders with NO
//        Suspense boundary; octane's sync renderer has no parked root-level
//        render — an unhandled suspension escapes mount as an exception
//        (verified empirically). The boundary-ful microtask-resolution
//        outcome is COVERED-BY-EXISTING: suspense.test.ts ('shows pending
//        fallback while use() awaits, then swaps to resolved content').
//   :765 "unwraps thenable that fulfills synchronously without suspending" —
//        PORTED (passes, outcome-level; see note in the test).
//   :875 "when replaying a suspended component, reuses the hooks computed
//        during the previous attempt (Memo)" — PORTED (passes).
//   :933 "…(State)" — COVERED-BY-EXISTING: suspense.test.ts ('reuses hooks
//        computed during the previous attempt (State)', cites :933) +
//        conformance/suspense-extra.test.ts ('useRef survives replay…').
//   :1010 "…(DebugValue+State)" — the hook-order-mismatch-warning purpose is
//        N/A (octane has no rules of hooks / hook-order warnings; useDebugValue
//        is an exported no-op). The observable half (state declared BELOW the
//        use() is preserved and updatable after resolve) is COVERED-BY-
//        EXISTING: conformance/suspense-extra.test.ts ('useEffect / useRef
//        declared after use() do not fire during the pending window') +
//        suspense.test.ts replay-state coverage.
//   :1064 "wrap an async function with useMemo to skip running the function
//        twice when loading new data" — COVERED-BY-EXISTING:
//        suspense.test.ts ('useMemo pattern: both fetches kick off on initial
//        render (network-parallel)') — pins the factory running exactly once
//        across suspend/replay cycles.
// ============================================================================
