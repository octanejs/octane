import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { OTPInput as ReactOTPInput, OTPInputContext as ReactContext } from 'input-otp';
import { createElement, useContext as useReactContext, type FormEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { mount } from '../../../octane/tests/_helpers';
import { UncontrolledInput } from '../conformance/_fixtures/input.tsrx';

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

function ReactProjection() {
	const state = useReactContext(ReactContext);
	return createElement('output', {
		'data-testid': 'react-context',
		'data-slots': state.slots.map((slot) => slot.char ?? slot.placeholderChar ?? '_').join('|'),
	});
}
function ReactFixture(props: {
	onChange?: (value: string) => void;
	onInput?: (event: FormEvent<HTMLInputElement>) => void;
}) {
	return createElement(
		ReactOTPInput,
		{
			maxLength: 4,
			defaultValue: '12',
			pattern: '^\\d+$',
			placeholder: '0000',
			onChange: props.onChange,
			onInput: props.onInput,
			'aria-label': 'Verification code',
			name: 'verification-code',
		},
		createElement(ReactProjection),
	);
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	try {
		// input-otp@1.5.0 cancels sync timeouts on unmount; drain any leftover PWM timers.
		cleanup();
		// Drain only the callbacks upstream failed to cancel, while the jsdom
		// window still exists, so a busy runner cannot strand them past teardown.
		act(() => vi.runOnlyPendingTimers());
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

describe('@octanejs/input-otp differential React oracle', () => {
	it('matches initial native input attributes and projected slots', () => {
		const react = render(createElement(ReactFixture));
		const octane = mount(UncontrolledInput, {});
		const reactInput = react.container.querySelector('input') as HTMLInputElement;
		const octaneInput = octane.find('input') as HTMLInputElement;
		for (const key of [
			'value',
			'maxLength',
			'autocomplete',
			'inputMode',
			'pattern',
			'name',
			'spellcheck',
		] as const)
			expect(octaneInput[key]).toBe(reactInput[key]);
		expect(octane.find('[data-input-otp-container]').getAttribute('translate')).toBe(
			react.container.querySelector('[data-input-otp-container]')?.getAttribute('translate'),
		);
		expect(octane.find('[data-testid="context"]').getAttribute('data-slots')).toBe(
			react.container.querySelector('[data-testid="react-context"]')?.getAttribute('data-slots'),
		);
		octane.unmount();
	});
	it('matches uncontrolled native input and callback behavior', () => {
		const reactChange = vi.fn();
		const octaneChange = vi.fn();
		const react = render(createElement(ReactFixture, { onChange: reactChange }));
		const octane = mount(UncontrolledInput, { onChange: octaneChange });
		const reactInput = react.container.querySelector('input') as HTMLInputElement;
		const octaneInput = octane.find('input') as HTMLInputElement;
		fireEvent.input(reactInput, { target: { value: '123' } });
		octaneInput.value = '123';
		octaneInput.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync(() => {});
		expect(octaneInput.value).toBe(reactInput.value);
		expect(octaneChange.mock.lastCall).toEqual(reactChange.mock.lastCall);
		octane.unmount();
	});
	it('matches pattern rejection after an invalid edit', () => {
		const reactInputEvents = vi.fn();
		const octaneInputEvents = vi.fn();
		const react = render(createElement(ReactFixture, { onInput: reactInputEvents }));
		const octane = mount(UncontrolledInput, { onInput: octaneInputEvents });
		const reactInput = react.container.querySelector('input') as HTMLInputElement;
		const octaneInput = octane.find('input') as HTMLInputElement;
		fireEvent.input(reactInput, { target: { value: '12a' } });
		octaneInput.value = '12a';
		octaneInput.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync(() => {});
		expect(octaneInput.value).toBe(reactInput.value);
		expect(octaneInputEvents).toHaveBeenCalledTimes(reactInputEvents.mock.calls.length);
		octane.unmount();
	});
});
