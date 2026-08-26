import {
  type BaseFormStore,
  type FormSchema,
  INTERNAL,
  validateFormInput,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Validate form config interface.
 */
export interface ValidateFormConfig {
  /**
   * Whether to focus the first field with errors after validation. Defaults to false.
   */
  readonly shouldFocus?: boolean | undefined;
}

/**
 * Validates the entire form input against its schema. Returns a safe parse result
 * indicating success or failure with detailed issues. Optionally focuses the first
 * field with validation errors.
 *
 * @param form The form store to validate.
 * @param config The validate form configuration specifying focus behavior.
 *
 * @returns A promise resolving to the validation result.
 */
export function validate<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>,
  config?: ValidateFormConfig
): Promise<v.SafeParseResult<TSchema>> {
  return validateFormInput(form[INTERNAL], config) as Promise<
    v.SafeParseResult<TSchema>
  >;
}
