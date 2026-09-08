import {
  type BaseFormStore,
  batch,
  copyItemState,
  createId,
  type DeepPartial,
  type FormSchema,
  initializeFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type InternalFieldStore,
  type PathValue,
  type RequiredPath,
  resetItemState,
  untrack,
  type ValidArrayPath,
  validateIfRequired,
} from '@formisch/core';
import type * as v from 'valibot';

/**
 * Insert array field config interface.
 */
export interface InsertConfig<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
> {
  /**
   * The path to the field array to insert into.
   */
  readonly path: ValidArrayPath<v.InferInput<TSchema>, TFieldArrayPath>;
  /**
   * The index to insert the new item at. If undefined, appends to the end.
   */
  readonly at?: number | undefined;
  /**
   * The partial initial input value for the new item.
   */
  readonly initialInput?:
    | DeepPartial<
        PathValue<v.InferInput<TSchema>, [...TFieldArrayPath, number]>
      >
    | undefined;
}

/**
 * Inserts a new item into a field array at the specified index. All items at
 * or after the insertion point are shifted up by one index.
 *
 * @param form The form store containing the field array.
 * @param config The insert configuration specifying the path, index, and initial value.
 */
export function insert<
  TSchema extends FormSchema,
  TFieldArrayPath extends RequiredPath,
>(
  form: BaseFormStore<TSchema>,
  config: InsertConfig<TSchema, TFieldArrayPath>
): void {
  // Get internal form store
  const internalFormStore = form[INTERNAL];

  // Walk path to get internal field store and mark all parents as having input
  let internalFieldStore: InternalFieldStore = internalFormStore;
  for (let index = 0; index < config.path.length; index++) {
    // @ts-expect-error
    internalFieldStore = internalFieldStore.children[config.path[index]];
    if (index < config.path.length - 1) {
      internalFieldStore.input.value = true;
    }
  }

  // Last internal field store of path is array store
  const internalArrayStore = internalFieldStore as InternalArrayStore;

  // Get current items of field array
  const items = untrack(() => internalArrayStore.items.value);

  // Determine insertion index (default to end of array)
  const insertIndex = config.at === undefined ? items.length : config.at;

  // Continue if insertion index is valid
  if (insertIndex >= 0 && insertIndex <= items.length) {
    batch(() => {
      // Insert new item ID at the specified index
      const newItems = [...items];
      newItems.splice(insertIndex, 0, createId());
      internalArrayStore.items.value = newItems;

      // Move all child stores after the insertion point one index up
      for (let index = items.length; index > insertIndex; index--) {
        if (!internalArrayStore.children[index]) {
          // @ts-expect-error
          internalArrayStore.children[index] = {};
          initializeFieldStore(
            internalFormStore,
            internalArrayStore.children[index],
            // @ts-expect-error
            internalArrayStore.schema.item,
            undefined,
            [...internalArrayStore.path, index]
          );
        }
        copyItemState(
          internalFormStore,
          internalArrayStore.children[index - 1],
          internalArrayStore.children[index]
        );
      }

      if (!internalArrayStore.children[insertIndex]) {
        // @ts-expect-error
        internalArrayStore.children[insertIndex] = {};
        initializeFieldStore(
          internalFormStore,
          internalArrayStore.children[insertIndex],
          // @ts-expect-error
          internalArrayStore.schema.item,
          config.initialInput,
          [...internalArrayStore.path, insertIndex]
        );
      } else {
        resetItemState(
          internalFormStore,
          internalArrayStore.children[insertIndex],
          config.initialInput
        );
      }

      // Mark array input as present in children
      internalArrayStore.input.value = true;

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
