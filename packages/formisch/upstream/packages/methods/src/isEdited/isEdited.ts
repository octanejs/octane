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
 * Is form edited config interface.
 */
export interface IsFormEditedConfig {
  /**
   * The path to a field. Leave undefined to check the entire form.
   */
  readonly path?: undefined;
}

/**
 * Is field edited config interface.
 */
export interface IsFieldEditedConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to check for being edited.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Checks whether a specific field or the entire form is edited by walking
 * through the field store and all its descendants. A field is edited once its
 * value has been changed by the user.
 *
 * @param form The form store to check for being edited.
 *
 * @returns Whether the field or form is edited.
 */
export function isEdited<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>
): boolean;

/**
 * Checks whether a specific field or the entire form is edited by walking
 * through the field store and all its descendants. A field is edited once its
 * value has been changed by the user.
 *
 * @param form The form store to check for being edited.
 * @param config The is edited configuration.
 *
 * @returns Whether the field or form is edited.
 */
export function isEdited<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? IsFieldEditedConfig<TSchema, TFieldPath>
    : IsFormEditedConfig
): boolean;

// @__NO_SIDE_EFFECTS__
export function isEdited(
  form: BaseFormStore,
  config?: IsFormEditedConfig | IsFieldEditedConfig<FormSchema, RequiredPath>
): boolean {
  return getFieldBool(
    config?.path ? getFieldStore(form[INTERNAL], config.path) : form[INTERNAL],
    'isEdited'
  );
}
