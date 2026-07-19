/**
 * Phase-5 differential parity: the SAME react-aria-components collection trees run
 * through @octanejs/aria/components (octane) and the REAL react-aria-components 1.19.0
 * (React), driving identical interactions and asserting byte-identical innerHTML per
 * step. Covers ListBox (dynamic items, click selection, keyed reverse), Tabs (switch),
 * TagGroup (multi-select toggling), GridList (row selection), Breadcrumbs (static
 * structure), and ComboBox's in-container wiring while typing (the open popover portals
 * to document.body on both sides, outside the rig's compare — Menu/Select open-state
 * carries behavioral coverage in rac-menu/rac-select-combobox tests instead).
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-rac-collections.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

// jsdom lacks CSS.escape and getAnimations (selection delegates + RAC animation
// helpers hit both, on both sides).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}
if (typeof (Element.prototype as any).getAnimations !== 'function') {
	(Element.prototype as any).getAnimations = () => [];
}

describe('differential: @octanejs/aria/components Phase-5 collections vs real react-aria-components', () => {
	it('ListBox: dynamic items, click selection, keyed reverse, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ListBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select banana', async (i, r) => {
			await i.click('[data-key="banana"]');
			await r.click('[data-key="banana"]');
		});
		await d.step('reverse items', async (i, r) => {
			await i.click('#reverse');
			await r.click('#reverse');
		});
		d.unmount();
	});

	it('Tabs: default selection + click switch, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TabsSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select two', async (i, r) => {
			await i.click('[data-key="two"]');
			await r.click('[data-key="two"]');
		});
		d.unmount();
	});

	it('TagGroup: multiple-selection toggling, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TagGroupSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select news', async (i, r) => {
			await i.click('[data-key="news"]');
			await r.click('[data-key="news"]');
		});
		await d.step('select travel too', async (i, r) => {
			await i.click('[data-key="travel"]');
			await r.click('[data-key="travel"]');
		});
		d.unmount();
	});

	it('GridList: row selection, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'GridListSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select row a', async (i, r) => {
			await i.click('[data-key="a"]');
			await r.click('[data-key="a"]');
		});
		d.unmount();
	});

	it('Breadcrumbs: structure + aria-current, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'BreadcrumbsSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('ComboBox: typing updates in-container combobox wiring, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ComboBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('type ap', async (i, r) => {
			await i.input('#combo-input', 'ap');
			await r.input('#combo-input', 'ap');
		});
		d.unmount();
	});
});
