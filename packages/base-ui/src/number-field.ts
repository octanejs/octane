// Ported from .base-ui/packages/react/src/number-field/ (v1.6.0): root/NumberFieldRoot (+ its
// context), group/NumberFieldGroup, input/NumberFieldInput, increment/NumberFieldIncrement,
// decrement/NumberFieldDecrement, root/useNumberFieldButton + useNumberFieldStepperButton, and
// utils/stateAttributesMapping — plus its `index.parts` (the `NumberField` namespace).
//
// octane adaptations: native events (no `.nativeEvent`); forwardRef → ref-as-prop. The visible
// and hidden inputs take live controlled `value` props — octane inputs are CONTROLLED exactly
// like React's (property-driven, reasserted on every commit and after discrete events). The
// scrub area + press-and-hold auto-repeat are deferred (see `usePressAndHold` stub).
// Field/Form integration is inert when standalone.
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useComposedRefs } from './utils/composeRefs';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { useValueAsRef } from './utils/useValueAsRef';
import { useValueChanged } from './utils/useValueChanged';
import { useForcedRerendering } from './utils/useForcedRerendering';
import { addEventListener } from './utils/addEventListener';
import { platform } from './utils/platform';
import { ownerDocument } from './utils/owner';
import { visuallyHidden, visuallyHiddenInput } from './utils/visuallyHidden';
import { stopEvent } from './utils/composite/list-utils';
import { useButton } from './utils/useButton';
import { useLabelableId } from './utils/field/useLabelableId';
import { formatNumber } from './utils/formatNumber';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import {
	getNumberLocaleDetails,
	isNumeralChar,
	parseNumber,
	ANY_MINUS_RE,
	ANY_PLUS_RE,
	ANY_MINUS_DETECT_RE,
	ANY_PLUS_DETECT_RE,
	PERCENTAGES,
	PERMILLE,
	SPACE_SEPARATOR_RE,
	BASE_NON_NUMERIC_SYMBOLS,
	MINUS_SIGNS_WITH_ASCII,
	PLUS_SIGNS_WITH_ASCII,
} from './utils/number/parse';
import {
	hasNumberFormatRoundingOptions,
	removeFloatingPointErrors,
	toValidatedNumber,
} from './utils/number/validate';
import { usePressAndHold, isTouchLikePointerType } from './utils/usePressAndHold';
import {
	CHANGE_VALUE_TICK_DELAY,
	START_AUTO_CHANGE_DELAY,
	SCROLLING_POINTER_MOVE_DISTANCE,
} from './utils/number/constants';
import type { EventWithOptionalKeyState, IncrementValueParameters } from './utils/number/types';

type InputMode = 'numeric' | 'decimal' | 'text';

const NAVIGATE_KEYS = new Set([
	'Backspace',
	'Delete',
	'ArrowLeft',
	'ArrowRight',
	'Tab',
	'Enter',
	'Escape',
]);

function activeElement(doc: Document): Element | null {
	return doc.activeElement;
}

export interface NumberFieldRootState extends FieldRootState {
	value: number | null;
	inputValue: string;
	readOnly: boolean;
	required: boolean;
	scrubbing: boolean;
}

const stateAttributesMapping: StateAttributesMapping<any> = {
	inputValue: () => null,
	value: () => null,
	...(fieldValidityMapping as StateAttributesMapping<any>),
};

// --- Context -----------------------------------------------------------------

const NumberFieldRootContext = createContext<any>(undefined);

