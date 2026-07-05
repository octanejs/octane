// Ported from .base-ui/packages/react/src/radio/ (v1.6.0): root/RadioRoot,
// root/RadioRootContext, utils/stateAttributesMapping, indicator/RadioIndicator — plus its
// `index.parts` (the `Radio` namespace).
//
// A radio renders a `<span role="radio">` + a hidden `<input type="radio">` (a CompositeItem
// for roving focus when inside a <RadioGroup>). octane adaptations mirror Switch/Checkbox:
// native events; the uncontrolled-input pattern (initial checked → attribute, live
// `input.checked` PROPERTY via the native setter, native click/change dispatch).
import { createContext, createElement, useContext, useLayoutEffect, useMemo, useRef } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useComposedRefs } from './utils/composeRefs';
import { useStableCallback } from './utils/useStableCallback';
import { visuallyHidden, visuallyHiddenInput } from './utils/visuallyHidden';
import { ownerWindow } from './utils/owner';
import { NOOP } from './utils/noop';
import { serializeValue } from './utils/serializeValue';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFieldItemContext } from './utils/field/FieldItemContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useAriaLabelledBy } from './utils/field/useAriaLabelledBy';
import { useLabelableId } from './utils/field/useLabelableId';
import { useRadioGroupContext } from './utils/RadioGroupContext';
import { ACTIVE_COMPOSITE_ITEM } from './utils/composite/keys';
import { CompositeItem } from './utils/composite/CompositeItem';
import {
	useTransitionStatus,
	transitionStatusMapping,
	type TransitionStatus,
} from './utils/useTransitionStatus';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';

export interface RadioRootState extends FieldRootState {
	checked: boolean;
	readOnly: boolean;
	required: boolean;
}

const stateAttributesMapping: StateAttributesMapping<any> = {
	checked(value: boolean): Record<string, string> {
		if (value) {
			return { 'data-checked': '' };
		}
		return { 'data-unchecked': '' };
	},
	...(transitionStatusMapping as StateAttributesMapping<any>),
	...(fieldValidityMapping as StateAttributesMapping<any>),
};

// --- Context -----------------------------------------------------------------

const RadioRootContext = createContext<RadioRootState | undefined>(undefined);

function useRadioRootContext(): RadioRootState {
	const value = useContext(RadioRootContext);
	if (value === undefined) {
		throw new Error(
			'Base UI: RadioRootContext is missing. Radio parts must be placed within <Radio.Root>.',
		);
	}
	return value;
}

// --- Root --------------------------------------------------------------------

