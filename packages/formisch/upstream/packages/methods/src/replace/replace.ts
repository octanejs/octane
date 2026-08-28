import {
  type BaseFormStore,
  batch,
  createId,
  type DeepPartial,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type PathValue,
  type RequiredPath,
  resetItemState,
  untrack,
  type ValidArrayPath,
  validateIfRequired,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Replace array field config interface.
 */
export interface ReplaceConfig<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
> {
  /**
   * The path to the field array to replace an item within.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The index of the item to replace.
   */
  readonly at: number;
  /**
   * The partial initial input value for the replacement item.
   */
  readonly initialInput?:
    | DeepPartial<
        PathValue<v.InferInput<TSchema>, [...TFieldArrayPath, number]>
      >
    | undefined;
}

/**
 * Replaces an item in a field array at the specified index with new initial input.
 *
 * @param form The form store containing the field array.
 * @param config The replace configuration specifying the path, index, and initial input.
 */
export function replace<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
>(
  form: BaseFormStore<TSchema>,
  config: ReplaceConfig<TSchema, TFieldArrayPath>
): void {
  // Get internal form and array store
  const internalFormStore = form[INTERNAL];
  const internalArrayStore = getFieldStore(
    internalFormStore,
    config.path
  ) as InternalArrayStore;

  // Get current items of field array
  const items = untrack(() => internalArrayStore.items.value);

  // Continue if specified index is valid
  if (config.at >= 0 && config.at <= items.length - 1) {
    batch(() => {
      // Replace item ID to trigger reactivity
      const newItems = [...items];
      newItems[config.at] = createId();
      internalArrayStore.items.value = newItems;

      // Replace input of field array item
      resetItemState(
        internalFormStore,
        internalArrayStore.children[config.at],
        config.initialInput
      );

      // Mark field array as touched, edited and dirty
      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      internalArrayStore.isDirty.value = true;

      // Validate if required
      // TODO: Should we validate on touch, change and blur too?
      validateIfRequired(internalFormStore, internalArrayStore, 'input');
    });
  }
}
