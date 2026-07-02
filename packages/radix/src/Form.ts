// Ported from @radix-ui/react-form (source:
// .radix-primitives/packages/react/form/src/form.tsx). Native-Constraint-Validation
// forms: Field names a control; Control is a native input whose ValidityState is
// captured into context on `change`/`invalid` (+ custom sync/async matchers over
// FormData with `setCustomValidity`); Message renders when its matcher applies and
// registers itself into the control's `aria-describedby`; Root focuses the first
// invalid control on submit and suppresses the default browser bubbles. This is the
// most octane-native primitive of the batch — everything is built on the native
// validity API (octane's `invalid` events are capture-delegated with React's
// propagation semantics).
import { createElement, useCallback, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Root as LabelPrimitive } from './Label';
import { Primitive } from './Primitive';
import { useId } from './useId';

const [createFormContext, createFormScope] = createContextScope('Form');
export { createFormScope };

const FORM_NAME = 'Form';

type ValidityMap = { [fieldName: string]: ValidityState | undefined };
type CustomMatcher = (value: string, formData: FormData) => boolean | Promise<boolean>;
type CustomMatcherEntry = { id: string; match: CustomMatcher };
type CustomMatcherArgs = [string, FormData];

interface ValidationContextValue {
	getFieldValidity(fieldName: string): ValidityState | undefined;
	onFieldValidityChange(fieldName: string, validity: ValidityState): void;
	getFieldCustomMatcherEntries(fieldName: string): CustomMatcherEntry[];
	onFieldCustomMatcherEntryAdd(fieldName: string, matcherEntry: CustomMatcherEntry): void;
	onFieldCustomMatcherEntryRemove(fieldName: string, matcherEntryId: string): void;
	getFieldCustomErrors(fieldName: string): Record<string, boolean>;
	onFieldCustomErrorsChange(fieldName: string, errors: Record<string, boolean>): void;
	onFieldValiditionClear(fieldName: string): void;
}
const [ValidationProvider, useValidationContext] =
	createFormContext<ValidationContextValue>(FORM_NAME);

interface AriaDescriptionContextValue {
	onFieldMessageIdAdd(fieldName: string, id: string): void;
	onFieldMessageIdRemove(fieldName: string, id: string): void;
	getFieldDescription(fieldName: string): string | undefined;
}
const [AriaDescriptionProvider, useAriaDescriptionContext] =
	createFormContext<AriaDescriptionContextValue>(FORM_NAME);

