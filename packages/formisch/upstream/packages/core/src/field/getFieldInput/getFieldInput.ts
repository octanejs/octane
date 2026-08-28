import type { InternalFieldStore } from '../../types/index.ts';

/**
 * Returns the current input of the field store. For arrays and objects,
 * recursively collects input from all children. Returns `null` or `undefined`
 * for nullish array/object inputs, or the primitive value for value fields.
 *
 * @param internalFieldStore The field store to get input from.
 *
 * @returns The field input.
 */
// @__NO_SIDE_EFFECTS__
export function getFieldInput(internalFieldStore: InternalFieldStore): unknown {
  // If field store is array, collect input from children
  if (internalFieldStore.kind === 'array') {
    // If array input is not nullish, build array from children
    if (internalFieldStore.input.value) {
      // Create output array
      const value = [];

      // Collect input from each array item
      for (
        let index = 0;
        index < internalFieldStore.items.value.length;
        index++
      ) {
        value[index] = getFieldInput(internalFieldStore.children[index]);
      }
      return value;
    }

    // Otherwise, return nullish input as-is
    return internalFieldStore.input.value;
  }

  // If field store is object, collect input from children
  if (internalFieldStore.kind === 'object') {
    // If object input is not nullish, build object from children
    if (internalFieldStore.input.value) {
      // Create output object
      const value: Record<string, unknown> = {};

      // Collect input from each object property
      for (const key in internalFieldStore.children) {
        value[key] = getFieldInput(internalFieldStore.children[key]);
      }
      return value;
    }

    // Otherwise, return nullish input as-is
    return internalFieldStore.input.value;
  }

  // Return primitive value input
  return internalFieldStore.input.value;
}
