// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/form/useFormValidation.ts).
// octane adaptations:
// - `react-stately/private/form/useFormValidationState` → the ported
//   `../stately/form/useFormValidationState`.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; upstream's
//   dep-less `useLayoutEffect` becomes an explicit `null`; the explicit
//   `[ref, validationBehavior]` effect deps are preserved exactly.
// - The native `invalid`/`change`/`reset` listeners are direct `addEventListener` wiring
//   (never a synthetic layer), exactly like upstream: native `change` is the platform's
//   value-commit event, so it is NOT renamed to `input` (the onInput rule covers event
//   *props* on text controls, not native commit listeners).
// - The `form.reset` interception ports verbatim: upstream added it to ignore React
//   server-action auto-resets; in octane it still (harmlessly) ignores programmatic
//   `form.reset()` calls that occur outside a user event.
import type { RefObject, Validation, ValidationResult } from '@react-types/shared';
import { useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import type { FormValidationState } from '../stately/form/useFormValidationState';
import { setInteractionModality } from '../interactions/useFocusVisible';
import { getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { useEffectEvent } from '../utils/useEffectEvent';
import { useLayoutEffect } from '../utils/useLayoutEffect';

type ValidatableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface FormValidationProps<T> extends Validation<T> {
	focus?: () => void;
}

export function useFormValidation<T>(
	props: FormValidationProps<T>,
	state: FormValidationState,
	ref: RefObject<ValidatableElement | null> | undefined,
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFormValidation<T>(
	props: FormValidationProps<T>,
	state: FormValidationState,
	ref: RefObject<ValidatableElement | null> | undefined,
	slot: symbol | undefined,
): void;
export function useFormValidation(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFormValidation');
	const props = user[0] as FormValidationProps<any>;
	const state = user[1] as FormValidationState;
	const ref = user[2] as RefObject<ValidatableElement | null> | undefined;

	let { validationBehavior, focus } = props;

	// This is a useLayoutEffect so that it runs before the useEffect in useFormValidationState, which commits the validation change.
	useLayoutEffect(
		() => {
			if (
				validationBehavior === 'native' &&
				ref?.current &&
				'setCustomValidity' in ref.current &&
				!ref.current.disabled
			) {
				let errorMessage = state.realtimeValidation.isInvalid
					? state.realtimeValidation.validationErrors.join(' ') || 'Invalid value.'
					: '';
				ref.current.setCustomValidity(errorMessage);

				// Prevent default tooltip for validation message.
				// https://bugzilla.mozilla.org/show_bug.cgi?id=605277
				if (!ref.current.hasAttribute('title')) {
					ref.current.title = '';
				}

				if (!state.realtimeValidation.isInvalid) {
					state.updateValidation(getNativeValidity(ref.current));
				}
			}
		},
		null,
		subSlot(slot, 'native'),
	);

	let isIgnoredReset = useRef(false, subSlot(slot, 'ignoredReset'));
	let onReset = useEffectEvent(
		() => {
			if (!isIgnoredReset.current) {
				state.resetValidation();
			}
		},
		subSlot(slot, 'reset'),
	);

	let onInvalid = useEffectEvent(
		(e: Event) => {
			// Only commit validation if we are not already displaying one.
			// This avoids clearing server errors that the user didn't actually fix.
			if (!state.displayValidation.isInvalid) {
				state.commitValidation();
			}

			// Auto focus the first invalid input in a form, unless the error already had its default prevented.
			let form = ref?.current?.form;
			if (!e.defaultPrevented && ref && form && getFirstInvalidInput(form) === ref.current) {
				if (focus) {
					focus();
				} else {
					ref.current?.focus();
				}

				// Always show focus ring.
				setInteractionModality('keyboard');
			}

			// Prevent default browser error UI from appearing.
			e.preventDefault();
		},
		subSlot(slot, 'invalid'),
	);

	let onChange = useEffectEvent(
		() => {
			state.commitValidation();
		},
		subSlot(slot, 'change'),
	);

	useEffect(
		() => {
			let input = ref?.current;
			if (!input) {
				return;
			}

			let form = input.form;

			let reset = form?.reset;
			if (form) {
				// Try to detect React's automatic form reset behavior so we don't clear
				// validation errors that are returned by server actions.
				// To do this, we ignore programmatic form resets that occur outside a user event.
				// This is best-effort. There may be false positives, e.g. setTimeout.
				form.reset = () => {
					// React uses MessageChannel for scheduling, so ignore 'message' events.
					isIgnoredReset.current =
						!window.event ||
						(window.event.type === 'message' &&
							getEventTarget(window.event) instanceof MessagePort);
					reset?.call(form);
					isIgnoredReset.current = false;
				};
			}

			input.addEventListener('invalid', onInvalid);
			input.addEventListener('change', onChange);
			form?.addEventListener('reset', onReset);
			return () => {
				input!.removeEventListener('invalid', onInvalid);
				input!.removeEventListener('change', onChange);
				form?.removeEventListener('reset', onReset);
				if (form) {
					// @ts-ignore
					form.reset = reset;
				}
			};
		},
		[ref, validationBehavior],
		subSlot(slot, 'listen'),
	);
}

function getValidity(input: ValidatableElement) {
	// The native ValidityState object is live, meaning each property is a getter that returns the current state.
	// We need to create a snapshot of the validity state at the time this function is called to avoid unpredictable React renders.
	let validity = input.validity;
	return {
		badInput: validity.badInput,
		customError: validity.customError,
		patternMismatch: validity.patternMismatch,
		rangeOverflow: validity.rangeOverflow,
		rangeUnderflow: validity.rangeUnderflow,
		stepMismatch: validity.stepMismatch,
		tooLong: validity.tooLong,
		tooShort: validity.tooShort,
		typeMismatch: validity.typeMismatch,
		valueMissing: validity.valueMissing,
		valid: validity.valid,
	};
}

function getNativeValidity(input: ValidatableElement): ValidationResult {
	return {
		isInvalid: !input.validity.valid,
		validationDetails: getValidity(input),
		validationErrors: input.validationMessage ? [input.validationMessage] : [],
	};
}

function getFirstInvalidInput(form: HTMLFormElement): ValidatableElement | null {
	for (let i = 0; i < form.elements.length; i++) {
		let element = form.elements[i] as ValidatableElement;
		if (element.validity?.valid === false) {
			return element;
		}
	}

	return null;
}
