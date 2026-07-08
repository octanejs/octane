// Ported from @radix-ui/react-radio-group's internal radio (source:
// .radix-primitives/packages/react/radio-group/src/radio.tsx). The single-radio
// building block RadioGroup composes: a `role=radio` button + Presence indicator +
// the hidden native-radio "bubble input" (same machinery as Checkbox — a live
// CONTROLLED `checked` prop keeps the DOM in sync, the bubble effect only dispatches
// events). Same octane adaptations as Checkbox.ts: `isPropagationStopped()` →
// `event.cancelBubble`; the source's uncontrolled input + descriptor `checked` writes
// → octane's controlled `checked`; a native `change` dispatched alongside the
// source's `click`.
import { createElement, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { usePrevious } from './use-previous';
import { useSize } from './use-size';

const RADIO_NAME = 'Radio';

const [createRadioContext, createRadioScope] = createContextScope(RADIO_NAME);
export { createRadioScope };

interface RadioContextValue {
	checked: boolean;
	disabled: boolean | undefined;
	required: boolean | undefined;
	name: string | undefined;
	form: string | undefined;
	value: string | number;
	control: HTMLElement | null;
	setControl: (control: HTMLElement | null) => void;
	hasConsumerStoppedPropagationRef: { current: boolean };
	isFormControl: boolean;
	bubbleInput: HTMLInputElement | null;
	setBubbleInput: (input: HTMLInputElement | null) => void;
	onCheck(): void;
}

const [RadioProviderImpl, useRadioContextImpl] = createRadioContext<RadioContextValue>(RADIO_NAME);
export const useRadioContext = useRadioContextImpl;

export function RadioProvider(props: any): any {
	const slot = S('Radio.Provider');
	const {
		__scopeRadio,
		checked = false,
		children,
		disabled,
		form,
		name,
		onCheck,
		required,
		value = 'on',
		internal_do_not_use_render,
	} = props ?? {};

	const [control, setControl] = useState<HTMLElement | null>(null, subSlot(slot, 'control'));
	const [bubbleInput, setBubbleInput] = useState<HTMLInputElement | null>(
		null,
		subSlot(slot, 'input'),
	);
	const hasConsumerStoppedPropagationRef = useRef(false, subSlot(slot, 'stopped'));
	const isFormControl = control
		? !!form || !!control.closest('form')
		: // We set this to true by default so that events bubble to forms without JS (SSR)
			true;

	const context: RadioContextValue = {
		checked,
		disabled,
		required,
		name,
		form,
		value,
		control,
		setControl,
		hasConsumerStoppedPropagationRef,
		isFormControl,
		bubbleInput,
		setBubbleInput,
		onCheck: () => onCheck?.(),
	};

	return createElement(RadioProviderImpl, {
		scope: __scopeRadio,
		...context,
		children: isFunction(internal_do_not_use_render)
			? internal_do_not_use_render(context)
			: children,
	});
}

export function RadioTrigger(props: any): any {
	const slot = S('Radio.Trigger');
	const { __scopeRadio, onClick, ref: forwardedRef, ...radioProps } = props ?? {};
	const {
		checked,
		disabled,
		value,
		setControl,
		onCheck,
		hasConsumerStoppedPropagationRef,
		isFormControl,
		bubbleInput,
	} = useRadioContext('RadioTrigger', __scopeRadio);
	const composedRefs = useComposedRefs(forwardedRef, setControl, subSlot(slot, 'refs'));

	return createElement(Primitive.button, {
		type: 'button',
		role: 'radio',
		'aria-checked': checked,
		'data-state': getState(checked),
		'data-disabled': disabled ? '' : undefined,
		disabled,
		value,
		...radioProps,
		ref: composedRefs,
		onClick: composeEventHandlers(onClick, (event: MouseEvent) => {
			// radios cannot be unchecked so we only communicate a checked state
			if (!checked) onCheck();
			if (bubbleInput && isFormControl) {
				hasConsumerStoppedPropagationRef.current = event.cancelBubble;
				// if radio has a bubble input and is a form control, stop propagation
				// from the button so that we only propagate one click event (from the
				// input). We propagate changes from an input so that native form
				// validation works and form events reflect radio updates.
				if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
			}
		}),
	});
}

export function Radio(props: any): any {
	const {
		__scopeRadio,
		name,
		checked,
		required,
		disabled,
		value,
		onCheck,
		form,
		ref: forwardedRef,
		...radioProps
	} = props ?? {};

	return createElement(RadioProvider, {
		__scopeRadio,
		checked,
		disabled,
		required,
		onCheck,
		name,
		form,
		value,
		internal_do_not_use_render: ({ isFormControl }: RadioContextValue) => [
			createElement(RadioTrigger, {
				key: 'trigger',
				...radioProps,
				ref: forwardedRef,
				__scopeRadio,
			}),
			isFormControl ? createElement(RadioBubbleInput, { key: 'bubble', __scopeRadio }) : null,
		],
	});
}

export function RadioIndicator(props: any): any {
	const { __scopeRadio, forceMount, ...indicatorProps } = props ?? {};
	const context = useRadioContext('RadioIndicator', __scopeRadio);
	return createElement(Presence, {
		present: forceMount || context.checked,
		children: createElement(Primitive.span, {
			'data-state': getState(context.checked),
			'data-disabled': context.disabled ? '' : undefined,
			...indicatorProps,
		}),
	});
}

export function RadioBubbleInput(props: any): any {
	const slot = S('Radio.BubbleInput');
	const { __scopeRadio, ref: forwardedRef, ...inputProps } = props ?? {};
	const {
		control,
		checked,
		required,
		disabled,
		name,
		value,
		form,
		bubbleInput,
		setBubbleInput,
		hasConsumerStoppedPropagationRef,
	} = useRadioContext('RadioBubbleInput', __scopeRadio);

	const composedRefs = useComposedRefs(forwardedRef, setBubbleInput, subSlot(slot, 'refs'));
	const prevChecked = usePrevious(checked, subSlot(slot, 'prev'));
	const controlSize = useSize(control, subSlot(slot, 'size'));

	// Bubble checked change to parents (e.g form change event). The controlled
	// `checked` prop below keeps the input's DOM state in sync, so this effect
	// only dispatches the events (see Checkbox.ts).
	useEffect(
		() => {
			const input = bubbleInput;
			if (!input) return;

			const bubbles = !hasConsumerStoppedPropagationRef.current;
			if (prevChecked !== checked) {
				input.dispatchEvent(new Event('click', { bubbles }));
				// octane adaptation: also fire the native `change` (see Checkbox.ts header).
				input.dispatchEvent(new Event('change', { bubbles }));
			}
		},
		[bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef],
		subSlot(slot, 'e:bubble'),
	);

	return createElement(Primitive.input, {
		type: 'radio',
		'aria-hidden': true,
		// Live CONTROLLED checked (octane React-parity — see Checkbox.ts). The runtime's
		// event-restore also re-syncs radio-group cousins after a dispatched `click`.
		checked,
		required,
		disabled,
		name,
		value,
		form,
		...inputProps,
		tabIndex: -1,
		ref: composedRefs,
		style: {
			...props?.style,
			...controlSize,
			position: 'absolute',
			pointerEvents: 'none',
			opacity: 0,
			margin: 0,
			// We transform because the input is absolutely positioned but we have
			// rendered it **after** the button. This pulls it back to sit on top
			// of the button.
			transform: 'translateX(-100%)',
		},
	});
}

function isFunction(value: unknown): value is (...args: any[]) => any {
	return typeof value === 'function';
}

function getState(checked: boolean): string {
	return checked ? 'checked' : 'unchecked';
}
