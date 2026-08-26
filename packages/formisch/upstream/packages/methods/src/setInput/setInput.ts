import {
  type BaseFormStore,
  batch,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type PathValue,
  type RequiredPath,
  setFieldInput,
  validateIfRequired,
  type ValidPath,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Set form input config interface.
 */
export interface SetFormInputConfig<TSchema extends FormSchema> {
  /**
   * The path to a field. Leave undefined to set the entire form input.
   */
  readonly path?: undefined;
  /**
   * The input value to set for the form.
   */
  readonly input: v.InferInput<TSchema>;
}

/**
 * Set field input config interface.
 */
export interface SetFieldInputConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> {
  /**
   * The path to the field to set input on.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
  /**
   * The input value to set for the field.
   */
  readonly input: PathValue<v.InferInput<TSchema>, TFieldPath>;
}

/**
 * Sets the input value of a specific field or the entire form. This updates
 * the field value(s) and triggers validation if required by the form's
 * validation mode.
 *
 * @param form The form store to set input on.
 * @param config The set form input configuration specifying the new input values.
 */
export function setInput<TSchema extends FormSchema>(
  form: BaseFormStore<TSchema>,
  config: SetFormInputConfig<TSchema>
): void;

/**
 * Sets the input value of a specific field or the entire form. This updates
 * the field value(s) and triggers validation if required by the form's
 * validation mode.
 *
 * @param form The form store to set input on.
 * @param config The set input configuration specifying the path and new value.
 */
export function setInput<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? SetFieldInputConfig<TSchema, TFieldPath>
    : SetFormInputConfig<TSchema>
): void;

export function setInput(
  form: BaseFormStore,
  config:
    | SetFormInputConfig<FormSchema>
    | SetFieldInputConfig<FormSchema, RequiredPath>
): void {
  batch(() => {
    const internalFormStore = form[INTERNAL];
    setFieldInput(internalFormStore, config.path ?? [], config.input);
    // TODO: Should we validate on touch, change and blur too?
    validateIfRequired(
      internalFormStore,
      config.path
        ? getFieldStore(internalFormStore, config.path)
        : internalFormStore,
      'input'
    );
  });
}
