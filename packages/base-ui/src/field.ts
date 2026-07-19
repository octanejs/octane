// Ported from .base-ui/packages/react/src/field/ (v1.6.0): root/FieldRoot,
// control/FieldControl, label/FieldLabel, description/FieldDescription, error/FieldError,
// validity/FieldValidity, item/FieldItem — plus its `index.parts` (the `Field` namespace).
//
// Field groups a control with its label/description/error and runs validation. The default
// (inert) field contexts are overridden here by the real providers. octane adaptations:
// native events; forwardRef → ref-as-prop. The control's `value`/`defaultValue` pass straight
// through — octane inputs are CONTROLLED exactly like React's.
import {
	createContext,
	createElement,
	useContext,
	useCallback,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { ownerDocument } from './utils/owner';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import {
	DEFAULT_VALIDITY_STATE,
	fieldValidityMapping,
	type FieldRootState,
	type FieldValidityData,
	type FormValidationMode,
} from './utils/field/constants';
import { FieldRootContext, type FieldRootContextValue } from './utils/field/FieldRootContext';
import { FieldItemContext } from './utils/field/FieldItemContext';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFieldItemContext } from './utils/field/FieldItemContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { LabelableProvider } from './utils/field/LabelableProvider';
import { useLabelableId } from './utils/field/useLabelableId';
import { useLabel } from './utils/field/useLabel';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { useFieldValidation } from './utils/field/useFieldValidation';
import { useFieldControlRegistration } from './utils/field/useFieldControlRegistration';
import { getCombinedFieldValidityData } from './utils/field/getCombinedFieldValidityData';
import { useFieldsetRootContext } from './fieldset';
import { transitionStatusMapping, useTransitionStatus } from './utils/useTransitionStatus';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { useBaseUiId } from './utils/useBaseUiId';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';

function activeElement(doc: Document): Element | null {
	return doc.activeElement;
}

// --- Root --------------------------------------------------------------------

