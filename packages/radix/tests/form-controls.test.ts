import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import {
	CheckboxApp,
	SwitchApp,
	RadioGroupApp,
	SliderApp,
	RangeSliderApp,
} from './_fixtures/form-controls.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

function click(el: Element): void {
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — Checkbox', () => {
	afterEach(async () => {
		await settle();
	});

	it('toggles state, syncs the hidden bubble input into FormData, and bubbles form change', async () => {
		const r = mount(CheckboxApp);
		const $ = inC(r.container);
		await settle();
		const checkbox = $('[data-testid="checkbox"]')!;
		const form = $('[data-testid="form"]') as HTMLFormElement;
		expect(checkbox.getAttribute('role')).toBe('checkbox');
		expect(checkbox.getAttribute('aria-checked')).toBe('false');
		expect(checkbox.getAttribute('data-state')).toBe('unchecked');
		expect($('[data-testid="indicator"]')).toBe(null);
		// The hidden native input exists (we're inside a form).
		const input = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(input).not.toBe(null);
		expect(input.checked).toBe(false);
		expect(new FormData(form).get('notifications')).toBe(null);

		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('aria-checked')).toBe('true');
		expect(checkbox.getAttribute('data-state')).toBe('checked');
		expect($('[data-testid="indicator"]')).not.toBe(null);
		// The bubble input synced imperatively and FormData reflects it.
		expect(input.checked).toBe(true);
		expect(new FormData(form).get('notifications')).toBe('on');
		// The dispatched native change reached the form's onChange.
		expect($('[data-testid="changes"]')!.textContent).toBe('1');

		click(checkbox);
		await settle();
		expect(input.checked).toBe(false);
		expect(new FormData(form).get('notifications')).toBe(null);
		expect($('[data-testid="changes"]')!.textContent).toBe('2');
		r.unmount();
	});

	it('indeterminate default renders mixed and first click checks', async () => {
		const r = mount(CheckboxApp, { defaultChecked: 'indeterminate' as const });
		const $ = inC(r.container);
		await settle();
		const checkbox = $('[data-testid="checkbox"]')!;
		expect(checkbox.getAttribute('aria-checked')).toBe('mixed');
		expect(checkbox.getAttribute('data-state')).toBe('indeterminate');
		expect($('[data-testid="indicator"]')).not.toBe(null); // indeterminate shows the indicator

		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('aria-checked')).toBe('true');
		expect(checkbox.getAttribute('data-state')).toBe('checked');
		r.unmount();
	});

	it('initially-checked: unchecking syncs the live controlled bubble input', async () => {
		// Regression: the pre-controlled workaround froze `checked={initial}` on the
		// bubble input; under octane's controlled runtime that reasserted the INITIAL
		// state on every commit/event flush, fighting the uncheck.
		const r = mount(CheckboxApp, { defaultChecked: true });
		const $ = inC(r.container);
		await settle();
		const checkbox = $('[data-testid="checkbox"]')!;
		const form = $('[data-testid="form"]') as HTMLFormElement;
		const input = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(checkbox.getAttribute('aria-checked')).toBe('true');
		expect(input.checked).toBe(true);
		expect(new FormData(form).get('notifications')).toBe('on');

		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('aria-checked')).toBe('false');
		expect(input.checked).toBe(false);
		expect(new FormData(form).get('notifications')).toBe(null);

		// A later discrete event + commit must not restore the stale initial state.
		click(checkbox);
		await settle();
		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('aria-checked')).toBe('false');
		expect(input.checked).toBe(false);
		r.unmount();
	});

	it('form reset restores the initial state', async () => {
		const r = mount(CheckboxApp);
		const $ = inC(r.container);
		await settle();
		const checkbox = $('[data-testid="checkbox"]')!;
		click(checkbox);
		await settle();
		expect(checkbox.getAttribute('data-state')).toBe('checked');

		click($('[data-testid="reset"]')!);
		await settle();
		expect(checkbox.getAttribute('data-state')).toBe('unchecked');
		r.unmount();
	});
});

describe('@octanejs/radix — Switch', () => {
	afterEach(async () => {
		await settle();
	});

	it('toggles role=switch state and syncs FormData + form change', async () => {
		const r = mount(SwitchApp);
		const $ = inC(r.container);
		await settle();
		const sw = $('[data-testid="switch"]')!;
		const form = $('[data-testid="form"]') as HTMLFormElement;
		expect(sw.getAttribute('role')).toBe('switch');
		expect(sw.getAttribute('aria-checked')).toBe('false');
		expect($('[data-testid="thumb"]')!.getAttribute('data-state')).toBe('unchecked');

		click(sw);
		await settle();
		expect(sw.getAttribute('aria-checked')).toBe('true');
		expect(sw.getAttribute('data-state')).toBe('checked');
		expect($('[data-testid="thumb"]')!.getAttribute('data-state')).toBe('checked');
		expect(new FormData(form).get('airplane')).toBe('on');
		expect($('[data-testid="changes"]')!.textContent).toBe('1');
		r.unmount();
	});
});

