import {
  type BaseFormStore,
  batch,
  copyItemState,
  type FormSchema,
  getFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type RequiredPath,
  untrack,
  type ValidArrayPath,
  validateIfRequired,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Remove array field config interface.
 */
export interface RemoveConfig<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
> {
  /**
   * The path to the field array to remove an item from.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The index of the item to remove.
   */
  readonly at: number;
}

/**
 * Removes an item from a field array at the specified index. All items after
 * the removed item are shifted down by one index.
 *
 * @param form The form store containing the field array.
 * @param config The remove configuration specifying the path and index.
 */
export function remove<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
>(
  form: BaseFormStore<TSchema>,
  config: RemoveConfig<TSchema, TFieldArrayPath>
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
      // Remove item ID from the items array
      const newItems = [...items];
      newItems.splice(config.at, 1);
      internalArrayStore.items.value = newItems;

      // Move all child stores after the removed item one index down
      for (let index = config.at; index < items.length - 1; index++) {
        copyItemState(
          internalFormStore,
          internalArrayStore.children[index + 1],
          internalArrayStore.children[index]
        );
      }

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
