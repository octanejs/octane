import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { FormApp } from './_fixtures/form.tsx';

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

describe('@octanejs/radix — Form', () => {
	afterEach(async () => {
		await settle();
	});

	it('label wires htmlFor to the control id; no messages before validation', async () => {
		const r = mount(FormApp);
		const $ = inC(r.container);
		await settle();
		const label = $('[data-testid="label"]') as HTMLLabelElement;
		const control = $('[data-testid="control"]') as HTMLInputElement;
		expect(label.getAttribute('for')).toBe(control.id);
		expect(control.name).toBe('email');
		expect(control.required).toBe(true);
		expect($('[data-testid="msg-missing"]')).toBe(null);
		expect($('[data-testid="msg-taken"]')).toBe(null);
		r.unmount();
	});

	it('built-in validation: empty required control → valueMissing message + data-invalid + aria wiring', async () => {
		const r = mount(FormApp);
		const $ = inC(r.container);
		await settle();
		const control = $('[data-testid="control"]') as HTMLInputElement;

		// checkValidity fires the native (non-bubbling) `invalid` event; the delegated
		// onInvalid captures the ValidityState into context.
		flushSync(() => {
			control.checkValidity();
		});
		await settle();

		const msg = $('[data-testid="msg-missing"]')!;
		expect(msg).not.toBe(null);
		expect(msg.textContent!.trim()).toBe('Please enter your email');
		// data-* booleans stringify (React parity): Radix's `data-invalid={true}`
		// renders "true", exactly as it does under React.
		expect($('[data-testid="field"]')!.getAttribute('data-invalid')).toBe('true');
		expect(control.getAttribute('data-invalid')).toBe('true');
		expect($('[data-testid="label"]')!.getAttribute('data-invalid')).toBe('true');
		// The message id lands in the control's aria-describedby.
		expect(control.getAttribute('aria-describedby')).toBe(msg.id);

		// Fixing the value validates on native change → message clears, field valid.
		flushSync(() => {
			control.value = 'me@example.com';
			control.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
		expect($('[data-testid="msg-missing"]')).toBe(null);
		expect($('[data-testid="field"]')!.getAttribute('data-valid')).toBe('true');
		r.unmount();
	});

	it('custom matcher: matching value shows the custom message and sets customError validity', async () => {
		const r = mount(FormApp);
		const $ = inC(r.container);
		await settle();
		const control = $('[data-testid="control"]') as HTMLInputElement;

		flushSync(() => {
			control.value = 'taken@example.com';
			control.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();

		const msg = $('[data-testid="msg-taken"]')!;
		expect(msg).not.toBe(null);
		expect(msg.textContent!.trim()).toBe('Email already taken');
		expect($('[data-testid="msg-missing"]')).toBe(null); // built-in not matched
		expect(control.validity.customError).toBe(true); // setCustomValidity applied
		expect($('[data-testid="field"]')!.getAttribute('data-invalid')).toBe('true');

		// A non-matching value clears it.
		flushSync(() => {
			control.value = 'free@example.com';
			control.dispatchEvent(new Event('change', { bubbles: true }));
		});
		await settle();
		expect($('[data-testid="msg-taken"]')).toBe(null);
		expect(control.validity.customError).toBe(false);
		r.unmount();
	});
});
