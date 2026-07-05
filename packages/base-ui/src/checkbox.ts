// Ported from .base-ui/packages/react/src/checkbox/ (v1.6.0): root/CheckboxRoot,
// root/CheckboxRootContext, utils/useStateAttributesMapping, indicator/CheckboxIndicator —
// plus its `index.parts` (the `Checkbox` namespace).
//
// A checkbox renders a `<span role="checkbox">` + a hidden `<input type="checkbox">`, with an
// optional `<Checkbox.Indicator>` (transition-mounted). octane adaptations mirror Switch:
// native events (no `.nativeEvent`); the uncontrolled-input pattern (initial checked →
// attribute, live `input.checked` PROPERTY via the native setter, native click/change
// dispatch); `input.indeterminate` set imperatively as a property. The CheckboxGroup /
// parent-checkbox branches stay dormant until CheckboxGroup lands (groupContext undefined).
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { mergeProps, makeEventPreventable } from './utils/mergeProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useComposedRefs } from './utils/composeRefs';
import { useRefWithInit } from './utils/useRefWithInit';
import { visuallyHidden, visuallyHiddenInput } from './utils/visuallyHidden';
import { ownerWindow } from './utils/owner';
import { getDefaultFormSubmitter } from './utils/getDefaultFormSubmitter';
import { NOOP } from './utils/noop';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFieldItemContext } from './utils/field/FieldItemContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { useAriaLabelledBy } from './utils/field/useAriaLabelledBy';
import { useCheckboxGroupContext } from './utils/CheckboxGroupContext';
import { useValueChanged } from './utils/useValueChanged';
import {
	useTransitionStatus,
	transitionStatusMapping,
	type TransitionStatus,
} from './utils/useTransitionStatus';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';

export const PARENT_CHECKBOX = 'data-parent';

export interface CheckboxRootState extends FieldRootState {
	checked: boolean;
	readOnly: boolean;
	required: boolean;
	indeterminate: boolean;
}

// state → data-* (checked/unchecked, but nothing when indeterminate — `data-indeterminate`
// comes from the default mapping of the `indeterminate` state key). Recomputed when
// `indeterminate` flips.
function useStateAttributesMapping(state: CheckboxRootState): StateAttributesMapping<any> {
	return useMemo<StateAttributesMapping<any>>(
		() => ({
			checked(value: boolean): Record<string, string> {
				if (state.indeterminate) {
					return {};
				}
				if (value) {
					return { 'data-checked': '' };
				}
				return { 'data-unchecked': '' };
			},
			...(fieldValidityMapping as StateAttributesMapping<any>),
		}),
		[state.indeterminate],
		S('Checkbox.mapping'),
	);
}

// --- Context -----------------------------------------------------------------

const CheckboxRootContext = createContext<CheckboxRootState | undefined>(undefined);

