// Ported from .base-ui/packages/react/src/field/root/useFieldValidation.ts. The field's
// validation state machine: runs native constraint validation + a custom `validate` fn on
// commit/change (debounced), tracks a registry of inputs (for checkbox groups), and produces
// `getValidationProps` (aria-invalid + aria-describedby). Framework-agnostic logic; octane
// hooks are slot-threaded.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useCallback, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { mergeProps } from '../mergeProps';
import { useTimeout } from '../useTimeout';
import { useRefWithInit } from '../useRefWithInit';
import { useStableCallback } from '../useStableCallback';
import { DEFAULT_VALIDITY_STATE, type FieldValidityData, type FieldRootState } from './constants';
import { getCombinedFieldValidityData } from './getCombinedFieldValidityData';
import { useFormContext } from './FormContext';
import { useLabelableContext } from './LabelableContext';

const validityKeys = Object.keys(DEFAULT_VALIDITY_STATE) as Array<keyof ValidityState>;

function isOnlyValueMissing(state: Record<string, boolean> | undefined): boolean {
	if (!state || state.valid || !state.valueMissing) {
		return false;
	}
	let onlyValueMissing = false;
	for (const key of validityKeys) {
		if (key === 'valid') {
			continue;
		}
		if (key === 'valueMissing') {
			onlyValueMissing = state[key];
		} else if (state[key]) {
			onlyValueMissing = false;
		}
	}
	return onlyValueMissing;
}

function findRepresentativeInput(inputs: Set<HTMLInputElement>): HTMLInputElement | null {
	let fallback: HTMLInputElement | null = null;
	for (const input of inputs) {
		if (input.disabled) {
			continue;
		}
		if (!input.validity.valid) {
			return input;
		}
		fallback ??= input;
	}
	return fallback;
}

function clearCustomValidity(element: HTMLInputElement, inputs: Set<HTMLInputElement>): void {
	let didClearElement = false;
	for (const input of inputs) {
		input.setCustomValidity('');
		didClearElement ||= input === element;
	}
	if (!didClearElement) {
		element.setCustomValidity('');
	}
}

export interface UseFieldValidationParameters {
	setValidityData: (data: FieldValidityData) => void;
	validate: (value: unknown, formValues: Record<string, unknown>) => any;
	validityData: FieldValidityData;
	validationDebounceTime: number;
	invalid: boolean;
	markedDirtyRef: { current: boolean };
	state: FieldRootState;
	shouldValidateOnChange: () => boolean;
	getRegisteredFieldId: () => string | undefined;
}

