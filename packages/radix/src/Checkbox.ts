// Ported from @radix-ui/react-checkbox (source:
// .radix-primitives/packages/react/checkbox/src/checkbox.tsx). A `role=checkbox` button
// (with `indeterminate` support) that — when inside a form — renders a hidden native
// checkbox "bubble input" so native form machinery (FormData, validation, reset,
// change listeners) reflects the state.
//
// octane adaptations (documented; see docs/react-parity-migration-plan.md):
// - React's synthetic `event.isPropagationStopped()` → native `event.cancelBubble`.
// - The source's uncontrolled bubble input (`defaultChecked` + prototype-descriptor
//   `checked` writes) → a live CONTROLLED `checked` prop: octane's React-parity
//   controlled form components write the DOM property at commit and reassert it after
//   every event flush, so the bubble effect only dispatches events.
// - The bubble effect ALSO dispatches a native `change` event after the source's
//   `click`: React forms observe checkbox clicks through synthetic `onChange`, which
//   octane doesn't have — a native bubbling `change` gives octane `<form onChange>`
//   the same functional outcome.
import { createElement, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { usePrevious } from './use-previous';
import { useSize } from './use-size';
import { useControllableState } from './useControllableState';

const CHECKBOX_NAME = 'Checkbox';

const [createCheckboxContext, createCheckboxScope] = createContextScope(CHECKBOX_NAME);
export { createCheckboxScope };

export type CheckedState = boolean | 'indeterminate';

interface CheckboxContextValue {
	checked: CheckedState;
	setChecked: (checked: CheckedState | ((prev: CheckedState) => CheckedState)) => void;
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

const [CheckboxProviderImpl, useCheckboxContext] =
	createCheckboxContext<CheckboxContextValue>(CHECKBOX_NAME);

export function Provider(props: any): any {
	const slot = S('Checkbox.Provider');
	const {
		__scopeCheckbox,
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

	const [checked, setChecked] = useControllableState<CheckedState>(
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

	const context: CheckboxContextValue = {
		checked,
		disabled,
		setChecked,
		control,
		setControl,
		name,
		form,
		value,
		hasConsumerStoppedPropagationRef,
		required,
		defaultChecked: isIndeterminate(defaultChecked) ? false : defaultChecked,
		isFormControl,
		bubbleInput,
		setBubbleInput,
	};

	return createElement(CheckboxProviderImpl, {
		scope: __scopeCheckbox,
		...context,
		children: isFunction(internal_do_not_use_render)
			? internal_do_not_use_render(context)
			: children,
	});
}

export function Trigger(props: any): any {
	const slot = S('Checkbox.Trigger');
	const { __scopeCheckbox, onKeyDown, onClick, ref: forwardedRef, ...checkboxProps } = props ?? {};
	const {
		control,
		value,
		disabled,
		checked,
		required,
		setControl,
		setChecked,
		hasConsumerStoppedPropagationRef,
		isFormControl,
		bubbleInput,
	} = useCheckboxContext('CheckboxTrigger', __scopeCheckbox);
	const composedRefs = useComposedRefs(forwardedRef, setControl, subSlot(slot, 'refs'));

	const initialCheckedStateRef = useRef(checked, subSlot(slot, 'initial'));
	useEffect(
		() => {
			const form = (control as HTMLButtonElement | null)?.form;
			if (form) {
				const reset = (): void => setChecked(initialCheckedStateRef.current);
				form.addEventListener('reset', reset);
				return () => form.removeEventListener('reset', reset);
			}
		},
		[control, setChecked],
		subSlot(slot, 'e:reset'),
	);

	return createElement(Primitive.button, {
		type: 'button',
		role: 'checkbox',
		'aria-checked': isIndeterminate(checked) ? 'mixed' : checked,
		'aria-required': required,
		'data-state': getState(checked),
		'data-disabled': disabled ? '' : undefined,
		disabled,
		value,
		...checkboxProps,
		ref: composedRefs,
		onKeyDown: composeEventHandlers(onKeyDown, (event: KeyboardEvent) => {
			// According to WAI ARIA, Checkboxes don't activate on enter keypress
			if (event.key === 'Enter') event.preventDefault();
		}),
		onClick: composeEventHandlers(onClick, (event: MouseEvent) => {
			setChecked((prevChecked) => (isIndeterminate(prevChecked) ? true : !prevChecked));
			if (bubbleInput && isFormControl) {
				hasConsumerStoppedPropagationRef.current = event.cancelBubble;
				// if checkbox has a bubble input and is a form control, stop
				// propagation from the button so that we only propagate one click
				// event (from the input). We propagate changes from an input so
				// that native form validation works and form events reflect
				// checkbox updates.
				if (!hasConsumerStoppedPropagationRef.current) event.stopPropagation();
			}
		}),
	});
}

export function Root(props: any): any {
	const {
		__scopeCheckbox,
		name,
		checked,
		defaultChecked,
		required,
		disabled,
		value,
		onCheckedChange,
		form,
		ref: forwardedRef,
		...checkboxProps
	} = props ?? {};

	return createElement(Provider, {
		__scopeCheckbox,
		checked,
		defaultChecked,
		disabled,
		required,
		onCheckedChange,
		name,
		form,
		value,
		internal_do_not_use_render: ({ isFormControl }: CheckboxContextValue) => [
			createElement(Trigger, {
				key: 'trigger',
				...checkboxProps,
				ref: forwardedRef,
				__scopeCheckbox,
			}),
			isFormControl ? createElement(BubbleInput, { key: 'bubble', __scopeCheckbox }) : null,
		],
	});
}

export function Indicator(props: any): any {
	const { __scopeCheckbox, forceMount, ...indicatorProps } = props ?? {};
	const context = useCheckboxContext('CheckboxIndicator', __scopeCheckbox);
	return createElement(Presence, {
		present: forceMount || isIndeterminate(context.checked) || context.checked === true,
		children: createElement(Primitive.span, {
			'data-state': getState(context.checked),
			'data-disabled': context.disabled ? '' : undefined,
			...indicatorProps,
			style: { pointerEvents: 'none', ...props?.style },
		}),
	});
}

export function BubbleInput(props: any): any {
	const slot = S('Checkbox.BubbleInput');
	const { __scopeCheckbox, ref: forwardedRef, ...inputProps } = props ?? {};
	const {
		control,
		hasConsumerStoppedPropagationRef,
		checked,
		required,
		disabled,
		name,
		value,
		form,
		bubbleInput,
		setBubbleInput,
	} = useCheckboxContext('CheckboxBubbleInput', __scopeCheckbox);

	const composedRefs = useComposedRefs(forwardedRef, setBubbleInput, subSlot(slot, 'refs'));
	const prevChecked = usePrevious(checked, subSlot(slot, 'prev'));
	const controlSize = useSize(control, subSlot(slot, 'size'));

	// Bubble checked change to parents (e.g form change event). The controlled
	// `checked` prop below keeps the input's DOM state in sync, so — unlike the
	// source's uncontrolled input — this effect only dispatches the events
	// (`indeterminate` stays imperative: it is property-only, as in the source).
	useEffect(
		() => {
			const input = bubbleInput;
			if (!input) return;

			const bubbles = !hasConsumerStoppedPropagationRef.current;
			if (prevChecked !== checked) {
				input.indeterminate = isIndeterminate(checked);
				input.dispatchEvent(new Event('click', { bubbles }));
				// octane adaptation: also fire the native `change` React's synthetic
				// onChange would have synthesised from the click (see file header).
				input.dispatchEvent(new Event('change', { bubbles }));
			}
		},
		[bubbleInput, prevChecked, checked, hasConsumerStoppedPropagationRef],
		subSlot(slot, 'e:bubble'),
	);

	return createElement(Primitive.input, {
		type: 'checkbox',
		'aria-hidden': true,
		// Live CONTROLLED checked (octane React-parity): the runtime writes the DOM
		// property, mirrors only the INITIAL state to the attribute, and reasserts
		// the property on every commit / after event flushes.
		checked: isIndeterminate(checked) ? false : checked,
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

function isIndeterminate(checked?: CheckedState | boolean): checked is 'indeterminate' {
	return checked === 'indeterminate';
}

function getState(checked: CheckedState): string {
	return isIndeterminate(checked) ? 'indeterminate' : checked ? 'checked' : 'unchecked';
}

export {
	Root as Checkbox,
	Provider as CheckboxProvider,
	Trigger as CheckboxTrigger,
	Indicator as CheckboxIndicator,
	BubbleInput as CheckboxBubbleInput,
};
