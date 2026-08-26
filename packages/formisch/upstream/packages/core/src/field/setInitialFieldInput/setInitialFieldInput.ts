import { batch, createId } from '../../framework/index.ts';
import type {
  EmptyInput,
  InternalFieldStore,
  InternalFormStore,
} from '../../types/index.ts';
import { initializeFieldStore } from '../initializeFieldStore/index.ts';

/**
 * Sets the initial input for a field store and all its children recursively.
 * For arrays, initializes missing children if needed. Updates `initialInput`
 * and `initialItems` properties.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to update.
 * @param initialInput The initial input value.
 */
export function setInitialFieldInput(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  initialInput: unknown
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // If field store is array, handle array initial input
    if (internalFieldStore.kind === 'array') {
      // Set initial array input
      internalFieldStore.initialInput.value =
        initialInput == null ? initialInput : true;

      // Normalize input to empty array if nullish
      const initialArrayInput = initialInput ?? [];

      // Tuples have a fixed number of children, so ignore any extra input items
      // instead of growing them (they have no `item` schema to initialize
      // additional children, unlike dynamic arrays)
      const length =
        internalFieldStore.schema.type === 'array'
          ? (initialArrayInput as unknown[]).length
          : internalFieldStore.children.length;

      // If initial input exceeds children capacity, initialize new children
      if (length > internalFieldStore.children.length) {
        // Initialize missing children
        for (
          let index = internalFieldStore.children.length;
          index < length;
          index++
        ) {
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
            initialArrayInput[index],
            [...internalFieldStore.path, index]
          );
        }
      }

      // Set initial items with unique IDs
      internalFieldStore.initialItems.value = Array.from({ length }, createId);

      // Set initial input for each array item
      for (let index = 0; index < internalFieldStore.children.length; index++) {
        // Recursively set initial input for child
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore.children[index],
          // @ts-expect-error
          initialArrayInput[index]
        );
      }

      // Otherwise, if field store is object, handle object initial input
    } else if (internalFieldStore.kind === 'object') {
      // Set initial object input
      internalFieldStore.initialInput.value =
        initialInput == null ? initialInput : true;

      // Set initial input for each object property
      for (const key in internalFieldStore.children) {
        // Recursively set initial input for child
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore.children[key],
          // @ts-expect-error
          initialInput?.[key]
        );
      }

      // Otherwise, handle value field initial input
    } else {
      // Fall back to the empty input for this field's type when no input is
      // provided so the initial input stays consistent with form
      // initialization. Optional and nullable fields stay `undefined`.
      internalFieldStore.initialInput.value =
        initialInput === undefined && !internalFieldStore.isNullish
          ? internalFormStore.emptyInput[
              internalFieldStore.schema.type as keyof EmptyInput
            ]
          : initialInput;
    }
  });
}
