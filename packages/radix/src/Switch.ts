// Ported from @radix-ui/react-switch (source:
// .radix-primitives/packages/react/switch/src/switch.tsx). A `role=switch` button with
// a Thumb; inside a form it renders the hidden native-checkbox "bubble input" (same
// machinery as Checkbox — uncontrolled input, imperative `checked` setter + dispatched
// events). Same octane adaptations as Checkbox.ts: `isPropagationStopped()` →
// `event.cancelBubble`; `defaultChecked` → the native `checked` attribute; a native
// `change` dispatched alongside the source's `click`.
import { createElement, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { usePrevious } from './use-previous';
import { useSize } from './use-size';
import { useControllableState } from './useControllableState';

const SWITCH_NAME = 'Switch';

const [createSwitchContext, createSwitchScope] = createContextScope(SWITCH_NAME);
export { createSwitchScope };

interface SwitchContextValue {
	checked: boolean;
	setChecked: (checked: boolean | ((prev: boolean) => boolean)) => void;
	disabled: boolean | undefined;
	control: HTMLElement | null;
	setControl: (control: HTMLElement | null) => void;
	name: string | undefined;
	form: string | undefined;
	value: string | number;
	hasConsumerStoppedPropagationRef: { current: boolean };
	required: boolean | undefined;
	defaultChecked: boolean | undefined;
	isFormControl: boolean;
	bubbleInput: HTMLInputElement | null;
	setBubbleInput: (input: HTMLInputElement | null) => void;
}

const [SwitchProviderImpl, useSwitchContext] = createSwitchContext<SwitchContextValue>(SWITCH_NAME);

export function Provider(props: any): any {
	const slot = S('Switch.Provider');
	const {
		__scopeSwitch,
		checked: checkedProp,
		children,
		defaultChecked,
		disabled,
		form,
		name,
		onCheckedChange,
		required,
		value = 'on',
		internal_do_not_use_render,
	} = props ?? {};

	const [checked, setChecked] = useControllableState<boolean>(
		{ prop: checkedProp, defaultProp: defaultChecked ?? false, onChange: onCheckedChange },
		subSlot(slot, 'checked'),
	);
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

	const context: SwitchContextValue = {
		checked,
		setChecked,
		disabled,
		control,
		setControl,
		name,
		form,
		value,
		hasConsumerStoppedPropagationRef,
		required,
		defaultChecked,
		isFormControl,
		bubbleInput,
		setBubbleInput,
	};

	return createElement(SwitchProviderImpl, {
		scope: __scopeSwitch,
		...context,
		children: isFunction(internal_do_not_use_render)
			? internal_do_not_use_render(context)
			: children,
	});
}

export function Trigger(props: any): any {
	const slot = S('Switch.Trigger');
	const { __scopeSwitch, onClick, ref: forwardedRef, ...switchProps } = props ?? {};
	const {
		value,
		disabled,
		checked,
		required,
		setControl,
		setChecked,
		hasConsumerStoppedPropagationRef,
		isFormControl,
		bubbleInput,
	} = useSwitchContext('SwitchTrigger', __scopeSwitch);
	const composedRefs = useComposedRefs(forwardedRef, setControl, subSlot(slot, 'refs'));

	return createElement(Primitive.button, {
		type: 'button',
		role: 'switch',
		'aria-checked': checked,
		'aria-required': required,
		'data-state': getState(checked),
		'data-disabled': disabled ? '' : undefined,
		disabled,
		value,
		...switchProps,
		ref: composedRefs,
		onClick: composeEventHandlers(onClick, (event: MouseEvent) => {
			setChecked((prevChecked) => !prevChecked);
			if (bubbleInput && isFormControl) {
				hasConsumerStoppedPropagationRef.current = event.cancelBubble;
				// if switch has a bubble input and is a form control, stop
				// propagation from the button so that we only propagate one click
				// event (from the input). We propagate changes from an input so
				// that native form validation works and form events reflect switch
				// updates.
				if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
			}
		}),
	});
}

export function Root(props: any): any {
	const {
		__scopeSwitch,
		name,
		checked,
		defaultChecked,
		required,
		disabled,
		value,
		onCheckedChange,
		form,
		ref: forwardedRef,
		...switchProps
	} = props ?? {};

	return createElement(Provider, {
		__scopeSwitch,
		checked,
		defaultChecked,
		disabled,
		required,
		onCheckedChange,
		name,
		form,
		value,
		internal_do_not_use_render: ({ isFormControl }: SwitchContextValue) => [
			createElement(Trigger, {
				key: 'trigger',
				...switchProps,
				ref: forwardedRef,
				__scopeSwitch,
			}),
			isFormControl ? createElement(BubbleInput, { key: 'bubble', __scopeSwitch }) : null,
		],
	});
}

export function Thumb(props: any): any {
	const { __scopeSwitch, ...thumbProps } = props ?? {};
	const context = useSwitchContext('SwitchThumb', __scopeSwitch);
	return createElement(Primitive.span, {
		'data-state': getState(context.checked),
		'data-disabled': context.disabled ? '' : undefined,
		...thumbProps,
	});
}

export function BubbleInput(props: any): any {
	const slot = S('Switch.BubbleInput');
	const { __scopeSwitch, ref: forwardedRef, ...inputProps } = props ?? {};
	const {
		control,
		hasConsumerStoppedPropagationRef,
		checked,
		defaultChecked,
		required,
		disabled,
		name,
		value,
		form,
		bubbleInput,
		setBubbleInput,
	} = useSwitchContext('SwitchBubbleInput', __scopeSwitch);

	const composedRefs = useComposedRefs(forwardedRef, setBubbleInput, subSlot(slot, 'refs'));
	const prevChecked = usePrevious(checked, subSlot(slot, 'prev'));
	const controlSize = useSize(control, subSlot(slot, 'size'));

	// Bubble checked change to parents (e.g form change event)
	useEffect(
		() => {
			const input = bubbleInput;
			if (!input) return;

			const inputProto = window.HTMLInputElement.prototype;
			const descriptor = Object.getOwnPropertyDescriptor(
				inputProto,
				'checked',
			) as PropertyDescriptor;
			const setChecked = descriptor.set;

			const bubbles = !hasConsumerStoppedPropagationRef.current;
			if (prevChecked !== checked && setChecked) {
				setChecked.call(input, checked);
				input.dispatchEvent(new Event('click', { bubbles }));
				// octane adaptation: also fire the native `change` (see Checkbox.ts header).
				input.dispatchEvent(new Event('change', { bubbles }));
			}
		},
		[bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef],
		subSlot(slot, 'e:bubble'),
	);

	const defaultCheckedRef = useRef(checked, subSlot(slot, 'default'));
	return createElement(Primitive.input, {
		type: 'checkbox',
		'aria-hidden': true,
		// octane: native `checked` attribute = default-checked state (see Checkbox.ts).
		checked: (defaultChecked ?? defaultCheckedRef.current) || undefined,
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

export {
	Root as Switch,
	Provider as SwitchProvider,
	Trigger as SwitchTrigger,
	Thumb as SwitchThumb,
	BubbleInput as SwitchBubbleInput,
};
