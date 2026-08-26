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
 * Set form errors config interface.
 */
export interface SetFormErrorsConfig {
  /**
   * The path to a field. Leave undefined to set form-level errors.
   */
  readonly path?: undefined;
  /**
   * The error messages to set, or null to clear errors.
   */
  readonly errors: [string, ...string[]] | null;
}

/**
 * Set field errors config interface.
 */
export interface SetFieldErrorsConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to set errors on.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
  /**
   * The error messages to set, or null to clear errors.
   */
  readonly errors: [string, ...string[]] | null;
}

/**
 * Sets or clears error messages on the form or a specific field. This is
 * useful for setting custom validation errors that don't come from schema
 * validation.
 *
 * @param form The form store to set errors on.
 * @param config The set errors configuration specifying the path and error messages.
 */
export function setErrors<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? SetFieldErrorsConfig<TSchema, TFieldPath>
    : SetFormErrorsConfig
): void;

export function setErrors(
  form: BaseFormStore,
  config: SetFormErrorsConfig | SetFieldErrorsConfig<FormSchema, RequiredPath>
): void {
  (config.path
    ? getFieldStore(form[INTERNAL], config.path)
    : form[INTERNAL]
  ).errors.value = config.errors;
}
