import { resetItemState } from '../../array/resetItemState/index.ts';
import { batch, createId, untrack } from '../../framework/index.ts';
import type {
  InternalFieldStore,
  InternalFormStore,
  Path,
} from '../../types/index.ts';
import { initializeFieldStore } from '../initializeFieldStore/index.ts';

/**
 * Sets the input for a nested field store and all its children, updating
 * touched and dirty states accordingly. Handles dynamic array resizing.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to update.
 * @param input The new input value.
 */
function setNestedInput(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  input: unknown
): void {
  // Mark field as touched and edited
  internalFieldStore.isTouched.value = true;
  internalFieldStore.isEdited.value = true;

  // If field store is array, handle array input
  if (internalFieldStore.kind === 'array') {
    // Normalize input to empty array if nullish
    const arrayInput = input ?? [];
    const items = internalFieldStore.items.value;

    // Tuples have a fixed number of children, so ignore any extra input items
    // instead of growing them (they have no `item` schema to initialize
    // additional children, unlike dynamic arrays)
    const length =
      internalFieldStore.schema.type === 'array'
        ? (arrayInput as unknown[]).length
        : internalFieldStore.children.length;

    // If new array is shorter, truncate items
    if (length < items.length) {
      internalFieldStore.items.value = items.slice(0, length);

      // Otherwise, if new array is longer, extend items
    } else if (length > items.length) {
      // Initialize or reset each newly visible child
      for (let index = items.length; index < length; index++) {
        // Reset the reused stale child but keep its start input as baseline
        // Hint: A child store from a previously longer array still holds stale
        // errors and nested values that must be cleared, but its `startInput`
        // and `startItems` are the dirty baseline. Passing `keepStart`
        // preserves them so editing a regrown index is detected as dirty, just
        // like a direct edit on a never-shrunk array would be.
        if (internalFieldStore.children[index]) {
          resetItemState(
            internalFormStore,
            internalFieldStore.children[index],
            // @ts-expect-error
            arrayInput[index],
            true
          );

          // Otherwise, create and initialize a brand-new child
        } else {
          // Create empty child object
          // @ts-expect-error
          internalFieldStore.children[index] = {};

          // Initialize field store for new child
          initializeFieldStore(
            internalFormStore,
            internalFieldStore.children[index],
            // @ts-expect-error
            internalFieldStore.schema.item,
            // @ts-expect-error
            arrayInput[index],
            [...internalFieldStore.path, index]
          );
        }
      }

      // Extend items array with new items, capped to the clamped length so a
      // tuple never grows beyond its fixed number of children
      internalFieldStore.items.value = [
        ...items,
        ...Array.from({ length: length - items.length }, createId),
      ];
    }

    // Set input for each array item
    for (let index = 0; index < length; index++) {
      // Recursively set nested input
      setNestedInput(
        internalFormStore,
        internalFieldStore.children[index],
        // @ts-expect-error
        arrayInput[index]
      );
    }

    // Set array input
    internalFieldStore.input.value = input == null ? input : true;

    // Update dirty state based on input or items length change
    internalFieldStore.isDirty.value =
      internalFieldStore.startInput.value !== internalFieldStore.input.value ||
      internalFieldStore.startItems.value.length !==
        internalFieldStore.items.value.length;

    // Otherwise, if field store is object, handle object input
  } else if (internalFieldStore.kind === 'object') {
    // Set input for each object property
    for (const key in internalFieldStore.children) {
      // Recursively set nested input
      setNestedInput(
        internalFormStore,
        internalFieldStore.children[key],
        // @ts-expect-error
        input?.[key]
      );
    }

    // Set object input
    internalFieldStore.input.value = input == null ? input : true;

    // Update dirty state based on input change
    internalFieldStore.isDirty.value =
      internalFieldStore.startInput.value !== internalFieldStore.input.value;

    // Otherwise, handle value field input
  } else {
    // Set value input
    internalFieldStore.input.value = input;

    // TODO: Should we add support for Dates and Files?
    // Get start input for comparison
    const startInput = internalFieldStore.startInput.value;

    // Update dirty state with special handling for empty string and NaN
    internalFieldStore.isDirty.value =
      startInput !== input &&
      // Hint: This check ensures that an empty string or `NaN` does not mark
      // the field as dirty if the start input was `undefined` or `null`.
      (startInput != null || (input !== '' && !Number.isNaN(input)));
  }
}

/**
 * Sets the input for a field at the specified path in the form store,
 * traversing the path and updating all parent fields along the way.
 *
 * @param internalFormStore The form store containing the field.
 * @param path The path to the field.
 * @param input The new input value.
 */
export function setFieldInput(
  internalFormStore: InternalFormStore,
  path: Path,
  input: unknown
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // Untrack to avoid creating reactive dependencies during update
    untrack(() => {
      // Start at form store root
      let internalFieldStore: InternalFieldStore = internalFormStore;

      // Traverse path to target field
      for (let index = 0; index < path.length; index++) {
        // Navigate to child at current path key
        // @ts-expect-error
        internalFieldStore = internalFieldStore.children[path[index]];

        // If not at target field, mark parent input as truthy
        if (index < path.length - 1) {
          internalFieldStore.input.value = true;
        }
      }

      // Set nested input on target field
      setNestedInput(internalFormStore, internalFieldStore, input);
    });
  });
}
