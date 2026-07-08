// Ported from @radix-ui/react-one-time-password-field (source:
// .radix-primitives/packages/react/one-time-password-field/src/one-time-password-field.tsx).
// A one-time-password / verification-code field: per-character `Input` cells inside a
// `Root` that owns the combined value (useControllableState), a RovingFocusGroup across
// the cells (single tab stop, arrow keys move focus), a `HiddenInput` carrying the
// joined value for forms, and paste/keyboard orchestration — typing advances focus,
// Backspace clears + retreats, paste distributes characters, per-cell validation via
// `validationType` (numeric/alpha/alphanumeric patterns), `autoSubmit` submits the
// associated form when all cells fill, and sanitization on every input.
//
// octane adaptations (all established in prior ports; see docs/react-parity-migration-plan.md):
// - React's `onChange` on a TEXT INPUT is the native `input` event (as in Form.ts) — the
//   source's separate `onInput` (password-manager multi-char detection) and `onChange`
//   handlers both fire from the SAME native `input` event here. We bind ONE octane
//   `onInput` that runs the source's input logic then its change logic, each composed
//   with the corresponding user prop via `composeEventHandlers` (React fires them in that
//   order for a native `input` event). The user's `onChange` prop is therefore folded
//   into the `input` binding and NOT bound to native `change` (native change = commit).
// - React's CONTROLLED `value={char}` cell maps directly onto octane's controlled
//   `value` prop (React-parity controlled form components): the runtime writes the DOM
//   `.value` property at commit, reasserts it on every commit of the owning block, and
//   restores it after each native event flush (React's controlled-value restoration —
//   e.g. an invalid character that produced no state change snaps back automatically).
// - The source's `unstable_createCollection` (state-backed, `.at`/`.from`/`.size`/
//   `.indexOf`) has no shared octane port (the shared collection.ts is the legacy API,
//   which registers items in passive effects and never re-renders consumers). Since the
//   new collection's order IS DOM order, we derive an equivalent live collection API from
//   the DOM (`input[data-radix-otp-input]` under the Root element — the source stamps
//   that attribute on every cell) and thread it to `Input` through context (standing in
//   for the source's `useCollection(scope)`). `from()` clamps to the first/last member
//   exactly like the source's OrderedDict.from. The source's registration re-render (its
//   collection is React state, so a cell mounting/unmounting re-renders Root + every
//   Input) is recreated with a `collectionVersion` counter in context that each Input
//   bumps from a layout effect on mount/unmount. `locateForm` reads the first input
//   lazily inside the callback instead of memoizing a render-time snapshot — equivalent,
//   since by the time any caller runs (effects/event handlers) the cells are in the DOM.
// - `flushSync` comes from 'octane' (source: react-dom).
// - `spellCheck={false}` → the string 'false' (octane removes false-valued attributes;
//   React renders spellcheck="false"), `autoFocus={false}` → omitted.
// - No forwardRef: `ref: forwardedRef` is destructured from props (React-19 style).
// - `@radix-ui/number`'s `clamp` is inlined.
// - Skipped: the source's dev-only TODO warnings (repo policy: functional outcomes only).
import {
	createElement,
	flushSync,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { useControllableState } from './useControllableState';
import { useIsHydrated } from './use-is-hydrated';

export type InputValidationType = 'alpha' | 'numeric' | 'alphanumeric' | 'none';

const INPUT_VALIDATION_MAP: Record<
	InputValidationType,
	{ type: InputValidationType; regexp: RegExp; pattern: string; inputMode: string } | null
> = {
	numeric: {
		type: 'numeric',
		regexp: /[^\d]/g,
		pattern: '\\d{1}',
		inputMode: 'numeric',
	},
	alpha: {
		type: 'alpha',
		regexp: /[^a-zA-Z]/g,
		pattern: '[a-zA-Z]{1}',
		inputMode: 'text',
	},
	alphanumeric: {
		type: 'alphanumeric',
		regexp: /[^a-zA-Z0-9]/g,
		pattern: '[a-zA-Z0-9]{1}',
		inputMode: 'text',
	},
	none: null,
};

/* -------------------------------------------------------------------------------------------------
 * OneTimePasswordField context
 * -----------------------------------------------------------------------------------------------*/

type KeyboardActionDetails =
	| {
			type: 'keydown';
			key: 'Backspace' | 'Delete' | 'Clear' | 'Char';
			metaKey: boolean;
			ctrlKey: boolean;
	  }
	| { type: 'cut' }
	| { type: 'autocomplete-paste' };

type UpdateAction =
	| { type: 'SET_CHAR'; char: string; index: number; event: Event }
	| { type: 'CLEAR_CHAR'; index: number; reason: 'Backspace' | 'Delete' | 'Cut' }
	| { type: 'CLEAR'; reason: 'Reset' | 'Backspace' | 'Delete' | 'Clear' }
	| { type: 'PASTE'; value: string };
type Dispatcher = (action: UpdateAction) => void;

// The live DOM-derived stand-in for the source's `unstable_createCollection` state (see
// file header). Order is DOM order — exactly what the source's collection resolves to.
interface CollectionApi {
	readonly size: number;
	at(index: number): { element: HTMLInputElement } | undefined;
	from(element: HTMLElement, offset: number): { element: HTMLInputElement } | undefined;
	indexOf(element: HTMLElement): number;
}

interface OneTimePasswordFieldContextValue {
	attemptSubmit: () => void;
	autoComplete: 'off' | 'one-time-code';
	autoFocus: boolean;
	collection: CollectionApi;
	disabled: boolean;
	dispatch: Dispatcher;
	form: string | undefined;
	hiddenInputRef: { current: HTMLInputElement | null };
	isHydrated: boolean;
	name: string | undefined;
	orientation: 'horizontal' | 'vertical';
	placeholder: string | undefined;
	readOnly: boolean;
	// octane adaptation (see file header): cell mount/unmount registration. `registerInput`
	// bumps `collectionVersion`, whose presence in the context value re-renders every
	// consumer (standing in for the source's state-backed collection re-render).
	collectionVersion: number;
	registerInput: () => () => void;
	type: 'password' | 'text';
	userActionRef: { current: KeyboardActionDetails | null };
	validationType: InputValidationType;
	value: string[];
	sanitizeValue: (arg: string | string[]) => string[];
}

const ONE_TIME_PASSWORD_FIELD_NAME = 'OneTimePasswordField';
const [createOneTimePasswordFieldContext, createOneTimePasswordFieldScope] = createContextScope(
	ONE_TIME_PASSWORD_FIELD_NAME,
	[createRovingFocusGroupScope],
);
export { createOneTimePasswordFieldScope };
const useRovingFocusGroupScope = createRovingFocusGroupScope();

const [OneTimePasswordFieldContext, useOneTimePasswordFieldContext] =
	createOneTimePasswordFieldContext<OneTimePasswordFieldContextValue>(ONE_TIME_PASSWORD_FIELD_NAME);

const OTP_INPUT_ATTR = 'data-radix-otp-input';

function createCollectionApi(getRoot: () => HTMLElement | null): CollectionApi {
	const elements = (): HTMLInputElement[] => {
		const root = getRoot();
		if (!root) return [];
		return Array.from(root.querySelectorAll<HTMLInputElement>(`input[${OTP_INPUT_ATTR}]`));
	};
	return {
		get size(): number {
			return elements().length;
		},
		at(index: number) {
			const element = elements().at(index);
			return element ? { element } : undefined;
		},
		from(element: HTMLElement, offset: number) {
			const els = elements();
			const index = els.indexOf(element as HTMLInputElement);
			if (index === -1) return undefined;
			// Clamp to the ends like the source's OrderedDict.from (ordered-dictionary.ts):
			// for a member element this never walks off the collection, so boundary cells
			// resolve to themselves (focusInput then re-selects the already-focused cell).
			let dest = index + offset;
			if (dest < 0) dest = 0;
			if (dest >= els.length) dest = els.length - 1;
			const target = els[dest];
			return target ? { element: target } : undefined;
		},
		indexOf(element: HTMLElement) {
			return elements().indexOf(element as HTMLInputElement);
		},
	};
}

/* -------------------------------------------------------------------------------------------------
 * OneTimePasswordField (Root)
 * -----------------------------------------------------------------------------------------------*/

export function OneTimePasswordField(props: any): any {
	const slot = S('OneTimePasswordField.Root');
	const {
		__scopeOneTimePasswordField,
		defaultValue,
		value: valueProp,
		onValueChange,
		autoSubmit = false,
		children,
		onPaste,
		onAutoSubmit,
		disabled = false,
		readOnly = false,
		autoComplete = 'one-time-code',
		autoFocus = false,
		form,
		name,
		placeholder,
		type = 'text',
		// TODO (source): Change default to vertical when inputs use vertical writing mode
		orientation = 'horizontal',
		dir,
		validationType = 'numeric',
		sanitizeValue: sanitizeValueProp,
		ref: forwardedRef,
		...domProps
	} = props ?? {};

	const rovingFocusGroupScope = useRovingFocusGroupScope(
		__scopeOneTimePasswordField,
		subSlot(slot, 'rfs'),
	);
	const direction = useDirection(dir);

	const rootRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'root'));
	// octane adaptation: live DOM-derived collection (see file header).
	const collection = useMemo(
		() => createCollectionApi(() => rootRef.current),
		[],
		subSlot(slot, 'coll'),
	);
	// octane adaptation: the source's collection is React STATE — each ItemSlot
	// registration sets it, re-rendering the Root and (via context) every Input, so
	// index-derived output (aria-label 'of N', maxLength, data-radix-index,
	// focusable/active) refreshes when cells mount/unmount. Recreate that with a version
	// counter: every Input bumps it from a layout effect on mount and again in its
	// cleanup; the version rides in the context value (invalidating the scoped Provider's
	// memo), so membership changes re-render Root + all Inputs. Order stays DOM-derived.
	const [collectionVersion, setCollectionVersion] = useState(0, subSlot(slot, 'collVer'));
	const registerInput = useCallback(
		() => {
			setCollectionVersion((v: number) => v + 1);
			return () => setCollectionVersion((v: number) => v + 1);
		},
		[],
		subSlot(slot, 'register'),
	);

	const validation = INPUT_VALIDATION_MAP[validationType as InputValidationType] ?? null;

	const sanitizeValue = useCallback(
		(value: string | string[]) => {
			let str: string;
			if (Array.isArray(value)) {
				str = value.map(removeWhitespace).join('');
			} else {
				str = removeWhitespace(value);
			}

			if (validation) {
				// global regexp is stateful, so we clone it for each call
				const regexp = new RegExp(validation.regexp);
				str = str.replace(regexp, '');
			} else if (sanitizeValueProp) {
				str = sanitizeValueProp(str);
			}

			return str.split('');
		},
		[validation, sanitizeValueProp],
		subSlot(slot, 'sanitize'),
	);

	const controlledValue = useMemo(
		() => {
			return valueProp != null ? sanitizeValue(valueProp) : undefined;
		},
		[valueProp, sanitizeValue],
		subSlot(slot, 'controlled'),
	);

	const handleValueChange = useCallback(
		(value: string[]) => onValueChange?.(value.join('')),
		[onValueChange],
		subSlot(slot, 'onChange'),
	);
	const [value, setValue] = useControllableState<string[]>(
		{
			prop: controlledValue,
			defaultProp: defaultValue != null ? sanitizeValue(defaultValue) : [],
			onChange: handleValueChange,
		},
		subSlot(slot, 'value'),
	);

	// Use a ref so dispatch always reads the latest value without needing value in its
	// dependency array (which would change its identity every keystroke and cause
	// cascading effect re-runs).
	const latestValueRef = useRef(value, subSlot(slot, 'latest'));
	latestValueRef.current = value;

	// Update function *specifically* for event handlers.
	const dispatch = useCallback<Dispatcher>(
		(action: UpdateAction) => {
			const value = latestValueRef.current;
			switch (action.type) {
				case 'SET_CHAR': {
					const { index, char } = action;
					const currentTarget = collection.at(index)?.element;
					if (value[index] === char) {
						const next = currentTarget && collection.from(currentTarget, 1)?.element;
						focusInput(next);
						return;
					}

					// empty values should be handled in the CLEAR_CHAR action
					if (char === '') {
						return;
					}

					if (validation) {
						const regexp = new RegExp(validation.regexp);
						const clean = char.replace(regexp, '');
						if (clean !== char) {
							// not valid; ignore
							return;
						}
					}

					// no more space
					if (value.length >= collection.size) {
						// replace current value; move to next input
						const newValue = [...value];
						newValue[index] = char;
						flushSync(() => setValue(newValue));
						const next = currentTarget && collection.from(currentTarget, 1)?.element;
						focusInput(next);
						return;
					}

					const newValue = [...value];
					newValue[index] = char;

					const lastElement = collection.at(-1)?.element;
					flushSync(() => setValue(newValue));
					if (currentTarget !== lastElement) {
						const next = currentTarget && collection.from(currentTarget, 1)?.element;
						focusInput(next);
					} else {
						currentTarget?.select();
					}
					return;
				}

				case 'CLEAR_CHAR': {
					const { index, reason } = action;
					if (!value[index]) {
						return;
					}

					const newValue = value.filter((_, i) => i !== index);
					const currentTarget = collection.at(index)?.element;
					const previous = currentTarget && collection.from(currentTarget, -1)?.element;

					flushSync(() => setValue(newValue));
					if (reason === 'Backspace') {
						focusInput(previous);
					} else if (reason === 'Delete' || reason === 'Cut') {
						focusInput(currentTarget);
					}
					return;
				}

				case 'CLEAR': {
					if (value.length === 0) {
						return;
					}

					if (action.reason === 'Backspace' || action.reason === 'Delete') {
						flushSync(() => setValue([]));
						focusInput(collection.at(0)?.element);
					} else {
						setValue([]);
					}
					return;
				}

				case 'PASTE': {
					const { value: pastedValue } = action;
					const sanitizedValue = sanitizeValue(pastedValue);
					if (!sanitizedValue) {
						return;
					}

					const value = sanitizedValue.slice(0, collection.size);

					flushSync(() => setValue(value));
					focusInput(collection.at(value.length - 1)?.element);
					return;
				}
			}
		},
		[collection, sanitizeValue, setValue, validation],
		subSlot(slot, 'dispatch'),
	);

	// re-validate when the validation type changes
	const validationTypeRef = useRef(validation, subSlot(slot, 'vtype'));
	useEffect(
		() => {
			if (!validation) {
				return;
			}

			if (validationTypeRef.current?.type !== validation.type) {
				validationTypeRef.current = validation;
				setValue(sanitizeValue(value.join('')));
			}
		},
		[sanitizeValue, setValue, validation, value],
		subSlot(slot, 'e:revalidate'),
	);

	const hiddenInputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'hidden'));

	const userActionRef = useRef<KeyboardActionDetails | null>(null, subSlot(slot, 'action'));
	const composedRefs = useComposedRefs(forwardedRef, rootRef, subSlot(slot, 'refs'));

	const locateForm = useCallback(
		() => {
			let formElement: HTMLFormElement | null | undefined;
			if (form) {
				const associatedElement = (rootRef.current?.ownerDocument ?? document).getElementById(form);
				if (isFormElement(associatedElement)) {
					formElement = associatedElement;
				}
			} else if (hiddenInputRef.current) {
				formElement = hiddenInputRef.current.form;
			} else {
				// octane adaptation: read the first input lazily from the live collection
				// (equivalent to the source's render-time `collection.at(0)` snapshot; the
				// lazy read is always at least as fresh — see file header).
				const firstInput = collection.at(0)?.element;
				if (firstInput) {
					formElement = firstInput.form;
				}
			}

			return formElement ?? null;
		},
		[form, collection],
		subSlot(slot, 'locate'),
	);

	const attemptSubmit = useCallback(
		() => {
			const formElement = locateForm();
			formElement?.requestSubmit();
		},
		[locateForm],
		subSlot(slot, 'submit'),
	);

	useEffect(
		() => {
			const form = locateForm();
			if (form) {
				const reset = () => dispatch({ type: 'CLEAR', reason: 'Reset' });
				form.addEventListener('reset', reset);
				return () => form.removeEventListener('reset', reset);
			}
		},
		[dispatch, locateForm],
		subSlot(slot, 'e:reset'),
	);

	const currentValue = value.join('');
	const valueRef = useRef(currentValue, subSlot(slot, 'valueRef'));
	const length = collection.size;
	useEffect(
		() => {
			const previousValue = valueRef.current;
			valueRef.current = currentValue;
			if (previousValue === currentValue) {
				return;
			}

			if (autoSubmit && value.every((char) => char !== '') && value.length === length) {
				onAutoSubmit?.(value.join(''));
				attemptSubmit();
			}
		},
		[attemptSubmit, autoSubmit, currentValue, length, onAutoSubmit, value],
		subSlot(slot, 'e:autosubmit'),
	);
	const isHydrated = useIsHydrated(subSlot(slot, 'hydrated'));

	return createElement(OneTimePasswordFieldContext, {
		scope: __scopeOneTimePasswordField,
		value,
		attemptSubmit,
		collection,
		collectionVersion,
		registerInput,
		disabled,
		readOnly,
		autoComplete,
		autoFocus,
		form,
		name,
		placeholder,
		type,
		hiddenInputRef,
		userActionRef,
		dispatch,
		validationType,
		orientation,
		isHydrated,
		sanitizeValue,
		children: createElement(RovingFocusGroup.Root, {
			asChild: true,
			...rovingFocusGroupScope,
			orientation,
			dir: direction,
			children: createElement(Primitive.div, {
				...domProps,
				role: 'group',
				ref: composedRefs,
				onPaste: composeEventHandlers(onPaste, (event: ClipboardEvent) => {
					event.preventDefault();
					const pastedValue = event.clipboardData?.getData('text/plain') ?? '';
					dispatch({ type: 'PASTE', value: pastedValue });
				}),
				children,
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * OneTimePasswordFieldHiddenInput
 * -----------------------------------------------------------------------------------------------*/

export function OneTimePasswordFieldHiddenInput(props: any): any {
	const slot = S('OneTimePasswordField.HiddenInput');
	const { __scopeOneTimePasswordField, ref: forwardedRef, ...hiddenProps } = props ?? {};
	const { value, hiddenInputRef, name } = useOneTimePasswordFieldContext(
		'OneTimePasswordFieldHiddenInput',
		__scopeOneTimePasswordField,
	);
	const ref = useComposedRefs(hiddenInputRef, forwardedRef, subSlot(slot, 'refs'));
	return createElement('input', {
		ref,
		name,
		value: value.join('').trim(),
		autoComplete: 'off',
		autoCapitalize: 'off',
		autoCorrect: 'off',
		autoSave: 'off',
		// octane: pass the string 'false' — a false-valued attribute would be removed,
		// but React renders spellcheck="false".
		spellCheck: 'false',
		...hiddenProps,
		type: 'hidden',
		readOnly: true,
	});
}

/* -------------------------------------------------------------------------------------------------
 * OneTimePasswordFieldInput
 * -----------------------------------------------------------------------------------------------*/

export function OneTimePasswordFieldInput(props: any): any {
	const slot = S('OneTimePasswordField.Input');
	const {
		__scopeOneTimePasswordField,
		onInvalidChange,
		index: indexProp,
		// props users should pass on the Root instead (the source strips + TODO-warns)
		value: _value,
		defaultValue: _defaultValue,
		disabled: _disabled,
		readOnly: _readOnly,
		autoComplete: _autoComplete,
		autoFocus: _autoFocus,
		form: _form,
		name: _name,
		placeholder: _placeholder,
		type: _type,
		// octane adaptation: React's onChange on a text input is the native `input` event —
		// both user handlers fold into the single composed onInput binding below, so they
		// must not stay in domProps (a native `change` binding would mean something else).
		onInput: onInputProp,
		onChange: onChangeProp,
		ref: forwardedRef,
		...domProps
	} = props ?? {};

	const context = useOneTimePasswordFieldContext(
		'OneTimePasswordFieldInput',
		__scopeOneTimePasswordField,
	);
	const { dispatch, userActionRef, validationType, isHydrated, disabled, collection } = context;
	const registerInput: () => () => void = context.registerInput;
	// octane adaptation: registration bump (see Root) — mounting/unmounting ANY cell
	// re-renders every cell so its index-derived render output stays fresh, matching the
	// source's state-backed collection. Layout effect: runs after this input is in the
	// DOM (mount) and its cleanup schedules a re-render after removal (unmount).
	useLayoutEffect(() => registerInput(), [registerInput], subSlot(slot, 'e:register'));
	const rovingFocusGroupScope = useRovingFocusGroupScope(
		__scopeOneTimePasswordField,
		subSlot(slot, 'rfs'),
	);

	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'input'));
	const [element, setElement] = useState<HTMLInputElement | null>(null, subSlot(slot, 'element'));

	const index: number = indexProp ?? (element ? collection.indexOf(element) : -1);
	const canSetPlaceholder = indexProp != null || isHydrated;
	let placeholder: string | undefined;
	if (canSetPlaceholder && context.placeholder && context.value.length === 0) {
		// only set placeholder after hydration to prevent flickering when indices are
		// re-calculated
		placeholder = context.placeholder[index];
	}

	const composedInputRef = useComposedRefs(
		forwardedRef,
		inputRef,
		setElement,
		subSlot(slot, 'refs'),
	);
	// The cell's `value={char}` is live CONTROLLED (octane React-parity): the runtime
	// keeps the DOM `.value` in sync and restores it after event flushes — no
	// imperative sync or post-handler reassertion needed here.
	const char = context.value[index] ?? '';

	const keyboardActionTimeoutRef = useRef<number | null>(null, subSlot(slot, 'timeout'));
	useEffect(
		() => {
			return () => {
				if (keyboardActionTimeoutRef.current) {
					window.clearTimeout(keyboardActionTimeoutRef.current);
				}
			};
		},
		[],
		subSlot(slot, 'e:timeout'),
	);

	const totalValue = context.value.join('').trim();
	const lastSelectableIndex = clamp(totalValue.length, [0, collection.size - 1]);
	const isFocusable = index <= lastSelectableIndex;

	const validation = INPUT_VALIDATION_MAP[validationType as InputValidationType] ?? undefined;

	// Source `onInput` logic: password managers may try to insert the whole code into a
	// single input, in which case form validation would fail to prevent additional input.
	// Handle this the same as if a user were pasting a value.
	const handleInput = (event: Event) => {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (value.length > 1) {
			event.preventDefault();
			userActionRef.current = { type: 'autocomplete-paste' };
			dispatch({ type: 'PASTE', value });
			keyboardActionTimeoutRef.current = window.setTimeout(() => {
				userActionRef.current = null;
			}, 10);
		}
	};

	// Source `onChange` logic (fires from the same native `input` event in octane).
	const handleChange = (event: Event) => {
		const target = event.target as HTMLInputElement;
		const value = target.value;
		event.preventDefault();
		const action = userActionRef.current;
		userActionRef.current = null;

		if (action) {
			switch (action.type) {
				case 'cut':
					// TODO (source): do we want to assume the user wants to clear the entire
					// value here and copy the code to the clipboard instead of just the value
					// of the given input?
					dispatch({ type: 'CLEAR_CHAR', index, reason: 'Cut' });
					return;
				case 'autocomplete-paste':
					// the PASTE handler will already set the value and focus the final input;
					// we want to skip focusing the wrong element if the browser fires another
					// change for the first input. This sometimes happens during autocomplete.
					return;
				case 'keydown': {
					if (action.key === 'Char') {
						// update resulting from a keydown event that set a value directly.
						// Ignore.
						return;
					}

					const isClearing = action.key === 'Backspace' && (action.metaKey || action.ctrlKey);
					if (action.key === 'Clear' || isClearing) {
						dispatch({ type: 'CLEAR', reason: 'Backspace' });
					} else {
						dispatch({ type: 'CLEAR_CHAR', index, reason: action.key });
					}
					return;
				}
				default:
					return;
			}
		}

		// Only update the value if it matches the input pattern
		if (target.validity.valid) {
			if (value === '') {
				let reason: 'Backspace' | 'Delete' | 'Cut' = 'Backspace';
				const inputType = (event as InputEvent).inputType;
				if (inputType === 'deleteContentBackward') {
					reason = 'Backspace';
				} else if (inputType === 'deleteByCut') {
					reason = 'Cut';
				}
				dispatch({ type: 'CLEAR_CHAR', index, reason });
			} else {
				dispatch({ type: 'SET_CHAR', char: value, index, event });
			}
		} else {
			onInvalidChange?.(target.value);
			requestAnimationFrame(() => {
				if (target.ownerDocument.activeElement === target) {
					target.select();
				}
			});
		}
	};

	return createElement(RovingFocusGroup.Item, {
		...rovingFocusGroupScope,
		asChild: true,
		focusable: !context.disabled && isFocusable,
		active: index === lastSelectableIndex,
		children: ({
			hasTabStop,
			isCurrentTabStop,
		}: {
			hasTabStop: boolean;
			isCurrentTabStop: boolean;
		}) => {
			const supportsAutoComplete = hasTabStop ? isCurrentTabStop : index === 0;
			return createElement(Primitive.input, {
				ref: composedInputRef,
				type: context.type,
				disabled,
				'aria-label': `Character ${index + 1} of ${collection.size}`,
				autoComplete: supportsAutoComplete ? context.autoComplete : 'off',
				'data-1p-ignore': supportsAutoComplete ? undefined : 'true',
				'data-lpignore': supportsAutoComplete ? undefined : 'true',
				'data-protonpass-ignore': supportsAutoComplete ? undefined : 'true',
				'data-bwignore': supportsAutoComplete ? undefined : 'true',
				inputMode: validation?.inputMode,
				maxLength: supportsAutoComplete ? collection.size : 1,
				pattern: validation?.pattern,
				readOnly: context.readOnly,
				value: char,
				placeholder,
				[OTP_INPUT_ATTR]: '',
				'data-radix-index': index,
				...domProps,
				onFocus: composeEventHandlers(props?.onFocus, (event: FocusEvent) => {
					(event.currentTarget as HTMLInputElement).select();
				}),
				onCut: composeEventHandlers(props?.onCut, (event: ClipboardEvent) => {
					const currentValue = (event.currentTarget as HTMLInputElement).value;
					if (currentValue !== '') {
						// In this case the value will be cleared, but we don't want to set it
						// directly because the user may want to prevent default behavior in the
						// change handler. The userActionRef will be set temporarily so the
						// change handler can behave correctly in response to the action.
						userActionRef.current = { type: 'cut' };
						// Set a short timeout to clear the action tracker after the change
						// handler has had time to complete.
						keyboardActionTimeoutRef.current = window.setTimeout(() => {
							userActionRef.current = null;
						}, 10);
					}
				}),
				// octane adaptation: ONE native `input` binding runs the source's onInput
				// logic then its onChange logic (React's order for a native input event).
				// React's controlled-input restoration is the runtime's: after the event
				// flush, the controlled `value` snaps the DOM back to the rendered char.
				onInput: (event: Event) => {
					composeEventHandlers(onInputProp, handleInput)(event);
					composeEventHandlers(onChangeProp, handleChange)(event);
				},
				onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
					switch (event.key) {
						case 'Clear':
						case 'Delete':
						case 'Backspace': {
							const currentTarget = event.currentTarget as HTMLInputElement;
							const currentValue = currentTarget.value;
							// if current value is empty, no change event will fire
							if (currentValue === '') {
								// if the user presses delete when there is no value, noop
								if (event.key === 'Delete') return;

								const isClearing = event.key === 'Clear' || event.metaKey || event.ctrlKey;
								if (isClearing) {
									dispatch({ type: 'CLEAR', reason: 'Backspace' });
								} else {
									const element = currentTarget;
									requestAnimationFrame(() => {
										focusInput(collection.from(element, -1)?.element);
									});
								}
							} else {
								// In this case the value will be cleared, but we don't want to set
								// it directly because the user may want to prevent default behavior
								// in the change handler. The userActionRef is set temporarily so
								// the change handler can behave correctly in response to the key
								// vs. clearing the value by setting state externally.
								userActionRef.current = {
									type: 'keydown',
									key: event.key as 'Backspace' | 'Delete' | 'Clear',
									metaKey: event.metaKey,
									ctrlKey: event.ctrlKey,
								};
								// Set a short timeout to clear the action tracker after the change
								// handler has had time to complete.
								keyboardActionTimeoutRef.current = window.setTimeout(() => {
									userActionRef.current = null;
								}, 10);
							}

							return;
						}
						case 'Enter': {
							event.preventDefault();
							context.attemptSubmit();
							return;
						}
						case 'ArrowDown':
						case 'ArrowUp': {
							if (context.orientation === 'horizontal') {
								// in horizontal orientation, up/down would de-select the input
								// instead of moving focus
								event.preventDefault();
							}
							return;
						}
						// TODO (source): Handle left/right arrow keys in vertical writing mode
						default: {
							const currentTarget = event.currentTarget as HTMLInputElement;
							if (currentTarget.value === event.key) {
								// if current value is same as the key press, no change event will
								// fire. Focus the next input.
								event.preventDefault();
								focusInput(collection.from(currentTarget, 1)?.element);
								return;
							} else if (
								// input already has a value, but...
								currentTarget.value &&
								// the value is not selected
								!(
									currentTarget.selectionStart === 0 &&
									currentTarget.selectionEnd != null &&
									currentTarget.selectionEnd > 0
								)
							) {
								const attemptedValue = event.key;
								if (event.key.length > 1 || event.key === ' ') {
									// not a character; do nothing
									return;
								} else {
									// user is attempting to enter a character, but the input will
									// not update by default since it's limited to a single
									// character.
									const nextInput = collection.from(currentTarget, 1)?.element;
									const lastInput = collection.at(-1)?.element;
									if (nextInput !== lastInput && currentTarget !== lastInput) {
										// if selection is before the value, set the value of the
										// current input. Otherwise set the value of the next input.
										if (currentTarget.selectionStart === 0) {
											dispatch({ type: 'SET_CHAR', char: attemptedValue, index, event });
										} else {
											dispatch({
												type: 'SET_CHAR',
												char: attemptedValue,
												index: index + 1,
												event,
											});
										}

										userActionRef.current = {
											type: 'keydown',
											key: 'Char',
											metaKey: event.metaKey,
											ctrlKey: event.ctrlKey,
										};
										keyboardActionTimeoutRef.current = window.setTimeout(() => {
											userActionRef.current = null;
										}, 10);
									}
								}
							}
						}
					}
				}),
				onPointerDown: composeEventHandlers(props?.onPointerDown, (event: PointerEvent) => {
					event.preventDefault();
					const indexToFocus = Math.min(index, lastSelectableIndex);
					const element = collection.at(indexToFocus)?.element;
					focusInput(element);
				}),
			});
		},
	});
}

/* -----------------------------------------------------------------------------------------------*/

function isFormElement(element: Element | null | undefined): element is HTMLFormElement {
	return element?.tagName === 'FORM';
}

function removeWhitespace(value: string): string {
	return value.replace(/\s/g, '');
}

function focusInput(element: HTMLInputElement | null | undefined): void {
	if (!element) return;
	if (element.ownerDocument.activeElement === element) {
		// if the element is already focused, select the value in the next animation frame
		window.requestAnimationFrame(() => {
			element.select?.();
		});
	} else {
		element.focus();
	}
}

// Inlined from @radix-ui/number.
function clamp(value: number, [min, max]: [number, number]): number {
	return Math.min(max, Math.max(min, value));
}

export {
	OneTimePasswordField as Root,
	OneTimePasswordFieldInput as Input,
	OneTimePasswordFieldHiddenInput as HiddenInput,
};
