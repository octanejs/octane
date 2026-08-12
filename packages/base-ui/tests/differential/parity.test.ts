/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/base-ui (octane)
 * AND the real Base UI components (React) — the setup rewrites `@octanejs/base-ui/<sub>`
 * → `@base-ui/react/<sub>` and `octane` → `react`. octane's `mountDifferential`
 * mounts both, and asserts byte-identical innerHTML after each step. This is the
 * gold-standard proof that the port behaves like Base UI — not just "passes my tests".
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
	normaliseHtml,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/base-ui-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

/**
 * The rig mounts BOTH runtimes into one jsdom document, so they share a single
 * `document.activeElement`. A `Menu.Popup` takes focus on open (unlike Dialog/Popover, whose
 * differential fixtures either run a MODAL focus manager or never focus), and it does so on both
 * sides — so whichever popup is focused last makes the OTHER runtime's still-focused portal fire a
 * `focusout` whose `relatedTarget` sits outside it. `FloatingPortal`'s non-modal tab-management
 * answers that by running `disableFocusInside(portalNode)`, which stamps
 * `tabindex="-1" data-tabindex="<prev>"` on every tabbable in that portal — including the focus
 * manager's own inside guards.
 *
 * Both runtimes run that identical code; the asymmetry is one document for two apps, not a port
 * divergence (probed: the side holding focus keeps its original `tabindex`, the side that lost it
 * gets `-1`, and which side that is flips with whatever the previous test left focused).
 *
 * Rather than delete the attributes, this UNDOES the disable — `disableFocusInside` stashes the
 * previous value in `data-tabindex`, so restoring it is exactly what `enableFocusInside` does when
 * focus comes back. Both sides therefore normalise to their pre-disable DOM and the `tabindex`
 * values are still compared, which matters once menu ITEMS are in the popup: their tabindex is
 * roving state (`open && highlighted ? 0 : -1`), not a constant, so blanket-stripping it would hide
 * a real roving-focus divergence. Everything else is byte-compared untouched.
 */
function undoFocusInsideDisable(html: string): string {
	return html.replace(/<[a-z]+ [^>]*data-tabindex="[^"]*"[^>]*>/g, (tag) => {
		const stashed = / data-tabindex="([^"]*)"/.exec(tag)?.[1] ?? '';
		const withoutStash = tag.replace(/ data-tabindex="[^"]*"/, '');
		return stashed === ''
			? withoutStash.replace(/ tabindex="[^"]*"/, '')
			: withoutStash.replace(/ tabindex="[^"]*"/, ` tabindex="${stashed}"`);
	});
}

/**
 * `d.step` for open menus: drives the step on both runtimes, then byte-compares after undoing the
 * shared-document focus artifact above on both sides.
 */
async function stepUndoingFocusDisable(
	d: any,
	name: string,
	fn: (i: any, r: any) => void | Promise<void> = () => {},
): Promise<void> {
	await d.observe(name, fn);
	const octane = undoFocusInsideDisable(normaliseHtml(d.octane.container.innerHTML));
	const react = undoFocusInsideDisable(normaliseHtml(d.react.container.innerHTML));
	expect(octane, `divergence at step "${name}"`).toBe(react);
}

/**
 * Byte-compare ONE subtree instead of the whole container.
 *
 * Needed for an open SUBMENU. The submenu trigger is the only tabbable child of the parent popup
 * while its submenu is open (`tabIndex: open || highlighted ? 0 : -1`), so the parent focus
 * manager's initial focus lands on it, and the trigger's `onFocus` sets the PARENT menu's
 * `activeIndex` — which surfaces as `data-highlighted`. With both runtimes in one document only one
 * can win that focus, so only one gets the derived state. Unlike the focus-guard `tabindex`, this is
 * store state, not a DOM attribute the rig can reconstruct.
 *
 * Verified it is the rig and not the port: mounted octane ALONE (no React competing for focus) and
 * the trigger *is* highlighted and *is* `document.activeElement`, matching React exactly. Rather
 * than normalise `data-highlighted` away — which would blind the roving-focus comparison the stage-2
 * helper deliberately preserves — this compares the submenu's OWN portal subtree, where the whole
 * stage-3 payload lives: nested placement, `data-nested`, the popup's aria wiring back to the
 * trigger, and the nested items. The trigger's own highlighted state is covered by an octane-only
 * assertion in `tests/menu.test.ts`.
 */
