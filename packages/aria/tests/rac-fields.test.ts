import { beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DisclosureGroupScenario,
	DisclosureScenario,
	NumberFieldScenario,
	SearchFieldScenario,
	SliderScenario,
	TextFieldScenario,
} from './_fixtures/rac-fields.tsx';

// @octanejs/aria Phase 4 — RAC field components (TextField / SearchField /
// NumberField / Slider / Disclosure), driven through octane's NATIVE delegated
// events: typing rides native `input` events, presses ride native clicks.
// Slider position math reads track rects (inert in jsdom), so these tests
// assert wiring/aria/data-* — not pixels.

// jsdom gap: the Web Animations API. Disclosure's panel show/hide path calls
// element.getAnimations(); stub it the same way a browser with no active
// animations would answer.
beforeAll(() => {
	if (typeof (Element.prototype as any).getAnimations !== 'function') {
		(Element.prototype as any).getAnimations = () => [];
	}
});

async function type(input: HTMLInputElement, text: string) {
	await act(() => {
		input.value = text;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

describe('@octanejs/aria/components — TextField', () => {
	it('links label and input, and typing updates the controlled value', async () => {
		const r = mount(TextFieldScenario);
		const root = r.container.querySelector('[data-testid="tf-root"]') as HTMLElement;
		expect(root.className).toBe('react-aria-TextField');
		expect(root.getAttribute('data-rac')).toBe('');
		const label = r.container.querySelector('label')!;
		const input = r.container.querySelector('input')!;
		expect(label.className).toBe('react-aria-Label');
		expect(input.className).toBe('react-aria-Input');
		expect(label.getAttribute('for')).toBe(input.id);
		expect(input.getAttribute('aria-labelledby')).toBe(label.id);

		await type(input, 'hi');
		expect((r.container.querySelector('#tf-value') as HTMLElement).textContent).toBe('value:hi');
		expect(input.value).toBe('hi');
		r.unmount();
	});

	it('surfaces validation errors as data-invalid and renders FieldError', async () => {
		const r = mount(TextFieldScenario);
		const root = r.container.querySelector('[data-testid="tf-root"]') as HTMLElement;
		const input = r.container.querySelector('input')!;
		expect(root.hasAttribute('data-invalid')).toBe(false);
		expect(r.container.querySelector('[data-testid="tf-error"]')).toBe(null);

		await type(input, 'bad');
		expect(root.getAttribute('data-invalid')).toBe('true');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		const error = r.container.querySelector('[data-testid="tf-error"]') as HTMLElement;
		expect(error.textContent).toBe('Bad value');
		expect(error.className).toBe('react-aria-FieldError');
		// The error message is linked to the input for AT.
		expect(input.getAttribute('aria-describedby')).toBe(error.id);

		await type(input, 'ok');
		expect(root.hasAttribute('data-invalid')).toBe(false);
		expect(r.container.querySelector('[data-testid="tf-error"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/aria/components — SearchField', () => {
	it('tracks data-empty and clears through the context-wired clear button', async () => {
		const r = mount(SearchFieldScenario);
		const root = r.container.querySelector('[data-testid="sf-root"]') as HTMLElement;
		expect(root.className).toBe('react-aria-SearchField');
		const input = r.container.querySelector('input')!;
		expect(input.type).toBe('search');
		expect(root.getAttribute('data-empty')).toBe('true');

		const clear = r.container.querySelector('#sf-clear') as HTMLButtonElement;
		// The clear button rides useSearchField's clearButtonProps via ButtonContext.
		expect(clear.getAttribute('aria-label')).toBe('Clear search');
		expect(clear.getAttribute('tabindex')).toBe('-1');

		await type(input, 'abc');
		expect(root.hasAttribute('data-empty')).toBe(false);
		expect(input.value).toBe('abc');

		await act(() => clear.click());
		expect(input.value).toBe('');
		expect(root.getAttribute('data-empty')).toBe('true');
		expect((r.container.querySelector('#sf-cleared') as HTMLElement).textContent).toBe(
			'cleared:yes',
		);
		r.unmount();
	});
});

describe('@octanejs/aria/components — NumberField', () => {
	it('wires the group, the number-flavored input, and the hidden form input', async () => {
		const r = mount(NumberFieldScenario);
		await act(() => {});
		const group = r.container.querySelector('[data-testid="nf-group"]') as HTMLElement;
		expect(group.getAttribute('role')).toBe('group');
		const input = r.container.querySelector('input.react-aria-Input') as HTMLInputElement;
		// useNumberField deliberately strips the spinbutton role off the input and
		// renders type=text with a numeric inputMode (mirroring react-aria exactly).
		expect(input.getAttribute('role')).toBe(null);
		expect(input.type).toBe('text');
		expect(input.getAttribute('inputmode')).toBe('numeric');
		expect(input.getAttribute('aria-roledescription')).toBeTruthy();
		expect(input.value).toBe('5');
		// The hidden form input mirrors the committed number value.
		const hidden = r.container.querySelector('input[name="amount"]') as HTMLInputElement;
		expect(hidden.type).toBe('hidden');
		expect(hidden.value).toBe('5');
		r.unmount();
	});

	it('stepper buttons increment/decrement the committed value via ButtonContext slots', async () => {
		const r = mount(NumberFieldScenario);
		await act(() => {});
		const input = r.container.querySelector('input.react-aria-Input') as HTMLInputElement;
		const inc = r.container.querySelector('#nf-inc') as HTMLButtonElement;
		const dec = r.container.querySelector('#nf-dec') as HTMLButtonElement;
		// The steppers are labelled by the hook's localized strings.
		expect(inc.getAttribute('aria-label')).toBeTruthy();
		expect(dec.getAttribute('aria-label')).toBeTruthy();

		await act(() => inc.click());
		expect(input.value).toBe('6');
		expect((r.container.querySelector('input[name="amount"]') as HTMLInputElement).value).toBe('6');
		await act(() => dec.click());
		expect(input.value).toBe('5');
		r.unmount();
	});
});

describe('@octanejs/aria/components — Slider', () => {
	it('wires the thumb range input, the output render prop, and data-orientation', async () => {
		const r = mount(SliderScenario);
		await act(() => {});
		const root = r.container.querySelector('[data-testid="slider-root"]') as HTMLElement;
		expect(root.className).toBe('react-aria-Slider');
		expect(root.getAttribute('data-orientation')).toBe('horizontal');
		const label = r.container.querySelector('label')!;
		expect(root.getAttribute('aria-labelledby')).toBe(label.id);

		const track = r.container.querySelector('[data-testid="slider-track"]') as HTMLElement;
		expect(track.className).toBe('react-aria-SliderTrack');
		expect(track.getAttribute('data-orientation')).toBe('horizontal');
		const thumb = r.container.querySelector('[data-testid="slider-thumb"]') as HTMLElement;
		expect(thumb.className).toBe('react-aria-SliderThumb');

		const input = r.container.querySelector('input[type="range"]') as HTMLInputElement;
		expect(input.getAttribute('min')).toBe('0');
		expect(input.getAttribute('max')).toBe('100');
		expect(input.getAttribute('step')).toBe('5');
		expect(input.value).toBe('30');
		expect(input.getAttribute('aria-valuetext')).toBe('30');
		expect(input.getAttribute('aria-orientation')).toBe('horizontal');

		const output = r.container.querySelector('output')!;
		expect(output.className).toBe('react-aria-SliderOutput');
		expect(output.getAttribute('data-orientation')).toBe('horizontal');
		// The render prop composes the formatted default children.
		expect(output.textContent).toBe('val:30');

		// SliderFill positions itself from the value percentage (30%).
		const fill = r.container.querySelector('[data-testid="slider-fill"]') as HTMLElement;
		expect(fill.className).toBe('react-aria-SliderFill');
		expect(fill.style.width).toBe('30%');
		r.unmount();
	});

	it('changing the range input updates the state, output, and aria-valuetext', async () => {
		const r = mount(SliderScenario);
		await act(() => {});
		const input = r.container.querySelector('input[type="range"]') as HTMLInputElement;
		await type(input, '40');
		expect(input.value).toBe('40');
		expect(input.getAttribute('aria-valuetext')).toBe('40');
		expect(r.container.querySelector('output')!.textContent).toBe('val:40');
		r.unmount();
	});
});

describe('@octanejs/aria/components — Disclosure', () => {
	it('expands and collapses via the trigger-slot button', async () => {
		const r = mount(DisclosureScenario);
		await act(() => {});
		const root = r.container.querySelector('[data-testid="disc-root"]') as HTMLElement;
		expect(root.className).toBe('react-aria-Disclosure');
		const trigger = r.container.querySelector('#disc-trigger') as HTMLButtonElement;
		const panel = r.container.querySelector('[data-testid="disc-panel"]') as HTMLElement;
		expect(panel.className).toBe('react-aria-DisclosurePanel');
		expect(panel.getAttribute('role')).toBe('group');

		// Collapsed: aria-expanded=false, panel hidden, no data-expanded.
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
		expect(root.hasAttribute('data-expanded')).toBe(false);
		expect(panel.hasAttribute('hidden')).toBe(true);

		await act(() => trigger.click());
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(root.getAttribute('data-expanded')).toBe('true');
		expect(panel.hasAttribute('hidden')).toBe(false);

		await act(() => trigger.click());
		// The hide path applies `hidden` after the (empty) animation set settles.
		await act(() => {});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(root.hasAttribute('data-expanded')).toBe(false);
		expect(panel.hasAttribute('hidden')).toBe(true);
		r.unmount();
	});

	it('DisclosureGroup with allowsMultipleExpanded=false collapses the previous item', async () => {
		const r = mount(DisclosureGroupScenario);
		await act(() => {});
		const groupRoot = r.container.querySelector('[data-testid="group-root"]') as HTMLElement;
		expect(groupRoot.className).toBe('react-aria-DisclosureGroup');
		const one = r.container.querySelector('[data-testid="disc-one"]') as HTMLElement;
		const two = r.container.querySelector('[data-testid="disc-two"]') as HTMLElement;
		const trigOne = r.container.querySelector('#trig-one') as HTMLButtonElement;
		const trigTwo = r.container.querySelector('#trig-two') as HTMLButtonElement;
		expect(one.hasAttribute('data-expanded')).toBe(false);
		expect(two.hasAttribute('data-expanded')).toBe(false);

		await act(() => trigOne.click());
		expect(one.getAttribute('data-expanded')).toBe('true');
		expect(trigOne.getAttribute('aria-expanded')).toBe('true');
		expect(two.hasAttribute('data-expanded')).toBe(false);

		// Expanding the second collapses the first (single-expansion semantics).
		await act(() => trigTwo.click());
		await act(() => {});
		expect(two.getAttribute('data-expanded')).toBe('true');
		expect(one.hasAttribute('data-expanded')).toBe(false);
		expect(trigOne.getAttribute('aria-expanded')).toBe('false');
		const panelOne = r.container.querySelector('[data-testid="panel-one"]') as HTMLElement;
		const panelTwo = r.container.querySelector('[data-testid="panel-two"]') as HTMLElement;
		expect(panelOne.hasAttribute('hidden')).toBe(true);
		expect(panelTwo.hasAttribute('hidden')).toBe(false);
		r.unmount();
	});
});
