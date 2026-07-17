// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/form/useFormValidationState.ts).
// octane adaptations:
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; explicit dep
//   arrays are preserved exactly, and upstream's dep-less `useEffect(commitValidation)`
//   becomes an explicit `null` (run after every render).
// - The private group-state prop path returns before any hooks run — legal in octane
//   (hooks are slot-keyed, not order-keyed), so upstream's eslint-suppressed structure
//   ports as-is. `privateValidationStateProp` keeps upstream's exact string: it must be
//   stable across server/client module evaluation for SSR hydration.
// - `ValidityState` writes/reads through dynamic keys cast via `Record<string, any>`
//   (upstream relies on looser index typing).
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'octane';
import type {
	Validation,
	ValidationErrors,
	ValidationFunction,
	ValidationResult,
} from '@react-types/shared';

import { S, splitSlot, subSlot } from '../../internal';

export const VALID_VALIDITY_STATE: ValidityState = {
	badInput: false,
	customError: false,
	patternMismatch: false,
	rangeOverflow: false,
	rangeUnderflow: false,
	stepMismatch: false,
	tooLong: false,
	tooShort: false,
	typeMismatch: false,
	valueMissing: false,
	valid: true,
};

const CUSTOM_VALIDITY_STATE: ValidityState = {
	...VALID_VALIDITY_STATE,
	customError: true,
	valid: false,
};

export const DEFAULT_VALIDATION_RESULT: ValidationResult = {
	isInvalid: false,
	validationDetails: VALID_VALIDITY_STATE,
	validationErrors: [],
};

export const FormValidationContext = createContext<ValidationErrors>({});

// Private props that we pass from useFormValidationState to children.
// Ideally we'd use a Symbol for this, but React doesn't support them: https://github.com/facebook/react/issues/7552
// This needs to be stable across server and client module evaluation for SSR hydration.
export const privateValidationStateProp: string = '__reactAriaFormValidationState';

interface FormValidationProps<T> extends Validation<T> {
	builtinValidation?: ValidationResult;
	name?: string | string[];
	value: T | null;
}

export interface FormValidationState {
	/** Realtime validation results, updated as the user edits the value. */
	realtimeValidation: ValidationResult;
	/** Currently displayed validation results, updated when the user commits their changes. */
	displayValidation: ValidationResult;
	/**
	 * Updates the current validation result. Not displayed to the user until `commitValidation` is
	 * called.
	 */
	updateValidation(result: ValidationResult): void;
	/** Resets the displayed validation state to valid when the user resets the form. */
	resetValidation(): void;
	/** Commits the realtime validation so it is displayed to the user. */
	commitValidation(): void;
}

export function useFormValidationState<T>(props: FormValidationProps<T>): FormValidationState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFormValidationState<T>(
	props: FormValidationProps<T>,
	slot: symbol | undefined,
): FormValidationState;
export function useFormValidationState(...args: any[]): FormValidationState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFormValidationState');
	const props = user[0] as FormValidationProps<any>;

	// Private prop for parent components to pass state to children.
	if ((props as any)[privateValidationStateProp]) {
		let {
			realtimeValidation,
			displayValidation,
			updateValidation,
			resetValidation,
			commitValidation,
		} = (props as any)[privateValidationStateProp] as FormValidationState;
		return {
			realtimeValidation,
			displayValidation,
			updateValidation,
			resetValidation,
			commitValidation,
		};
	}

	return useFormValidationStateImpl(props, slot);
}