export function Root(props: any): any {
	const slot = S('Form.Root');
	const {
		__scopeForm,
		onClearServerErrors = () => {},
		ref: forwardedRef,
		...rootProps
	} = props ?? {};
	const formRef = useRef<HTMLFormElement | null>(null, subSlot(slot, 'form'));
	const composedFormRef = useComposedRefs(forwardedRef, formRef, subSlot(slot, 'refs'));

	// native validity per field
	const [validityMap, setValidityMap] = useState<ValidityMap>({}, subSlot(slot, 'validity'));
	const getFieldValidity = useCallback(
		(fieldName: string) => validityMap[fieldName],
		[validityMap],
		subSlot(slot, 'getValidity'),
	);
	const handleFieldValidityChange = useCallback(
		(fieldName: string, validity: ValidityState) =>
			setValidityMap((prevValidityMap) => ({
				...prevValidityMap,
				[fieldName]: { ...(prevValidityMap[fieldName] ?? {}), ...validity },
			})),
		[],
		subSlot(slot, 'validityChange'),
	);
	const handleFieldValiditionClear = useCallback(
		(fieldName: string) => {
			setValidityMap((prevValidityMap) => ({ ...prevValidityMap, [fieldName]: undefined }));
			setCustomErrorsMap((prevCustomErrorsMap) => ({ ...prevCustomErrorsMap, [fieldName]: {} }));
		},
		[],
		subSlot(slot, 'validityClear'),
	);

	// custom matcher entries per field
	const [customMatcherEntriesMap, setCustomMatcherEntriesMap] = useState<{
		[fieldName: string]: CustomMatcherEntry[];
	}>({}, subSlot(slot, 'matchers'));
	const getFieldCustomMatcherEntries = useCallback(
		(fieldName: string) => customMatcherEntriesMap[fieldName] ?? [],
		[customMatcherEntriesMap],
		subSlot(slot, 'getMatchers'),
	);
	const handleFieldCustomMatcherAdd = useCallback(
		(fieldName: string, matcherEntry: CustomMatcherEntry) => {
			setCustomMatcherEntriesMap((prev) => ({
				...prev,
				[fieldName]: [...(prev[fieldName] ?? []), matcherEntry],
			}));
		},
		[],
		subSlot(slot, 'matcherAdd'),
	);
	const handleFieldCustomMatcherRemove = useCallback(
		(fieldName: string, matcherEntryId: string) => {
			setCustomMatcherEntriesMap((prev) => ({
				...prev,
				[fieldName]: (prev[fieldName] ?? []).filter((entry) => entry.id !== matcherEntryId),
			}));
		},
		[],
		subSlot(slot, 'matcherRemove'),
	);

	// custom errors per field
	const [customErrorsMap, setCustomErrorsMap] = useState<{
		[fieldName: string]: Record<string, boolean>;
	}>({}, subSlot(slot, 'errors'));
	const getFieldCustomErrors = useCallback(
		(fieldName: string) => customErrorsMap[fieldName] ?? {},
		[customErrorsMap],
		subSlot(slot, 'getErrors'),
	);
	const handleFieldCustomErrorsChange = useCallback(
		(fieldName: string, customErrors: Record<string, boolean>) => {
			setCustomErrorsMap((prev) => ({
				...prev,
				[fieldName]: { ...(prev[fieldName] ?? {}), ...customErrors },
			}));
		},
		[],
		subSlot(slot, 'errorsChange'),
	);

	// messageIds per field
	const [messageIdsMap, setMessageIdsMap] = useState<{ [fieldName: string]: Set<string> }>(
		{},
		subSlot(slot, 'messages'),
	);
	const handleFieldMessageIdAdd = useCallback(
		(fieldName: string, id: string) => {
			setMessageIdsMap((prev) => {
				const fieldDescriptionIds = new Set(prev[fieldName]).add(id);
				return { ...prev, [fieldName]: fieldDescriptionIds };
			});
		},
		[],
		subSlot(slot, 'messageAdd'),
	);
	const handleFieldMessageIdRemove = useCallback(
		(fieldName: string, id: string) => {
			setMessageIdsMap((prev) => {
				const fieldDescriptionIds = new Set(prev[fieldName]);
				fieldDescriptionIds.delete(id);
				return { ...prev, [fieldName]: fieldDescriptionIds };
			});
		},
		[],
		subSlot(slot, 'messageRemove'),
	);
	const getFieldDescription = useCallback(
		(fieldName: string) => Array.from(messageIdsMap[fieldName] ?? []).join(' ') || undefined,
		[messageIdsMap],
		subSlot(slot, 'getDescription'),
	);

	return createElement(ValidationProvider, {
		scope: __scopeForm,
		getFieldValidity,
		onFieldValidityChange: handleFieldValidityChange,
		getFieldCustomMatcherEntries,
		onFieldCustomMatcherEntryAdd: handleFieldCustomMatcherAdd,
		onFieldCustomMatcherEntryRemove: handleFieldCustomMatcherRemove,
		getFieldCustomErrors,
		onFieldCustomErrorsChange: handleFieldCustomErrorsChange,
		onFieldValiditionClear: handleFieldValiditionClear,
		children: createElement(AriaDescriptionProvider, {
			scope: __scopeForm,
			onFieldMessageIdAdd: handleFieldMessageIdAdd,
			onFieldMessageIdRemove: handleFieldMessageIdRemove,
			getFieldDescription,
			children: createElement(Primitive.form, {
				...rootProps,
				ref: composedFormRef,
				// focus first invalid control when the form is submitted
				onInvalid: composeEventHandlers(props?.onInvalid, (event: Event) => {
					const firstInvalidControl = getFirstInvalidControl(
						event.currentTarget as HTMLFormElement,
					);
					if (firstInvalidControl === event.target) firstInvalidControl.focus();
					// prevent default browser UI for form validation
					event.preventDefault();
				}),
				// clear server errors when the form is re-submitted
				onSubmit: composeEventHandlers(props?.onSubmit, onClearServerErrors, {
					checkForDefaultPrevented: false,
				}),
				// clear server errors when the form is reset
				onReset: composeEventHandlers(props?.onReset, onClearServerErrors),
			}),
		}),
	});
}