function useCheckboxRootContext(): CheckboxRootState {
	const context = useContext(CheckboxRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: CheckboxRootContext is missing. Checkbox parts must be placed within <Checkbox.Root>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

export interface CheckboxRootProps {
	checked?: boolean;
	defaultChecked?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	indeterminate?: boolean;
	name?: string;
	form?: string;
	id?: string;
	inputRef?: any;
	parent?: boolean;
	nativeButton?: boolean;
	value?: string;
	uncheckedValue?: string;
	onCheckedChange?: (checked: boolean, eventDetails: any) => void;
	'aria-labelledby'?: string;
	render?: RenderProp<CheckboxRootState>;
	className?: string | ((state: CheckboxRootState) => string | undefined);
	style?: Record<string, any> | ((state: CheckboxRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function CheckboxRoot(props: CheckboxRootProps): any {
	const slot = S('CheckboxRoot');
	const {
		checked: checkedProp,
		className,
		defaultChecked = false,
		'aria-labelledby': ariaLabelledByProp,
		disabled: disabledProp = false,
		form,
		id: idProp,
		indeterminate = false,
		inputRef: inputRefProp,
		name: nameProp,
		onCheckedChange,
		parent = false,
		readOnly = false,
		render,
		required = false,
		uncheckedValue,
		value: valueProp,
		nativeButton = false,
		style,
		ref,
		...elementProps
	} = props;

	const { clearErrors } = useFormContext();
	const {
		disabled: rootDisabled,
		name: fieldName,
		setDirty,
		setFilled,
		setFocused,
		setTouched,
		state: fieldState,
		validationMode,
		validityData,
		validation: localValidation,
	} = useFieldRootContext();
	const fieldItemContext = useFieldItemContext();
	const { labelId, controlId, registerControlId, getDescriptionProps } = useLabelableContext();

	const groupContext = useCheckboxGroupContext();
	const parentContext = groupContext?.parent;
	const isGroupedWithParent = parentContext && groupContext!.allValues;

	const disabled =
		rootDisabled || fieldItemContext.disabled || groupContext?.disabled || disabledProp;
	const name = fieldName ?? nameProp;
	const value = valueProp ?? name;

	const id = useBaseUiId(undefined, subSlot(slot, 'id'));
	const parentId = useBaseUiId(undefined, subSlot(slot, 'parentId'));

	let inputId = controlId;
	if (isGroupedWithParent) {
		inputId = parent ? parentId : `${parentContext.id}-${value}`;
	} else if (idProp) {
		inputId = idProp;
	}

	let groupProps: Record<string, any> = {};
	if (isGroupedWithParent) {
		if (parent) {
			groupProps = groupContext!.parent.getParentProps();
		} else if (value) {
			groupProps = groupContext!.parent.getChildProps(value);
		}
	}

	const {
		checked: groupChecked = checkedProp,
		indeterminate: groupIndeterminate = indeterminate,
		onCheckedChange: groupOnChange,
		...otherGroupProps
	} = groupProps;

	const groupValue = groupContext?.value;
	const setGroupValue = groupContext?.setValue;
	const defaultGroupValue = groupContext?.defaultValue;

	const controlRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'controlRef'));
	const controlSourceRef = useRefWithInit<symbol>(
		() => Symbol('checkbox-control'),
		subSlot(slot, 'controlSrc'),
	);
	const hasRegisteredRef = useRef(false, subSlot(slot, 'hasReg'));

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'button'),
	);

	const validation = groupContext?.validation ?? localValidation;

	const [checked, setCheckedState] = useControlled<boolean>(
		{
			controlled: value && groupValue && !parent ? groupValue.includes(value) : groupChecked,
			default:
				value && defaultGroupValue && !parent ? defaultGroupValue.includes(value) : defaultChecked,
			name: 'Checkbox',
			state: 'checked',
		},
		subSlot(slot, 'checked'),
	);

	// octane: reflect the INITIAL checked as the `checked` ATTRIBUTE (see Switch).
	const initialCheckedRef = useRef(checked, subSlot(slot, 'initialChecked'));

	const computedChecked = isGroupedWithParent ? Boolean(groupChecked) : checked;
	const computedIndeterminate = isGroupedWithParent
		? groupIndeterminate || indeterminate
		: indeterminate;

	// Field.Item / group control-id registration (inert standalone).
	useLayoutEffect(
		() => {
			if (registerControlId === NOOP) {
				return undefined;
			}
			hasRegisteredRef.current = true;
			registerControlId(controlSourceRef.current, inputId);
			return undefined;
		},
		[inputId, registerControlId, controlSourceRef],
		subSlot(slot, 'e:regId'),
	);

	useEffect(
		() => {
			const controlSource = controlSourceRef.current;
			return () => {
				if (!hasRegisteredRef.current || registerControlId === NOOP) {
					return;
				}
				hasRegisteredRef.current = false;
				registerControlId(controlSource, undefined);
			};
		},
		[registerControlId, controlSourceRef],
		subSlot(slot, 'e:unregId'),
	);

	useRegisterFieldControl(
		controlRef,
		id,
		checked,
		undefined,
		!groupContext && !disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const mergedInputRef = useComposedRefs(
		inputRefProp,
		inputRef,
		validation.inputRef,
		validation.registerInput,
		subSlot(slot, 'mergedInputRef'),
	);
	const ariaLabelledBy = useAriaLabelledBy(
		ariaLabelledByProp,
		labelId,
		inputRef,
		!nativeButton,
		inputId ?? undefined,
		subSlot(slot, 'ariaLabelledBy'),
	);

	// octane: set `checked` (property) + `indeterminate` (property) imperatively; matches
	// React's controlled input (property-only, never a `checked` attribute beyond the initial).
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
			input.indeterminate = computedIndeterminate;
			if (checked) {
				setFilled(true);
			}
		},
		[checked, computedIndeterminate, setFilled],
		subSlot(slot, 'e:sync'),
	);

	useValueChanged(
		checked,
		() => {
			if (groupContext) {
				return;
			}
			clearErrors(name);
			setFilled(checked);
			setDirty(checked !== validityData.initialValue);
			validation.change(checked);
		},
		subSlot(slot, 'valueChanged'),
	);

	const inputProps: Record<string, any> = mergeProps(
		{
			// octane: initial checked → attribute; live value driven via the property (above).
			checked: initialCheckedRef.current || undefined,
			disabled,
			form,
			name: parent ? undefined : name,
			id: nativeButton ? undefined : (inputId ?? undefined),
			required,
			ref: mergedInputRef,
			style: name ? visuallyHiddenInput : visuallyHidden,
			tabIndex: -1,
			type: 'checkbox',
			'aria-hidden': true,
			onChange(event: any) {
				if (event.defaultPrevented) {
					return;
				}
				if (readOnly) {
					event.preventDefault();
					return;
				}
				const nextChecked = event.currentTarget.checked;
				const details = createChangeEventDetails(REASONS.none, event);
				onCheckedChange?.(nextChecked, details);
				if (details.isCanceled) {
					return;
				}
				groupOnChange?.(nextChecked, details);
				if (details.isCanceled) {
					return;
				}
				setCheckedState(nextChecked);
				if (value && groupValue && setGroupValue && !parent && !isGroupedWithParent) {
					const nextGroupValue = nextChecked
						? [...groupValue, value]
						: groupValue.filter((item) => item !== value);
					setGroupValue(nextGroupValue, details);
				}
			},
			onFocus() {
				controlRef.current?.focus();
			},
		},
		valueProp !== undefined
			? { value: (groupContext ? checked && valueProp : valueProp) || '' }
			: {},
		getDescriptionProps,
		(p: any) => validation.getValidationProps(disabled, p),
	);

	useEffect(
		() => {
			if (!parentContext || !value) {
				return undefined;
			}
			const disabledStates = parentContext.disabledStatesRef.current;
			disabledStates.set(value, disabled);
			return () => {
				disabledStates.delete(value);
			};
		},
		[parentContext, disabled, value],
		subSlot(slot, 'e:parentDisabled'),
	);

	const state: CheckboxRootState = useMemo(
		() => ({
			...fieldState,
			checked: computedChecked,
			disabled,
			readOnly,
			required,
			indeterminate: computedIndeterminate,
		}),
		[fieldState, computedChecked, disabled, readOnly, required, computedIndeterminate],
		subSlot(slot, 'state'),
	);

	const stateAttributesMapping = useStateAttributesMapping(state);

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{
			state,
			ref: [buttonRef, controlRef, ref, groupContext?.registerControlRef],
			props: [
				{
					id: nativeButton ? (inputId ?? undefined) : id,
					role: 'checkbox',
					'aria-checked': computedIndeterminate ? 'mixed' : computedChecked,
					'aria-readonly': readOnly || undefined,
					'aria-required': required || undefined,
					'aria-labelledby': ariaLabelledBy,
					[PARENT_CHECKBOX]: parent ? '' : undefined,
					onFocus() {
						if (!disabled) {
							setFocused(true);
						}
					},
					onBlur() {
						const inputEl = inputRef.current;
						if (!inputEl) {
							return;
						}
						setTouched(true);
						setFocused(false);
						if (validationMode === 'onBlur') {
							validation.commit(groupContext ? groupValue : inputEl.checked);
						}
					},
					onKeyDown(event: any) {
						if (event.key !== 'Enter') {
							return;
						}
						// octane: `event` IS the native event.
						makeEventPreventable(event);
						event.preventBaseUIHandler?.();
						if (event.defaultPrevented) {
							return;
						}
						const formToSubmit = inputRef.current?.form ?? null;
						const currentTarget = event.currentTarget;
						const originalPreventDefault = event.preventDefault.bind(event);
						let preventDefaultCalledAfterPropagation = false;
						event.preventDefault = () => {
							preventDefaultCalledAfterPropagation = true;
							originalPreventDefault();
						};
						// Cancel the native button behavior without flagging defaultPrevented.
						originalPreventDefault();
						ownerWindow(currentTarget).queueMicrotask(() => {
							event.preventDefault = originalPreventDefault;
							if (!preventDefaultCalledAfterPropagation) {
								getDefaultFormSubmitter(formToSubmit)?.click();
							}
						});
					},
					onClick(event: any) {
						if (readOnly || disabled) {
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
				},
				elementProps,
				otherGroupProps,
				getButtonProps,
				getDescriptionProps,
				(p: any) => validation.getValidationProps(disabled, p),
			],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	const hiddenValueInput =
		!checked && !groupContext && name && !parent && uncheckedValue !== undefined
			? createElement('input', {
					type: 'hidden',
					form,
					name,
					value: uncheckedValue,
					disabled,
				})
			: null;

	return createElement(CheckboxRootContext.Provider, {
		value: state,
		children: [element, hiddenValueInput, createElement('input', inputProps)],
	});
}

// --- Indicator ---------------------------------------------------------------

export interface CheckboxIndicatorState extends CheckboxRootState {
	transitionStatus: TransitionStatus;
}

function CheckboxIndicator(props: any): any {
	const slot = S('CheckboxIndicator');
	const { render, className, style, keepMounted = false, ref, ...elementProps } = props;

	const rootState = useCheckboxRootContext();
	const rendered = rootState.checked || rootState.indeterminate;

	const { mounted, transitionStatus, setMounted } = useTransitionStatus(
		rendered,
		subSlot(slot, 'ts'),
	);

	const indicatorRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'indRef'));

	const state: CheckboxIndicatorState = { ...rootState, transitionStatus };

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

	const baseStateAttributesMapping = useStateAttributesMapping(rootState);
	const stateAttributesMapping: StateAttributesMapping<any> = {
		...baseStateAttributesMapping,
		...transitionStatusMapping,
		...(fieldValidityMapping as StateAttributesMapping<any>),
	};

	const shouldRender = keepMounted || mounted;

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{ ref: [ref, indicatorRef], state, stateAttributesMapping, props: elementProps },
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

// --- Namespace (mirrors `export * as Checkbox`) ------------------------------

export const Checkbox = {
	Root: CheckboxRoot,
	Indicator: CheckboxIndicator,
};