function useNumberFieldRootContext(): any {
	const context = useContext(NumberFieldRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: NumberFieldRootContext is missing. NumberField parts must be placed within <NumberField.Root>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

function NumberFieldRoot(props: any): any {
	const slot = S('NumberFieldRoot');
	const {
		id: idProp,
		min,
		max,
		smallStep = 0.1,
		step: stepProp = 1,
		largeStep = 10,
		required = false,
		disabled: disabledProp = false,
		readOnly = false,
		form,
		name: nameProp,
		defaultValue,
		value: valueProp,
		onValueChange: onValueChangeProp,
		onValueCommitted: onValueCommittedProp,
		allowWheelScrub = false,
		snapOnStep = false,
		allowOutOfRange = false,
		format,
		locale,
		render,
		className,
		inputRef: inputRefProp,
		style,
		ref,
		...elementProps
	} = props;

	const {
		setDirty,
		validityData,
		disabled: fieldDisabled,
		setFilled,
		invalid,
		name: fieldName,
		state: fieldState,
		validation,
	} = useFieldRootContext();
	const { clearErrors } = useFormContext();

	const disabled = fieldDisabled || disabledProp;
	const name = fieldName ?? nameProp;
	const step = stepProp === 'any' ? 1 : stepProp;

	const [isScrubbing, setIsScrubbing] = useState(false, subSlot(slot, 'scrubbing'));

	const minWithDefault = min ?? Number.MIN_SAFE_INTEGER;
	const maxWithDefault = max ?? Number.MAX_SAFE_INTEGER;
	const minWithZeroDefault = min ?? 0;
	const formatStyle = format?.style;

	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const hiddenInputRef = useComposedRefs(
		inputRefProp,
		validation.inputRef,
		subSlot(slot, 'hiddenRef'),
	);

	const id = useLabelableId({ id: idProp }, subSlot(slot, 'id'));

	const [valueUnwrapped, setValueUnwrapped] = useControlled<number | null>(
		{ controlled: valueProp, default: defaultValue, name: 'NumberField', state: 'value' },
		subSlot(slot, 'value'),
	);

	const value = valueUnwrapped ?? null;
	const valueRef = useValueAsRef<number | null>(value, subSlot(slot, 'valueRef'));

	useLayoutEffect(() => setFilled(value !== null), [setFilled, value], subSlot(slot, 'e:filled'));

	const forceRender = useForcedRerendering(subSlot(slot, 'force'));
	const formatOptionsRef = useValueAsRef<Intl.NumberFormatOptions | undefined>(
		format,
		subSlot(slot, 'fmtRef'),
	);
	const hasPendingCommitRef = useRef(false, subSlot(slot, 'pending'));

	const onValueCommitted = useStableCallback(
		(nextValue: number | null, eventDetails: any) => {
			hasPendingCommitRef.current = false;
			onValueCommittedProp?.(nextValue, eventDetails);
		},
		subSlot(slot, 'commit'),
	);

	const allowInputSyncRef = useRef(true, subSlot(slot, 'allowSync'));
	const lastChangedValueRef = useRef<number | null>(null, subSlot(slot, 'lastChanged'));

	const [inputValue, setInputValue] = useState(
		() => formatNumber(value, locale, format),
		subSlot(slot, 'inputValue'),
	);
	const [inputMode, setInputMode] = useState<InputMode>('numeric', subSlot(slot, 'inputMode'));

	const getAllowedNonNumericKeys = useStableCallback(
		() => {
			const { decimal, group, currency, literal } = getNumberLocaleDetails(locale, format);
			const keys = new Set<string>();
			BASE_NON_NUMERIC_SYMBOLS.forEach((symbol) => keys.add(symbol));
			if (decimal) keys.add(decimal);
			if (group) {
				keys.add(group);
				if (SPACE_SEPARATOR_RE.test(group)) keys.add(' ');
			}
			const allowPercentSymbols =
				formatStyle === 'percent' || (formatStyle === 'unit' && format?.unit === 'percent');
			const allowPermilleSymbols =
				formatStyle === 'percent' || (formatStyle === 'unit' && format?.unit === 'permille');
			if (allowPercentSymbols) PERCENTAGES.forEach((key) => keys.add(key));
			if (allowPermilleSymbols) PERMILLE.forEach((key) => keys.add(key));
			if (formatStyle === 'currency' && currency) keys.add(currency);
			if (literal) {
				Array.from(literal).forEach((char) => keys.add(char));
				if (SPACE_SEPARATOR_RE.test(literal)) keys.add(' ');
			}
			PLUS_SIGNS_WITH_ASCII.forEach((key) => keys.add(key));
			if (minWithDefault < 0 || allowOutOfRange) {
				MINUS_SIGNS_WITH_ASCII.forEach((key) => keys.add(key));
			}
			return keys;
		},
		subSlot(slot, 'allowedKeys'),
	);

	const getStepAmount = useStableCallback(
		(event?: EventWithOptionalKeyState) => {
			if (event?.altKey) return smallStep;
			if (event?.shiftKey) return largeStep;
			return step;
		},
		subSlot(slot, 'stepAmount'),
	);

	const setValue = useStableCallback(
		(unvalidatedValue: number | null, details: any): boolean => {
			const eventWithOptionalKeyState = details.event as EventWithOptionalKeyState;
			const dir = details.direction;
			const isInputReason =
				details.reason === REASONS.inputChange ||
				details.reason === 'input-clear' ||
				details.reason === 'input-blur' ||
				details.reason === 'input-paste' ||
				details.reason === REASONS.none;
			const shouldClampValue = !allowOutOfRange || !isInputReason;

			const validatedValue = toValidatedNumber(unvalidatedValue, {
				step: dir ? getStepAmount(eventWithOptionalKeyState) * dir : undefined,
				format: formatOptionsRef.current,
				minWithDefault,
				maxWithDefault,
				minWithZeroDefault,
				snapOnStep,
				small: eventWithOptionalKeyState?.altKey ?? false,
				clamp: shouldClampValue,
			});

			const shouldFireChange =
				validatedValue !== value ||
				(isInputReason && (unvalidatedValue !== value || allowInputSyncRef.current === false));

			if (shouldFireChange) {
				onValueChangeProp?.(validatedValue, details);
				if (details.isCanceled) return false;
				setValueUnwrapped(validatedValue);
				setDirty(validatedValue !== validityData.initialValue);
				hasPendingCommitRef.current = true;
			}

			lastChangedValueRef.current = validatedValue;
			if (allowInputSyncRef.current) {
				setInputValue(formatNumber(validatedValue, locale, format));
			}
			forceRender();
			return shouldFireChange;
		},
		subSlot(slot, 'setValue'),
	);

	const incrementValue = useStableCallback(
		(amount: number, params: IncrementValueParameters) => {
			const { direction, currentValue, event, reason } = params;
			const prevValue = currentValue == null ? valueRef.current : currentValue;
			if (typeof prevValue !== 'number') {
				return setValue(0, createChangeEventDetails(reason, event));
			}
			return setValue(
				prevValue + amount * direction,
				createChangeEventDetails(reason, event, undefined, { direction }),
			);
		},
		subSlot(slot, 'increment'),
	);

	// Sync the formatted input value when the external value changes (blur-gated).
	useLayoutEffect(
		() => {
			if (!allowInputSyncRef.current) return;
			const nextInputValue = formatNumber(value, locale, format);
			if (nextInputValue !== inputValue) setInputValue(nextInputValue);
		},
		undefined,
		subSlot(slot, 'e:syncInput'),
	);

	useLayoutEffect(
		() => {
			if (!platform.os.ios) return;
			let computedInputMode: InputMode = 'text';
			if (minWithDefault >= 0) computedInputMode = 'decimal';
			setInputMode(computedInputMode);
		},
		[minWithDefault],
		subSlot(slot, 'e:inputMode'),
	);

	useEffect(
		() => {
			const element = inputRef.current;
			if (disabled || readOnly || !allowWheelScrub || !element) return undefined;
			function handleWheel(event: WheelEvent) {
				if (event.ctrlKey || activeElement(ownerDocument(inputRef.current)) !== inputRef.current) {
					return;
				}
				event.preventDefault();
				allowInputSyncRef.current = true;
				const amount = getStepAmount(event);
				const changed = incrementValue(amount, {
					direction: event.deltaY > 0 ? -1 : 1,
					event,
					reason: 'wheel',
				});
				if (changed) {
					onValueCommitted(
						lastChangedValueRef.current ?? valueRef.current,
						createChangeEventDetails('wheel' as any, event),
					);
				}
			}
			return addEventListener(element, 'wheel', handleWheel as EventListener);
		},
		[allowWheelScrub, incrementValue, disabled, readOnly, getStepAmount, onValueCommitted],
		subSlot(slot, 'e:wheel'),
	);

	const state: NumberFieldRootState = useMemo(
		() => ({
			...fieldState,
			disabled,
			readOnly,
			required,
			value,
			inputValue,
			scrubbing: isScrubbing,
		}),
		[fieldState, disabled, readOnly, required, value, inputValue, isScrubbing],
		subSlot(slot, 'state'),
	);

	const contextValue = useMemo(
		() => ({
			inputRef,
			inputValue,
			value,
			minWithDefault,
			maxWithDefault,
			disabled,
			readOnly,
			id,
			setValue,
			incrementValue,
			getStepAmount,
			allowInputSyncRef,
			formatOptionsRef,
			valueRef,
			lastChangedValueRef,
			hasPendingCommitRef,
			name,
			nameProp,
			required,
			invalid,
			inputMode,
			getAllowedNonNumericKeys,
			min,
			max,
			setInputValue,
			locale,
			isScrubbing,
			setIsScrubbing,
			state,
			onValueCommitted,
		}),
		[
			inputValue,
			value,
			minWithDefault,
			maxWithDefault,
			disabled,
			readOnly,
			id,
			setValue,
			incrementValue,
			getStepAmount,
			name,
			nameProp,
			required,
			invalid,
			inputMode,
			getAllowedNonNumericKeys,
			min,
			max,
			locale,
			isScrubbing,
			state,
			onValueCommitted,
		],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{ ref, state, props: elementProps, stateAttributesMapping },
		subSlot(slot, 're'),
	);

	const hiddenInputProps = validation.getValidationProps(disabled, {
		onFocus() {
			inputRef.current?.focus();
		},
		onChange(event: any) {
			if (event.defaultPrevented || disabled || readOnly) return;
			const nextValue = event.currentTarget.valueAsNumber;
			const parsedValue = Number.isNaN(nextValue) ? null : nextValue;
			const details = createChangeEventDetails(REASONS.none, event);
			setValue(parsedValue, details);
			clearErrors(name);
			validation.change(lastChangedValueRef.current ?? parsedValue);
		},
	});

	const hiddenInput = createElement('input', {
		...hiddenInputProps,
		ref: hiddenInputRef,
		type: 'number',
		form,
		name,
		value: value ?? '',
		min,
		max,
		step: stepProp,
		disabled,
		readOnly,
		required,
		'aria-hidden': true,
		tabIndex: -1,
		style: name ? visuallyHiddenInput : visuallyHidden,
	});

	return createElement(NumberFieldRootContext.Provider, {
		value: contextValue,
		children: [element, hiddenInput],
	});
}

// --- Group -------------------------------------------------------------------

function NumberFieldGroup(props: any): any {
	const slot = S('NumberFieldGroup');
	const { render, className, style, ref, ...elementProps } = props;
	const { state } = useNumberFieldRootContext();
	return useRenderElement(
		'div',
		{ render, className, style },
		{ ref, state, props: [{ role: 'group' }, elementProps], stateAttributesMapping },
		subSlot(slot, 're'),
	);
}

// --- Input -------------------------------------------------------------------

function NumberFieldInput(props: any): any {
	const slot = S('NumberFieldInput');
	const { render, className, style, ref, ...elementProps } = props;

	const {
		allowInputSyncRef,
		disabled,
		formatOptionsRef,
		getAllowedNonNumericKeys,
		getStepAmount,
		id,
		incrementValue,
		inputMode,
		inputValue,
		max,
		min,
		name,
		nameProp,
		readOnly,
		required,
		setValue,
		state,
		setInputValue,
		locale,
		inputRef,
		value,
		onValueCommitted,
		lastChangedValueRef,
		hasPendingCommitRef,
		valueRef,
	} = useNumberFieldRootContext();

	const { clearErrors } = useFormContext();
	const { validationMode, setTouched, setFocused, invalid, shouldValidateOnChange, validation } =
		useFieldRootContext();
	const { labelId } = useLabelableContext();

	const hasTouchedInputRef = useRef(false, subSlot(slot, 'touched'));
	const blockRevalidationRef = useRef(false, subSlot(slot, 'blockReval'));
	const pendingCaretRef = useRef<number | null>(null, subSlot(slot, 'caret'));

	useRegisterFieldControl(
		inputRef,
		id,
		value,
		undefined,
		!disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	useLayoutEffect(
		() => {
			if (pendingCaretRef.current != null) {
				const caret = pendingCaretRef.current;
				pendingCaretRef.current = null;
				inputRef.current?.setSelectionRange(caret, caret);
			}
		},
		undefined,
		subSlot(slot, 'e:caret'),
	);

	useValueChanged(
		value,
		() => {
			clearErrors(name);
			if (blockRevalidationRef.current && !shouldValidateOnChange()) {
				blockRevalidationRef.current = false;
				return;
			}
			validation.change(value);
		},
		subSlot(slot, 'valueChanged'),
	);

	const inputProps: Record<string, any> = {
		id,
		required,
		disabled,
		readOnly,
		inputMode,
		value: inputValue,
		type: 'text',
		autoComplete: 'off',
		autoCorrect: 'off',
		spellCheck: 'false',
		'aria-roledescription': 'Number field',
		'aria-invalid': !disabled && invalid ? true : undefined,
		'aria-labelledby': labelId,
		onFocus(event: any) {
			if (event.defaultPrevented || disabled) return;
			setFocused(true);
			if (hasTouchedInputRef.current) return;
			hasTouchedInputRef.current = true;
			const target = event.currentTarget;
			const length = target.value.length;
			target.setSelectionRange(length, length);
		},
		onBlur(event: any) {
			if (event.defaultPrevented || disabled) return;
			setTouched(true);
			setFocused(false);
			if (readOnly) return;
			const hadManualInput = !allowInputSyncRef.current;
			const hadPendingProgrammaticChange = hasPendingCommitRef.current;
			allowInputSyncRef.current = true;
			if (inputValue.trim() === '') {
				const clearDetails = createChangeEventDetails('input-clear' as any, event);
				setValue(null, clearDetails);
				if (clearDetails.isCanceled) return;
				if (validationMode === 'onBlur') validation.commit(null);
				if (hadManualInput || hadPendingProgrammaticChange || value !== null) {
					onValueCommitted(null, createChangeEventDetails('input-clear' as any, event));
				}
				return;
			}
			const formatOptions = formatOptionsRef.current;
			const parsedValue = parseNumber(inputValue, locale, formatOptions);
			if (parsedValue === null) return;
			const hasRoundingOptions = hasNumberFormatRoundingOptions(formatOptions);
			let committed: number | null;
			if (!hadManualInput && !hasRoundingOptions) {
				committed = value;
			} else if (hasRoundingOptions) {
				committed = removeFloatingPointErrors(parsedValue, formatOptions);
			} else {
				committed = parsedValue;
			}
			const shouldUpdateValue = value !== committed;
			const shouldCommit = hadManualInput || shouldUpdateValue || hadPendingProgrammaticChange;
			let committedValue = committed;
			if (shouldUpdateValue) {
				const changeDetails = createChangeEventDetails('input-blur' as any, event);
				blockRevalidationRef.current = true;
				setValue(committed, changeDetails);
				if (changeDetails.isCanceled) {
					blockRevalidationRef.current = false;
					return;
				}
				committedValue = lastChangedValueRef.current ?? committed;
				if (committedValue === value) blockRevalidationRef.current = false;
			}
			if (validationMode === 'onBlur') validation.commit(committedValue);
			if (shouldCommit)
				onValueCommitted(committedValue, createChangeEventDetails('input-blur' as any, event));
			const canonicalText = formatNumber(committedValue, locale, formatOptions);
			if (inputValue !== canonicalText) setInputValue(canonicalText);
		},
		onChange(event: any) {
			if (event.defaultPrevented) return;
			allowInputSyncRef.current = false;
			const targetValue = event.currentTarget.value;
			if (targetValue.trim() === '') {
				setInputValue(targetValue);
				setValue(null, createChangeEventDetails('input-clear' as any, event));
				return;
			}
			const allowedNonNumericKeys = getAllowedNonNumericKeys();
			const isValidCharacterString = Array.from(targetValue as string).every(
				(ch) => isNumeralChar(ch) || ANY_MINUS_DETECT_RE.test(ch) || allowedNonNumericKeys.has(ch),
			);
			if (!isValidCharacterString) return;
			const parsedValue = parseNumber(targetValue, locale, formatOptionsRef.current);
			setInputValue(targetValue);
			if (parsedValue !== null) {
				setValue(parsedValue, createChangeEventDetails(REASONS.inputChange, event));
			}
		},
		onKeyDown(event: any) {
			if (event.defaultPrevented || readOnly || disabled) return;
			const nativeEvent = event;
			const hadManualInput = !allowInputSyncRef.current;
			const allowedNonNumericKeys = getAllowedNonNumericKeys();
			let isAllowedNonNumericKey = allowedNonNumericKeys.has(event.key);
			const { decimal, currency, percentSign } = getNumberLocaleDetails(
				locale,
				formatOptionsRef.current,
			);
			const selectionStart = event.currentTarget.selectionStart;
			const selectionEnd = event.currentTarget.selectionEnd;
			const isAllSelected = selectionStart === 0 && selectionEnd === inputValue.length;
			const selectionContainsIndex = (index: number) =>
				selectionStart != null &&
				selectionEnd != null &&
				index >= selectionStart &&
				index < selectionEnd;

			const signGroups = [
				[ANY_MINUS_DETECT_RE, ANY_MINUS_RE],
				[ANY_PLUS_DETECT_RE, ANY_PLUS_RE],
			] as const;
			signGroups.forEach(([detectRe, globalRe]) => {
				if (
					detectRe.test(event.key) &&
					Array.from(allowedNonNumericKeys as Set<string>).some((k) => detectRe.test(k))
				) {
					const existingIndex = inputValue.search(globalRe);
					const isReplacingExisting = existingIndex !== -1 && selectionContainsIndex(existingIndex);
					isAllowedNonNumericKey =
						!(ANY_MINUS_DETECT_RE.test(inputValue) || ANY_PLUS_DETECT_RE.test(inputValue)) ||
						isAllSelected ||
						isReplacingExisting;
				}
			});
			[decimal, currency, percentSign].forEach((symbol) => {
				if (symbol && event.key === symbol) {
					const symbolIndex = inputValue.indexOf(symbol);
					const isSymbolHighlighted = selectionContainsIndex(symbolIndex);
					isAllowedNonNumericKey =
						!inputValue.includes(symbol) || isAllSelected || isSymbolHighlighted;
				}
			});

			const isNavigateKey = NAVIGATE_KEYS.has(event.key);
			const isStepKey = event.key === 'ArrowUp' || event.key === 'ArrowDown';
			if (
				event.which === 229 ||
				(event.altKey && !isStepKey) ||
				event.ctrlKey ||
				event.metaKey ||
				isAllowedNonNumericKey ||
				isNumeralChar(event.key) ||
				isNavigateKey
			) {
				return;
			}

			const willSetHome = event.key === 'Home' && min != null;
			const willSetEnd = event.key === 'End' && max != null;
			if (event.key.length > 1 && !isStepKey && !willSetHome && !willSetEnd) return;

			const currentValue = hadManualInput
				? parseNumber(inputValue, locale, formatOptionsRef.current)
				: null;
			const amount = getStepAmount(event);
			stopEvent(event);
			const commitDetails = createChangeEventDetails('keyboard' as any, nativeEvent);
			let changed = false;
			if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
				allowInputSyncRef.current = true;
				if (!hadManualInput) lastChangedValueRef.current = valueRef.current;
				changed = incrementValue(amount, {
					direction: event.key === 'ArrowUp' ? 1 : -1,
					currentValue,
					event: nativeEvent,
					reason: 'keyboard',
				});
			} else if (willSetHome) {
				allowInputSyncRef.current = true;
				changed = setValue(min, createChangeEventDetails('keyboard' as any, nativeEvent));
			} else if (willSetEnd) {
				allowInputSyncRef.current = true;
				changed = setValue(max, createChangeEventDetails('keyboard' as any, nativeEvent));
			}
			if (changed) onValueCommitted(lastChangedValueRef.current ?? valueRef.current, commitDetails);
		},
		onPaste(event: any) {
			if (event.defaultPrevented || readOnly || disabled) return;
			let pastedData = '';
			try {
				pastedData = event.clipboardData?.getData('text/plain') ?? '';
			} catch {
				return;
			}
			event.preventDefault();
			const input = event.currentTarget;
			const selectionStart = input.selectionStart ?? inputValue.length;
			const selectionEnd = input.selectionEnd ?? inputValue.length;
			const nextText =
				inputValue.slice(0, selectionStart) + pastedData + inputValue.slice(selectionEnd);
			const parsedValue = parseNumber(nextText, locale, formatOptionsRef.current);
			if (parsedValue !== null) {
				allowInputSyncRef.current = false;
				pendingCaretRef.current = selectionStart + pastedData.length;
				setValue(parsedValue, createChangeEventDetails('input-paste' as any, event));
				setInputValue(nextText);
			}
		},
	};

	return useRenderElement(
		'input',
		{ render, className, style },
		{
			ref: [ref, inputRef],
			state,
			props: [inputProps, elementProps, (p: any) => validation.getValidationProps(disabled, p)],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Stepper buttons ---------------------------------------------------------

function useNumberFieldButton(params: any): Record<string, any> {
	const {
		allowInputSyncRef,
		disabled,
		formatOptionsRef,
		getStepAmount,
		id,
		incrementValue,
		inputRef,
		inputValue,
		isIncrement,
		locale,
		readOnly,
		setValue,
		valueRef,
		lastChangedValueRef,
		onValueCommitted,
		slot,
	} = params;

	const pressReason = isIncrement ? REASONS.incrementPress : REASONS.decrementPress;

	function commitValue(nativeEvent: any) {
		const shouldCommitInputValue = !allowInputSyncRef.current;
		allowInputSyncRef.current = true;
		if (!shouldCommitInputValue) {
			lastChangedValueRef.current = valueRef.current;
			return;
		}
		const parsedValue = parseNumber(inputValue, locale, formatOptionsRef.current);
		if (parsedValue !== null) {
			const details = createChangeEventDetails(pressReason, nativeEvent);
			setValue(parsedValue, details);
			if (!details.isCanceled) valueRef.current = parsedValue;
		}
	}

	const { pointerHandlers, shouldSkipClick } = usePressAndHold({
		disabled: disabled || readOnly,
		elementRef: inputRef,
		tickDelay: CHANGE_VALUE_TICK_DELAY,
		startDelay: START_AUTO_CHANGE_DELAY,
		scrollDistance: SCROLLING_POINTER_MOVE_DISTANCE,
		tick(triggerEvent?: any) {
			const amount = getStepAmount(triggerEvent);
			return incrementValue(amount, {
				direction: isIncrement ? 1 : -1,
				event: triggerEvent,
				reason: pressReason,
			});
		},
		onStop(nativeEvent: any) {
			const committed = lastChangedValueRef.current ?? valueRef.current;
			onValueCommitted(committed, createChangeEventDetails(pressReason, nativeEvent));
		},
	});

	return {
		disabled,
		'aria-label': isIncrement ? 'Increase' : 'Decrease',
		'aria-controls': id,
		tabIndex: -1,
		style: { WebkitUserSelect: 'none', userSelect: 'none' },
		...pointerHandlers,
		onClick(event: any) {
			const isDisabled = disabled || readOnly;
			if (event.defaultPrevented || isDisabled || shouldSkipClick(event)) return;
			commitValue(event);
			const amount = getStepAmount(event);
			const prev = valueRef.current;
			incrementValue(amount, { direction: isIncrement ? 1 : -1, event, reason: pressReason });
			const committed = lastChangedValueRef.current ?? valueRef.current;
			if (committed !== prev) {
				onValueCommitted(committed, createChangeEventDetails(pressReason, event));
			}
		},
		onPointerDown(event: any) {
			const isMainButton = !event.button || event.button === 0;
			if (event.defaultPrevented || readOnly || !isMainButton || disabled) return;
			commitValue(event);
			lastChangedValueRef.current = null;
			if (!isTouchLikePointerType(event.pointerType)) inputRef.current?.focus();
			pointerHandlers.onPointerDown(event);
		},
		_slot: slot,
	};
}

function useNumberFieldStepperButton(componentProps: any, isIncrement: boolean, slot: symbol): any {
	const {
		render,
		className,
		disabled: disabledProp = false,
		nativeButton = true,
		style,
		ref,
		...elementProps
	} = componentProps;
	const ctx = useNumberFieldRootContext();
	const { disabled: contextDisabled, maxWithDefault, minWithDefault, readOnly, state, value } = ctx;

	const isAtBoundary =
		value != null && (isIncrement ? value >= maxWithDefault : value <= minWithDefault);
	const disabled = disabledProp || contextDisabled || isAtBoundary;

	const buttonProps = useNumberFieldButton({ ...ctx, isIncrement, disabled, slot });

	const { getButtonProps, buttonRef } = useButton(
		{ disabled: disabled || readOnly, native: nativeButton, focusableWhenDisabled: true },
		subSlot(slot, 'button'),
	);

	const buttonState = { ...state, disabled };

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			ref: [ref, buttonRef],
			state: buttonState,
			props: [buttonProps, elementProps, getButtonProps],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

function NumberFieldIncrement(props: any): any {
	return useNumberFieldStepperButton(props, true, S('NumberFieldIncrement'));
}

function NumberFieldDecrement(props: any): any {
	return useNumberFieldStepperButton(props, false, S('NumberFieldDecrement'));
}

// --- Namespace (mirrors `export * as NumberField`) ---------------------------

export const NumberField = {
	Root: NumberFieldRoot,
	Group: NumberFieldGroup,
	Input: NumberFieldInput,
	Increment: NumberFieldIncrement,
	Decrement: NumberFieldDecrement,
};
