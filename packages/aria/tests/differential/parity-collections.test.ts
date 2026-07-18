/**
 * Phase-2 collections differential parity: the SAME `.tsrx` fixtures run through
 * @octanejs/aria (octane) and the real react-aria/react-stately (React), driving identical
 * clicks and asserting byte-identical innerHTML per step. Covers the collection builder,
 * useTabListState's default-selection effect, the tab/panel aria-controls/labelledby/id
 * wiring through useId, and useListState/useListBox/useOption selection.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-tabs.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/aria Phase-2 tabs vs real react-aria', () => {
	it('default selection + roles + aria wiring, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TabsSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('clicking a tab moves selection, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TabsSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select two', async (i, r) => {
			await i.click('[role="tab"]:nth-child(2)');
			await r.click('[role="tab"]:nth-child(2)');
		});
		d.unmount();
	});
});

const LISTBOX_FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-listbox.tsrx');

describe('differential: @octanejs/aria Phase-2 listbox vs real react-aria', () => {
	it('roles + labelling on mount, byte-identical', async () => {
		const d = await mountDifferential(LISTBOX_FIXTURE, 'ListBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('clicking an option selects it, byte-identical', async () => {
		const d = await mountDifferential(LISTBOX_FIXTURE, 'ListBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select banana', async (i, r) => {
			await i.click('[role="option"]:nth-child(2)');
			await r.click('[role="option"]:nth-child(2)');
		});
		d.unmount();
	});
});
