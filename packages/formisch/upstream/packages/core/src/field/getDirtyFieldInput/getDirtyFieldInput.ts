import type { InternalFieldStore } from '../../types/index.ts';
import { getFieldBool } from '../getFieldBool/getFieldBool.ts';

/**
 * Returns only the dirty input of the field store. Arrays are treated as
 * atomic and returned in full if any item is dirty, while object keys without
 * a dirty descendant are omitted. Returns `undefined` if no descendant is
 * dirty.
 *
 * @param internalFieldStore The field store to get dirty input from.
 * @param dirtyOnly Whether to only include dirty fields. Defaults to `true`.
 *
 * @returns The dirty input, or `undefined` if no descendant is dirty.
 */
// @__NO_SIDE_EFFECTS__
export function getDirtyFieldInput(
  internalFieldStore: InternalFieldStore,
  dirtyOnly: boolean = true
): unknown {
  // If field has no dirty descendant, return undefined
  if (dirtyOnly && !getFieldBool(internalFieldStore, 'isDirty')) {
    return undefined;
  }

  // If field store is array, collect input from children
  if (internalFieldStore.kind === 'array') {
    // If array input is not nullish, build full array from children
    if (internalFieldStore.input.value) {
      // Create output array
      const value = [];

      // Collect input from each array item
      for (
        let index = 0;
        index < internalFieldStore.items.value.length;
        index++
      ) {
        value[index] = getDirtyFieldInput(
          internalFieldStore.children[index],
          false
        );
      }
      return value;
    }

    // Otherwise, return nullish input as-is
    return internalFieldStore.input.value;
  }

  // If field store is object, recurse only into dirty children
  if (internalFieldStore.kind === 'object') {
    // If object input is not nullish, build object from children
    if (internalFieldStore.input.value) {
      // Create output object
      const value: Record<string, unknown> = {};

      // Collect input from each dirty object property
      for (const key in internalFieldStore.children) {
        const child = internalFieldStore.children[key];
        if (!dirtyOnly || getFieldBool(child, 'isDirty')) {
          value[key] = getDirtyFieldInput(child, dirtyOnly);
        }
      }
      return value;
    }

    // Otherwise, return nullish input as-is
    return internalFieldStore.input.value;
  }

  // Return primitive value input
  return internalFieldStore.input.value;
}
