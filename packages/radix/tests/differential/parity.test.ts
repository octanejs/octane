/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/radix (octane) AND
 * the real Radix primitives (React) — the setup rewrites `@octanejs/radix` → `radix-ui`
 * and `octane` → `react` for the React side. octane's `mountDifferential` mounts both,
 * drives identical clicks, and asserts byte-identical innerHTML after each step (with
 * useId tokens canonicalised — see the rig). This is the gold-standard proof that the
 * binding behaves like Radix's React primitives — not just "passes my tests".
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/radix-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential _setup.ts)
// so the React side resolves radix-ui from here.
const CACHE = resolve(__dirname, '.react-cache');
// Importing the real `radix-ui` oracle is substantially more expensive than
// any individual case. Start it at module evaluation so the first case does
// not own that one-time work (and cannot leave React's act queue half-open if
// the per-test timeout expires under CI contention).
await preloadDifferentialFixture(FIXTURE, CACHE);

// Let queued `requestAnimationFrame` callbacks fire on BOTH sides before interacting.
// Radix's Collapsible content arms a mount-time rAF that disables its "block the mount
// animation" guard; in a real browser it has long fired before any user click, but under
// jsdom + act() the React side's rAF stays queued unless the frame callbacks run — leaving
// the two sides in different guard states (a test-environment artifact, not a renderer
// divergence). Drive the rAF queue explicitly instead of a wall-clock `setTimeout`.
function settleRaf(): Promise<void> {
	return new Promise(function (resolve) {
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				resolve();
			});
		});
	});
}

// Real Radix's useSize constructs ResizeObserver unguarded (jsdom has none) — the form
// controls' bubble inputs and the slider thumb hit it on the React side. A no-op stub
// keeps sizes at the initial report, identical on both sides.
beforeAll(() => {
	if (!('ResizeObserver' in globalThis)) {
		(globalThis as any).ResizeObserver = class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		};
		(globalThis as any).__stubbedRO = true;
	}
});
afterAll(() => {
	if ((globalThis as any).__stubbedRO) {
		delete (globalThis as any).ResizeObserver;
		delete (globalThis as any).__stubbedRO;
	}
});

