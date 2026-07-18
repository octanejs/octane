/**
 * Phase-3 differential parity: the SAME Select `.tsrx` fixture runs through @octanejs/aria
 * (octane) and real react-aria/react-stately (React), asserting byte-identical innerHTML
 * per step. Covers useSelectState + useSelect trigger/label/value wiring, the HiddenSelect
 * native <select> mirror, and the inline listbox opening on trigger press.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

// jsdom lacks CSS.escape, which the selection delegates use to build `[data-key]`
// selectors when the listbox opens (both the octane and real-react-aria sides hit it).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-select.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/aria Phase-3 select vs real react-aria', () => {
	it('closed on mount with a hidden native select, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SelectSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('pressing the trigger opens the listbox, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SelectSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('open', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});
});