export function useFieldValidation(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFieldValidation');
	const params = user[0] as UseFieldValidationParameters;
	const { formRef } = useFormContext();
	const {
		setValidityData,
		validate,
		validityData,
		validationDebounceTime,
		invalid,
		markedDirtyRef,
		state,
		shouldValidateOnChange,
		getRegisteredFieldId,
	} = params;

	const { controlId, getDescriptionProps } = useLabelableContext();

	const timeout = useTimeout(subSlot(slot, 'timeout'));
	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const registeredInputs = useRefWithInit<Set<HTMLInputElement>>(
		() => new Set(),
		subSlot(slot, 'registered'),
	).current;
	const validationCommitIdRef = useRef(0, subSlot(slot, 'commitId'));

	const registerInput = useCallback(
		(element: HTMLInputElement | null) => {
			if (!element) {
				return undefined;
			}
			registeredInputs.add(element);
			return () => {
				registeredInputs.delete(element);
			};
		},
		[registeredInputs],
		subSlot(slot, 'registerInput'),
	);

	const commit = useStableCallback(
		async (value: unknown, revalidate = false) => {
			const element = findRepresentativeInput(registeredInputs) ?? inputRef.current;
			if (!element) {
				return;
			}

			validationCommitIdRef.current += 1;
			const validationCommitId = validationCommitIdRef.current;

			function updateRegisteredFieldValidity(
				nextValidityData: FieldValidityData,
				externalInvalid = invalid,
			): void {
				const fieldId = getRegisteredFieldId() ?? controlId;
				if (fieldId == null) {
					return;
				}
				const currentFieldData = formRef.current.fields.get(fieldId);
				if (!currentFieldData) {
					return;
				}
				const validityDataWithFormErrors = getCombinedFieldValidityData(
					nextValidityData,
					externalInvalid,
				);
				formRef.current.fields.set(fieldId, {
					...currentFieldData,
					validityData: validityDataWithFormErrors,
				});
			}

			if (revalidate) {
				if (state.valid !== false) {
					return;
				}
				const currentNativeValidity = element.validity;
				if (!currentNativeValidity.valueMissing) {
					const nextValidityData: FieldValidityData = {
						value,
						state: { ...DEFAULT_VALIDITY_STATE, valid: true },
						error: '',
						errors: [],
						initialValue: validityData.initialValue,
					};
					clearCustomValidity(element, registeredInputs);
					updateRegisteredFieldValidity(nextValidityData, false);
					setValidityData(nextValidityData);
					return;
				}
				const currentNativeValidityObject = validityKeys.reduce(
					(acc, key) => {
						acc[key] = currentNativeValidity[key];
						return acc;
					},
					{} as Record<string, boolean>,
				);
				if (
					!currentNativeValidityObject.valid &&
					!isOnlyValueMissing(currentNativeValidityObject)
				) {
					return;
				}
			}

			function getState(el: HTMLInputElement): Record<string, boolean> {
				const computedState = validityKeys.reduce(
					(acc, key) => {
						acc[key] = el.validity[key];
						return acc;
					},
					{} as Record<string, boolean>,
				);
				let hasOnlyValueMissingError = false;
				for (const key of validityKeys) {
					if (key === 'valid') {
						continue;
					}
					if (key === 'valueMissing' && computedState[key]) {
						hasOnlyValueMissingError = true;
					} else if (computedState[key]) {
						return computedState;
					}
				}
				if (hasOnlyValueMissingError && !markedDirtyRef.current) {
					computedState.valid = true;
					computedState.valueMissing = false;
				}
				return computedState;
			}

			timeout.clear();

			let result: null | string | string[] = null;
			let validationErrors: string[] = [];
			const nextState = getState(element);
			let defaultValidationMessage: string | undefined;
			const isValidatingOnChange = shouldValidateOnChange();

			if (element.validationMessage && !isValidatingOnChange) {
				defaultValidationMessage = element.validationMessage;
				validationErrors = [element.validationMessage];
			} else {
				const formValues = Array.from(formRef.current.fields.values()).reduce(
					(acc: Record<string, unknown>, field: any) => {
						if (field.name) {
							acc[field.name] = field.getValue();
						}
						return acc;
					},
					{} as Record<string, unknown>,
				);
				const resultOrPromise = validate(value, formValues);
				if (
					typeof resultOrPromise === 'object' &&
					resultOrPromise !== null &&
					'then' in resultOrPromise
				) {
					result = await resultOrPromise;
					if (validationCommitId !== validationCommitIdRef.current) {
						return;
					}
				} else {
					result = resultOrPromise;
				}

				if (result !== null) {
					nextState.valid = false;
					nextState.customError = true;
					if (Array.isArray(result)) {
						validationErrors = result;
						element.setCustomValidity(result.join('\n'));
					} else if (result) {
						validationErrors = [result];
						element.setCustomValidity(result);
					}
				} else if (isValidatingOnChange) {
					clearCustomValidity(element, registeredInputs);
					nextState.customError = false;
					if (element.validationMessage) {
						defaultValidationMessage = element.validationMessage;
						validationErrors = [element.validationMessage];
					} else if (element.validity.valid && !nextState.valid) {
						nextState.valid = true;
					}
				}
			}

			const nextValidityData: FieldValidityData = {
				value,
				state: nextState as any,
				error: defaultValidationMessage ?? (Array.isArray(result) ? result[0] : (result ?? '')),
				errors: validationErrors,
				initialValue: validityData.initialValue,
			};

			updateRegisteredFieldValidity(nextValidityData);
			setValidityData(nextValidityData);
		},
		subSlot(slot, 'commit'),
	);

	const change = useStableCallback(
		(value: unknown) => {
			timeout.clear();
			const validateOnChange = shouldValidateOnChange();
			if (validateOnChange && value !== '' && validationDebounceTime) {
				validationCommitIdRef.current += 1;
				timeout.start(validationDebounceTime, () => {
					commit(value);
				});
			} else {
				commit(value, !validateOnChange);
			}
		},
		subSlot(slot, 'change'),
	);

	const getValidationProps = useCallback(
		(disabled: boolean, externalProps: Record<string, any> = {}) =>
			mergeProps(
				getDescriptionProps(externalProps),
				state.valid === false && !state.disabled && !disabled ? { 'aria-invalid': true } : {},
			),
		[getDescriptionProps, state.disabled, state.valid],
		subSlot(slot, 'getValidationProps'),
	);

	return useMemo(
		() => ({ getValidationProps, inputRef, registerInput, commit, change }),
		[getValidationProps, registerInput, commit, change],
		subSlot(slot, 'return'),
	);
}
