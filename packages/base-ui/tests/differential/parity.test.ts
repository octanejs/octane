/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/base-ui (octane)
 * AND the real Base UI components (React) — the setup rewrites `@octanejs/base-ui/<sub>`
 * → `@base-ui/react/<sub>` and `octane` → `react`. octane's `mountDifferential`
 * mounts both, and asserts byte-identical innerHTML after each step. This is the
 * gold-standard proof that the port behaves like Base UI — not just "passes my tests".
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/base-ui-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/base-ui vs real Base UI on React', () => {
	it('Separator: default (horizontal), byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SeparatorDefault', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Separator: vertical (state → data-orientation)', async () => {
		const d = await mountDifferential(FIXTURE, 'SeparatorVertical', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Separator: render-prop element form (clones onto <hr>, className concatenates)', async () => {
		const d = await mountDifferential(FIXTURE, 'SeparatorRenderElement', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Separator: render-prop function form (merged props + state)', async () => {
		const d = await mountDifferential(FIXTURE, 'SeparatorRenderFn', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Separator: className as function of state', async () => {
		const d = await mountDifferential(FIXTURE, 'SeparatorClassNameFn', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('useRender: basic custom element with state → data-*', async () => {
		const d = await mountDifferential(FIXTURE, 'UseRenderBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('useRender: render-prop function form', async () => {
		const d = await mountDifferential(FIXTURE, 'UseRenderFn', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Fieldset: basic (legend→root aria-labelledby wiring via layout effect)', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldsetBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Fieldset: disabled (disabled attr + data-disabled on root, inherited on legend)', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldsetDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Fieldset: explicit legend id wins, still wired to aria-labelledby', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldsetLegendId', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Fieldset: legend render-prop (renders <section>, keeps id wiring)', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldsetLegendRender', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Meter: basic (value→percent, aria-value*, indicator width%, value text)', async () => {
		const d = await mountDifferential(FIXTURE, 'MeterBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Meter: custom min/max (percentage is position within the range)', async () => {
		const d = await mountDifferential(FIXTURE, 'MeterRange', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Meter: explicit Intl format (value text + aria-valuetext)', async () => {
		const d = await mountDifferential(FIXTURE, 'MeterFormatted', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Progress: basic (status→data-progressing on every part, aria-valuenow, width%)', async () => {
		const d = await mountDifferential(FIXTURE, 'ProgressBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Progress: complete (value === max → data-complete)', async () => {
		const d = await mountDifferential(FIXTURE, 'ProgressComplete', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Progress: indeterminate (value null → data-indeterminate, no aria-valuenow, empty fill)', async () => {
		const d = await mountDifferential(FIXTURE, 'ProgressIndeterminate', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Toggle: uncontrolled — click toggles aria-pressed (button type + tabindex)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleBasic', undefined, CACHE);
		await d.step('mount (aria-pressed false)', () => {});
		await d.step('click → pressed', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		await d.step('click → unpressed', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});

	it('Toggle: uncontrolled defaultPressed (aria-pressed starts true)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleDefaultPressed', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click → unpressed', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});

	it('Toggle: disabled (native disabled attr; click is a no-op)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click → still unpressed', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});

	it('Toggle: controlled (pressed prop owns state; click does not change DOM)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleControlled', undefined, CACHE);
		await d.step('mount (aria-pressed true)', () => {});
		await d.step('click → unchanged', async (i, r) => {
			await i.click('button');
			await r.click('button');
		});
		d.unmount();
	});
});
