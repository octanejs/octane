/**
 * Tree/Table-phase differential parity: the SAME react-aria-components Tree and Table
 * trees run through @octanejs/aria/components (octane) and the REAL
 * react-aria-components 1.19.0 (React), driving identical interactions and asserting
 * byte-identical innerHTML per step. Both components render inline (no portals), so the
 * full container compare applies. Covers treegrid structure + chevron expand/collapse +
 * row selection through the checkbox slot, and table structure + sort cycling +
 * multiple row selection. Column-resize pixel behavior is layout-driven (jsdom zero
 * rects) and carries behavioral coverage in rac-table.test.ts instead.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-tree-table.tsrx');
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

describe('differential: @octanejs/aria/components Tree + Table vs real react-aria-components', () => {
	// Tree compares controlled STRUCTURE states only: chevron-driven interaction goes
	// through useTreeItem's expand-button onPress, which also moves the selection
	// manager's focusedKey — and the follow-on focus effects are not faithfully
	// driveable by the rig's virtual (el.click-only) events on the React side (the same
	// shared-document focus limitation as Phase 1's focus fixtures; the probe showed
	// React's side ends with real DOM focus parked on the previously-focused row).
	// rac-tree.test.ts carries the interaction coverage with real focus.
	it('Tree: treegrid structure with a branch expanded, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TreeSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Tree: fully collapsed structure, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TreeCollapsedSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Tree: nested expansion + checkbox selection state, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TreeExpandedSelectedSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Table: grid structure, sort cycling, row selection, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TableSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('sort by name ascending', async (i, r) => {
			await i.click('[data-key="name"]');
			await r.click('[data-key="name"]');
		});
		await d.step('sort by name descending', async (i, r) => {
			await i.click('[data-key="name"]');
			await r.click('[data-key="name"]');
		});
		await d.step('select row r2', async (i, r) => {
			await i.click('[data-key="r2"]');
			await r.click('[data-key="r2"]');
		});
		d.unmount();
	});
});
