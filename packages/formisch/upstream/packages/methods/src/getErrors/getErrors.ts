import {
  type BaseFormStore,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type RequiredPath,
  type ValidPath,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Get form errors config interface.
 */
export interface GetFormErrorsConfig {
  /**
   * The path to a field. Leave undefined to get form-level errors.
   */
  readonly path?: undefined;
}

/**
 * Get field errors config interface.
 */
export interface GetFieldErrorsConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to retrieve errors from.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Retrieves error messages from the form. When called without a config,
 * returns form-level errors. When called with a path, returns errors for
 * that specific field.
 *
 * @param form The form store to retrieve errors from.
 *
 * @returns A non-empty array of error messages, or null if no errors exist.
 */
export function getErrors<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): [string, ...string[]] | null;

/**
 * Retrieves error messages from the form. When called without a config,
 * returns form-level errors. When called with a path, returns errors for
 * that specific field.
 *
 * @param form The form store to retrieve errors from.
 * @param config The get errors configuration.
 *
 * @returns A non-empty array of error messages, or null if no errors exist.
 */
export function getErrors<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? GetFieldErrorsConfig<TSchema, TFieldPath>
    : GetFormErrorsConfig
): [string, ...string[]] | null;

// @__NO_SIDE_EFFECTS__
export function getErrors(
  form: BaseFormStore,
  config?: GetFormErrorsConfig | GetFieldErrorsConfig<FormSchema, RequiredPath>
): [string, ...string[]] | null {
  return (
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL]
  ).errors.value;
}
