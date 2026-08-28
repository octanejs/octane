import {
  type BaseFormStore,
  type FormSchema,
  getFieldBool,
  getFieldStore,
  INTERNAL,
  type RequiredPath,
  type ValidPath,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Is form valid config interface.
 */
export interface IsFormValidConfig {
  /**
   * The path to a field. Leave undefined to check the entire form.
   */
  readonly path?: undefined;
}

/**
 * Is field valid config interface.
 */
export interface IsFieldValidConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to check for validity.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Checks whether a specific field or the entire form is valid by walking
 * through the field store and all its descendants. A field is valid when
 * neither it nor any of its descendants contains an error. Form-level errors
 * are included.
 *
 * @param form The form store to check for validity.
 *
 * @returns Whether the field or form is valid.
 */
export function isValid<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): boolean;

/**
 * Checks whether a specific field or the entire form is valid by walking
 * through the field store and all its descendants. A field is valid when
 * neither it nor any of its descendants contains an error. Form-level errors
 * are included.
 *
 * @param form The form store to check for validity.
 * @param config The is valid configuration.
 *
 * @returns Whether the field or form is valid.
 */
export function isValid<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? IsFieldValidConfig<TSchema, TFieldPath>
    : IsFormValidConfig
): boolean;

// @__NO_SIDE_EFFECTS__
export function isValid(
  form: BaseFormStore,
  config?: IsFormValidConfig | IsFieldValidConfig<FormSchema, RequiredPath>
): boolean {
  return !getFieldBool(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    'errors'
  );
}
