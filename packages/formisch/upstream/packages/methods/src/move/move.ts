import {
  type BaseFormStore,
  batch,
  copyItemState,
  type FormSchema,
  getFieldStore,
  initializeFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type InternalFieldStore,
  type RequiredPath,
  untrack,
  type ValidArrayPath,
  validateIfRequired,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Move array field config interface.
 */
export interface MoveConfig<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
> {
  /**
   * The path to the field array to move an item within.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The index of the item to move from.
   */
  readonly from: number;
  /**
   * The index to move the item to.
   */
  readonly to: number;
}

/**
 * Moves an item from one index to another within a field array. All items
 * between the source and destination indices are shifted accordingly.
 *
 * @param form The form store containing the field array.
 * @param config The move configuration specifying the path and source/destination indices.
 */
export function move<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
>(
  form: BaseFormStore<TSchema>,
  config: MoveConfig<TSchema, TFieldArrayPath>
): void {
  // Get internal form and array store
  const internalFormStore = form[INTERNAL];
  const internalArrayStore = getFieldStore(
    internalFormStore,
    config.path
  ) as InternalArrayStore;

  // Get current items of field array
  const items = untrack(() => internalArrayStore.items.value);

  // Continue if both indices are valid and different
  if (
    config.from >= 0 &&
    config.from <= items.length - 1 &&
    config.to >= 0 &&
    config.to <= items.length - 1 &&
    config.from !== config.to
  ) {
    batch(() => {
      // Move item ID in the items array
      const newItems = [...items];
      newItems.splice(config.to, 0, newItems.splice(config.from, 1)[0]);
      internalArrayStore.items.value = newItems;

      // Create temporary internal field store
      const tempInternalFieldStore = {} as InternalFieldStore;
      initializeFieldStore(
        internalFormStore,
        tempInternalFieldStore,
        // @ts-expect-error
        internalArrayStore.schema.item,
        undefined,
        []
      );

      // Copy item state that gets overwritten to temporary store
      copyItemState(
        internalFormStore,
        internalArrayStore.children[config.from],
        tempInternalFieldStore
      );

      if (config.from < config.to) {
        // Move child stores between 'from' and 'to' one index down
        for (let index = config.from; index < config.to; index++) {
          copyItemState(
            internalFormStore,
            internalArrayStore.children[index + 1],
            internalArrayStore.children[index]
          );
        }
      } else {
        // Move child stores between 'to' and 'from' one index up
        for (let index = config.from; index > config.to; index--) {
          copyItemState(
            internalFormStore,
            internalArrayStore.children[index - 1],
            internalArrayStore.children[index]
          );
        }
      }

      // Copy item state from temporary store to new position
      copyItemState(
        internalFormStore,
        tempInternalFieldStore,
        internalArrayStore.children[config.to]
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
