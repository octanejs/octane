/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/shadcn
 * (octane) AND a vendored React reference (the setup rewrites
 * `@octanejs/shadcn` → the precompiled upstream barrel and `octane` →
 * `react`). octane's `mountDifferential` mounts both, drives identical events,
 * and asserts byte-identical innerHTML after each step (useId/radix-id tokens
 * canonicalised — see the rig).
 *
 * WHAT EACH FIXTURE PROVES — the references differ in provenance:
 *   - dialog, dropdown-menu, tabs: vendored byte-identical from the pinned
 *     upstream sources, so these prove UPSTREAM FIDELITY (octane renders what
 *     upstream shadcn renders on React).
 *   - button, badge: the reference was hand-authored to carry the same
 *     maintainer-supplied class strings the port ships, since no upstream file
 *     has that flavor. These prove RUNTIME EQUIVALENCE (octane and React agree
 *     given identical source), NOT upstream fidelity.
 *
 * Portal'd content (dialog content/overlay, dropdown menu content) lands on
 * document.body on BOTH runtimes, so — exactly like radix's parity suite — the
 * rig's container compare covers the trigger ARIA/data-state wiring plus any
 * fixture state text, while the portal'd markup contract is covered by the
 * octane unit tests (overlays.test.ts, menus.test.ts). Interactions with
 * portal'd items resolve each side's OWN portal subtree through the trigger's
 * `aria-controls` id, so the two sides never grab each other's nodes.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential, type DiffMount } from '../../../octane/tests/differential/_rig.js';

const fixture = (name: string): string =>
	resolve(__dirname, `../_fixtures/shadcn-diff/${name}.tsrx`);
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves react/radix-ui/lucide-react from here.
const CACHE = resolve(__dirname, '.react-cache');

// Let queued timers/rAF fire on BOTH sides between interactions (radix arms
// mount-time timers — e.g. the delayed pointerdown-outside listener attach —
// that need a real macrotask turn under jsdom).
const settleRaf = (): Promise<void> => new Promise((res) => setTimeout(res, 40));

// Real Radix's useSize constructs ResizeObserver unguarded (jsdom has none).
// A no-op stub keeps sizes at the initial report, identical on both sides.
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

// jsdom's querySelector('#x') can miss freshly-rendered subtrees (same quirk
// the rig's click helper works around) — walk instead.
const findById = (root: Element, id: string): HTMLElement => {
	const all = root.getElementsByTagName('*');
	for (let i = 0; i < all.length; i++) {
		if (all[i].id === id) return all[i] as HTMLElement;
	}
	throw new Error(`no element #${id} under ${root.tagName}`);
};

// Menu triggers open on POINTERDOWN (left button) — jsdom's el.click() emits no
// pointerdown, so dispatch it explicitly. Dispatching on both sides within the
// SAME macrotask matters: radix attaches its pointerdown-outside dismiss
// listener behind a setTimeout(0), so neither open menu can see the other
// side's opening pointerdown as an "outside" press.
const pointerdown = (root: HTMLElement, id: string): void => {
	findById(root, id).dispatchEvent(
		new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
	);
};

// Resolve a portal'd element belonging to ONE side: the side's trigger (inside
// its container) advertises its own content via `aria-controls`, so following
// that id from the container guarantees we hit that runtime's portal subtree
// on document.body, never the other side's.
const portalItem = (m: DiffMount, triggerId: string, itemId: string): HTMLElement => {
	const trigger = findById(m.container, triggerId);
	const contentId = trigger.getAttribute('aria-controls');
	if (!contentId) throw new Error(`#${triggerId} has no aria-controls`);
	const content = document.getElementById(contentId) ?? findById(document.body, contentId);
	return findById(content, itemId);
};

const clickEl = (el: HTMLElement): void => {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};

describe('differential: @octanejs/shadcn vs upstream shadcn on React', () => {
	it('Badge: variants + className merge + asChild anchor, byte-identical', async () => {
		const d = await mountDifferential(fixture('badge'), 'BadgeGallery', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Button: variants/sizes/disabled + asChild anchor + onClick wiring, byte-identical', async () => {
		const d = await mountDifferential(fixture('button'), 'ButtonApp', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click increments', async (i, r) => {
			await i.click('#btn');
			await r.click('#btn');
		});
		await d.step('click again', async (i, r) => {
			await i.click('#btn');
			await r.click('#btn');
		});
		d.unmount();
	});

	it('Tabs: switch panels via trigger mousedown, byte-identical', async () => {
		const d = await mountDifferential(fixture('tabs'), 'TabsApp', undefined, CACHE);
		await d.step('mount (one active)', () => {});
		// Radix Tabs activates on MOUSEDOWN (not click) — dispatch it explicitly
		// on both sides (radix's parity suite does the same).
		const mousedown = (root: HTMLElement, id: string): void => {
			findById(root, id).dispatchEvent(
				new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
			);
		};
		await d.step('activate two', async (i, r) => {
			await settleRaf();
			mousedown(i.container, 't2');
			mousedown(r.container, 't2');
			await settleRaf();
		});
		await d.step('back to one', async (i, r) => {
			mousedown(i.container, 't1');
			mousedown(r.container, 't1');
			await settleRaf();
		});
		d.unmount();
	});

	it('Dialog (non-modal): trigger ARIA + open-state text across open/close, byte-identical', async () => {
		// Content (overlay + panel + close button) portals to document.body on
		// both runtimes, so the container compare covers the trigger's
		// ARIA/data-state wiring and the fixture's onOpenChange-driven state text;
		// portal'd content markup is covered by overlays.test.ts. Close goes
		// through the trigger toggle — the DialogClose button lives in the portal.
		const d = await mountDifferential(fixture('dialog'), 'DialogApp', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		await d.step('open', async (i, r) => {
			await settleRaf();
			await i.click('#dt');
			await r.click('#dt');
		});
		await d.step('close (trigger toggle)', async (i, r) => {
			await settleRaf();
			await i.click('#dt');
			await r.click('#dt');
		});
		d.unmount();
	});

	it('DropdownMenu (non-modal): open, toggle checkbox item, reopen, select item — byte-identical', async () => {
		const d = await mountDifferential(fixture('dropdown-menu'), 'DropdownApp', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		await d.step('open', async (i, r) => {
			await settleRaf();
			pointerdown(i.container, 'mt');
			pointerdown(r.container, 'mt');
			await settleRaf();
		});
		// Toggling the checkbox item routes through onCheckedChange AND closes the
		// menu (radix select default) — both observable in the container bytes via
		// the state text and the trigger's data-state/aria-expanded.
		await d.step('toggle checkbox item (selects + closes)', async (i, r) => {
			clickEl(portalItem(i, 'mt', 'mi-check'));
			clickEl(portalItem(r, 'mt', 'mi-check'));
			await settleRaf();
		});
		await d.step('reopen (checkbox now checked)', async (i, r) => {
			pointerdown(i.container, 'mt');
			pointerdown(r.container, 'mt');
			await settleRaf();
		});
		await d.step('select Copy (records + closes)', async (i, r) => {
			clickEl(portalItem(i, 'mt', 'mi-copy'));
			clickEl(portalItem(r, 'mt', 'mi-copy'));
			await settleRaf();
		});
		d.unmount();
	});
});
