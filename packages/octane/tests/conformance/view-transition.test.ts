/**
 * Port of facebook/react ReactDOMViewTransition-test.js (main, 2026-07-11) —
 * scaffolded by scripts/scaffold-react-port.mjs, triage hand-corrected: the
 * two "intermediate class is none" cases are CSS animation-class semantics
 * (the scaffolder's class-COMPONENT rule misfired), so they are in scope.
 *
 * 25 in-scope cases — ALL PORTED (view-transitions plan Phases 1-4):
 *   - core callbacks + share + Suspense reveal + nested-unit (:252-:466).
 *   - the onParentEnter/onParentExit relay cluster (:529-:1315): React gates
 *     it behind `enableViewTransitionParentEnterExit`, which is ON in the
 *     experimental channel (where ViewTransition ships) — octane ships the
 *     behavior.
 *
 * The jsdom environment for these ports is _helpers/view-transition-mocks.ts
 * (React's own mock recipe, source :188-249); the one live harness-pin test
 * below keeps the helper honest.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from '../_helpers';
import { createRoot, startTransition, type Root } from '../../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './_helpers/view-transition-mocks';
import {
	EnterApp,
	ExitApp,
	UpdateApp,
	PlainApp,
	ShareApp,
	SuspenseRevealApp,
	NestedUnitApp,
	ParentExitApp,
	ParentEnterApp,
	ChainBreakApp,
	NoneBreakExitApp,
	NoneBreakEnterApp,
	KindMismatchApp,
	ShareNoRelayApp,
	ShareNoEnterRelayApp,
	NoneAncestorExitApp,
	NoneAncestorEnterApp,
	UnstyledRelayApp,
	HandlerOnlyExitApp,
	HandlerOnlyEnterApp,
	NoneEnterHandlerOnlyApp,
	DivsChainApp,
	NoPropsAncestorEnterApp,
	NoPropsAncestorExitApp,
} from './_fixtures/view-transition.tsrx';

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

		// Per ReactDOMViewTransition-test.js:362
		it('fires onShare for paired named transitions instead of onEnter/onExit', async () => {
			let sharesA = 0,
				exitsA = 0,
				sharesB = 0,
				entersB = 0;
			const props = {
				page: 'a',
				onShareA: () => {
					sharesA++;
				},
				onExitA: () => {
					exitsA++;
				},
				onShareB: () => {
					sharesB++;
				},
				onEnterB: () => {
					entersB++;
				},
			};

			// Render page A.
			await act(() => {
				startTransition(() => {
					root.render(ShareApp, props);
				});
			});
			// Clear any enter callbacks from the initial mount.
			sharesA = exitsA = sharesB = entersB = 0;

			// Switch from page A to page B inside startTransition.
			await act(() => {
				startTransition(() => {
					root.render(ShareApp, { ...props, page: 'b' });
				});
			});

			// onShare fires on the exiting side (page A).
			expect(sharesA).toBe(1);
			// onExit does NOT fire when share takes precedence.
			expect(exitsA).toBe(0);
			// onEnter does NOT fire on the entering side when paired.
			expect(entersB).toBe(0);
			expect(container.textContent).toBe('Page B');
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

		// ── Suspense + nested-unit semantics (Phase 3) ──────────────────────────

		// Per ReactDOMViewTransition-test.js:422
		it('fires onEnter when Suspense content resolves', async () => {
			let enters = 0;
			const onEnter = () => {
				enters++;
			};
			let resolve!: (v: string) => void;
			const promise = new Promise<string>((r) => {
				resolve = r;
			});

			// Initial render — content suspends, the fallback commits under the
			// wrapped transition flush.
			await act(() => {
				startTransition(() => {
					root.render(SuspenseRevealApp, { onEnter, promise });
				});
			});
			expect(container.textContent).toBe('Loading...');
			// onEnter fires for the fallback appearing.
			const entersAfterFallback = enters;
			enters = 0;

			// Resolve the suspended content.
			await act(async () => {
				resolve('Loaded');
				await promise;
			});

			expect(container.textContent).toBe('Loaded');
			// The reveal (or the initial fallback mount) triggered enter — React's
			// own assertion is this lenient sum (see the source test).
			expect(enters + entersAfterFallback).toBeGreaterThanOrEqual(1);
		});

		// Per ReactDOMViewTransition-test.js:466
		it('does not fire onExit/onEnter on nested ViewTransition when the subtree is removed as one unit', async () => {
			let parentEnters = 0,
				parentExits = 0,
				nestedEnters = 0,
				nestedExits = 0;
			const props = {
				show: false,
				onParentEnter: () => {
					parentEnters++;
				},
				onParentExit: () => {
					parentExits++;
				},
				onNestedEnter: () => {
					nestedEnters++;
				},
				onNestedExit: () => {
					nestedExits++;
				},
			};

			await act(() => {
				startTransition(() => {
					root.render(NestedUnitApp, props);
				});
			});
			parentEnters = nestedEnters = 0;

			await act(() => {
				startTransition(() => {
					root.render(NestedUnitApp, { ...props, show: true });
				});
			});

			expect(parentEnters).toBe(1);
			expect(nestedEnters).toBe(0);

			parentExits = nestedExits = 0;

			await act(() => {
				startTransition(() => {
					root.render(NestedUnitApp, { ...props, show: false });
				});
			});

			expect(parentExits).toBe(1);
			expect(nestedExits).toBe(0);
		});
	});

	// ── onParentEnter/onParentExit relays (Phase 4) ───────────────────────────
	// React gates these behind enableViewTransitionParentEnterExit, which is ON
	// in the experimental channel (the channel ViewTransition ships in) — so
	// octane SHIPS the behavior rather than pinning. Each test drives a fixture
	// twin of the React inline App through show/page transitions and counts
	// callback fires; `relay()` is the shared show:false→true→false (or reverse)
	// driver.
	describe('parent enter/exit relays', () => {
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
			void vt;
		});

		/** Mount at `from`, transition to `to` — counters read after. */
		async function drive(app: any, props: Record<string, unknown>, from: any, to: any) {
			await act(() => {
				startTransition(() => {
					root.render(app, { ...props, ...from });
				});
			});
			for (const k of Object.keys(counters)) counters[k] = 0;
			await act(() => {
				startTransition(() => {
					root.render(app, { ...props, ...to });
				});
			});
		}
		/** Named counters + matching callback props for a fixture. */
		let counters: Record<string, number>;
		function cbs(...names: string[]): Record<string, unknown> {
			counters = {};
			const props: Record<string, unknown> = {};
			for (const n of names) {
				counters[n] = 0;
				props[n] = () => {
					counters[n]++;
				};
			}
			return props;
		}

		// Per ReactDOMViewTransition-test.js:529
		it('fires onParentExit when ancestor ViewTransition exits', async () => {
			const props = cbs('onParentExit', 'onNestedExit', 'onParentExitNested');
			await drive(ParentExitApp, props, { show: true }, { show: false });
			expect(counters.onParentExit).toBe(1);
			expect(counters.onNestedExit).toBe(0);
			expect(counters.onParentExitNested).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:577
		it('fires onParentEnter when ancestor ViewTransition enters', async () => {
			const props = cbs('onParentEnter', 'onNestedEnter', 'onParentEnterNested');
			await drive(ParentEnterApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(1);
			expect(counters.onNestedEnter).toBe(0);
			expect(counters.onParentEnterNested).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:625
		it('breaks parentExit chain when intermediate ViewTransition lacks parentExit', async () => {
			const props = cbs('onParentExit1', 'onParentExit2');
			await drive(ChainBreakApp, props, { show: true }, { show: false });
			expect(counters.onParentExit1).toBe(0);
			expect(counters.onParentExit2).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:681
		it('stops the parentExit relay when an intermediate class is "none"', async () => {
			const props = cbs('onDeep', 'onSibling');
			await drive(NoneBreakExitApp, props, { show: true }, { show: false });
			expect(counters.onDeep).toBe(0);
			expect(counters.onSibling).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:735
		it('stops the parentEnter relay when an intermediate class is "none"', async () => {
			const props = cbs('onDeep', 'onSibling');
			await drive(NoneBreakEnterApp, props, { show: false }, { show: true });
			expect(counters.onDeep).toBe(0);
			expect(counters.onSibling).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:785
		it('does not fire onParentEnter when ancestor exits', async () => {
			const props = cbs('onParentEnter');
			await drive(KindMismatchApp, props, { show: true }, { show: false });
			expect(counters.onParentEnter).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:827
		it('does not fire onParentExit when ancestor shares instead of exiting', async () => {
			const props = cbs('onShare', 'onParentExit');
			await drive(ShareNoRelayApp, props, { page: 'a' }, { page: 'b' });
			expect(counters.onShare).toBe(1);
			expect(counters.onParentExit).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:876
		it('does not fire onParentEnter when ancestor shares instead of entering', async () => {
			const props = cbs('onShare', 'onParentEnter');
			await drive(ShareNoEnterRelayApp, props, { page: 'a' }, { page: 'b' });
			expect(counters.onShare).toBe(1);
			expect(counters.onParentEnter).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:924
		it('does not fire onParentExit when ancestor exit is none', async () => {
			const props = cbs('onParentExit');
			await drive(NoneAncestorExitApp, props, { show: true }, { show: false });
			expect(counters.onParentExit).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:961
		it('does not fire onParentEnter when ancestor enter is none', async () => {
			const props = cbs('onParentEnter');
			await drive(NoneAncestorEnterApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:999
		it('relays parentExit chain through unstyled parentExit', async () => {
			const props = cbs('onParentExit');
			await drive(UnstyledRelayApp, props, { show: true }, { show: false });
			expect(counters.onParentExit).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:1041
		it('fires onParentExit when ancestor ViewTransition exits with handler only', async () => {
			const props = cbs('onParentExit', 'onRelayParentExit', 'onParentExitDeep');
			await drive(HandlerOnlyExitApp, props, { show: true }, { show: false });
			expect(counters.onParentExit).toBe(1);
			expect(counters.onRelayParentExit).toBe(1);
			expect(counters.onParentExitDeep).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:1087
		it('fires onParentEnter when ancestor ViewTransition enters with handler only', async () => {
			const props = cbs('onParentEnter', 'onRelayParentEnter', 'onParentEnterDeep');
			await drive(HandlerOnlyEnterApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(1);
			expect(counters.onRelayParentEnter).toBe(1);
			expect(counters.onParentEnterDeep).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:1132
		it('does not fire onParentEnter when ancestor enter is none with handler only', async () => {
			const props = cbs('onParentEnter');
			await drive(NoneEnterHandlerOnlyApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(0);
		});

		// Per ReactDOMViewTransition-test.js:1168
		it('relays parentEnter chain to handler-only child through intermediate divs', async () => {
			const props = cbs('onParentEnter', 'onParentEnterNested');
			await drive(DivsChainApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(1);
			expect(counters.onParentEnterNested).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:1277
		it('fires onParentEnter when ancestor ViewTransition has no props', async () => {
			const props = cbs('onParentEnter');
			await drive(NoPropsAncestorEnterApp, props, { show: false }, { show: true });
			expect(counters.onParentEnter).toBe(1);
		});

		// Per ReactDOMViewTransition-test.js:1315
		it('fires onParentExit when ancestor ViewTransition has no props', async () => {
			const props = cbs('onParentExit');
			await drive(NoPropsAncestorExitApp, props, { show: true }, { show: false });
			expect(counters.onParentExit).toBe(1);
		});
	});
});

/* Out of scope — intentionally NOT ported:
 *  - [112] handles ViewTransition wrapping Suspense inside SuspenseList
 *      → SuspenseList (not in Octane)
 */
