import {
  type BaseFormStore,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type RequiredPath,
  type ValidPath,
  walkFieldStore,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Get form deep errors config interface.
 */
export interface GetFormDeepErrorsConfig {
  /**
   * The path to a field. Leave undefined to get the errors of the entire form.
   */
  readonly path?: undefined;
}

/**
 * Get field deep errors config interface.
 */
export interface GetFieldDeepErrorsConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to retrieve the errors from.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Retrieves all error messages of a specific field or the entire form by
 * walking through the field store and all its descendants. This is useful for
 * displaying a summary of all validation errors within a section or the whole
 * form. Form-level errors are included.
 *
 * @param form The form store to retrieve errors from.
 *
 * @returns A non-empty array of error messages, or null if no errors exist.
 */
export function getDeepErrors<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): [string, ...string[]] | null;

/**
 * Retrieves all error messages of a specific field or the entire form by
 * walking through the field store and all its descendants. This is useful for
 * displaying a summary of all validation errors within a section or the whole
 * form. Form-level errors are included.
 *
 * @param form The form store to retrieve errors from.
 * @param config The get deep errors configuration.
 *
 * @returns A non-empty array of error messages, or null if no errors exist.
 */
export function getDeepErrors<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? GetFieldDeepErrorsConfig<TSchema, TFieldPath>
    : GetFormDeepErrorsConfig
): [string, ...string[]] | null;

// @__NO_SIDE_EFFECTS__
export function getDeepErrors(
  form: BaseFormStore,
  config?:
    | GetFormDeepErrorsConfig
    | GetFieldDeepErrorsConfig<FormSchema, RequiredPath>
): [string, ...string[]] | null {
  let deepErrors: [string, ...string[]] | null = null;
  walkFieldStore(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    (internalFieldStore) => {
      const errors = internalFieldStore.errors.value;
      if (errors) {
        if (deepErrors) {
          deepErrors.push(...errors);
        } else {
          deepErrors = [...errors];
        }
      }
    }
  );
  return deepErrors;
}
