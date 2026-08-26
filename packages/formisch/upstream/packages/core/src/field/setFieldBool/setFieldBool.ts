import { batch, untrack } from '../../framework/index.ts';
import type { InternalFieldStore } from '../../types/index.ts';
import { walkFieldStore } from '../walkFieldStore/index.ts';

/**
 * Sets the specified boolean property for the field store and all nested
 * children. Recursively updates arrays and objects.
 *
 * @param internalFieldStore The field store to update.
 * @param type The boolean property type to set.
 * @param bool The boolean value to set.
 */
export function setFieldBool(
  internalFieldStore: InternalFieldStore,
  type: 'isTouched' | 'isDirty',
  bool: boolean
): void {
  // Batch all state updates for optimal reactivity performance
  batch(() => {
    // Untracked to avoid subscribing a surrounding reactive scope to the
    // form structure
    untrack(() => {
      // Set property on each field store
      walkFieldStore(internalFieldStore, (internalFieldStore) => {
        internalFieldStore[type].value = bool;
      });
    });
  });
}
