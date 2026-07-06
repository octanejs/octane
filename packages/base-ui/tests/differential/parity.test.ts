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

	it('ToggleGroup: single-select (composite roving tabindex + value → aria-pressed)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupSingle', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click center → value moves', async (i, r) => {
			await i.click('.ti:nth-child(2)');
			await r.click('.ti:nth-child(2)');
		});
		d.unmount();
	});

	it('ToggleGroup: multiple-select (data-multiple, two items pressed)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupMultiple', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click center → adds to selection', async (i, r) => {
			await i.click('.ti:nth-child(2)');
			await r.click('.ti:nth-child(2)');
		});
		d.unmount();
	});

	it('ToggleGroup: disabled group (data-disabled + every button disabled)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleGroupDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Avatar: image + fallback (image inert under jsdom → fallback shows, img unmounted)', async () => {
		const d = await mountDifferential(FIXTURE, 'AvatarBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Avatar: fallback only (no image)', async () => {
		const d = await mountDifferential(FIXTURE, 'AvatarFallbackOnly', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Switch: uncontrolled — click toggles aria-checked + data-checked (native input adaptation)', async () => {
		const d = await mountDifferential(FIXTURE, 'SwitchBasic', undefined, CACHE);
		await d.step('mount (unchecked)', () => {});
		await d.step('click → checked', async (i, r) => {
			await i.click('[role="switch"]');
			await r.click('[role="switch"]');
		});
		await d.step('click → unchecked', async (i, r) => {
			await i.click('[role="switch"]');
			await r.click('[role="switch"]');
		});
		d.unmount();
	});

	it('Switch: uncontrolled default-checked (aria-checked starts true; click unchecks)', async () => {
		const d = await mountDifferential(FIXTURE, 'SwitchDefaultChecked', undefined, CACHE);
		await d.step('mount (checked)', () => {});
		await d.step('click → unchecked', async (i, r) => {
			await i.click('[role="switch"]');
			await r.click('[role="switch"]');
		});
		d.unmount();
	});

	it('Switch: disabled (native disabled input + data-disabled; click is a no-op)', async () => {
		const d = await mountDifferential(FIXTURE, 'SwitchDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click → still unchecked', async (i, r) => {
			await i.click('[role="switch"]');
			await r.click('[role="switch"]');
		});
		d.unmount();
	});

	it('Checkbox: uncontrolled — click ticks + mounts the Indicator', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxBasic', undefined, CACHE);
		await d.step('mount (unchecked, no indicator)', () => {});
		await d.step('click → checked + indicator', async (i, r) => {
			await i.click('[role="checkbox"]');
			await r.click('[role="checkbox"]');
		});
		d.unmount();
	});

	it('Checkbox: uncontrolled default-checked (aria-checked true, data-checked, indicator)', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxDefaultChecked', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click → unchecked', async (i, r) => {
			await i.click('[role="checkbox"]');
			await r.click('[role="checkbox"]');
		});
		d.unmount();
	});

	it('Checkbox: indeterminate (aria-checked="mixed" + data-indeterminate)', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxIndeterminate', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Checkbox: disabled (native disabled input + data-disabled; click is a no-op)', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click → still unchecked', async (i, r) => {
			await i.click('[role="checkbox"]');
			await r.click('[role="checkbox"]');
		});
		d.unmount();
	});

	it('CheckboxGroup: shared value — child derives checked; click updates the group', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxGroupBasic', undefined, CACHE);
		await d.step('mount (a checked)', () => {});
		await d.step('click b → added to group', async (i, r) => {
			await i.click('.cb:nth-child(3)');
			await r.click('.cb:nth-child(3)');
		});
		d.unmount();
	});

	it('CheckboxGroup: parent (select-all) is indeterminate when some children are ticked', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxGroupParent', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('NumberField: Root/Group/Input/steppers render the formatted value byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'NumberFieldBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('NumberField: at max boundary the Increment button is disabled', async () => {
		const d = await mountDifferential(FIXTURE, 'NumberFieldBoundary', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Dialog: closed Root+Trigger renders the trigger byte-identically (Store foundation)', async () => {
		const d = await mountDifferential(FIXTURE, 'DialogClosed', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		d.unmount();
	});

	// GAP: the open path currently reuses `@octanejs/floating-ui`'s FloatingPortal + FocusManager,
	// which emit `data-floating-ui-*` attributes (+ different FocusGuard style/role and container
	// handling) — Base UI emits `data-base-ui-*`. Byte-parity needs Base UI's own FloatingPortal +
	// FloatingFocusManager ported (next). The Root/Trigger/Interactions/parts + dismiss/scroll layer
	// are all in place; this flips green once those land.
	it.skip('Dialog: open modal (Portal/Backdrop/Popup/Title/Description/Close) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'DialogOpen', undefined, CACHE);
		await d.step('mount (open)', () => {});
		d.unmount();
	});

	it('Slider: Root/Value/Control/Track/Indicator/Thumb render the value byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'SliderBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Slider: range slider renders two thumbs + sorted values byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'SliderRange', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Slider: ArrowUp on the thumb steps the value (aria-valuenow + indicator % + output re-render)', async () => {
		const d = await mountDifferential(FIXTURE, 'SliderBasic', undefined, CACHE);
		await d.step('mount (30)', () => {});
		await d.step('ArrowUp → 31', async (i, r) => {
			await i.keydown('input[type="range"]', 'ArrowUp');
			await r.keydown('input[type="range"]', 'ArrowUp');
		});
		d.unmount();
	});

	it('Slider: range ArrowRight steps only the pressed (first) thumb', async () => {
		const d = await mountDifferential(FIXTURE, 'SliderRange', undefined, CACHE);
		await d.step('mount ([20, 60])', () => {});
		await d.step('ArrowRight on thumb 0 → 21', async (i, r) => {
			await i.keydown('input[type="range"]', 'ArrowRight');
			await r.keydown('input[type="range"]', 'ArrowRight');
		});
		d.unmount();
	});

	it('RadioGroup: composite roving focus + value → aria-checked; click moves selection', async () => {
		const d = await mountDifferential(FIXTURE, 'RadioGroupBasic', undefined, CACHE);
		await d.step('mount (a selected)', () => {});
		await d.step('click b → selection moves', async (i, r) => {
			await i.click('.r:nth-child(3)');
			await r.click('.r:nth-child(3)');
		});
		d.unmount();
	});

	it('RadioGroup: disabled group (aria-disabled + every radio disabled)', async () => {
		const d = await mountDifferential(FIXTURE, 'RadioGroupDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Field: label/control/description id association (for/aria-labelledby/aria-describedby)', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Field: disabled (data-disabled propagates to parts)', async () => {
		const d = await mountDifferential(FIXTURE, 'FieldDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Input: standalone (Field.Control with the inert default context)', async () => {
		const d = await mountDifferential(FIXTURE, 'InputBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Form: wraps a Field (form novalidate + FormContext)', async () => {
		const d = await mountDifferential(FIXTURE, 'FormBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});
