import { getFieldBool } from '../../field/index.ts';
import { untrack } from '../../framework/index.ts';
import type {
  InternalFieldStore,
  InternalFormStore,
  ValidationMode,
} from '../../types/index.ts';
import { validateFormInput } from '../validateFormInput/validateFormInput.ts';

/**
 * Validates the form input if required based on the validation mode and form
 * state. Determines whether to use initial validation mode, revalidation mode,
 * or skip validation entirely.
 *
 * @param internalFormStore The form store to validate.
 * @param internalFieldStore The field store that triggered validation.
 * @param validationMode The validation mode that triggered this check.
 */
export function validateIfRequired(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  validationMode: ValidationMode
): void {
  if (
    validationMode ===
    (internalFormStore.validate === 'initial' ||
    (internalFormStore.validate === 'submit'
      ? untrack(() => internalFormStore.isSubmitted.value)
      : untrack(() => getFieldBool(internalFieldStore, 'errors')))
      ? internalFormStore.revalidate
      : internalFormStore.validate)
  ) {
    validateFormInput(internalFormStore);
  }
}
