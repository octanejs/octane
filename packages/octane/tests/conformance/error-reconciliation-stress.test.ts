/**
 * Error boundaries × keyed reconciliation — ported from facebook/react
 * packages/react-dom/src/__tests__/ReactErrorBoundaries-test.internal.js
 * (React 19.2.7), OUTCOME ports per docs/react-parity-migration-plan.md §3
 * Tier 7 (class ErrorBoundary → @try/@catch).
 *
 * The centerpiece is :1978 "doesn't get into inconsistent state during
 * reorders" — ~100 shuffled keyed children with one thrower flipping mid-
 * stream. React discards the aborted render's WIP; octane mutates the live
 * DOM during reconcileKeyed, so a mid-reconcile throw is the one place its
 * intentional LIS-move divergence could hide a real bug (half-moved rows,
 * orphaned Blocks). The port runs the shuffle as a seeded stress loop so a
 * failure reproduces from the seed embedded in the error message.
 */
import { describe, it, expect } from 'vitest';
import { mount, createLog } from '../_helpers';
import { makeRng, makeRootRng } from './_helpers/fuzz-prng';
import { ReorderStress, AdditionsCase, RemovalsCase } from './_fixtures/error-reconciliation.tsrx';

interface Item {
	id: number;
	label: string;
	broken: boolean;
}

/** Fisher–Yates with the case's PRNG — mirrors the React test's shuffle. */
function shuffle<T>(rng: ReturnType<typeof makeRng>, arr: T[]): T[] {
	const next = arr.slice();
	for (let i = next.length - 1; i > 0; i--) {
		const j = rng.intBelow(i + 1);
		[next[i], next[j]] = [next[j], next[i]];
	}
	return next;
}

function domKeys(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('[data-k]')).map(
		(el) => el.getAttribute('data-k') || '',
	);
}

const NUM_SEEDS = parseInt(process.env.OCTANE_FUZZ_CASES || '40', 10);
const ROWS = 100; // per the React original: 100 normal rows + 1 maybe-thrower

describe('error boundaries under keyed reconciliation (stress)', () => {
	// Per ReactErrorBoundaries-test.internal.js:1978 — "doesn't get into
	// inconsistent state during reorders". Each seeded case:
	//   1. mounts 101 shuffled keyed rows (100 normal + 1 maybe-thrower),
	//   2. runs several benign shuffles, asserting after each that the DOM
	//      key order matches the items exactly (no orphan/duplicate rows) and
	//      that the live innerHTML is byte-equal to a from-scratch render —
	//      the same oracle fuzz-keyed-list uses, now with a boundary above,
	//   3. flips `fail` and shuffles once more so the thrower throws at a
	//      random position mid-reconcile,
	//   4. asserts the boundary caught it ("Caught an error: Hello."), that
	//      ZERO rows survive anywhere under the container, and that unmount
	//      completes cleanly.
	it(`survives ${NUM_SEEDS} seeded reorder streams with a mid-reconcile throw`, () => {
		const root = makeRootRng('error-reconciliation:reorders');
		for (let c = 0; c < NUM_SEEDS; c++) {
			const caseSeed = (root.next() * 0xffffffff) | 0;
			const rng = makeRng(caseSeed);

			let items: Item[] = [];
			for (let i = 0; i < ROWS; i++) {
				items.push({ id: i, label: `L${i}`, broken: false });
			}
			items.push({ id: ROWS, label: 'boom', broken: true });
			items = shuffle(rng, items);

			const fail = (msg: string): never => {
				throw new Error(`[error-reconciliation] ${msg} (seed=${caseSeed}, case=${c})`);
			};

			const r = mount(ReorderStress as any, { items, fail: false });
			try {
				// Benign shuffles first — the boundary must be inert while the
				// LIS reconciler does arbitrary moves under it.
				const benign = 1 + rng.intBelow(4);
				for (let s = 0; s < benign; s++) {
					items = shuffle(rng, items);
					r.update(ReorderStress as any, { items, fail: false });

					const got = domKeys(r.container).join(',');
					const want = items.map((it) => String(it.id)).join(',');
					if (got !== want)
						fail(`benign shuffle ${s}: DOM key order mismatch\n  got=${got}\n  want=${want}`);

					const baseline = mount(ReorderStress as any, { items, fail: false });
					try {
						if (r.container.innerHTML !== baseline.container.innerHTML) {
							fail(`benign shuffle ${s}: innerHTML differs from from-scratch baseline`);
						}
					} finally {
						baseline.unmount();
					}
				}

				// The failing pass: shuffle again AND flip the thrower, so the
				// throw lands at a random point of the keyed reconcile.
				items = shuffle(rng, items);
				r.update(ReorderStress as any, { items, fail: true });

				// Boundary caught it; fallback replaced the ENTIRE try body.
				expect(r.container.textContent).toBe('Caught an error: Hello.');
				// No inconsistent state: no orphaned or duplicated rows survive.
				if (r.container.querySelectorAll('[data-k]').length !== 0) {
					fail('rows leaked past the catch swap');
				}
				if (r.container.querySelectorAll('#stress-list').length !== 0) {
					fail('try-body wrapper leaked past the catch swap');
				}
			} finally {
				r.unmount();
			}
		}
	}, 60_000);

	// Per ReactErrorBoundaries-test.internal.js:1950 — "doesn't get into
	// inconsistent state during additions". Boundary mounts empty; an update
	// adds Normal + BrokenRender + Normal; the mount-time throw of the middle
	// child must land in the fallback with no partial siblings left behind.
	it('recovers cleanly when an added child throws while mounting', () => {
		const r = mount(AdditionsCase as any, { showChildren: false });
		expect(r.container.textContent).toBe('');

		r.update(AdditionsCase as any, { showChildren: true });
		expect(r.container.textContent).toBe('Caught an error: Hello.');
		expect(r.findAll('.normal')).toHaveLength(0);
		expect(r.findAll('#add-wrap')).toHaveLength(0);
		r.unmount();
	});

	// Per ReactErrorBoundaries-test.internal.js:1927 — "doesn't get into
	// inconsistent state during removals". React's BrokenComponentWillUnmount
	// throws from componentWillUnmount; the octane analog throws from a
	// layout-effect cleanup at unmount. React's full contract, now matched:
	// the removal COMPLETES consistently (cleanup ran, no child survives, no
	// crash) AND the error is routed to the nearest still-mounted boundary,
	// which switches to its fallback (unmountScope collects deletion-phase
	// cleanup throws and dispatches them to the boundary enclosing the
	// deletion after the walk — reportTeardownError/dispatchTeardownErrors).
	it('completes the removal consistently and routes the throw to the boundary', () => {
		const log = createLog();
		const r = mount(RemovalsCase as any, { showChildren: true, log: log.push });
		expect(r.findAll('.normal')).toHaveLength(2);
		expect(r.find('.row').textContent).toBe('broken');

		expect(() =>
			r.update(RemovalsCase as any, { showChildren: false, log: log.push }),
		).not.toThrow();
		expect(log.drain()).toContain('BrokenUnmount cleanup [!]');
		// Removal completed: no child (or partial sibling) survives…
		expect(r.findAll('.row')).toHaveLength(0);
		expect(r.findAll('.normal')).toHaveLength(0);
		// …and the boundary caught the deletion-phase throw (React behavior).
		expect(r.container.textContent).toBe('Caught an error: Hello.');
		r.unmount();
	});
});

