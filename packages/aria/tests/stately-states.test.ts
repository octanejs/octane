import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ToggleUncontrolled,
	ToggleReadOnly,
	ToggleControlled,
	ToggleInputHarness,
	CheckboxGroupHarness,
	RadioGroupHarness,
	RadioGroupControlled,
	RadioGroupReadOnly,
	FormValidationClient,
	FormValidationServer,
	LocaleWithProvider,
	LocaleDefault,
	NumberDE,
	NumberUS,
	FilterHarness,
} from './_fixtures/stately-states.tsx';

// @octanejs/aria/stately — Phase-1 state hooks + i18n.

const text = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector(`[data-testid="${testid}"]`)!.textContent;
const click = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click();

describe('@octanejs/aria/stately — useToggleState', () => {
	it('uncontrolled: defaultSelected seeds the state, toggle flips it, onChange observes it', async () => {
		const r = mount(ToggleUncontrolled);
		expect(text(r, 'selected')).toBe('sel:true');
		expect(text(r, 'default')).toBe('def:true');
		await act(() => click(r, 'toggle'));
		expect(text(r, 'selected')).toBe('sel:false');
		expect(text(r, 'log')).toBe('log:false');
		await act(() => click(r, 'toggle'));
		expect(text(r, 'selected')).toBe('sel:true');
		expect(text(r, 'log')).toBe('log:true');
		// defaultSelected reflects the prop, not the live state.
		expect(text(r, 'default')).toBe('def:true');
		r.unmount();
	});

	it('readOnly: toggle and setSelected are ignored and onChange never fires', async () => {
		const r = mount(ToggleReadOnly);
		expect(text(r, 'selected')).toBe('sel:false');
		await act(() => click(r, 'toggle'));
		await act(() => click(r, 'on'));
		expect(text(r, 'selected')).toBe('sel:false');
		expect(text(r, 'log')).toBe('log:none');
		r.unmount();
	});

	it('controlled: the parent-wired isSelected drives the render through onChange', async () => {
		const r = mount(ToggleControlled);
		expect(text(r, 'selected')).toBe('sel:false');
		await act(() => click(r, 'toggle'));
		expect(text(r, 'selected')).toBe('sel:true');
		await act(() => click(r, 'toggle'));
		expect(text(r, 'selected')).toBe('sel:false');
		r.unmount();
	});
});

describe('@octanejs/aria — useToggle', () => {
	it('inputProps render a checkbox whose native input event drives ToggleState', async () => {
		const r = mount(ToggleInputHarness);
		const input = r.container.querySelector<HTMLInputElement>('[data-testid="input"]')!;
		expect(input.type).toBe('checkbox');
		expect(input.checked).toBe(false);
		expect(text(r, 'selected')).toBe('sel:false');

		await act(() => {
			// A user toggle: the platform flips `checked`, then fires the native input event.
			input.checked = true;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
		expect(text(r, 'selected')).toBe('sel:true');
		expect(input.checked).toBe(true);
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useCheckboxGroupState', () => {
	it('adds, removes, and toggles values, notifying onChange with the new array', async () => {
		const r = mount(CheckboxGroupHarness);
		expect(text(r, 'value')).toBe('v:a');
		expect(text(r, 'sel-a')).toBe('a:true');

		await act(() => click(r, 'add-b'));
		expect(text(r, 'value')).toBe('v:a,b');
		expect(text(r, 'log')).toBe('log:a|b');

		// Adding an already-selected value is a no-op.
		await act(() => click(r, 'add-a'));
		expect(text(r, 'value')).toBe('v:a,b');
		expect(text(r, 'log')).toBe('log:a|b');

		await act(() => click(r, 'remove-a'));
		expect(text(r, 'value')).toBe('v:b');
		expect(text(r, 'sel-a')).toBe('a:false');
		expect(text(r, 'log')).toBe('log:b');

		await act(() => click(r, 'toggle-c'));
		expect(text(r, 'value')).toBe('v:b,c');
		await act(() => click(r, 'toggle-c'));
		expect(text(r, 'value')).toBe('v:b');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useRadioGroupState', () => {
	it('uncontrolled: defaultValue seeds selection and setSelectedValue selects + notifies', async () => {
		const r = mount(RadioGroupHarness);
		expect(text(r, 'selected')).toBe('v:a');
		expect(text(r, 'default')).toBe('def:a');
		await act(() => click(r, 'select-b'));
		expect(text(r, 'selected')).toBe('v:b');
		expect(text(r, 'log')).toBe('log:b');
		// The default selected value is unaffected by selection.
		expect(text(r, 'default')).toBe('def:a');
		r.unmount();
	});

	it('controlled: the parent-wired value drives the render through onChange', async () => {
		const r = mount(RadioGroupControlled);
		expect(text(r, 'selected')).toBe('v:x');
		await act(() => click(r, 'select-y'));
		expect(text(r, 'selected')).toBe('v:y');
		r.unmount();
	});

	it('readOnly: setSelectedValue is ignored', async () => {
		const r = mount(RadioGroupReadOnly);
		expect(text(r, 'selected')).toBe('v:a');
		await act(() => click(r, 'select-b'));
		expect(text(r, 'selected')).toBe('v:a');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useFormValidationState', () => {
	it('client validate surfaces realtime + display errors with the custom-error validity shape', async () => {
		const r = mount(FormValidationClient);
		expect(text(r, 'display')).toBe('d:false:');
		expect(text(r, 'realtime')).toBe('r:false:');
		expect(text(r, 'details')).toBe('custom:false:valid:true');

		await act(() => click(r, 'set-bad'));
		expect(text(r, 'display')).toBe('d:true:Bad value');
		expect(text(r, 'realtime')).toBe('r:true:Bad value');
		expect(text(r, 'details')).toBe('custom:true:valid:false');

		await act(() => click(r, 'set-good'));
		expect(text(r, 'display')).toBe('d:false:');
		expect(text(r, 'details')).toBe('custom:false:valid:true');
		r.unmount();
	});

	it('server errors arrive via FormValidationContext by field name and clear on commit', async () => {
		const r = mount(FormValidationServer);
		expect(text(r, 'display')).toBe('d:true:Username taken');
		expect(text(r, 'realtime')).toBe('r:true:Username taken');

		// Committing a change clears server errors (the user addressed the field).
		await act(() => click(r, 'commit'));
		expect(text(r, 'display')).toBe('d:false:');
		expect(text(r, 'realtime')).toBe('r:false:');
		r.unmount();
	});
});

describe('@octanejs/aria — i18n', () => {
	it('I18nProvider supplies locale + direction to useLocale', () => {
		const r = mount(LocaleWithProvider);
		expect(text(r, 'locale')).toBe('ar-AE:rtl');
		r.unmount();
	});

	it('useLocale falls back to the browser default locale without a provider', () => {
		const r = mount(LocaleDefault);
		expect(text(r, 'locale')).toBe(`${navigator.language}:ltr`);
		r.unmount();
	});

	it('useNumberFormatter formats per the provided locale', () => {
		const de = mount(NumberDE);
		expect(text(de, 'number')).toBe('n:1.234,56');
		de.unmount();

		const us = mount(NumberUS);
		expect(text(us, 'number')).toBe('n:1,234.56');
		us.unmount();
	});

	it('useFilter matches case- and diacritic-insensitively with sensitivity "base"', () => {
		const r = mount(FilterHarness);
		expect(text(r, 'filter')).toBe('f:true,true,false,true,false,true');
		r.unmount();
	});
});