function FieldRootInner(props: any): any {
	const slot = S('FieldRootInner');
	const { errors, validationMode: formValidationMode, submitAttemptedRef } = useFormContext();

	const {
		render,
		className,
		validate: validateProp,
		validationDebounceTime = 0,
		validationMode = formValidationMode,
		name,
		disabled: disabledProp = false,
		invalid: invalidProp,
		dirty: dirtyProp,
		touched: touchedProp,
		actionsRef,
		style,
		ref,
		...elementProps
	} = props;

	const disabledFieldset = useFieldsetRootContext(true)?.disabled;
	const validate = useStableCallback(validateProp || (() => null), subSlot(slot, 'validate'));
	const disabled = disabledFieldset || disabledProp;

	const [touchedState, setTouchedUnwrapped] = useState(false, subSlot(slot, 'touched'));
	const [dirtyState, setDirtyUnwrapped] = useState(false, subSlot(slot, 'dirty'));
	const [filled, setFilled] = useState(false, subSlot(slot, 'filled'));
	const [focused, setFocused] = useState(false, subSlot(slot, 'focused'));

	const dirty = dirtyProp ?? dirtyState;
	const touched = touchedProp ?? touchedState;

	const markedDirtyRef = useRef(dirty, subSlot(slot, 'markedDirty'));
	const registeredFieldIdRef = useRef<string | undefined>(undefined, subSlot(slot, 'regId'));
	const [registeredFieldName, setRegisteredFieldName] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'regName'),
	);
	const effectiveName = name ?? registeredFieldName;

	useLayoutEffect(
		() => {
			if (dirtyProp !== undefined) {
				markedDirtyRef.current = dirtyProp;
			}
		},
		[dirtyProp],
		subSlot(slot, 'e:markedDirty'),
	);

	const getRegisteredFieldId = useCallback(
		() => registeredFieldIdRef.current,
		[],
		subSlot(slot, 'getRegId'),
	);
	const setRegisteredFieldId = useCallback(
		(id: string | undefined) => {
			registeredFieldIdRef.current = id;
		},
		[],
		subSlot(slot, 'setRegId'),
	);

	const setDirty = useStableCallback(
		(value: any) => {
			if (dirtyProp !== undefined) {
				return;
			}
			if (value) {
				markedDirtyRef.current = true;
			}
			setDirtyUnwrapped(value);
		},
		subSlot(slot, 'setDirty'),
	);

	const setTouched = useStableCallback(
		(value: any) => {
			if (touchedProp !== undefined) {
				return;
			}
			setTouchedUnwrapped(value);
		},
		subSlot(slot, 'setTouched'),
	);

	const shouldValidateOnChange = useStableCallback(
		() =>
			validationMode === 'onChange' ||
			(validationMode === 'onSubmit' && submitAttemptedRef.current),
		subSlot(slot, 'shouldValidate'),
	);

	const formError =
		effectiveName && Object.hasOwn(errors, effectiveName) ? errors[effectiveName] : null;
	const hasFormError = !!(Array.isArray(formError) ? formError.length : formError);
	const invalid = invalidProp === true || hasFormError;

	const [validityData, setValidityData] = useState<FieldValidityData>(
		{ state: DEFAULT_VALIDITY_STATE, error: '', errors: [], value: null, initialValue: null },
		subSlot(slot, 'validityData'),
	);

	const valid = disabled ? null : !invalid && validityData.state.valid;

	const state: FieldRootState = useMemo(
		() => ({ disabled, touched, dirty, valid, filled, focused }),
		[disabled, touched, dirty, valid, filled, focused],
		subSlot(slot, 'state'),
	);

	const validation = useFieldValidation(
		{
			setValidityData,
			validate,
			validityData,
			validationDebounceTime,
			invalid,
			markedDirtyRef,
			state,
			shouldValidateOnChange,
			getRegisteredFieldId,
		},
		subSlot(slot, 'validation'),
	);

	const [validateFieldControl, registerFieldControl] = useFieldControlRegistration(
		{
			commit: validation.commit,
			invalid,
			markedDirtyRef,
			name,
			setRegisteredFieldName,
			setRegisteredFieldId,
			setValidityData,
			validityData,
		},
		subSlot(slot, 'controlReg'),
	);

	useImperativeHandle(
		actionsRef,
		() => ({ validate: validateFieldControl }),
		[validateFieldControl],
		subSlot(slot, 'imperative'),
	);

	const contextValue: FieldRootContextValue = useMemo(
		() => ({
			invalid,
			name: effectiveName,
			validityData,
			setValidityData,
			disabled,
			touched,
			setTouched,
			dirty,
			setDirty,
			filled,
			setFilled,
			focused,
			setFocused,
			validate,
			validationMode,
			validationDebounceTime,
			shouldValidateOnChange,
			state,
			markedDirtyRef,
			registerFieldControl,
			validation,
		}),
		[
			invalid,
			effectiveName,
			validityData,
			disabled,
			touched,
			setTouched,
			dirty,
			setDirty,
			filled,
			setFilled,
			focused,
			setFocused,
			validate,
			validationMode,
			validationDebounceTime,
			shouldValidateOnChange,
			state,
			registerFieldControl,
			validation,
		],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{ ref, state, props: elementProps, stateAttributesMapping: fieldValidityMapping },
		subSlot(slot, 're'),
	);

	return createElement(FieldRootContext.Provider, { value: contextValue, children: element });
}

function FieldRoot(props: any): any {
	return createElement(LabelableProvider, {
		children: createElement(FieldRootInner, props),
	});
}

// --- Control -----------------------------------------------------------------

