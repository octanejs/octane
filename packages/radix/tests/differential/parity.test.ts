/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/radix (octane) AND
 * the real Radix primitives (React) — the setup rewrites `@octanejs/radix` → `radix-ui`
 * and `octane` → `react` for the React side. octane's `mountDifferential` mounts both,
 * drives identical clicks, and asserts byte-identical innerHTML after each step (with
 * useId tokens canonicalised — see the rig). This is the gold-standard proof that the
 * binding behaves like Radix's React primitives — not just "passes my tests".
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/radix-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential _setup.ts)
// so the React side resolves radix-ui from here.
const CACHE = resolve(__dirname, '.react-cache');

// Let queued `requestAnimationFrame` callbacks fire on BOTH sides before interacting.
// Radix's Collapsible content arms a mount-time rAF that disables its "block the mount
// animation" guard; in a real browser it has long fired before any user click, but under
// jsdom + act() the React side's rAF stays queued unless real timers get a turn — leaving
// the two sides in different guard states (a test-environment artifact, not a renderer
// divergence).
const settleRaf = (): Promise<void> => new Promise((res) => setTimeout(res, 40));

describe('differential: @octanejs/radix vs real Radix on React', () => {
	it('Separator: horizontal / vertical / decorative, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'Separators', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Label: renders a native label byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'LabelBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

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

	it('ToggleGroup (single): switch + roving tabindex, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupSingle', undefined, CACHE);
		await d.step('mount (a on)', () => {});
		await d.step('press b (a off)', async (i, r) => {
			await i.click('#gb');
			await r.click('#gb');
		});
		d.unmount();
	});

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