function useFormValidationStateImpl<T>(
	props: FormValidationProps<T>,
	slot: symbol | undefined,
): FormValidationState {
	let {
		isInvalid,
		validationState,
		name,
		value,
		builtinValidation,
		validate,
		validationBehavior = 'aria',
	} = props;

	// backward compatibility.
	if (validationState) {
		isInvalid ||= validationState === 'invalid';
	}

	// If the isInvalid prop is controlled, update validation result in realtime.
	let controlledError: ValidationResult | null =
		isInvalid !== undefined
			? {
					isInvalid,
					validationErrors: [],
					validationDetails: CUSTOM_VALIDITY_STATE,
				}
			: null;

	// Perform custom client side validation.
	let clientError: ValidationResult | null = useMemo(
		() => {
			if (!validate || value == null) {
				return null;
			}
			let validateErrors = runValidate(validate, value);
			return getValidationResult(validateErrors);
		},
		[validate, value],
		subSlot(slot, 'client'),
	);

	if (builtinValidation?.validationDetails.valid) {
		builtinValidation = undefined;
	}

	// Get relevant server errors from the form.
	let serverErrors = useContext(FormValidationContext);
	let serverErrorMessages = useMemo(
		() => {
			if (name) {
				return Array.isArray(name)
					? name.flatMap((name) => asArray(serverErrors[name]))
					: asArray(serverErrors[name]);
			}
			return [];
		},
		[serverErrors, name],
		subSlot(slot, 'serverMessages'),
	);

	// Show server errors when the form gets a new value, and clear when the user changes the value.
	let [lastServerErrors, setLastServerErrors] = useState(serverErrors, subSlot(slot, 'lastServer'));
	let [isServerErrorCleared, setServerErrorCleared] = useState(
		false,
		subSlot(slot, 'serverCleared'),
	);
	if (serverErrors !== lastServerErrors) {
		setLastServerErrors(serverErrors);
		setServerErrorCleared(false);
	}

	let serverError: ValidationResult | null = useMemo(
		() => getValidationResult(isServerErrorCleared ? [] : serverErrorMessages),
		[isServerErrorCleared, serverErrorMessages],
		subSlot(slot, 'server'),
	);

	// Track the next validation state in a ref until commitValidation is called.
	let nextValidation = useRef(DEFAULT_VALIDATION_RESULT, subSlot(slot, 'next'));
	let [currentValidity, setCurrentValidity] = useState(
		DEFAULT_VALIDATION_RESULT,
		subSlot(slot, 'current'),
	);

	let lastError = useRef(DEFAULT_VALIDATION_RESULT, subSlot(slot, 'lastError'));
	let commitValidation = () => {
		if (!commitQueued) {
			return;
		}

		setCommitQueued(false);
		let error = clientError || builtinValidation || nextValidation.current;
		if (!isEqualValidation(error, lastError.current)) {
			lastError.current = error;
			setCurrentValidity(error);
		}
	};

	let [commitQueued, setCommitQueued] = useState(false, subSlot(slot, 'queued'));
	useEffect(commitValidation, null, subSlot(slot, 'commit'));

	// realtimeValidation is used to update the native input element's state based on custom validation logic.
	// displayValidation is the currently displayed validation state that the user sees (e.g. on input change/form submit).
	// With validationBehavior="aria", all errors are displayed in realtime rather than on submit.
	let realtimeValidation =
		controlledError || serverError || clientError || builtinValidation || DEFAULT_VALIDATION_RESULT;
	let displayValidation =
		validationBehavior === 'native'
			? controlledError || serverError || currentValidity
			: controlledError || serverError || clientError || builtinValidation || currentValidity;

	return {
		realtimeValidation,
		displayValidation,
		updateValidation(value) {
			// If validationBehavior is 'aria', update in realtime. Otherwise, store in a ref until commit.
			if (validationBehavior === 'aria' && !isEqualValidation(currentValidity, value)) {
				setCurrentValidity(value);
			} else {
				nextValidation.current = value;
			}
		},
		resetValidation() {
			// Update the currently displayed validation state to valid on form reset,
			// even if the native validity says it isn't. It'll show again on the next form submit.
			let error = DEFAULT_VALIDATION_RESULT;
			if (!isEqualValidation(error, lastError.current)) {
				lastError.current = error;
				setCurrentValidity(error);
			}

			// Do not commit validation after the next render. This avoids a condition where
			// useSelect calls commitValidation inside an onReset handler.
			if (validationBehavior === 'native') {
				setCommitQueued(false);
			}

			setServerErrorCleared(true);
		},
		commitValidation() {
			// Commit validation state so the user sees it on blur/change/submit. Also clear any server errors.
			// Wait until after the next render to commit so that the latest value has been validated.
			if (validationBehavior === 'native') {
				setCommitQueued(true);
			}
			setServerErrorCleared(true);
		},
	};
}

function asArray<T>(v: T | T[]): T[] {
	if (!v) {
		return [];
	}

	return Array.isArray(v) ? v : [v];
}

function runValidate<T>(validate: ValidationFunction<T>, value: T): string[] {
	if (typeof validate === 'function') {
		let e = validate(value);
		if (e && typeof e !== 'boolean') {
			return asArray(e);
		}
	}

	return [];
}

function getValidationResult(errors: string[]): ValidationResult | null {
	return errors.length
		? {
				isInvalid: true,
				validationErrors: errors,
				validationDetails: CUSTOM_VALIDITY_STATE,
			}
		: null;
}

function isEqualValidation(a: ValidationResult | null, b: ValidationResult | null): boolean {
	if (a === b) {
		return true;
	}

	return (
		!!a &&
		!!b &&
		a.isInvalid === b.isInvalid &&
		a.validationErrors.length === b.validationErrors.length &&
		a.validationErrors.every((a, i) => a === b.validationErrors[i]) &&
		Object.entries(a.validationDetails).every(
			([k, v]) => (b.validationDetails as unknown as Record<string, any>)[k] === v,
		)
	);
}

export function mergeValidation(...results: ValidationResult[]): ValidationResult {
	let errors = new Set<string>();
	let isInvalid = false;
	let validationDetails: Record<string, any> = {
		...VALID_VALIDITY_STATE,
	};

	for (let v of results) {
		for (let e of v.validationErrors) {
			errors.add(e);
		}

		// Only these properties apply for checkboxes.
		isInvalid ||= v.isInvalid;
		for (let key in validationDetails) {
			validationDetails[key] ||= (v.validationDetails as unknown as Record<string, any>)[key];
		}
	}

	validationDetails.valid = !isInvalid;
	return {
		isInvalid,
		validationErrors: [...errors],
		validationDetails: validationDetails as unknown as ValidityState,
	};
}
