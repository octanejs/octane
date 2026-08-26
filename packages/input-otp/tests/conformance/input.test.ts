import { flushSync } from 'octane';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	CallbackInput,
	EmptyInput,
	NoScriptDisabledInput,
	RefInput,
	RenderPropInput,
	UncontrolledInput,
} from './_fixtures/input.tsrx';

function edit(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
	flushSync(() => {});
}

describe('@octanejs/input-otp component state and projection', () => {
	beforeEach(() => {
		document.getElementById('input-otp-style')?.remove();
	});

	it('renders one real input with upstream attributes and context slots', () => {
		const app = mount(UncontrolledInput, {});
		const inputs = app.findAll('input[data-input-otp]');
		expect(inputs).toHaveLength(1);
		const input = inputs[0] as HTMLInputElement;
		expect(input.value).toBe('12');
		expect(input.maxLength).toBe(4);
		expect(input.autocomplete).toBe('one-time-code');
		expect(input.inputMode).toBe('numeric');
		expect(input.pattern).toBe('^\\d+$');
		expect(input.getAttribute('spellcheck')).toBe('false');
		expect(input.getAttribute('aria-label')).toBe('Verification code');
		expect(input.name).toBe('verification-code');
		expect(app.find('[data-input-otp-container]').getAttribute('translate')).toBe('no');
		expect(input.style.fontSize).toBe('var(--root-height, 16px)');
		expect(app.find('[data-testid="context"]').getAttribute('data-slots')).toBe('1|2|_|_');
		app.unmount();
	});

	it('updates uncontrolled state through native input and rejects pattern-invalid edits', () => {
		const onChange = vi.fn();
		const onInput = vi.fn();
		const onSelectionChange = vi.fn();
		document.addEventListener('selectionchange', onSelectionChange);
		const app = mount(UncontrolledInput, { onChange, onInput });
		const input = app.find('input') as HTMLInputElement;
		edit(input, '123');
		expect(input.value).toBe('123');
		expect(onChange).toHaveBeenLastCalledWith('123');
		expect(onInput).toHaveBeenCalledTimes(1);
		expect(app.find('[data-testid="context"]').getAttribute('data-slots')).toBe('1|2|3|_');
		expect(onSelectionChange).not.toHaveBeenCalled();
		edit(input, '12a');
		expect(input.value).toBe('123');
		expect(onChange).not.toHaveBeenCalledWith('12a');
		expect(onInput).toHaveBeenCalledTimes(2);
		expect(onSelectionChange).not.toHaveBeenCalled();
		edit(input, '12');
		expect(onInput).toHaveBeenCalledTimes(3);
		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		app.unmount();
		document.removeEventListener('selectionchange', onSelectionChange);
	});

	it('keeps controlled value authoritative and exposes render-prop slots', () => {
		const onChange = vi.fn();
		const app = mount(RenderPropInput, { value: '34', onChange });
		const input = app.find('input') as HTMLInputElement;
		expect(app.find('[data-testid="render"]').getAttribute('data-slots')).toBe('3|4|_|_');
		edit(input, '345');
		expect(onChange).toHaveBeenLastCalledWith('345');
		app.update(RenderPropInput, { value: '345', onChange });
		expect(input.value).toBe('345');
		expect(app.find('[data-testid="render"]').getAttribute('data-slots')).toBe('3|4|5|_');
		app.unmount();
	});

	it('forwards disabled and supports disabling the no-script fallback', () => {
		const app = mount(NoScriptDisabledInput);
		expect((app.find('input') as HTMLInputElement).disabled).toBe(true);
		expect(app.container.querySelector('noscript')).toBeNull();
		expect(app.find('[data-testid="context"]').hasAttribute('data-hovering')).toBe(false);
		app.unmount();
	});

	it('calls onComplete only when crossing from shorter to maxLength', () => {
		const onComplete = vi.fn();
		const app = mount(UncontrolledInput, { onComplete });
		const input = app.find('input') as HTMLInputElement;
		flushEffects();
		edit(input, '1234');
		flushEffects();
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenLastCalledWith('1234');
		edit(input, '1234');
		flushEffects();
		expect(onComplete).toHaveBeenCalledTimes(1);
		app.unmount();
	});

	it('exposes the native input through the public ref', () => {
		const inputRef: { current: HTMLInputElement | null } = { current: null };
		const callbackRef = vi.fn();
		const app = mount(RefInput, { inputRef: [inputRef, callbackRef] });
		expect(inputRef.current).toBe(app.find('input'));
		expect(callbackRef).toHaveBeenLastCalledWith(inputRef.current);
		expect(callbackRef).toHaveBeenCalledTimes(1);
		edit(inputRef.current as HTMLInputElement, '12');
		expect(callbackRef).toHaveBeenCalledTimes(1);
		inputRef.current?.focus();
		expect(document.activeElement).toBe(inputRef.current);
		app.unmount();
		expect(inputRef.current).toBeNull();
		expect(callbackRef).toHaveBeenLastCalledWith(null);
		expect(callbackRef).toHaveBeenCalledTimes(2);
	});

	it('projects placeholder, focus, active slot, fake caret, and hover state', () => {
		const app = mount(EmptyInput);
		const input = app.find('input') as HTMLInputElement;
		const projection = app.find('[data-testid="context"]');
		expect(projection.getAttribute('data-placeholders')).toBe('1|2|3|4');
		input.focus();
		flushSync(() => {});
		expect(projection.getAttribute('data-focused')).toBe('true');
		expect(projection.getAttribute('data-active')).toBe('true|false|false|false');
		expect(projection.getAttribute('data-fake-caret')).toBe('true|false|false|false');
		input.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		flushSync(() => {});
		expect(projection.getAttribute('data-hovering')).toBe('true');
		input.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
		flushSync(() => {});
		expect(projection.hasAttribute('data-hovering')).toBe(false);
		input.blur();
		flushSync(() => {});
		expect(projection.hasAttribute('data-focused')).toBe(false);
		app.unmount();
	});

	it('forwards intrinsic props and composes consumer focus, blur, paste, and mouse callbacks', () => {
		const callbacks = {
			onFocus: vi.fn(),
			onBlur: vi.fn(),
			onPaste: vi.fn(),
			onMouseOver: vi.fn(),
			onMouseLeave: vi.fn(),
		};
		const app = mount(CallbackInput, callbacks);
		flushEffects();
		const input = app.find('[data-testid="forwarded-input"]') as HTMLInputElement;
		expect(input.id).toBe('forwarded-id');
		expect(input.required).toBe(true);
		expect(input.tabIndex).toBe(3);
		expect(input.autocomplete).toBe('off');
		expect(input.getAttribute('spellcheck')).toBe('true');
		const injectedStyle = document.getElementById('input-otp-style');
		expect(injectedStyle).not.toBeNull();
		expect(injectedStyle?.getAttribute('nonce') || (injectedStyle as HTMLStyleElement).nonce).toBe(
			'csp-style',
		);

		input.focus();
		input.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		input.dispatchEvent(new MouseEvent('mouseleave'));
		const paste = new Event('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(paste, 'clipboardData', {
			value: { getData: () => '12-34' },
		});
		input.dispatchEvent(paste);
		input.blur();
		flushSync(() => {});

		expect(callbacks.onFocus).toHaveBeenCalledTimes(1);
		expect(callbacks.onBlur).toHaveBeenCalledTimes(1);
		expect(callbacks.onPaste).toHaveBeenCalledTimes(1);
		expect(callbacks.onMouseOver).toHaveBeenCalledTimes(1);
		expect(callbacks.onMouseLeave).toHaveBeenCalledTimes(1);
		expect(input.value).toBe('1234');
		app.unmount();
	});

	it('keeps shared styles while mounted inputs still use them', () => {
		const first = mount(EmptyInput);
		flushEffects();
		expect(document.getElementById('input-otp-style')).not.toBeNull();
		document.getElementById('input-otp-style')?.remove();

		const second = mount(EmptyInput);
		flushEffects();
		const reinstalled = document.getElementById('input-otp-style');
		expect(reinstalled).not.toBeNull();

		first.unmount();
		flushEffects();
		expect(document.getElementById('input-otp-style')).toBe(reinstalled);

		second.unmount();
		flushEffects();
		expect(document.getElementById('input-otp-style')).toBeNull();
	});
});