async function stepComparingSubtree(d: any, name: string, selector: string): Promise<void> {
	await d.observe(name, () => {});
	const pick = (root: HTMLElement) => {
		const el = root.querySelector(selector);
		expect(el, `no element matching ${selector}`).not.toBe(null);
		return undoFocusInsideDisable(normaliseHtml((el as HTMLElement).outerHTML));
	};
	expect(pick(d.octane.container), `divergence at step "${name}"`).toBe(pick(d.react.container));
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

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

	// OCTANE DIVERGENCE[ref-as-prop-class-composition][differential:base-ui-render-element]
	// @parity-case differential:base-ui-render-element
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

	// OCTANE DIVERGENCE[native-event-semantics][differential:base-ui-switch-native-input]
	// @parity-case differential:base-ui-switch-native-input
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

	// @parity-case differential:base-ui-number-field
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

	it('Popover: closed Root+Trigger renders the trigger byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'PopoverClosed', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		d.unmount();
	});

	// @parity-case differential:base-ui-dialog-open
	it('Dialog: open modal (Portal/Backdrop/Popup/Title/Description/Close) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'DialogOpen', undefined, CACHE);
		await d.step('mount (open)', () => {});
		d.unmount();
	});

	it('Popover: open anchored (Portal/Backdrop/Positioner/Popup/Arrow/Title/Description/Close) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'PopoverOpen', undefined, CACHE);
		await d.step('mount (open)', () => {});
		d.unmount();
	});

	it('AlertDialog: open modal (role=alertdialog, Dialog parts reused) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'AlertDialogOpen', undefined, CACHE);
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

	// @parity-case differential:base-ui-slider-keyboard
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
	it('Button: native button (type=button from useButton)', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonBasic', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Button: disabled (native disabled attribute)', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Button: focusableWhenDisabled (aria-disabled + stays a tab stop)', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonFocusableWhenDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Button: nativeButton={false} render target (role + tabindex on the span)', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonNonNative', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Button: disabled non-native render target (aria-disabled, no attribute)', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonNonNativeDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('DirectionProvider: useDirection defaults to ltr with no provider', async () => {
		const d = await mountDifferential(FIXTURE, 'DirectionDefault', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('DirectionProvider: provides the configured direction to descendants', async () => {
		const d = await mountDifferential(FIXTURE, 'DirectionRtl', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('DirectionProvider: the nearest provider wins when nested', async () => {
		const d = await mountDifferential(FIXTURE, 'DirectionNested', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('CSPProvider: renders no DOM of its own and passes children through', async () => {
		const d = await mountDifferential(FIXTURE, 'CspTransparent', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('useMediaQuery: reports the live matchMedia snapshot', async () => {
		const d = await mountDifferential(FIXTURE, 'MediaQueryProbe', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('useMediaQuery: the live snapshot overrides defaultMatches', async () => {
		const d = await mountDifferential(FIXTURE, 'MediaQueryDefaultMatches', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
	it('Dialog.Viewport: open (role=presentation container wrapping the popup)', async () => {
		const d = await mountDifferential(FIXTURE, 'DialogViewportOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Dialog.Viewport: closed (unmounted with the rest of the portal subtree)', async () => {
		const d = await mountDifferential(FIXTURE, 'DialogViewportClosed', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Popover.Viewport: open (current-content container inside the popup)', async () => {
		const d = await mountDifferential(FIXTURE, 'PopoverViewportOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
	it('Tooltip: closed (trigger only, popup subtree unmounted)', async () => {
		const d = await mountDifferential(FIXTURE, 'TooltipClosed', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	// @parity-case differential:base-ui-tooltip-open
	it('Tooltip: open (portal + anchored positioner + popup + arrow)', async () => {
		const d = await mountDifferential(FIXTURE, 'TooltipOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Tooltip.Viewport: open (current-content container inside the popup)', async () => {
		const d = await mountDifferential(FIXTURE, 'TooltipViewportOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Tooltip: disabled trigger (data-trigger-disabled, no trigger identifier)', async () => {
		const d = await mountDifferential(FIXTURE, 'TooltipDisabledTrigger', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Tooltip.Provider: shares a delay group without rendering DOM', async () => {
		const d = await mountDifferential(FIXTURE, 'TooltipProviderGroup', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
	it('PreviewCard: closed (link trigger only, popup subtree unmounted)', async () => {
		const d = await mountDifferential(FIXTURE, 'PreviewCardClosed', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('PreviewCard: open (portal + backdrop + anchored positioner + popup + arrow)', async () => {
		const d = await mountDifferential(FIXTURE, 'PreviewCardOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('PreviewCard.Viewport: open (current-content container inside the popup)', async () => {
		const d = await mountDifferential(FIXTURE, 'PreviewCardViewportOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
	it("AlertDialog.Viewport: open (Dialog's viewport reached through the AlertDialog namespace)", async () => {
		const d = await mountDifferential(FIXTURE, 'AlertDialogViewportOpen', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Menu: closed Root+Trigger renders the trigger byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuClosed', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		d.unmount();
	});

	it('Menu: open modal dropdown (Portal/backdrop/Positioner/Popup) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpen', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open non-modal dropdown (no internal backdrop) renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenNonModal', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with explicit side/align/sideOffset renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenPlacement', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with a disabled root renders byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenDisabled', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with items, a disabled item, Separator and Group/GroupLabel', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenWithItems', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with checkbox items (checked/unchecked + transition-mounted indicator)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenCheckboxItems', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	// Base UI's MENU indicators gate on `item.checked`, not on the `mounted` flag that
	// `Checkbox.Indicator`/`Radio.Indicator` use — so unchecking drops the node immediately and the
	// exit transition never runs. That reads as a bug against the rest of Base UI, and it was raised
	// as one in review, but it is upstream's own inconsistency (`MenuCheckboxItemIndicator.tsx` L26
	// does not even destructure `mounted`). Porting the "fix" would diverge from the real
	// `@base-ui/react`; this step is the proof that both runtimes drop it on the same commit, and
	// the guard against a future well-meant repair.
	// @parity-case differential:base-ui-menu-checkbox
	it('Menu: toggling a checkbox item matches Base UI, including the immediate indicator unmount', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenCheckboxItems', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open, first item checked)');
		await stepUndoingFocusDisable(d, 'uncheck the first item', async (i, r) => {
			await i.click('.menu-check');
			await r.click('.menu-check');
		});
		await stepUndoingFocusDisable(d, 're-check the first item', async (i, r) => {
			await i.click('.menu-check');
			await r.click('.menu-check');
		});
		d.unmount();
	});

	it('Menu: selecting a different radio item matches Base UI (indicator moves)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenRadioGroup', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open, second item selected)');
		await stepUndoingFocusDisable(d, 'select the first item', async (i, r) => {
			await i.click('.menu-radio');
			await r.click('.menu-radio');
		});
		d.unmount();
	});

	it('Menu: open with a radio group (group label wiring + selected indicator)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenRadioGroup', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with LinkItem, Arrow and Backdrop', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenLinkArrowBackdrop', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with a Viewport wrapping the items', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenViewport', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: open with a closed submenu (SubmenuTrigger is both a parent item and a trigger)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenWithSubmenu', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open, submenu closed)');
		d.unmount();
	});

	it('Toast: empty viewport (live region resting state)', async () => {
		const d = await mountDifferential(FIXTURE, 'ToastEmpty', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Toast: adding a toast renders it byte-identically', async () => {
		const d = await mountDifferential(FIXTURE, 'ToastBasic', undefined, CACHE);
		await d.step('mount (empty)', () => {});
		await d.step('add a toast', async (i, r) => {
			await i.click('.toast-add');
			await r.click('.toast-add');
		});
		await d.step('add a second toast', async (i, r) => {
			await i.click('.toast-add');
			await r.click('.toast-add');
		});
		d.unmount();
	});

	// @parity-case differential:base-ui-toast-limit
	it('Toast: limit marks older toasts limited rather than removing them', async () => {
		const d = await mountDifferential(FIXTURE, 'ToastLimited', undefined, CACHE);
		await d.step('add a toast', async (i, r) => {
			await i.click('.toast-add');
			await r.click('.toast-add');
		});
		await d.step('add a second toast (first becomes limited)', async (i, r) => {
			await i.click('.toast-add');
			await r.click('.toast-add');
		});
		d.unmount();
	});

	it('Toast: high priority renders alertdialog + the hidden alert live region', async () => {
		const d = await mountDifferential(FIXTURE, 'ToastHighPriority', undefined, CACHE);
		await d.step('add an urgent toast', async (i, r) => {
			await i.click('.toast-add-high');
			await r.click('.toast-add-high');
		});
		d.unmount();
	});

	it('Menubar: closed (composite root of menuitem triggers)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenubarClosed', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Menubar: vertical, non-modal, disabled (state attributes + orientation)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenubarVerticalDisabled', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Menubar: with one menu open (bar-cutout backdrop, orientation-driven side)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenubarOpenMenu', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('ContextMenu: closed Root+Trigger', async () => {
		const d = await mountDifferential(FIXTURE, 'ContextMenuClosed', undefined, CACHE);
		await d.step('mount (closed)', () => {});
		d.unmount();
	});

	it('ContextMenu: open (modal focus manager, fixed positioning, Menu parts via the namespace)', async () => {
		const d = await mountDifferential(FIXTURE, 'ContextMenuOpen', undefined, CACHE);
		await stepUndoingFocusDisable(d, 'mount (open)');
		d.unmount();
	});

	it('Menu: OPEN submenu subtree (nested placement, data-nested, aria wiring, nested items)', async () => {
		const d = await mountDifferential(FIXTURE, 'MenuOpenWithSubmenuOpen', undefined, CACHE);
		await stepComparingSubtree(d, 'mount (both open)', '.submenu-positioner');
		d.unmount();
	});
});