const FIELD_NAME = 'FormField';

interface FormFieldContextValue {
	id: string;
	name: string;
	serverInvalid: boolean;
}
const [FormFieldProvider, useFormFieldContext] =
	createFormContext<FormFieldContextValue>(FIELD_NAME);

export function Field(props: any): any {
	const slot = S('Form.Field');
	const { __scopeForm, name, serverInvalid = false, ...fieldProps } = props ?? {};
	const validationContext = useValidationContext(FIELD_NAME, __scopeForm);
	const validity = validationContext.getFieldValidity(name);
	const id = useId(subSlot(slot, 'id'));

	return createElement(FormFieldProvider, {
		scope: __scopeForm,
		id,
		name,
		serverInvalid,
		children: createElement(Primitive.div, {
			'data-valid': getValidAttribute(validity, serverInvalid),
			'data-invalid': getInvalidAttribute(validity, serverInvalid),
			...fieldProps,
		}),
	});
}

export function Label(props: any): any {
	const { __scopeForm, ...labelProps } = props ?? {};
	const validationContext = useValidationContext('FormLabel', __scopeForm);
	const fieldContext = useFormFieldContext('FormLabel', __scopeForm);
	const htmlFor = labelProps.htmlFor || fieldContext.id;
	const validity = validationContext.getFieldValidity(fieldContext.name);

	return createElement(LabelPrimitive, {
		'data-valid': getValidAttribute(validity, fieldContext.serverInvalid),
		'data-invalid': getInvalidAttribute(validity, fieldContext.serverInvalid),
		...labelProps,
		htmlFor,
	});
}

const CONTROL_NAME = 'FormControl';

