import type {
  InternalFieldStore,
  InternalFormStore,
  Path,
} from '../../types/index.ts';

/**
 * Returns the field store at the specified path by traversing the form store's
 * children hierarchy.
 *
 * @param internalFormStore The form store to traverse.
 * @param path The path to the field store.
 *
 * @returns The field store.
 */
// @__NO_SIDE_EFFECTS__
export function getFieldStore(
  internalFormStore: InternalFormStore,
  path: Path
): InternalFieldStore {
  // Start at form store root
  let internalFieldStore: InternalFieldStore = internalFormStore;

  // Traverse path to find target field store
  // TODO: This does not guard against paths that exist in the type but not at
  // runtime (e.g. a not-yet-created dynamic array index), so navigating into a
  // missing child returns `undefined` and crashes consumers like the deep error
  // methods. A clean fix likely throws an error or returns `undefined` here
  // and handles it in all callers.
  for (const key of path) {
    // Navigate to child at current path key
    // @ts-expect-error
    internalFieldStore = internalFieldStore.children[key];
  }

  // Return found field store
  return internalFieldStore;
}