/*
 * ── Accounting: ReactErrorBoundaries-test.internal.js (50 its) ────────────
 * NB: this is an `.internal.js` suite (runs with non-default feature flags);
 * only flag-independent, default-React OUTCOME behavior is ported.
 *
 * Ported here:
 *   :1927 doesn't get into inconsistent state during removals (removal
 *         completes consistently AND the throw routes to the boundary)
 *   :1950 doesn't get into inconsistent state during additions
 *   :1978 doesn't get into inconsistent state during reorders  (stress loop)
 * Ported in conformance/refs-under-error.test.ts:
 *   :1158 resets callback refs if mounting aborts
 *   :1209 resets object refs if mounting aborts
 *   :2782 catches errors thrown while detaching refs
 * Covered by existing octane tests:
 *   :2169 catches errors in useEffect        → conformance/error-effects.test.ts
 *   :2198 catches errors in useLayoutEffect  → conformance/error-effects.test.ts
 *   :763  renders an error state if child throws in render → try-catch.test.ts
 *          ('catches a child render error and shows the fallback')
 *   :1516 catches if child throws in render during update  → try-catch.test.ts
 *          (render-error catch) + boundary.test.ts (ErrorBoundary component)
 *   :1844 can recover from error state       → try-catch.test.ts ('reset()
 *          re-attempts the try body')
 * Skipped — class-lifecycle mechanics (out of scope per plan §2; octane has
 * no class components, so constructor/willMount/willReceiveProps/willUpdate/
 * didCatch/getDerivedStateFromError call sequences don't exist):
 *   :802 :837 :875 :906 :957 :1017 :1054 :1108 :1256 :1278 :1339 :1403 :1459
 *   :1581 :1655 :1713 :1775 :1896 :2068 :2128 :2227 :2265 :2543 :2576 :2699
 *   (:2699's outcome cousin — cleanup throw during removal — is :1927 above.)
 * Skipped — error-surface / logging / internals specifics:
 *   :578 :606 :645 (uncaught-error rethrow shape at the root — octane
 *         surfaces uncaught render errors from flushSync; the try-catch
 *         mount helper covers the throwing-mount path)
 *   :657  prevents errors from leaking into other roots (multi-root
 *         createRoot error isolation — octane roots are independent by
 *         construction; no shared fiber root to leak through)
 *   :716  logs a single error (console.error de-dup accounting)
 *   :2368 discards a bad root if the root component fails (React root-level
 *         null render semantics)
 *   :2397 renders empty output if error boundary does not handle the error
 *         (componentDidCatch-without-setState "noop boundary" — @catch
 *         always handles; there is no non-handling @catch)
 *   :2443 aggregate error when two errors happen in commit (AggregateError
 *         surface of the commit phase)
 *   :2484 propagates uncaught error inside unbatched initial mount (legacy
 *         unbatched-mount path)
 *   :2499 errors in before-mutation commit hook (getSnapshotBeforeUpdate)
 *   :2611 errors from invariants in completion phase (fiber completion
 *         internals — forced via a host-config invariant)
 *   :2628 errors in the throw phase (componentDidCatch itself throwing)
 *   :2661 protects errors from errors in stack generation (component-stack
 *         devtools internals)
 */