export function Control(props: any): any {
	const slot = S('Form.Control');
	const { __scopeForm, ref: forwardedRef, ...controlProps } = props ?? {};

	const validationContext = useValidationContext(CONTROL_NAME, __scopeForm);
	const fieldContext = useFormFieldContext(CONTROL_NAME, __scopeForm);
	const ariaDescriptionContext = useAriaDescriptionContext(CONTROL_NAME, __scopeForm);

	const ref = useRef<HTMLInputElement | null>(null, subSlot(slot, 'ref'));
	const composedRef = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const name = controlProps.name || fieldContext.name;
	const id = controlProps.id || fieldContext.id;
	const customMatcherEntries = validationContext.getFieldCustomMatcherEntries(name);

	const { onFieldValidityChange, onFieldCustomErrorsChange, onFieldValiditionClear } =
		validationContext;
	const updateControlValidity = useCallback(
		async (control: HTMLInputElement) => {
			// 1. first, if we have built-in errors we stop here
			if (hasBuiltInError(control.validity)) {
				const controlValidity = validityStateToObject(control.validity);
				onFieldValidityChange(name, controlValidity as unknown as ValidityState);
				return;
			}

			// 2. gather the form data to give to custom matchers for cross-comparisons
			const formData = control.form ? new FormData(control.form) : new FormData();
			const matcherArgs: CustomMatcherArgs = [control.value, formData];

			// 3. split sync and async custom matcher entries
			const syncCustomMatcherEntries: CustomMatcherEntry[] = [];
			const asyncCustomMatcherEntries: CustomMatcherEntry[] = [];
			customMatcherEntries.forEach((customMatcherEntry) => {
				if (isAsyncCustomMatcherEntry(customMatcherEntry, matcherArgs)) {
					asyncCustomMatcherEntries.push(customMatcherEntry);
				} else if (isSyncCustomMatcherEntry(customMatcherEntry)) {
					syncCustomMatcherEntries.push(customMatcherEntry);
				}
			});

			// 4. run sync custom matchers and update control validity / errors
			const syncCustomErrors = syncCustomMatcherEntries.map(({ id, match }) => {
				return [id, match(...matcherArgs)] as const;
			});
			const syncCustomErrorsById = Object.fromEntries(syncCustomErrors);
			const hasSyncCustomErrors = Object.values(syncCustomErrorsById).some(Boolean);
			control.setCustomValidity(hasSyncCustomErrors ? DEFAULT_INVALID_MESSAGE : '');
			onFieldValidityChange(
				name,
				validityStateToObject(control.validity) as unknown as ValidityState,
			);
			onFieldCustomErrorsChange(name, syncCustomErrorsById as Record<string, boolean>);

			// 5. run async custom matchers and update control validity / errors
			if (!hasSyncCustomErrors && asyncCustomMatcherEntries.length > 0) {
				const promisedCustomErrors = asyncCustomMatcherEntries.map(({ id, match }) =>
					(match(...matcherArgs) as Promise<boolean>).then((matches) => [id, matches] as const),
				);
				const asyncCustomErrors = await Promise.all(promisedCustomErrors);
				const asyncCustomErrorsById = Object.fromEntries(asyncCustomErrors);
				const hasAsyncCustomErrors = Object.values(asyncCustomErrorsById).some(Boolean);
				control.setCustomValidity(hasAsyncCustomErrors ? DEFAULT_INVALID_MESSAGE : '');
				onFieldValidityChange(
					name,
					validityStateToObject(control.validity) as unknown as ValidityState,
				);
				onFieldCustomErrorsChange(name, asyncCustomErrorsById);
			}
		},
		[customMatcherEntries, name, onFieldCustomErrorsChange, onFieldValidityChange],
		subSlot(slot, 'update'),
	);

	useEffect(
		() => {
			const control = ref.current;
			if (control) {
				// We only validate on the native `change` event (not on every keystroke) —
				// a UX decision from the source.
				const handleChange = (): void => void updateControlValidity(control);
				control.addEventListener('change', handleChange);
				return () => control.removeEventListener('change', handleChange);
			}
		},
		[updateControlValidity],
		subSlot(slot, 'e:change'),
	);

	const resetControlValidity = useCallback(
		() => {
			const control = ref.current;
			if (control) {
				control.setCustomValidity('');
				onFieldValiditionClear(name);
			}
		},
		[name, onFieldValiditionClear],
		subSlot(slot, 'reset'),
	);

	// reset validity and errors when the form is reset
	useEffect(
		() => {
			const form = ref.current?.form;
			if (form) {
				form.addEventListener('reset', resetControlValidity);
				return () => form.removeEventListener('reset', resetControlValidity);
			}
		},
		[resetControlValidity],
		subSlot(slot, 'e:reset'),
	);

	// focus first invalid control when fields are set as invalid by server
	useEffect(
		() => {
			const control = ref.current;
			const form = control?.closest('form');
			if (form && fieldContext.serverInvalid) {
				const firstInvalidControl = getFirstInvalidControl(form);
				if (firstInvalidControl === control) firstInvalidControl.focus();
			}
		},
		[fieldContext.serverInvalid],
		subSlot(slot, 'e:server'),
	);

	const validity = validationContext.getFieldValidity(name);

	return createElement(Primitive.input, {
		'data-valid': getValidAttribute(validity, fieldContext.serverInvalid),
		'data-invalid': getInvalidAttribute(validity, fieldContext.serverInvalid),
		'aria-invalid': fieldContext.serverInvalid ? true : undefined,
		'aria-describedby': ariaDescriptionContext.getFieldDescription(name),
		// disable default browser behaviour of showing built-in error message on hover
		title: '',
		...controlProps,
		ref: composedRef,
		id,
		name,
		onInvalid: composeEventHandlers(props?.onInvalid, (event: Event) => {
			const control = event.currentTarget as HTMLInputElement;
			void updateControlValidity(control);
		}),
		// octane adaptation: the source resets on React's `onChange`, which is the
		// native `input` event (each edit) — NOT the native `change` (commit) the
		// validate-on-change listener above uses. Binding this to octane's native
		// onChange would fire on the SAME event and stomp the freshly-captured
		// validity.
		onInput: composeEventHandlers(props?.onInput, () => {
			// reset validity when user changes value
			resetControlValidity();
		}),
	});
}

