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
 * Is form touched config interface.
 */
export interface IsFormTouchedConfig {
  /**
   * The path to a field. Leave undefined to check the entire form.
   */
  readonly path?: undefined;
}

/**
 * Is field touched config interface.
 */
export interface IsFieldTouchedConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to check for being touched.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Checks whether a specific field or the entire form is touched by walking
 * through the field store and all its descendants. A field is touched once it
 * has received and lost focus.
 *
 * @param form The form store to check for being touched.
 *
 * @returns Whether the field or form is touched.
 */
export function isTouched<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): boolean;

/**
 * Checks whether a specific field or the entire form is touched by walking
 * through the field store and all its descendants. A field is touched once it
 * has received and lost focus.
 *
 * @param form The form store to check for being touched.
 * @param config The is touched configuration.
 *
 * @returns Whether the field or form is touched.
 */
export function isTouched<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? IsFieldTouchedConfig<TSchema, TFieldPath>
    : IsFormTouchedConfig
): boolean;

// @__NO_SIDE_EFFECTS__
export function isTouched(
  form: BaseFormStore,
  config?: IsFormTouchedConfig | IsFieldTouchedConfig<FormSchema, RequiredPath>
): boolean {
  return getFieldBool(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    'isTouched'
  );
}
