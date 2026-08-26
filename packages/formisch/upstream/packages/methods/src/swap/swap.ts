import {
  type BaseFormStore,
  batch,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type RequiredPath,
  swapItemState,
  untrack,
  type ValidArrayPath,
  validateIfRequired,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Swap array field config interface.
 */
export interface SwapConfig<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
> {
  /**
   * The path to the field array to swap items within.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The index of the first item to swap.
   */
  readonly at: number;
  /**
   * The index of the second item to swap with the first.
   */
  readonly and: number;
}

/**
 * Swaps two items in a field array by exchanging their positions.
 *
 * @param form The form store containing the field array.
 * @param config The swap configuration specifying the path and indices to swap.
 */
export function swap<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
>(
  form: BaseFormStore<TSchema>,
  config: SwapConfig<TSchema, TFieldArrayPath>
): void {
  // Get internal form and array store
  const internalFormStore = form[INTERNAL];
  const internalArrayStore = getFieldStore(
    internalFormStore,
    config.path
  ) as InternalArrayStore;

  // Get current items of field array
  const items = untrack(() => internalArrayStore.items.value);

  // Continue if both specified indices are valid
  if (
    config.at >= 0 &&
    config.at <= items.length - 1 &&
    config.and >= 0 &&
    config.and <= items.length - 1 &&
    config.at !== config.and
  ) {
    batch(() => {
      // Swap item IDs in items array
      const newItems = [...items];
      const tempItemId = newItems[config.at];
      newItems[config.at] = newItems[config.and];
      newItems[config.and] = tempItemId;
      internalArrayStore.items.value = newItems;

      // Swap child stores directly
      swapItemState(
        internalFormStore,
        internalArrayStore.children[config.at],
        internalArrayStore.children[config.and]
      );

      // Mark field array as touched and edited and update dirty state
      internalArrayStore.isTouched.value = true;
      internalArrayStore.isEdited.value = true;
      internalArrayStore.isDirty.value =
        internalArrayStore.startItems.value.join() !== newItems.join();

      // Validate if required
      // TODO: Should we validate on touch, change and blur too?
      validateIfRequired(internalFormStore, internalArrayStore, 'input');
    });
  }
}