const _validityMatchers = [
	'badInput',
	'patternMismatch',
	'rangeOverflow',
	'rangeUnderflow',
	'stepMismatch',
	'tooLong',
	'tooShort',
	'typeMismatch',
	'valid',
	'valueMissing',
] as const;
type ValidityMatcher = (typeof _validityMatchers)[number];

const DEFAULT_INVALID_MESSAGE = 'This value is not valid';
const DEFAULT_BUILT_IN_MESSAGES: Record<ValidityMatcher, string | undefined> = {
	badInput: DEFAULT_INVALID_MESSAGE,
	patternMismatch: 'This value does not match the required pattern',
	rangeOverflow: 'This value is too large',
	rangeUnderflow: 'This value is too small',
	stepMismatch: 'This value does not match the required step',
	tooLong: 'This value is too long',
	tooShort: 'This value is too short',
	typeMismatch: 'This value does not match the required type',
	valid: undefined,
	valueMissing: 'This value is missing',
};

const MESSAGE_NAME = 'FormMessage';

export function Message(props: any): any {
	const { match, name: nameProp, ...messageProps } = props ?? {};
	const fieldContext = useFormFieldContext(MESSAGE_NAME, props?.__scopeForm);
	const name = nameProp ?? fieldContext.name;

	if (match === undefined) {
		return createElement(FormMessageImpl, {
			...messageProps,
			name,
			children: props?.children || DEFAULT_INVALID_MESSAGE,
		});
	} else if (typeof match === 'function') {
		return createElement(FormCustomMessage, { match, ...messageProps, name });
	} else {
		return createElement(FormBuiltInMessage, { match, ...messageProps, name });
	}
}

function FormBuiltInMessage(props: any): any {
	const { match, forceMatch = false, name, children, ...messageProps } = props;
	const validationContext = useValidationContext(MESSAGE_NAME, messageProps.__scopeForm);
	const validity = validationContext.getFieldValidity(name);
	const matches = forceMatch || validity?.[match as ValidityMatcher];

	if (matches) {
		return createElement(FormMessageImpl, {
			...messageProps,
			name,
			children: children ?? DEFAULT_BUILT_IN_MESSAGES[match as ValidityMatcher],
		});
	}

	return null;
}

function FormCustomMessage(props: any): any {
	const slot = S('Form.CustomMessage');
	const { match, forceMatch = false, name, id: idProp, children, ...messageProps } = props;
	const validationContext = useValidationContext(MESSAGE_NAME, messageProps.__scopeForm);
	const _id = useId(subSlot(slot, 'id'));
	const id = idProp ?? _id;

	const customMatcherEntry = { id, match };
	const { onFieldCustomMatcherEntryAdd, onFieldCustomMatcherEntryRemove } = validationContext;
	useEffect(
		() => {
			onFieldCustomMatcherEntryAdd(name, customMatcherEntry);
			return () => onFieldCustomMatcherEntryRemove(name, customMatcherEntry.id);
		},
		[id, match, name, onFieldCustomMatcherEntryAdd, onFieldCustomMatcherEntryRemove],
		subSlot(slot, 'e:matcher'),
	);

	const validity = validationContext.getFieldValidity(name);
	const customErrors = validationContext.getFieldCustomErrors(name);
	const hasMatchingCustomError = customErrors[id];
	const matches = forceMatch || (validity && !hasBuiltInError(validity) && hasMatchingCustomError);

	if (matches) {
		return createElement(FormMessageImpl, {
			id,
			...messageProps,
			name,
			children: children ?? DEFAULT_INVALID_MESSAGE,
		});
	}

	return null;
}

