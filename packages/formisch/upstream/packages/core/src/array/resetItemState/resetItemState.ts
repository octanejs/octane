import { initializeFieldStore } from '../../field/initializeFieldStore/index.ts';
import { batch, createId } from '../../framework/index.ts';
import type {
  EmptyInput,
  FieldElement,
  InternalFieldStore,
  InternalFormStore,
} from '../../types/index.ts';

/**
 * Resets the state of a field store (signal values) deeply nested. Sets
 * `elements` to empty array, `errors` to `null`, `isTouched`, `isEdited` and
 * `isDirty` to `false`, and `startInput`, `input`, `startItems`, and `items` to
 * the new input value. Keeps the `initialInput` and `initialItems` state
 * unchanged for form reset functionality.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The field store to reset.
 * @param input The new input value (can be any type including array or object).
 * @param keepStart Whether to keep `startInput` and `startItems` as the dirty
 * baseline instead of resetting them to the new input. Used when a field store
 * is reused for an in-place edit so its dirty state is detected correctly.
 */
export function resetItemState(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  input: unknown,
  keepStart = false
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // Clear elements array, keeping `initialElements` in sync while the store
    // still owns it (not moved by a reorder) so a later `reset` restores the
    // live element once the field remounts
    const elements: FieldElement[] = [];
    if (internalFieldStore.elements === internalFieldStore.initialElements) {
      internalFieldStore.initialElements = elements;
    }
    internalFieldStore.elements = elements;

    // Clear errors
    internalFieldStore.errors.value = null;

    // Reset touched to false
    internalFieldStore.isTouched.value = false;

    // Reset edited to false
    internalFieldStore.isEdited.value = false;

    // Reset dirty to false
    internalFieldStore.isDirty.value = false;

    // If field store is array or object, handle complex type reset
    if (
      internalFieldStore.kind === 'array' ||
      internalFieldStore.kind === 'object'
    ) {
      // For arrays and objects, input is null/undefined or true (not actual
      // value). Mirror `initializeFieldStore` so a missing input on a
      // non-nullish array or object becomes a present empty container (`true`)
      // instead of `undefined`, keeping reset consistent with the initial state.
      const objectInput =
        internalFieldStore.isNullish && input == null ? input : true;

      // Set start input unless it is kept as the dirty baseline
      if (!keepStart) {
        internalFieldStore.startInput.value = objectInput;
      }

      // Set current input
      internalFieldStore.input.value = objectInput;

      // If field store is array, handle array-specific reset
      if (internalFieldStore.kind === 'array') {
        // Tuples have a fixed number of children that the schema cannot
        // recreate (no `item`), so they keep them even when the input is
        // nullish, just like `initializeFieldStore`
        const isTuple = internalFieldStore.schema.type !== 'array';

        // If input is provided or store is a tuple, (re)create items with IDs
        if (input || isTuple) {
          // Dynamic arrays grow to the input length, while tuples keep their
          // fixed number of children
          const length = isTuple
            ? internalFieldStore.children.length
            : (input as unknown[]).length;

          // Create new items array with unique IDs for each item
          const newItems = Array.from({ length }, createId);

          // Set start items unless they are kept as the dirty baseline
          if (!keepStart) {
            internalFieldStore.startItems.value = newItems;
          }

          // Set current items
          internalFieldStore.items.value = newItems;

          // Reset state for each array item
          for (let index = 0; index < length; index++) {
            // A tuple reset without input (or with nullish input) resets each
            // child to undefined, mirroring `initializeFieldStore`
            const itemInput = (input as unknown[] | null | undefined)?.[index];

            // If child exists at this index, reset its state
            if (internalFieldStore.children[index]) {
              // Recursively reset child with corresponding input
              resetItemState(
                internalFormStore,
                internalFieldStore.children[index],
                itemInput,
                keepStart
              );

              // Otherwise, initialize a new child with the corresponding input
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
                itemInput,
                [...internalFieldStore.path, index]
              );
            }
          }

          // Otherwise, clear items arrays
        } else {
          // Set start items to empty array unless kept as the dirty baseline
          if (!keepStart) {
            internalFieldStore.startItems.value = [];
          }

          // Set current items to empty array
          internalFieldStore.items.value = [];
        }

        // Otherwise, if field store is object, handle object-specific reset
      } else {
        // Reset state for each object property
        for (const key in internalFieldStore.children) {
          // Recursively reset child with corresponding input
          resetItemState(
            internalFormStore,
            internalFieldStore.children[key],
            // @ts-expect-error
            input?.[key],
            keepStart
          );
        }
      }

      // Otherwise, if field store is value, handle primitive type reset
    } else {
      // Fall back to the empty input for this field's type when no input is
      // provided so the reset value stays consistent with the initial input.
      // Optional and nullable fields stay `undefined` as they accept it.
      const valueInput =
        input === undefined && !internalFieldStore.isNullish
          ? internalFormStore.emptyInput[
              internalFieldStore.schema.type as keyof EmptyInput
            ]
          : input;

      // Set start input unless it is kept as the dirty baseline
      if (!keepStart) {
        internalFieldStore.startInput.value = valueInput;
      }

      // Set current input
      internalFieldStore.input.value = valueInput;
    }
  });
}
