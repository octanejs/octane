import { beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	CheckboxFieldScenario,
	CheckboxGroupScenario,
	CheckboxScenario,
	IndeterminateCheckbox,
	RadioGroupScenario,
	SwitchFieldScenario,
	SwitchScenario,
} from './_fixtures/rac-checkable.tsx';

// @octanejs/aria Phase 4 — RAC checkable form components (Checkbox / CheckboxGroup /
// CheckboxField / CheckboxButton / Switch / SwitchField / SwitchButton / RadioGroup /
// Radio / RadioField / RadioButton), driven by clicking the REAL hidden inputs —
// octane's native change-event wiring, no synthetic layer.

beforeAll(() => {
	// SharedElementTransition (RadioGroup wraps its children in one) calls
	// element.getAnimations() on its transition and exit paths; jsdom has no Web
	// Animations API. Same stub as rac-support.test.ts.
	if (typeof (Element.prototype as any).getAnimations !== 'function') {
		(Element.prototype as any).getAnimations = () => [];
	}
});

describe('@octanejs/aria/components — Checkbox', () => {
	it('toggles selection by clicking the real input, reflected in data-selected and render props', async () => {
		const r = mount(CheckboxScenario);
		const label = r.container.querySelector('[data-testid="cb"]') as HTMLLabelElement;
		expect(label.tagName).toBe('LABEL');
		expect(label.className).toBe('react-aria-Checkbox');
		expect(label.getAttribute('data-rac')).toBe('');
		const input = label.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('checkbox');
		expect(label.hasAttribute('data-selected')).toBe(false);
		expect(label.textContent).toBe('checkbox:off');
		expect(r.container.querySelector('#cb-value')!.textContent).toBe('selected:no');

		await act(() => {
			input.click();
		});
		expect(input.checked).toBe(true);
		expect(label.getAttribute('data-selected')).toBe('true');
		expect(label.className).toBe('react-aria-Checkbox is-selected');
		expect(label.textContent).toBe('checkbox:on');
		expect(r.container.querySelector('#cb-value')!.textContent).toBe('selected:yes');

		await act(() => {
			input.click();
		});
		expect(input.checked).toBe(false);
		expect(label.hasAttribute('data-selected')).toBe(false);
		expect(label.className).toBe('react-aria-Checkbox');
		expect(label.textContent).toBe('checkbox:off');
		r.unmount();
	});

	it('exposes the indeterminate prop on the input DOM property and data-indeterminate', async () => {
		const r = mount(IndeterminateCheckbox);
		// The `indeterminate` DOM property is set from an effect; flush it.
		await act(() => {});
		const label = r.container.querySelector('[data-testid="ind"]') as HTMLLabelElement;
		const input = label.querySelector('input') as HTMLInputElement;
		expect(input.indeterminate).toBe(true);
		expect(input.checked).toBe(true); // defaultSelected
		expect(label.getAttribute('data-indeterminate')).toBe('true');
		expect(label.getAttribute('data-selected')).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/aria/components — CheckboxGroup', () => {
	it('aggregates item selections into the group value and links the Label via LabelContext', async () => {
		const r = mount(CheckboxGroupScenario);
		const group = r.container.querySelector('[data-testid="group"]') as HTMLElement;
		expect(group.getAttribute('role')).toBe('group');
		expect(group.className).toBe('react-aria-CheckboxGroup');
		// The group has no aria-label, so the Label renders as a span (elementType from
		// LabelContext) and the group is labelled by it.
		const labelEl = group.querySelector('span.react-aria-Label') as HTMLElement;
		expect(labelEl.textContent).toBe('Options');
		expect(labelEl.id).toBeTruthy();
		expect(group.getAttribute('aria-labelledby')).toBe(labelEl.id);

		const itemA = r.container.querySelector('[data-testid="cb-a"]') as HTMLElement;
		const itemB = r.container.querySelector('[data-testid="cb-b"]') as HTMLElement;
		const inputA = itemA.querySelector('input') as HTMLInputElement;
		const inputB = itemB.querySelector('input') as HTMLInputElement;
		expect(r.container.querySelector('#group-value')!.textContent).toBe('value:');

		await act(() => {
			inputA.click();
		});
		expect(r.container.querySelector('#group-value')!.textContent).toBe('value:a');
		expect(itemA.getAttribute('data-selected')).toBe('true');
		expect(itemB.hasAttribute('data-selected')).toBe(false);

		await act(() => {
			inputB.click();
		});
		expect(r.container.querySelector('#group-value')!.textContent).toBe('value:a,b');
		expect(inputA.checked).toBe(true);
		expect(inputB.checked).toBe(true);

		await act(() => {
			inputA.click();
		});
		expect(r.container.querySelector('#group-value')!.textContent).toBe('value:b');
		expect(itemA.hasAttribute('data-selected')).toBe(false);
		r.unmount();
	});

	it('surfaces group-level validation through data-invalid and FieldError', async () => {
		const r = mount(CheckboxGroupScenario);
		const group = r.container.querySelector('[data-testid="group"]') as HTMLElement;
		expect(group.hasAttribute('data-invalid')).toBe(false);
		expect(r.container.querySelector('[data-testid="group-error"]')).toBeNull();

		await act(() => {
			(r.container.querySelector('#make-invalid') as HTMLElement).click();
		});
		expect(group.getAttribute('data-invalid')).toBe('true');
		const error = r.container.querySelector('[data-testid="group-error"]') as HTMLElement;
		expect(error.textContent).toBe('Pick fewer options');
		expect(error.className).toBe('react-aria-FieldError');
		// The FieldError rides the group's TextContext errorMessage slot.
		expect(error.getAttribute('slot')).toBe('errorMessage');
		r.unmount();
	});
});

describe('@octanejs/aria/components — CheckboxField + CheckboxButton', () => {
	it('mirrors selection on the field div and the button label, with description linkage', async () => {
		const r = mount(CheckboxFieldScenario);
		await act(() => {});
		const field = r.container.querySelector('[data-testid="cbf"]') as HTMLElement;
		expect(field.tagName).toBe('DIV');
		expect(field.className).toBe('react-aria-CheckboxField');
		expect(field.getAttribute('data-selected')).toBe('true'); // defaultSelected

		const button = r.container.querySelector('[data-testid="cbf-btn"]') as HTMLElement;
		expect(button.tagName).toBe('LABEL');
		expect(button.className).toBe('react-aria-CheckboxButton');
		expect(button.getAttribute('data-selected')).toBe('true');

		const input = button.querySelector('input') as HTMLInputElement;
		expect(input.checked).toBe(true);

		const desc = r.container.querySelector('[data-testid="cbf-desc"]') as HTMLElement;
		expect(desc.textContent!.trim()).toBe('Required to proceed');
		expect(desc.id).toBeTruthy();
		expect(input.getAttribute('aria-describedby')).toBe(desc.id);

		await act(() => {
			input.click();
		});
		expect(input.checked).toBe(false);
		expect(field.hasAttribute('data-selected')).toBe(false);
		expect(button.hasAttribute('data-selected')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — Switch', () => {
	it('renders role=switch and toggles data-selected and render props by clicking the input', async () => {
		const r = mount(SwitchScenario);
		const label = r.container.querySelector('[data-testid="sw"]') as HTMLLabelElement;
		expect(label.tagName).toBe('LABEL');
		expect(label.className).toBe('react-aria-Switch');
		const input = label.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('checkbox');
		expect(input.getAttribute('role')).toBe('switch');
		expect(label.hasAttribute('data-selected')).toBe(false);
		expect(label.textContent).toBe('switch:off');

		await act(() => {
			input.click();
		});
		expect(input.checked).toBe(true);
		expect(label.getAttribute('data-selected')).toBe('true');
		expect(label.className).toBe('react-aria-Switch is-on');
		expect(label.textContent).toBe('switch:on');

		await act(() => {
			input.click();
		});
		expect(label.hasAttribute('data-selected')).toBe(false);
		expect(label.className).toBe('react-aria-Switch');
		r.unmount();
	});
});

describe('@octanejs/aria/components — SwitchField + SwitchButton', () => {
	it('mirrors selection on the field div and the button label, with description linkage', async () => {
		const r = mount(SwitchFieldScenario);
		await act(() => {});
		const field = r.container.querySelector('[data-testid="swf"]') as HTMLElement;
		expect(field.tagName).toBe('DIV');
		expect(field.className).toBe('react-aria-SwitchField');
		expect(field.hasAttribute('data-selected')).toBe(false);

		const button = r.container.querySelector('[data-testid="swf-btn"]') as HTMLElement;
		expect(button.className).toBe('react-aria-SwitchButton');
		const input = button.querySelector('input') as HTMLInputElement;
		expect(input.getAttribute('role')).toBe('switch');

		const desc = r.container.querySelector('[data-testid="swf-desc"]') as HTMLElement;
		expect(desc.textContent!.trim()).toBe('Sends you emails');
		expect(input.getAttribute('aria-describedby')).toBe(desc.id);

		await act(() => {
			input.click();
		});
		expect(field.getAttribute('data-selected')).toBe('true');
		expect(button.getAttribute('data-selected')).toBe('true');
		expect(input.checked).toBe(true);
		r.unmount();
	});
});

describe('@octanejs/aria/components — RadioGroup', () => {
	it('moves single selection between radios, exposes orientation, and links the Label', async () => {
		const r = mount(RadioGroupScenario);
		const rg = r.container.querySelector('[data-testid="rg"]') as HTMLElement;
		expect(rg.getAttribute('role')).toBe('radiogroup');
		expect(rg.className).toBe('react-aria-RadioGroup');
		expect(rg.getAttribute('data-orientation')).toBe('horizontal');
		expect(rg.getAttribute('aria-orientation')).toBe('horizontal');

		const labelEl = rg.querySelector('span.react-aria-Label') as HTMLElement;
		expect(labelEl.textContent).toBe('Fruit');
		expect(rg.getAttribute('aria-labelledby')).toBe(labelEl.id);

		const apple = r.container.querySelector('[data-testid="r-apple"]') as HTMLElement;
		const orange = r.container.querySelector('[data-testid="r-orange"]') as HTMLElement;
		const appleInput = apple.querySelector('input') as HTMLInputElement;
		const orangeInput = orange.querySelector('input') as HTMLInputElement;
		expect(appleInput.type).toBe('radio');
		// Radios in a group share the same generated name.
		expect(appleInput.name).toBeTruthy();
		expect(appleInput.name).toBe(orangeInput.name);
		expect(r.container.querySelector('#radio-value')!.textContent).toBe('value:none');

		await act(() => {
			appleInput.click();
		});
		expect(r.container.querySelector('#radio-value')!.textContent).toBe('value:apple');
		expect(apple.getAttribute('data-selected')).toBe('true');
		expect(apple.className).toBe('react-aria-Radio is-selected');
		expect(appleInput.checked).toBe(true);

		// Clicking radio B moves the selection: group value updates, data-selected moves.
		await act(() => {
			orangeInput.click();
		});
		expect(r.container.querySelector('#radio-value')!.textContent).toBe('value:orange');
		expect(orange.getAttribute('data-selected')).toBe('true');
		expect(apple.hasAttribute('data-selected')).toBe(false);
		expect(apple.className).toBe('react-aria-Radio');
		expect(appleInput.checked).toBe(false);
		expect(orangeInput.checked).toBe(true);
		r.unmount();
	});

	it('supports the split RadioField + RadioButton components inside the group', async () => {
		const r = mount(RadioGroupScenario);
		const pearField = r.container.querySelector('[data-testid="rf-pear"]') as HTMLElement;
		expect(pearField.tagName).toBe('DIV');
		expect(pearField.className).toBe('react-aria-RadioField');
		const pearButton = r.container.querySelector('[data-testid="rb-pear"]') as HTMLElement;
		expect(pearButton.tagName).toBe('LABEL');
		expect(pearButton.className).toBe('react-aria-RadioButton');
		const pearInput = pearButton.querySelector('input') as HTMLInputElement;

		const orange = r.container.querySelector('[data-testid="r-orange"]') as HTMLElement;
		const orangeInput = orange.querySelector('input') as HTMLInputElement;
		await act(() => {
			orangeInput.click();
		});
		expect(orange.getAttribute('data-selected')).toBe('true');

		await act(() => {
			pearInput.click();
		});
		expect(r.container.querySelector('#radio-value')!.textContent).toBe('value:pear');
		expect(pearField.getAttribute('data-selected')).toBe('true');
		expect(pearButton.getAttribute('data-selected')).toBe('true');
		expect(orange.hasAttribute('data-selected')).toBe(false);
		expect(orangeInput.checked).toBe(false);
		r.unmount();
	});
});