export interface RadioRootProps {
	value: any;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	inputRef?: any;
	nativeButton?: boolean;
	id?: string;
	'aria-labelledby'?: string;
	render?: RenderProp<RadioRootState>;
	className?: string | ((state: RadioRootState) => string | undefined);
	style?: Record<string, any> | ((state: RadioRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function RadioRoot(props: RadioRootProps): any {
	const slot = S('RadioRoot');
	const {
		render,
		className,
		disabled: disabledProp = false,
		readOnly: readOnlyProp = false,
		required: requiredProp = false,
		'aria-labelledby': ariaLabelledByProp,
		value,
		inputRef: inputRefProp,
		nativeButton = false,
		id: idProp,
		style,
		ref,
		...elementProps
	} = props;

	const groupContext = useRadioGroupContext();
	const {
		disabled: disabledGroup,
		readOnly: readOnlyGroup,
		required: requiredGroup,
		form: formGroup,
		checkedValue,
		touched = false,
		validation,
		name,
	} = groupContext ?? {};
	const setCheckedValue = groupContext?.setCheckedValue ?? NOOP;
	const setTouched = groupContext?.setTouched ?? NOOP;
	const registerControlRef = groupContext?.registerControlRef ?? NOOP;
	const registerInputRef = groupContext?.registerInputRef ?? NOOP;

	const {
		setTouched: setFieldTouched,
		setFilled,
		state: fieldState,
		disabled: fieldDisabled,
	} = useFieldRootContext();
	const fieldItemContext = useFieldItemContext();
	const { labelId, getDescriptionProps } = useLabelableContext();

	const disabled = fieldDisabled || fieldItemContext.disabled || disabledGroup || disabledProp;
	const readOnly = readOnlyGroup || readOnlyProp;
	const required = requiredGroup || requiredProp;
	const form = formGroup;

	const checked = groupContext ? checkedValue === value : value === '';

	const radioRef = useRef<HTMLElement | null>(null, subSlot(slot, 'radioRef'));
	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));

	// octane: reflect the INITIAL checked as the `checked` ATTRIBUTE (see Switch).
	const initialCheckedRef = useRef(checked, subSlot(slot, 'initialChecked'));

	const handleControlRef = useStableCallback(
		(element: HTMLElement | null) => {
			if (!element) {
				return;
			}
			registerControlRef(element, disabled);
		},
		subSlot(slot, 'handleControlRef'),
	);

	const mergedInputRef = useComposedRefs(
		inputRefProp,
		inputRef,
		registerInputRef,
		subSlot(slot, 'mergedInputRef'),
	);

	useLayoutEffect(
		() => {
			if (inputRef.current?.checked) {
				setFilled(true);
			}
		},
		[setFilled],
		subSlot(slot, 'e:filled'),
	);

	// octane: drive `input.checked` PROPERTY imperatively (matches React's controlled input).
	useLayoutEffect(
		() => {
			const input = inputRef.current;
			if (!input) {
				return;
			}
			const setNativeChecked = Object.getOwnPropertyDescriptor(
				ownerWindow(input).HTMLInputElement.prototype,
				'checked',
			)?.set;
			setNativeChecked?.call(input, checked);
		},
		[checked],
		subSlot(slot, 'e:syncChecked'),
	);

	useLayoutEffect(
		() => {
			if (!inputRef.current) {
				return;
			}
			if (disabled && checked) {
				registerInputRef(null);
				return;
			}
			if (radioRef.current) {
				registerControlRef(radioRef.current, disabled);
			}
			registerInputRef(inputRef.current);
		},
		[checked, disabled, registerControlRef, registerInputRef],
		subSlot(slot, 'e:registerInput'),
	);

	const id = useBaseUiId(undefined, subSlot(slot, 'id'));
	const inputId = useLabelableId(
		{ id: idProp, implicit: false, controlRef: radioRef },
		subSlot(slot, 'inputId'),
	);
	const hiddenInputId = nativeButton ? undefined : inputId;
	const ariaLabelledBy = useAriaLabelledBy(
		ariaLabelledByProp,
		labelId,
		inputRef,
		!nativeButton,
		hiddenInputId,
		subSlot(slot, 'ariaLabelledBy'),
	);

	const rootProps: Record<string, any> = {
		role: 'radio',
		'aria-checked': checked,
		'aria-required': required || undefined,
		'aria-readonly': readOnly || undefined,
		'aria-labelledby': ariaLabelledBy,
		[ACTIVE_COMPOSITE_ITEM]: checked ? '' : undefined,
		id: nativeButton ? inputId : id,
		onKeyDown(event: any) {
			if (event.key === 'Enter') {
				event.preventDefault();
			}
		},
		onClick(event: any) {
			if (event.defaultPrevented || disabled || readOnly) {
				return;
			}
			event.preventDefault();
			const input = inputRef.current;
			if (!input) {
				return;
			}
			input.dispatchEvent(
				new (ownerWindow(input).PointerEvent)('click', {
					bubbles: true,
					shiftKey: event.shiftKey,
					ctrlKey: event.ctrlKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
				}),
			);
		},
		onFocus(event: any) {
			if (event.defaultPrevented || disabled || readOnly || !touched) {
				return;
			}
			inputRef.current?.click();
			setTouched(false);
		},
	};

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton, composite: false },
		subSlot(slot, 'button'),
	);

	const inputProps: Record<string, any> = {
		type: 'radio',
		ref: mergedInputRef,
		form,
		id: hiddenInputId,
		name,
		tabIndex: -1,
		style: name ? visuallyHiddenInput : visuallyHidden,
		'aria-hidden': true,
		...(value !== undefined ? { value: serializeValue(value) } : {}),
		disabled,
		// octane: initial checked → attribute; live value via the property sync effect.
		checked: initialCheckedRef.current || undefined,
		required,
		readOnly,
		onChange(event: any) {
			if (event.defaultPrevented) {
				return;
			}
			if (disabled || readOnly || value === undefined) {
				return;
			}
			const details = createChangeEventDetails(REASONS.none, event);
			setCheckedValue(value, details);
			if (details.isCanceled) {
				return;
			}
			setFieldTouched(true);
		},
		onFocus() {
			radioRef.current?.focus();
		},
	};

	const state: RadioRootState = useMemo(
		() => ({ ...fieldState, required, disabled, readOnly, checked }),
		[fieldState, disabled, readOnly, checked, required],
		subSlot(slot, 'state'),
	);

	const isRadioGroup = groupContext !== undefined;

	const refs = [ref, radioRef, buttonRef, handleControlRef];
	const renderProps = [
		rootProps,
		elementProps,
		getButtonProps,
		getDescriptionProps,
		validation
			? (validationProps: any) => validation!.getValidationProps(disabled, validationProps)
			: {},
	];

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{ enabled: !isRadioGroup, state, ref: refs, props: renderProps, stateAttributesMapping },
		subSlot(slot, 're'),
	);

	const rendered = isRadioGroup
		? createElement(CompositeItem, {
				tag: 'span',
				render,
				className,
				style,
				state,
				refs,
				props: renderProps,
				stateAttributesMapping,
			})
		: element;

	return createElement(RadioRootContext.Provider, {
		value: state,
		children: [rendered, createElement('input', inputProps)],
	});
}

// --- Indicator ---------------------------------------------------------------

export interface RadioIndicatorState extends RadioRootState {
	transitionStatus: TransitionStatus;
}

function RadioIndicator(props: any): any {
	const slot = S('RadioIndicator');
	const { render, className, style, keepMounted = false, ref, ...elementProps } = props;

	const rootState = useRadioRootContext();
	const rendered = rootState.checked;

	const { mounted, transitionStatus, setMounted } = useTransitionStatus(
		rendered,
		subSlot(slot, 'ts'),
	);

	const state: RadioIndicatorState = { ...rootState, transitionStatus };
	const indicatorRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'indRef'));

	const shouldRender = keepMounted || mounted;

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{ ref: [ref, indicatorRef], state, props: elementProps, stateAttributesMapping },
		subSlot(slot, 're'),
	);

	useOpenChangeComplete(
		{
			open: rendered,
			ref: indicatorRef,
			onComplete() {
				if (!rendered) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

// --- Namespace (mirrors `export * as Radio`) ---------------------------------

export const Radio = {
	Root: RadioRoot,
	Indicator: RadioIndicator,
};
