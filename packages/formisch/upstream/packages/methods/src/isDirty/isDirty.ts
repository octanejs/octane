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
 * Is form dirty config interface.
 */
export interface IsFormDirtyConfig {
  /**
   * The path to a field. Leave undefined to check the entire form.
   */
  readonly path?: undefined;
}

/**
 * Is field dirty config interface.
 */
export interface IsFieldDirtyConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to check for dirtiness.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Checks whether a specific field or the entire form is dirty by walking
 * through the field store and all its descendants. A field is dirty when its
 * input differs from its initial value.
 *
 * @param form The form store to check for dirtiness.
 *
 * @returns Whether the field or form is dirty.
 */
export function isDirty<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): boolean;

/**
 * Checks whether a specific field or the entire form is dirty by walking
 * through the field store and all its descendants. A field is dirty when its
 * input differs from its initial value.
 *
 * @param form The form store to check for dirtiness.
 * @param config The is dirty configuration.
 *
 * @returns Whether the field or form is dirty.
 */
export function isDirty<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? IsFieldDirtyConfig<TSchema, TFieldPath>
    : IsFormDirtyConfig
): boolean;

// @__NO_SIDE_EFFECTS__
export function isDirty(
  form: BaseFormStore,
  config?: IsFormDirtyConfig | IsFieldDirtyConfig<FormSchema, RequiredPath>
): boolean {
  return getFieldBool(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    'isDirty'
  );
}