describe('differential: @octanejs/radix vs real Radix on React', () => {
	// @parity-case differential:radix-separator
	it('Separator: horizontal / vertical / decorative, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'Separators', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	// @parity-case differential:radix-label
	it('Label: renders a native label byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'LabelBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	// @parity-case differential:radix-collapsible
	it('Collapsible: closed → open → closed, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'CollapsibleApp', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		await d.step('open', async (i, r) => {
			await settleRaf();
			await i.click('#trigger');
			await r.click('#trigger');
		});
		await d.step('close', async (i, r) => {
			await settleRaf();
			await i.click('#trigger');
			await r.click('#trigger');
		});
		d.unmount();
	});

	// @parity-case differential:radix-accordion-single
	it('Accordion (single, collapsible): switch items + collapse, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'AccordionSingle', undefined, CACHE);
		await d.step('mount (a open)', () => {});
		await d.step('open b (a closes)', async (i, r) => {
			await settleRaf();
			await i.click('#tb');
			await r.click('#tb');
		});
		await d.step('close b (collapsible)', async (i, r) => {
			await settleRaf();
			await i.click('#tb');
			await r.click('#tb');
		});
		d.unmount();
	});

	// @parity-case differential:radix-dialog-non-modal
	it('Dialog (non-modal): trigger ARIA across open/close, byte-identical', async () => {
		// Content portals to document.body (both runtimes), so the rig's container compare
		// covers the trigger's ARIA/data-state wiring; portal'd content behavior is covered
		// by the octane unit tests (dialog.test.ts) — modal focus-traps would fight across
		// the two side-by-side mounts sharing one document.
		const d = await mountDifferential(FIXTURE, 'DialogNonModal', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		await d.step('open', async (i, r) => {
			await settleRaf();
			await i.click('#dt');
			await r.click('#dt');
		});
		// Close via the trigger toggle — the Close button lives in the portal'd content
		// (document.body), outside the rig's container-scoped click helper.
		await d.step('close (trigger toggle)', async (i, r) => {
			await settleRaf();
			await i.click('#dt');
			await r.click('#dt');
		});
		d.unmount();
	});

	// @parity-case differential:radix-toggle
	it('Toggle: pressed on/off, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleApp', undefined, CACHE);
		await d.step('mount (off)', () => {});
		await d.step('press', async (i, r) => {
			await i.click('#t');
			await r.click('#t');
		});
		await d.step('unpress', async (i, r) => {
			await i.click('#t');
			await r.click('#t');
		});
		d.unmount();
	});

	// @parity-case differential:radix-toggle-group-single
	it('ToggleGroup (single): switch + roving tabindex, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupSingle', undefined, CACHE);
		await d.step('mount (a on)', () => {});
		await d.step('press b (a off)', async (i, r) => {
			await i.click('#gb');
			await r.click('#gb');
		});
		d.unmount();
	});

	// @parity-case differential:radix-toggle-group-multiple
	it('ToggleGroup (multiple): independent presses, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupMultiple', undefined, CACHE);
		await d.step('mount (a on)', () => {});
		await d.step('press b (both on)', async (i, r) => {
			await i.click('#gb');
			await r.click('#gb');
		});
		await d.step('press a (only b on)', async (i, r) => {
			await i.click('#ga');
			await r.click('#ga');
		});
		d.unmount();
	});

	// @parity-case differential:radix-tabs
	it('Tabs: switch panels via trigger mousedown, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TabsApp', undefined, CACHE);
		await d.step('mount (one active)', () => {});
		// Radix Tabs activates on MOUSEDOWN (not click) — jsdom's el.click() emits no
		// mousedown, so dispatch it explicitly on both sides.
		const mousedown = (root: HTMLElement, id: string): void => {
			// jsdom's querySelector('#x') can miss freshly-rendered subtrees (same quirk the
			// rig's click helper works around) — walk instead.
			const all = root.getElementsByTagName('*');
			let el: Element | null = null;
			for (let i = 0; i < all.length; i++) {
				if (all[i].id === id) {
					el = all[i];
					break;
				}
			}
			el!.dispatchEvent(
				new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
			);
		};
		await d.step('activate two', async (i, r) => {
			await settleRaf();
			mousedown(i.container, 't2');
			mousedown(r.container, 't2');
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-quick-wins
	it('QuickWins: AspectRatio + VisuallyHidden + Avatar + Progress, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'QuickWins', undefined, CACHE);
		// jsdom never loads images, so both sides settle on the fallback.
		await d.step('mount', async () => {
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-toolbar
	it('Toolbar: buttons/link/separator/toggle-group, byte-identical incl. toggling', async () => {
		const d = await mountDifferential(FIXTURE, 'ToolbarApp', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('press A (both on)', async (i, r) => {
			await i.click('#ti-a');
			await r.click('#ti-a');
		});
		await d.step('press B (only A on)', async (i, r) => {
			await i.click('#ti-b');
			await r.click('#ti-b');
		});
		d.unmount();
	});

	// @parity-case differential:radix-form-controls
	it('FormControls: checkbox/switch/radio-group + bubble inputs across clicks, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'FormControls', undefined, CACHE);
		await d.step('mount', async () => {
			await settleRaf();
		});
		await d.step('check the checkbox', async (i, r) => {
			await i.click('#cb');
			await r.click('#cb');
			await settleRaf();
		});
		await d.step('toggle the switch', async (i, r) => {
			await i.click('#sw');
			await r.click('#sw');
			await settleRaf();
		});
		await d.step('select vanilla', async (i, r) => {
			await i.click('#rg-a');
			await r.click('#rg-a');
			await settleRaf();
		});
		await d.step('select chocolate (vanilla unchecks)', async (i, r) => {
			await i.click('#rg-b');
			await r.click('#rg-b');
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-slider
	it('Slider: aria/range/thumb bytes across keyboard steps, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SliderDiff', undefined, CACHE);
		await d.step('mount', async () => {
			await settleRaf();
		});
		const arrowRight = (root: HTMLElement): void => {
			const all = root.getElementsByTagName('*');
			let el: Element | null = null;
			for (let i = 0; i < all.length; i++) {
				if (all[i].getAttribute('role') === 'slider') {
					el = all[i];
					break;
				}
			}
			el!.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
			);
		};
		await d.step('ArrowRight (30 → 40)', async (i, r) => {
			arrowRight(i.container);
			arrowRight(r.container);
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-menubar-closed
	it('Menubar (closed): triggers + roving tabindex, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'MenubarClosed', undefined, CACHE);
		await d.step('mount', async () => {
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-navigation-menu-closed
	it('NavigationMenu (closed): nav/list/trigger aria wiring, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'NavMenuClosed', undefined, CACHE);
		await d.step('mount', async () => {
			await settleRaf();
		});
		d.unmount();
	});

	// @parity-case differential:radix-accordion-multiple
	it('Accordion (multiple): items open independently, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'AccordionMultiple', undefined, CACHE);
		await d.step('mount (a open)', () => {});
		await d.step('open b (both open)', async (i, r) => {
			await settleRaf();
			await i.click('#tb');
			await r.click('#tb');
		});
		await d.step('close a (b stays)', async (i, r) => {
			await settleRaf();
			await i.click('#ta');
			await r.click('#ta');
		});
		d.unmount();
	});
});
