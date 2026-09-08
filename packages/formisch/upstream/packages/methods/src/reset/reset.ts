import {
  type BaseFormStore,
  batch,
  type DeepPartial,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type PathValue,
  type RequiredPath,
  setInitialFieldInput,
  untrack,
  validateFormInput,
  type ValidPath,
  walkFieldStore,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Reset base config interface.
 */
interface ResetBaseConfig {
  /**
   * Whether to keep the current input values during reset. Defaults to false.
   */
  readonly keepInput?: boolean | undefined;
  /**
   * Whether to keep the touched state during reset. Defaults to false.
   */
  readonly keepTouched?: boolean | undefined;
  /**
   * Whether to keep the edited state during reset. Defaults to false.
   */
  readonly keepEdited?: boolean | undefined;
  /**
   * Whether to keep the error messages during reset. Defaults to false.
   */
  readonly keepErrors?: boolean | undefined;
}

/**
 * Reset form config interface.
 */
export interface ResetFormConfig<TSchema extends FormSchema>
  extends ResetBaseConfig {
  /**
   * The path to a field. Leave undefined to reset the entire form.
   */
  readonly path?: undefined;
  /**
   * The new initial input to reset to. If provided, replaces the form's
   * initial input.
   */
  readonly initialInput?: DeepPartial<v.InferInput<TSchema>> | undefined;
  /**
   * Whether to keep the submitted state during reset. Defaults to false.
   */
  readonly keepSubmitted?: boolean | undefined;
}

/**
 * Reset field config interface.
 */
export interface ResetFieldConfig<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath,
> extends ResetBaseConfig {
  /**
   * The path to the field to reset.
   */
  readonly path: ValidPath<v.InferInput<TSchema>, TFieldPath>;
  /**
   * The new initial input to reset the field to. If provided, replaces the
   * field's initial input.
   */
  readonly initialInput?:
    | DeepPartial<PathValue<v.InferInput<TSchema>, TFieldPath>>
    | undefined;
}

/**
 * Resets a specific field or the entire form to its initial state. Provides
 * fine-grained control over which state to preserve during reset through the
 * configuration options.
 *
 * @param form The form store to reset.
 */
export function reset(form: BaseFormStore): void;

/**
 * Resets a specific field or the entire form to its initial state. Provides
 * fine-grained control over which state to preserve during reset through the
 * configuration options.
 *
 * @param form The form store to reset.
 * @param config The reset configuration specifying what to reset and what to keep.
 */
export function reset<
  TSchema extends FormSchema,
  TFieldPath extends RequiredPath | undefined = undefined,
>(
  form: BaseFormStore<TSchema>,
  config: TFieldPath extends RequiredPath
    ? ResetFieldConfig<TSchema, TFieldPath>
    : ResetFormConfig<TSchema>
): void;

export function reset(
  form: BaseFormStore,
  config?:
    | ResetFormConfig<FormSchema>
    | ResetFieldConfig<FormSchema, RequiredPath>
): void {
  batch(() => {
    untrack(() => {
      // Get internal form and field store
      const internalFormStore = form[INTERNAL];
      const internalFieldStore = config?.path
        ? getFieldStore(internalFormStore, config.path)
        : internalFormStore;

      // If initial input is provided, set it
      if (config && 'initialInput' in config) {
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore,
          config.initialInput
        );
      }

      // Reset state of fields by walking field store
      walkFieldStore(internalFieldStore, (internalFieldStore) => {
        // Reset elements to initial elements
        // Hint: `copyItemState` and `swapItemState` move elements between field
        // stores during array methods, so this restores each field's original
        // element. Without it, focus and file reset target the wrong element
        // after a reorder followed by a reset.
        internalFieldStore.elements = internalFieldStore.initialElements;

        // Reset errors if it is not to be kept
        if (!config?.keepErrors) {
          internalFieldStore.errors.value = null;
        }

        // Reset is touched if it is not to be kept
        if (!config?.keepTouched) {
          internalFieldStore.isTouched.value = false;
        }

        // Reset is edited if it is not to be kept
        if (!config?.keepEdited) {
          internalFieldStore.isEdited.value = false;
        }

        // Reset start input to initial input
        internalFieldStore.startInput.value =
          internalFieldStore.initialInput.value;

        // Reset input if it is not to be kept
        if (!config?.keepInput) {
          internalFieldStore.input.value =
            internalFieldStore.initialInput.value;
        }

        // If it is an array, reset array specific state
        if (internalFieldStore.kind === 'array') {
          // Reset start items to initial items
          internalFieldStore.startItems.value =
            internalFieldStore.initialItems.value;

          // Reset items if it is not to be kept
          if (
            !config?.keepInput ||
            // Hint: The array items are just an internal concept used to
            // store and track changes. We reset anyway if the lengths are
            // equal because otherwise, the field may be in a dirty state
            // even though there is no visible change for the end user.
            internalFieldStore.startItems.value.length ===
              internalFieldStore.items.value.length
          ) {
            internalFieldStore.items.value =
              internalFieldStore.initialItems.value;
          }

          // Update is dirty to reflect changes
          internalFieldStore.isDirty.value =
            internalFieldStore.startInput.value !==
              internalFieldStore.input.value ||
            internalFieldStore.startItems.value !==
              internalFieldStore.items.value;

          // If it is an object, reset object specific state
        } else if (internalFieldStore.kind === 'object') {
          // Update is dirty to reflect changes
          internalFieldStore.isDirty.value =
            internalFieldStore.startInput.value !==
            internalFieldStore.input.value;

          // If it is a value, reset value specific state
        } else {
          // Update is dirty to reflect changes
          // TODO: Should we add support for Dates and Files?
          const startInput = internalFieldStore.startInput.value;
          const input = internalFieldStore.input.value;
          internalFieldStore.isDirty.value =
            startInput !== input &&
            // Hint: This check ensures that an empty string or `NaN` does not mark
            // the field as dirty if the start input was `undefined` or `null`.
            (startInput != null || (input !== '' && !Number.isNaN(input)));

          // Reset file inputs as they can't be controlled
          for (const element of internalFieldStore.elements) {
            if (element.type === 'file') {
              element.value = '';
            }
          }
        }
      });

      // If path is not defined, reset form specific state
      if (!config?.path) {
        // Reset is submitted if it is not to be kept
        if (!config?.keepSubmitted) {
          internalFormStore.isSubmitted.value = false;
        }

        // Validate form input if configured
        if (internalFormStore.validate === 'initial') {
          validateFormInput(internalFormStore);
        }
      }
    });
  });
}
