/**
 * Phase-1 leaf-hook differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/aria (octane) and the real react-aria/react-stately (React), driving
 * identical events and asserting byte-identical innerHTML per step. This covers the
 * whole prop-bag pipeline end to end: useButton/useToggleButton over usePress,
 * checkbox/switch/radio over useToggle + the native-`input` wiring, useTextField over
 * useControlledState + useField id plumbing, and useProgressBar over useLabel +
 * useNumberFormatter.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-leaf.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/aria Phase-1 leaf hooks vs real react-aria', () => {
	// @parity-case differential:aria-usebutton-native-button-onpress-click
	it('useButton: native button + onPress via click, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonBasic', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click', async (i, r) => {
			await i.click('#btn');
			await r.click('#btn');
		});
		d.unmount();
	});

	// @parity-case differential:aria-usebutton-span-elementtype-gets-role-tabindex-presses
	it('useButton: span elementType gets role/tabIndex and presses, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SpanButton', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click', async (i, r) => {
			await i.click('#span-btn');
			await r.click('#span-btn');
		});
		d.unmount();
	});

	// @parity-case differential:aria-usetogglebutton-aria-pressed-toggles-click
	it('useToggleButton: aria-pressed toggles on click, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ToggleButtonSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('toggle on', async (i, r) => {
			await i.click('#toggle-btn');
			await r.click('#toggle-btn');
		});
		await d.step('toggle off', async (i, r) => {
			await i.click('#toggle-btn');
			await r.click('#toggle-btn');
		});
		d.unmount();
	});

	// @parity-case differential:aria-usecheckbox-click-toggles-selection-through-native-input-event
	it('useCheckbox: click toggles selection through the native input event, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'CheckboxSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('check', async (i, r) => {
			await i.click('#cb');
			await r.click('#cb');
		});
		await d.step('uncheck', async (i, r) => {
			await i.click('#cb');
			await r.click('#cb');
		});
		d.unmount();
	});

	// @parity-case differential:aria-useswitch-role-switch-click-toggles
	it('useSwitch: role=switch + click toggles, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SwitchSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('toggle', async (i, r) => {
			await i.click('#sw');
			await r.click('#sw');
		});
		d.unmount();
	});

	// @parity-case differential:aria-useradiogroup-useradio-selection-moves-click-shared-group-name
	it('useRadioGroup/useRadio: selection moves on click with shared group name, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'RadioGroupSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select b', async (i, r) => {
			await i.click('#radio-b');
			await r.click('#radio-b');
		});
		d.unmount();
	});

	// OCTANE DIVERGENCE[native-input-event-wiring][differential:aria-leaf-textfield]
	// @parity-case differential:aria-leaf-textfield
	it('useTextField: typing updates value through the native input event + field ids, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'TextFieldSpec', undefined, CACHE);
		await d.step('mount', () => {});
		// useField assigns the input's id (the fixture's literal id is overridden by the
		// spread on BOTH sides) — select by tag.
		await d.step('type', async (i, r) => {
			await i.input('input', 'hi');
			await r.input('input', 'hi');
		});
		d.unmount();
	});

	// @parity-case differential:aria-useprogressbar-aria-value-attributes-formatted-valuetext
	it('useProgressBar: aria value attributes + formatted valuetext, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ProgressSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});

	// @parity-case differential:aria-usenumberfieldstate-controlled-values-unfinished-edits-match-pinned-react
	it('useNumberFieldState: controlled values and unfinished edits match pinned react-stately', async () => {
		const d = await mountDifferential(FIXTURE, 'NumberFieldStateSpec', undefined, CACHE);
		await d.step('initial controlled format', () => {
			expect(d.octane.find('#number-input').textContent).toBe('1,234.5');
		});
		await d.step('preserve unfinished user-entered precision', async (octane, react) => {
			await octane.click('#number-draft');
			await react.click('#number-draft');
			expect(octane.find('#number-input').textContent).toBe('9,876.500');
		});
		await d.step('keep the draft when equivalent options are recreated', async (octane, react) => {
			await octane.click('#number-refresh');
			await react.click('#number-refresh');
			expect(octane.find('#number-input').textContent).toBe('9,876.500');
		});
		await d.step('reconcile a new controlled value and parser together', async (octane, react) => {
			await octane.click('#number-value');
			await react.click('#number-value');
			expect(octane.find('#number-input').textContent).toBe('2,500.25');
			expect(octane.find('#number-parsed').textContent).toBe('2500.25');
		});
		d.unmount();
	});

	// @parity-case differential:aria-usenumberfieldstate-locale-formatting-user-selected-numerals-match-react
	it('useNumberFieldState: locale, formatting and user-selected numerals match react-stately', async () => {
		const d = await mountDifferential(FIXTURE, 'NumberFieldStateSpec', undefined, CACHE);
		await d.step('switch locale and parser', async (octane, react) => {
			await octane.click('#number-german');
			await react.click('#number-german');
			expect(octane.find('#number-input').textContent).toBe('1.234,5');
			expect(octane.find('#number-parsed').textContent).toBe('1234.5');
		});
		await d.step('reformat when effective format options change', async (octane, react) => {
			await octane.click('#number-precision');
			await react.click('#number-precision');
			expect(octane.find('#number-input').textContent).toBe('1.234,50');
		});
		await d.step('switch to an Arabic locale', async (octane, react) => {
			await octane.click('#number-arabic');
			await react.click('#number-arabic');
		});
		await d.step('honor a user-selected Latin numbering system', async (octane, react) => {
			await octane.click('#number-latin');
			await react.click('#number-latin');
			expect(octane.find('#number-input').textContent).toBe('9876.5');
		});
		await d.step(
			'retain user-selected numerals for the next controlled value',
			async (octane, react) => {
				await octane.click('#number-value');
				await react.click('#number-value');
				expect(octane.find('#number-input').textContent).toBe('2,500.25');
			},
		);
		d.unmount();
	});

	it.each([
		['USD', '$12.25', '12.25'],
		['JPY', '¥10', '10'],
		['BHD', 'BHD\u00a012.270', '12.27'],
		['KWD', 'KWD\u00a012.270', '12.27'],
	] as const)(
		'useNumberFieldState: %s rounding increments retain the same minor units as pinned react-stately',
		async (currency, formattedValue, parsedValue) => {
			const d = await mountDifferential(
				FIXTURE,
				'NumberFieldCurrencyRoundingSpec',
				{ currency },
				CACHE,
			);

			try {
				await d.step('initial currency formatting retains ISO minor units', (octane, react) => {
					expect(react.find('#currency-input').textContent).toBe(formattedValue);
					expect(react.find('#currency-parsed').textContent).toBe(parsedValue);
					expect(octane.find('#currency-input').textContent).toBe(formattedValue);
					expect(octane.find('#currency-parsed').textContent).toBe(parsedValue);
				});
			} finally {
				d.unmount();
			}
		},
	);

	it.each([
		['USD', '$10'],
		['JPY', '¥10'],
		['BHD', 'BHD\u00a010'],
		['KWD', 'KWD\u00a010'],
	] as const)(
		'useNumberFieldState: changing to %s rounding options retains pinned react-stately source-update behavior',
		async (currency, formattedValue) => {
			const d = await mountDifferential(
				FIXTURE,
				'NumberFieldCurrencyRoundingSpec',
				{ currency, locale: 'en-US-u-ca-gregory', initiallyFormatted: false },
				CACHE,
			);

			try {
				await d.step('unformatted initial value', () => {});
				await d.step('currency options change after initial mount', async (octane, react) => {
					await octane.click('#currency-enable');
					await react.click('#currency-enable');
					expect(react.find('#currency-input').textContent).toBe(formattedValue);
					expect(octane.find('#currency-input').textContent).toBe(formattedValue);
				});
			} finally {
				d.unmount();
			}
		},
	);
});
