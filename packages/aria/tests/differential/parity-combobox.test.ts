/**
 * Phase-3 differential parity: the SAME ComboBox `.tsrx` fixture runs through
 * @octanejs/aria (octane) and real react-aria/react-stately (React), driving identical
 * native input events and asserting byte-identical innerHTML per step. Covers
 * useComboBoxState filtering + useComboBox role=combobox / aria-expanded / aria-controls
 * wiring + the inline listbox render.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-combobox.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/aria Phase-3 combobox vs real react-aria', () => {
	it('closed on mount, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ComboBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('typing filters + opens the listbox, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ComboBoxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('type ap', async (i, r) => {
			await i.input('input', 'ap');
			await r.input('input', 'ap');
		});
		d.unmount();
	});
});
