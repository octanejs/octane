import { initializeFieldStore } from '../../field/initializeFieldStore/index.ts';
import { batch, untrack } from '../../framework/index.ts';
import type {
  InternalFieldStore,
  InternalFormStore,
} from '../../types/index.ts';

/**
 * Swaps the deeply nested state (signal values) between two field stores. This
 * includes the `elements`, `errors`, `startInput`, `input`, `isTouched`,
 * `isEdited`, `isDirty`, and for arrays `startItems` and `items` properties.
 * Recursively walks through the field stores and swaps all signal values.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param firstInternalFieldStore The first field store to swap.
 * @param secondInternalFieldStore The second field store to swap.
 */
export function swapItemState(
  internalFormStore: InternalFormStore,
  firstInternalFieldStore: InternalFieldStore,
  secondInternalFieldStore: InternalFieldStore
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // Untrack to avoid creating reactive dependencies during swap operation
    untrack(() => {
      // Swap elements references
      const tempElements = firstInternalFieldStore.elements;
      firstInternalFieldStore.elements = secondInternalFieldStore.elements;
      secondInternalFieldStore.elements = tempElements;

      // Swap errors
      const tempErrors = firstInternalFieldStore.errors.value;
      firstInternalFieldStore.errors.value =
        secondInternalFieldStore.errors.value;
      secondInternalFieldStore.errors.value = tempErrors;

      // Swap start input
      const tempStartInput = firstInternalFieldStore.startInput.value;
      firstInternalFieldStore.startInput.value =
        secondInternalFieldStore.startInput.value;
      secondInternalFieldStore.startInput.value = tempStartInput;

      // Swap current input
      const tempInput = firstInternalFieldStore.input.value;
      firstInternalFieldStore.input.value =
        secondInternalFieldStore.input.value;
      secondInternalFieldStore.input.value = tempInput;

      // Swap touched state
      const tempIsTouched = firstInternalFieldStore.isTouched.value;
      firstInternalFieldStore.isTouched.value =
        secondInternalFieldStore.isTouched.value;
      secondInternalFieldStore.isTouched.value = tempIsTouched;

      // Swap edited state
      const tempIsEdited = firstInternalFieldStore.isEdited.value;
      firstInternalFieldStore.isEdited.value =
        secondInternalFieldStore.isEdited.value;
      secondInternalFieldStore.isEdited.value = tempIsEdited;

      // Swap dirty state
      const tempIsDirty = firstInternalFieldStore.isDirty.value;
      firstInternalFieldStore.isDirty.value =
        secondInternalFieldStore.isDirty.value;
      secondInternalFieldStore.isDirty.value = tempIsDirty;

      // If both stores are arrays, swap array-specific state
      if (
        firstInternalFieldStore.kind === 'array' &&
        secondInternalFieldStore.kind === 'array'
      ) {
        // Get current items arrays for later use
        const firstItems = firstInternalFieldStore.items.value;
        const secondItems = secondInternalFieldStore.items.value;

        // Swap start items
        const tempStartItems = firstInternalFieldStore.startItems.value;
        firstInternalFieldStore.startItems.value =
          secondInternalFieldStore.startItems.value;
        secondInternalFieldStore.startItems.value = tempStartItems;

        // Swap current items
        firstInternalFieldStore.items.value = secondItems;
        secondInternalFieldStore.items.value = firstItems;

        // Calculate maximum length to ensure all children are swapped
        const maxLength = Math.max(firstItems.length, secondItems.length);

        // Swap state for each array item
        for (let index = 0; index < maxLength; index++) {
          // If first store child doesn't exist, initialize it
          if (!firstInternalFieldStore.children[index]) {
            // Create empty child object
            // @ts-expect-error
            firstInternalFieldStore.children[index] = {};

            // Initialize field store for new child
            initializeFieldStore(
              internalFormStore,
              firstInternalFieldStore.children[index],
              // @ts-expect-error
              firstInternalFieldStore.schema.item,
              undefined,
              [...firstInternalFieldStore.path, index]
            );
          }

          // If second store child doesn't exist, initialize it
          if (!secondInternalFieldStore.children[index]) {
            // Create empty child object
            // @ts-expect-error
            secondInternalFieldStore.children[index] = {};

            // Initialize field store for new child
            initializeFieldStore(
              internalFormStore,
              secondInternalFieldStore.children[index],
              // @ts-expect-error
              secondInternalFieldStore.schema.item,
              undefined,
              [...secondInternalFieldStore.path, index]
            );
          }

          // Recursively swap children
          swapItemState(
            internalFormStore,
            firstInternalFieldStore.children[index],
            secondInternalFieldStore.children[index]
          );
        }

        // Otherwise, if both stores are objects, swap object children
      } else if (
        firstInternalFieldStore.kind === 'object' &&
        secondInternalFieldStore.kind === 'object'
      ) {
        // Swap state for each object property
        for (const key in firstInternalFieldStore.children) {
          // Recursively swap children
          swapItemState(
            internalFormStore,
            firstInternalFieldStore.children[key],
            secondInternalFieldStore.children[key]
          );
        }
      }
    });
  });
}
