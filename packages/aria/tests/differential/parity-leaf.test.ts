/**
 * Phase-1 leaf-hook differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/aria (octane) and the real react-aria/react-stately (React), driving
 * identical events and asserting byte-identical innerHTML per step. This covers the
 * whole prop-bag pipeline end to end: useButton/useToggleButton over usePress,
 * checkbox/switch/radio over useToggle + the native-`input` wiring, useTextField over
 * useControlledState + useField id plumbing, and useProgressBar over useLabel +
 * useNumberFormatter.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-diff-leaf.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/aria Phase-1 leaf hooks vs real react-aria', () => {
	it('useButton: native button + onPress via click, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ButtonBasic', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click', async (i, r) => {
			await i.click('#btn');
			await r.click('#btn');
		});
		d.unmount();
	});

	it('useButton: span elementType gets role/tabIndex and presses, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SpanButton', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('click', async (i, r) => {
			await i.click('#span-btn');
			await r.click('#span-btn');
		});
		d.unmount();
	});

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

	it('useSwitch: role=switch + click toggles, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'SwitchSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('toggle', async (i, r) => {
			await i.click('#sw');
			await r.click('#sw');
		});
		d.unmount();
	});

	it('useRadioGroup/useRadio: selection moves on click with shared group name, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'RadioGroupSpec', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select b', async (i, r) => {
			await i.click('#radio-b');
			await r.click('#radio-b');
		});
		d.unmount();
	});

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

	it('useProgressBar: aria value attributes + formatted valuetext, byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ProgressSpec', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});