function FieldControl(props: any): any {
	const slot = S('FieldControl');
	const {
		render,
		className,
		id: idProp,
		name: nameProp,
		value: valueProp,
		disabled: disabledProp = false,
		onValueChange,
		defaultValue,
		autoFocus = false,
		style,
		ref,
		...elementProps
	} = props;

	const {
		state: fieldState,
		name: fieldName,
		disabled: fieldDisabled,
		setTouched,
		setDirty,
		validityData,
		setFocused,
		setFilled,
		validationMode,
		validation,
	} = useFieldRootContext();
	const { clearErrors } = useFormContext();

	const disabled = fieldDisabled || disabledProp;
	const name = fieldName ?? nameProp;
	const state = { ...fieldState, disabled };

	const { labelId } = useLabelableContext();
	const id = useLabelableId({ id: idProp }, subSlot(slot, 'id'));

	const inputRef = useRef<HTMLElement | null>(null, subSlot(slot, 'inputRef'));

	useLayoutEffect(
		() => {
			const hasExternalValue = valueProp != null;
			if (validation.inputRef.current?.value || (hasExternalValue && valueProp !== '')) {
				setFilled(true);
			} else if (hasExternalValue && valueProp === '') {
				setFilled(false);
			}
		},
		[validation.inputRef, setFilled, valueProp],
		subSlot(slot, 'e:filled'),
	);

	useLayoutEffect(
		() => {
			if (autoFocus && inputRef.current === activeElement(ownerDocument(inputRef.current))) {
				setFocused(true);
			}
		},
		[autoFocus, setFocused],
		subSlot(slot, 'e:autofocus'),
	);

	const [valueUnwrapped] = useControlled(
		{ controlled: valueProp, default: defaultValue, name: 'FieldControl', state: 'value' },
		subSlot(slot, 'value'),
	);

	const isControlled = valueProp !== undefined;
	const value = isControlled ? valueUnwrapped : undefined;

	const getValueFromInput = useStableCallback(
		() => validation.inputRef.current?.value,
		subSlot(slot, 'getValue'),
	);

	useRegisterFieldControl(
		validation.inputRef,
		id,
		value,
		getValueFromInput,
		!disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	return useRenderElement(
		'input',
		{ render, className, style },
		{
			ref: [ref, inputRef],
			state,
			props: [
				{
					id,
					disabled,
					name,
					ref: validation.inputRef,
					'aria-labelledby': labelId,
					autoFocus: autoFocus || undefined,
					...(isControlled ? { value } : { defaultValue }),
					onInput(event: any) {
						const inputValue = event.currentTarget.value;
						onValueChange?.(inputValue, createChangeEventDetails(REASONS.none, event));
						setDirty(inputValue !== validityData.initialValue);
						setFilled(inputValue !== '');
						if (!event.defaultPrevented) {
							clearErrors(name);
							validation.change(inputValue);
						}
					},
					onFocus() {
						setFocused(true);
					},
					onBlur(event: any) {
						setTouched(true);
						setFocused(false);
						if (validationMode === 'onBlur') {
							validation.commit(event.currentTarget.value);
						}
					},
					onKeyDown(event: any) {
						if (event.currentTarget.tagName === 'INPUT' && event.key === 'Enter') {
							setTouched(true);
							validation.commit(event.currentTarget.value);
						}
					},
				},
				elementProps,
				(p: any) => validation.getValidationProps(disabled, p),
			],
			stateAttributesMapping: fieldValidityMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Label -------------------------------------------------------------------

function FieldLabel(props: any): any {
	const slot = S('FieldLabel');
	const { render, className, style, id: idProp, nativeLabel = true, ref, ...elementProps } = props;

	const fieldRootContext = useFieldRootContext(false);
	const fieldItemContext = useFieldItemContext();
	const { labelId } = useLabelableContext();

	const state = {
		...fieldRootContext.state,
		disabled: fieldRootContext.disabled || fieldItemContext.disabled,
	};

	const labelRef = useRef<HTMLElement | null>(null, subSlot(slot, 'labelRef'));
	const labelProps = useLabel(
		{ id: labelId ?? idProp, native: nativeLabel },
		subSlot(slot, 'label'),
	);

	return useRenderElement(
		'label',
		{ render, className, style },
		{
			ref: [ref, labelRef],
			state,
			props: [labelProps, elementProps],
			stateAttributesMapping: fieldValidityMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Description --------------------------------------------------------------

function FieldDescription(props: any): any {
	const slot = S('FieldDescription');
	const { render, id: idProp, className, style, ref, ...elementProps } = props;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));
	const fieldRootContext = useFieldRootContext(false);
	const fieldItemContext = useFieldItemContext();
	const { setMessageIds } = useLabelableContext();

	const state = {
		...fieldRootContext.state,
		disabled: fieldRootContext.disabled || fieldItemContext.disabled,
	};

	useLayoutEffect(
		() => {
			if (!id) {
				return undefined;
			}
			setMessageIds((v: string[]) => v.concat(id));
			return () => {
				setMessageIds((v: string[]) => v.filter((item) => item !== id));
			};
		},
		[id, setMessageIds],
		subSlot(slot, 'e:register'),
	);

	return useRenderElement(
		'p',
		{ render, className, style },
		{ ref, state, props: [{ id }, elementProps], stateAttributesMapping: fieldValidityMapping },
		subSlot(slot, 're'),
	);
}

// --- Error -------------------------------------------------------------------

const errorStateAttributesMapping: StateAttributesMapping<any> = {
	...(fieldValidityMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

function FieldError(props: any): any {
	const slot = S('FieldError');
	const { render, id: idProp, className, match, style, children, ref, ...elementProps } = props;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));
	const { validityData, state: fieldState, name } = useFieldRootContext(false);
	const { setMessageIds } = useLabelableContext();
	const { errors } = useFormContext();

	const formError = name && Object.hasOwn(errors, name) ? errors[name] : null;
	const hasFormError = !!(Array.isArray(formError) ? formError.length : formError);
	const hasSpecificMatch = typeof match === 'string';

	let rendered = false;
	if (match === true) {
		rendered = true;
	} else if (fieldState.disabled) {
		rendered = false;
	} else if (hasSpecificMatch) {
		rendered = Boolean((validityData.state as any)[match]);
	} else {
		rendered = hasFormError || validityData.state.valid === false;
	}

	const { mounted, transitionStatus, setMounted } = useTransitionStatus(
		rendered,
		subSlot(slot, 'ts'),
	);

	useLayoutEffect(
		() => {
			if (!rendered || !id) {
				return undefined;
			}
			setMessageIds((v: string[]) => v.concat(id));
			return () => {
				setMessageIds((v: string[]) => v.filter((item) => item !== id));
			};
		},
		[rendered, id, setMessageIds],
		subSlot(slot, 'e:register'),
	);

	const errorRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'errorRef'));

	let error: string | string[] | null | undefined = validityData.error;
	if (!hasSpecificMatch && hasFormError) {
		error = formError;
	} else if (validityData.errors.length > 1) {
		error = validityData.errors;
	}

	let errorMessage: any = error ?? '';
	if (Array.isArray(error)) {
		errorMessage =
			error.length > 1
				? createElement('ul', {
						children: error.map((message) =>
							createElement('li', { key: message, children: message }),
						),
					})
				: error[0];
	}

	const state = { ...fieldState, transitionStatus };

	useOpenChangeComplete(
		{
			open: rendered,
			ref: errorRef,
			onComplete() {
				if (!rendered) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			ref: [ref, errorRef],
			state,
			props: [{ id, children: children ?? errorMessage }, elementProps],
			stateAttributesMapping: errorStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	if (!mounted) {
		return null;
	}
	return element;
}

// --- Validity (render-prop) --------------------------------------------------

function FieldValidity(props: any): any {
	const slot = S('FieldValidity');
	const { children } = props;
	const { validityData, invalid } = useFieldRootContext(false);

	const combined = useMemo(
		() => getCombinedFieldValidityData(validityData, invalid),
		[validityData, invalid],
		subSlot(slot, 'combined'),
	);
	const isInvalid = combined.state.valid === false;
	const { transitionStatus } = useTransitionStatus(isInvalid, subSlot(slot, 'ts'));

	const fieldValidityState = useMemo(
		() => ({ ...combined, validity: combined.state, transitionStatus }),
		[combined, transitionStatus],
		subSlot(slot, 'state'),
	);

	return children(fieldValidityState);
}

// --- Item --------------------------------------------------------------------

function FieldItem(props: any): any {
	const slot = S('FieldItem');
	const { render, className, style, disabled: disabledProp = false, ref, ...elementProps } = props;

	const { state: fieldState, disabled: rootDisabled } = useFieldRootContext(false);
	const disabled = rootDisabled || disabledProp;
	const state = { ...fieldState, disabled };

	const fieldItemContextValue = useMemo(() => ({ disabled }), [disabled], subSlot(slot, 'ctx'));

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{ ref, state, props: elementProps, stateAttributesMapping: fieldValidityMapping },
		subSlot(slot, 're'),
	);

	return createElement(LabelableProvider, {
		children: createElement(FieldItemContext.Provider, {
			value: fieldItemContextValue,
			children: element,
		}),
	});
}

// --- Namespace (mirrors `export * as Field`) ---------------------------------

export const Field = {
	Root: FieldRoot,
	Control: FieldControl,
	Label: FieldLabel,
	Description: FieldDescription,
	Error: FieldError,
	Validity: FieldValidity,
	Item: FieldItem,
};

export type { FieldRootState, FieldValidityData, FormValidationMode };
export { useFieldRootContext };