describe('@octanejs/radix — RadioGroup', () => {
	afterEach(async () => {
		await settle();
	});

	it('click checks an item (only one at a time); FormData carries the value', async () => {
		const r = mount(RadioGroupApp);
		const $ = inC(r.container);
		await settle();
		const group = $('[data-testid="group"]')!;
		const form = $('[data-testid="form"]') as HTMLFormElement;
		expect(group.getAttribute('role')).toBe('radiogroup');
		const vanilla = $('[data-testid="radio-vanilla"]')!;
		const chocolate = $('[data-testid="radio-chocolate"]')!;
		expect(vanilla.getAttribute('role')).toBe('radio');
		expect(vanilla.getAttribute('aria-checked')).toBe('false');
		expect(new FormData(form).get('flavor')).toBe(null);

		click(vanilla);
		await settle();
		expect(vanilla.getAttribute('aria-checked')).toBe('true');
		expect(vanilla.getAttribute('data-state')).toBe('checked');
		expect($('[data-testid="vanilla-indicator"]')).not.toBe(null);
		expect($('[data-testid="value"]')!.textContent).toBe('vanilla');
		expect(new FormData(form).get('flavor')).toBe('vanilla');

		click(chocolate);
		await settle();
		expect(chocolate.getAttribute('aria-checked')).toBe('true');
		expect(vanilla.getAttribute('aria-checked')).toBe('false');
		expect($('[data-testid="vanilla-indicator"]')).toBe(null);
		expect($('[data-testid="chocolate-indicator"]')).not.toBe(null);
		expect(new FormData(form).get('flavor')).toBe('chocolate');
		r.unmount();
	});

	it('disabled item is marked and does not check on click', async () => {
		const r = mount(RadioGroupApp);
		const $ = inC(r.container);
		await settle();
		const mint = $('[data-testid="radio-mint"]') as HTMLButtonElement;
		expect(mint.disabled).toBe(true);
		expect(mint.getAttribute('data-disabled')).toBe('');
		// Use .click() — like a real UA it suppresses activation on a disabled
		// control (a raw dispatchEvent would bypass that suppression).
		flushSync(() => mint.click());
		await settle();
		expect($('[data-testid="value"]')!.textContent).toBe('none');
		r.unmount();
	});

	it('ArrowDown moves focus to the next radio and checks it (click-on-focus)', async () => {
		const r = mount(RadioGroupApp);
		const $ = inC(r.container);
		await settle();
		const vanilla = $('[data-testid="radio-vanilla"]')!;
		click(vanilla);
		await settle();
		flushSync(() => vanilla.focus());

		flushSync(() => {
			vanilla.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		const chocolate = $('[data-testid="radio-chocolate"]')!;
		expect(document.activeElement).toBe(chocolate);
		expect(chocolate.getAttribute('aria-checked')).toBe('true');
		expect($('[data-testid="value"]')!.textContent).toBe('chocolate');
		r.unmount();
	});
});

describe('@octanejs/radix — Slider', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders slider roles/aria and a hidden form input carrying the value', async () => {
		const r = mount(SliderApp);
		const $ = inC(r.container);
		await settle();
		const form = $('[data-testid="form"]') as HTMLFormElement;
		const thumb = $('[data-testid="thumb"] [role="slider"], [role="slider"]')!;
		expect(thumb).not.toBe(null);
		expect(thumb.getAttribute('aria-valuemin')).toBe('0');
		expect(thumb.getAttribute('aria-valuemax')).toBe('100');
		expect(thumb.getAttribute('aria-valuenow')).toBe('30');
		expect(thumb.getAttribute('aria-orientation')).toBe('horizontal');
		// The range spans 0% → value%.
		const range = $('[data-testid="range"]')!;
		expect(range.style.left).toBe('0%');
		expect(range.style.right).toBe('70%');
		// Hidden input (display:none, not type=hidden so FormData sees it).
		expect(new FormData(form).get('volume')).toBe('30');
		r.unmount();
	});

	it('arrow keys step the value (with commit); Home/End jump; Shift skips', async () => {
		const r = mount(SliderApp);
		const $ = inC(r.container);
		await settle();
		const form = $('[data-testid="form"]') as HTMLFormElement;
		const thumb = $('[role="slider"]')!;
		const key = (init: KeyboardEventInit): void => {
			flushSync(() => {
				thumb.dispatchEvent(
					new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
				);
			});
		};

		key({ key: 'ArrowRight' });
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('40');
		expect($('[data-testid="committed"]')!.textContent).toBe('40');
		expect(new FormData(form).get('volume')).toBe('40');

		key({ key: 'ArrowLeft' });
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('30');

		key({ key: 'End' });
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('100');

		key({ key: 'Home' });
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('0');

		// Shift+Arrow steps 10× (step=10 → +100, clamped to max).
		key({ key: 'ArrowRight', shiftKey: true });
		await settle();
		expect(thumb.getAttribute('aria-valuenow')).toBe('100');
		r.unmount();
	});

	it('multi-thumb range: Minimum/Maximum labels, per-thumb inputs as name[], range spans between values', async () => {
		const r = mount(RangeSliderApp);
		const $ = inC(r.container);
		await settle();
		const form = $('[data-testid="form"]') as HTMLFormElement;
		const thumbs = r.container.querySelectorAll('[role="slider"]');
		expect(thumbs.length).toBe(2);
		expect(thumbs[0]!.getAttribute('aria-label')).toBe('Minimum');
		expect(thumbs[1]!.getAttribute('aria-label')).toBe('Maximum');
		expect(thumbs[0]!.getAttribute('aria-valuenow')).toBe('20');
		expect(thumbs[1]!.getAttribute('aria-valuenow')).toBe('80');
		// Range spans between the two values.
		const range = $('[data-testid="range"]')!;
		expect(range.style.left).toBe('20%');
		expect(range.style.right).toBe('20%');
		// Multi-value name gets the [] suffix; FormData carries both.
		expect(new FormData(form).getAll('range[]')).toEqual(['20', '80']);
		r.unmount();
	});
});
