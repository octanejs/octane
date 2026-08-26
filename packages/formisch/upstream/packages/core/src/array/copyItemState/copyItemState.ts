import { initializeFieldStore } from '../../field/initializeFieldStore/index.ts';
import { batch, untrack } from '../../framework/index.ts';
import type {
  InternalFieldStore,
  InternalFormStore,
} from '../../types/index.ts';

/**
 * Copies the deeply nested state (signal values) from one field store to
 * another. This includes the `elements`, `errors`, `startInput`, `input`,
 * `isTouched`, `isEdited`, `isDirty`, and for arrays `startItems` and `items`
 * properties. Recursively walks through the field stores and copies all signal
 * values.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param fromInternalFieldStore The source field store to copy from.
 * @param toInternalFieldStore The destination field store to copy to.
 */
export function copyItemState(
  internalFormStore: InternalFormStore,
  fromInternalFieldStore: InternalFieldStore,
  toInternalFieldStore: InternalFieldStore
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // Untrack to avoid creating reactive dependencies during copy operation
    untrack(() => {
      // Copy elements reference
      toInternalFieldStore.elements = fromInternalFieldStore.elements;

      // Copy errors
      toInternalFieldStore.errors.value = fromInternalFieldStore.errors.value;

      // Copy start input
      toInternalFieldStore.startInput.value =
        fromInternalFieldStore.startInput.value;

      // Copy current input
      toInternalFieldStore.input.value = fromInternalFieldStore.input.value;

      // Copy touched state
      toInternalFieldStore.isTouched.value =
        fromInternalFieldStore.isTouched.value;

      // Copy edited state
      toInternalFieldStore.isEdited.value =
        fromInternalFieldStore.isEdited.value;

      // Copy dirty state
      toInternalFieldStore.isDirty.value = fromInternalFieldStore.isDirty.value;

      // If both stores are arrays, copy array-specific state
      if (
        fromInternalFieldStore.kind === 'array' &&
        toInternalFieldStore.kind === 'array'
      ) {
        // Get source items array
        const fromItems = fromInternalFieldStore.items.value;

        // Copy start items
        toInternalFieldStore.startItems.value =
          fromInternalFieldStore.startItems.value;

        // Copy current items
        toInternalFieldStore.items.value = fromItems;

        // Copy state for each array item
        for (let index = 0; index < fromItems.length; index++) {
          // If destination child doesn't exist, initialize it
          if (!toInternalFieldStore.children[index]) {
            // Create empty child object
            // @ts-expect-error
            toInternalFieldStore.children[index] = {};

            // Initialize field store for new child
            initializeFieldStore(
              internalFormStore,
              toInternalFieldStore.children[index],
              // @ts-expect-error
              toInternalFieldStore.schema.item,
              undefined,
              [...toInternalFieldStore.path, index]
            );
          }

          // Recursively copy child state
          copyItemState(
            internalFormStore,
            fromInternalFieldStore.children[index],
            toInternalFieldStore.children[index]
          );
        }

        // Otherwise, if both stores are objects, copy object children
      } else if (
        fromInternalFieldStore.kind === 'object' &&
        toInternalFieldStore.kind === 'object'
      ) {
        // Copy state for each object property
        for (const key in fromInternalFieldStore.children) {
          // Recursively copy child state
          copyItemState(
            internalFormStore,
            fromInternalFieldStore.children[key],
            toInternalFieldStore.children[key]
          );
        }
      }
    });
  });
}
