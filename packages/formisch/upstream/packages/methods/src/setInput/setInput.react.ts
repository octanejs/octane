import {
  type BaseFormStore,
  batch,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type RequiredPath,
  setFieldInput,
  validateIfRequired,
} from '@formisch/core/react';
import {
  type SetFieldInputConfig,
  type SetFormInputConfig,
} from './setInput.ts';

export type { SetFieldInputConfig, SetFormInputConfig };

/**
 * Sets the input value of a specific field or the entire form. This updates
 * the field value(s) and triggers validation if required by the form's
 * validation mode for both input and change events.
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
 * validation mode for both input and change events.
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
    const fieldOrFormStore = config.path
      ? getFieldStore(internalFormStore, config.path)
      : internalFormStore;
    validateIfRequired(internalFormStore, fieldOrFormStore, 'input');
    validateIfRequired(internalFormStore, fieldOrFormStore, 'change');
  });
}
