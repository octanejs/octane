import type { InternalFieldStore } from '../../types/index.ts';
import { walkFieldStore } from '../walkFieldStore/index.ts';

/**
 * Returns whether the specified boolean property is true for the field store
 * or any of its nested children. Recursively checks arrays and objects.
 *
 * @param internalFieldStore The field store to check.
 * @param type The boolean property type to check.
 *
 * @returns Whether the property is true.
 */
// @__NO_SIDE_EFFECTS__
export function getFieldBool(
  internalFieldStore: InternalFieldStore,
  type: 'errors' | 'isTouched' | 'isEdited' | 'isDirty'
): boolean {
  // Stop walking as soon as a field has the property set to true
  return walkFieldStore(internalFieldStore, (internalFieldStore) =>
    Boolean(internalFieldStore[type].value)
  );
}
