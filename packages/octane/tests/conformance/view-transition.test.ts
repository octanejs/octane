/**
 * Port of facebook/react ReactDOMViewTransition-test.js (main, 2026-07-11) —
 * scaffolded by scripts/scaffold-react-port.mjs, triage hand-corrected: the
 * two "intermediate class is none" cases are CSS animation-class semantics
 * (the scaffolder's class-COMPONENT rule misfired), so they are in scope.
 *
 * 25 in-scope cases. Porting lands by phase of docs/view-transitions-plan.md:
 *   - core callbacks + Suspense reveal (source :252-:466) — Phases 1-3.
 *   - the onParentEnter/onParentExit relay cluster (:529-:1315) sits behind
 *     React's `enableViewTransitionParentEnterExit` flag — Phase 4 decides
 *     ship vs pin based on where that flag stands.
 *
 * The jsdom environment for these ports is _helpers/view-transition-mocks.ts
 * (React's own mock recipe, source :188-249); the one live test below pins
 * that harness contract itself so the helper stays honest until Phase 1
 * starts flipping todos.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from '../_helpers';
import { createRoot, startTransition, type Root } from '../../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './_helpers/view-transition-mocks';
import { EnterApp, ExitApp, UpdateApp, PlainApp } from './_fixtures/view-transition.tsrx';

describe('ReactDOMViewTransition (ported)', () => {
	// Harness pin (not a React port): the mock helper installs the exact
	// environment the ported tests assume, and restores it fully.
	it('view-transition mock helper installs and restores the jsdom environment', () => {
		const doc = document as never as Record<string, unknown>;
		const hadBefore = 'startViewTransition' in document;
		const vt = installViewTransitionMocks();
		try {
			expect(typeof doc['startViewTransition']).toBe('function');
			const el = document.createElement('div');
			el.textContent = 'Hello';
			// Content-derived rect: 5 chars * 10 + 10 = 60 wide, 20 tall.
			expect(el.getBoundingClientRect().width).toBe(60);
			expect(el.getBoundingClientRect().height).toBe(20);
			expect(el.getAnimations()).toEqual([]);
			// startViewTransition runs update synchronously and logs the call.
			let ran = false;
			const handle = (
				doc['startViewTransition'] as (o: { update: () => void }) => {
					ready: Promise<void>;
					finished: Promise<void>;
					skipTransition: () => void;
				}
			)({
				update: () => {
					ran = true;
				},
			});
			expect(ran).toBe(true);
			expect(vt.calls.length).toBe(1);
			expect(typeof handle.skipTransition).toBe('function');
		} finally {
			vt.restore();
		}
		expect('startViewTransition' in document).toBe(hadBefore);
	});

	// ── Core activation + callbacks (Phases 1-2) ──────────────────────────────
	describe('core activation callbacks', () => {
		let vt: ViewTransitionMocks;
		let container: HTMLElement;
		let root: Root;

		beforeEach(() => {
			vt = installViewTransitionMocks();
			container = document.createElement('div');
			document.body.appendChild(container);
			root = createRoot(container);
		});
		afterEach(() => {
			root.unmount();
			container.remove();
			vt.restore();
		});

		// Per ReactDOMViewTransition-test.js:252
		it('fires onEnter when a ViewTransition mounts', async () => {
			const enters: unknown[] = [];
			const onEnter = (i: unknown) => {
				enters.push(i);
			};

			// Initial render without the ViewTransition.
			await act(() => {
				root.render(EnterApp, { show: false, onEnter });
			});
			expect(enters.length).toBe(0);
			expect(vt.calls.length).toBe(0);

			// Mount the ViewTransition inside startTransition.
			await act(() => {
				startTransition(() => {
					root.render(EnterApp, { show: true, onEnter });
				});
			});

			expect(vt.calls.length).toBeGreaterThan(0);
			expect(enters.length).toBe(1);
			expect(container.textContent).toBe('Hello');
		});

		// Per ReactDOMViewTransition-test.js:289
		it('fires onExit when a ViewTransition unmounts', async () => {
			const exits: unknown[] = [];
			const onExit = (i: unknown) => {
				exits.push(i);
			};

			// Initial render WITH the ViewTransition (inside startTransition).
			await act(() => {
				startTransition(() => {
					root.render(ExitApp, { show: true, onExit });
				});
			});
			expect(exits.length).toBe(0);

			// Unmount the ViewTransition inside startTransition.
			await act(() => {
				startTransition(() => {
					root.render(ExitApp, { show: false, onExit });
				});
			});

			expect(exits.length).toBe(1);
			expect(container.textContent).toBe('');
		});

		// Per ReactDOMViewTransition-test.js:324
		it('fires onUpdate when content inside a ViewTransition changes', async () => {
			let updates = 0;
			let entersAfterMount = 0;
			const onUpdate = () => {
				updates++;
			};
			const onEnter = () => {
				entersAfterMount++;
			};

			await act(() => {
				startTransition(() => {
					root.render(UpdateApp, { text: 'Short', onUpdate, onEnter });
				});
			});
			entersAfterMount = 0; // mockClear() — enter on the initial transition mount is fine
			expect(updates).toBe(0);

			// Update content inside startTransition (different text length produces
			// different getBoundingClientRect values in the mock).
			await act(() => {
				startTransition(() => {
					root.render(UpdateApp, { text: 'Much longer content here', onUpdate, onEnter });
				});
			});

			expect(updates).toBe(1);
			// onEnter should NOT fire on an update.
			expect(entersAfterMount).toBe(0);
			expect(container.textContent).toBe('Much longer content here');
		});

		// Per ReactDOMViewTransition-test.js:1211
		it('enters without props and does not fire handlers', async () => {
			await act(() => {
				root.render(PlainApp, { show: false });
			});
			expect(vt.calls.length).toBe(0);

			await act(() => {
				startTransition(() => {
					root.render(PlainApp, { show: true });
				});
			});

			expect(vt.calls.length).toBeGreaterThan(0);
			expect(container.textContent).toBe('Hello');
		});

		// Per ReactDOMViewTransition-test.js:1243
		it('exits without props and does not fire handlers', async () => {
			await act(() => {
				startTransition(() => {
					root.render(PlainApp, { show: true });
				});
			});
			vt.calls.length = 0; // mockClear()

			await act(() => {
				startTransition(() => {
					root.render(PlainApp, { show: false });
				});
			});

			expect(vt.calls.length).toBeGreaterThan(0);
			expect(container.textContent).toBe('');
		});
	});

	// ReactDOMViewTransition-test.js:362
	it.todo('fires onShare for paired named transitions instead of onEnter/onExit');

	// ── Suspense + nested-unit semantics (Phase 3) ────────────────────────────
	// ReactDOMViewTransition-test.js:422
	it.todo('fires onEnter when Suspense content resolves');
	// ReactDOMViewTransition-test.js:466
	it.todo(
		'does not fire onExit/onEnter on nested ViewTransition when the subtree is removed as one unit',
	);

	// ── onParentEnter/onParentExit relays (Phase 4 — behind React's
	//    enableViewTransitionParentEnterExit flag; ship vs pin decided there) ──
	// ReactDOMViewTransition-test.js:529
	it.todo('fires onParentExit when ancestor ViewTransition exits');
	// ReactDOMViewTransition-test.js:577
	it.todo('fires onParentEnter when ancestor ViewTransition enters');
	// ReactDOMViewTransition-test.js:625
	it.todo('breaks parentExit chain when intermediate ViewTransition lacks parentExit');
	// ReactDOMViewTransition-test.js:681
	it.todo('stops the parentExit relay when an intermediate class is "none"');
	// ReactDOMViewTransition-test.js:735
	it.todo('stops the parentEnter relay when an intermediate class is "none"');
	// ReactDOMViewTransition-test.js:785
	it.todo('does not fire onParentEnter when ancestor exits');
	// ReactDOMViewTransition-test.js:827
	it.todo('does not fire onParentExit when ancestor shares instead of exiting');
	// ReactDOMViewTransition-test.js:876
	it.todo('does not fire onParentEnter when ancestor shares instead of entering');
	// ReactDOMViewTransition-test.js:924
	it.todo('does not fire onParentExit when ancestor exit is none');
	// ReactDOMViewTransition-test.js:961
	it.todo('does not fire onParentEnter when ancestor enter is none');
	// ReactDOMViewTransition-test.js:999
	it.todo('relays parentExit chain through unstyled parentExit');
	// ReactDOMViewTransition-test.js:1041
	it.todo('fires onParentExit when ancestor ViewTransition exits with handler only');
	// ReactDOMViewTransition-test.js:1087
	it.todo('fires onParentEnter when ancestor ViewTransition enters with handler only');
	// ReactDOMViewTransition-test.js:1132
	it.todo('does not fire onParentEnter when ancestor enter is none with handler only');
	// ReactDOMViewTransition-test.js:1168
	it.todo('relays parentEnter chain to handler-only child through intermediate divs');
	// ReactDOMViewTransition-test.js:1277
	it.todo('fires onParentEnter when ancestor ViewTransition has no props');
	// ReactDOMViewTransition-test.js:1315
	it.todo('fires onParentExit when ancestor ViewTransition has no props');
});

/* Out of scope — intentionally NOT ported:
 *  - [112] handles ViewTransition wrapping Suspense inside SuspenseList
 *      → SuspenseList (not in Octane)
 */
