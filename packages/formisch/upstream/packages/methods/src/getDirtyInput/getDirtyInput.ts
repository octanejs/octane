import {
  type BaseFormStore,
  type DeepPartial,
  type FormSchema,
  getDirtyFieldInput,
  getFieldStore,
  INTERNAL,
  type PathValue,
  type RequiredPath,
  type ValidPath,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Get form dirty input config interface.
 */
export interface GetFormDirtyInputConfig {
  /**
   * The path to a field. Leave undefined to get the dirty input of the entire
   * form.
   */
  readonly path?: undefined;
}

/**
 * Get field dirty input config interface.
 */
export interface GetFieldDirtyInputConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to retrieve the dirty input from.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Retrieves only the dirty input values of a specific field or the entire
 * form. Arrays are treated as atomic and returned in full if any item is
 * dirty, while object keys without a dirty descendant are omitted. Returns
 * `undefined` if no field in the inspected subtree is dirty.
 *
 * @param form The form store to retrieve dirty input from.
 *
 * @returns The dirty input of the form or specified field, or `undefined`.
 */
export function getDirtyInput<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): DeepPartial<v.InferInput<TSchema>> | undefined;

/**
 * Retrieves only the dirty input values of a specific field or the entire
 * form. Arrays are treated as atomic and returned in full if any item is
 * dirty, while object keys without a dirty descendant are omitted. Returns
 * `undefined` if no field in the inspected subtree is dirty.
 *
 * @param form The form store to retrieve dirty input from.
 * @param config The get dirty input configuration.
 *
 * @returns The dirty input of the form or specified field, or `undefined`.
 */
export function getDirtyInput<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? GetFieldDirtyInputConfig<TSchema, TFieldPath>
    : GetFormDirtyInputConfig
):
  | DeepPartial<
      TFieldPath extends RequiredPath
        ? PathValue<v.InferInput<TSchema>, TFieldPath>
        : v.InferInput<TSchema>
    >
  | undefined;

// @__NO_SIDE_EFFECTS__
export function getDirtyInput(
  form: BaseFormStore,
  config?:
    | GetFormDirtyInputConfig
    | GetFieldDirtyInputConfig<FormSchema, RequiredPath>
): unknown {
  return getDirtyFieldInput(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL]
  );
}