function FormMessageImpl(props: any): any {
	const slot = S('Form.MessageImpl');
	const { __scopeForm, id: idProp, name, ...messageProps } = props;
	const ariaDescriptionContext = useAriaDescriptionContext(MESSAGE_NAME, __scopeForm);
	const _id = useId(subSlot(slot, 'id'));
	const id = idProp ?? _id;

	const { onFieldMessageIdAdd, onFieldMessageIdRemove } = ariaDescriptionContext;
	useEffect(
		() => {
			onFieldMessageIdAdd(name, id);
			return () => onFieldMessageIdRemove(name, id);
		},
		[name, id, onFieldMessageIdAdd, onFieldMessageIdRemove],
		subSlot(slot, 'e:id'),
	);

	return createElement(Primitive.span, { id, ...messageProps });
}

export function ValidityState(props: any): any {
	const { __scopeForm, name: nameProp, children } = props ?? {};
	const validationContext = useValidationContext('FormValidityState', __scopeForm);
	const fieldContext = useFormFieldContext('FormValidityState', __scopeForm);
	const name = nameProp ?? fieldContext.name;
	const validity = validationContext.getFieldValidity(name);
	return children(validity);
}

export function Submit(props: any): any {
	const { __scopeForm, ...submitProps } = props ?? {};
	return createElement(Primitive.button, { type: 'submit', ...submitProps });
}

function validityStateToObject(validity: globalThis.ValidityState): Record<string, boolean> {
	const object: any = {};
	for (const key in validity) {
		object[key] = (validity as any)[key];
	}
	return object;
}

function isHTMLElement(element: any): element is HTMLElement {
	return element instanceof HTMLElement;
}

function isFormControl(element: any): element is { validity: globalThis.ValidityState } {
	return 'validity' in element;
}

function isInvalid(control: HTMLElement): boolean {
	return (
		isFormControl(control) &&
		(control.validity.valid === false || control.getAttribute('aria-invalid') === 'true')
	);
}

function getFirstInvalidControl(form: HTMLFormElement): HTMLElement | undefined {
	const elements = form.elements;
	const [firstInvalidControl] = Array.from(elements).filter(isHTMLElement).filter(isInvalid);
	return firstInvalidControl;
}

function isAsyncCustomMatcherEntry(entry: CustomMatcherEntry, args: CustomMatcherArgs): boolean {
	return entry.match.constructor.name === 'AsyncFunction' || returnsPromise(entry.match, args);
}

function isSyncCustomMatcherEntry(entry: CustomMatcherEntry): boolean {
	return entry.match.constructor.name === 'Function';
}

function returnsPromise(func: (...args: any[]) => any, args: Array<unknown>): boolean {
	return func(...args) instanceof Promise;
}

function hasBuiltInError(validity: globalThis.ValidityState): boolean {
	let error = false;
	for (const validityKey in validity) {
		const key = validityKey as keyof globalThis.ValidityState;
		if (key !== 'valid' && key !== 'customError' && validity[key]) {
			error = true;
			break;
		}
	}
	return error;
}

function getValidAttribute(
	validity: globalThis.ValidityState | undefined,
	serverInvalid: boolean,
): true | undefined {
	if (validity?.valid === true && !serverInvalid) return true;
	return undefined;
}
function getInvalidAttribute(
	validity: globalThis.ValidityState | undefined,
	serverInvalid: boolean,
): true | undefined {
	if (validity?.valid === false || serverInvalid) return true;
	return undefined;
}

export {
	Root as Form,
	Field as FormField,
	Label as FormLabel,
	Control as FormControl,
	Message as FormMessage,
	ValidityState as FormValidityState,
	Submit as FormSubmit,
};
