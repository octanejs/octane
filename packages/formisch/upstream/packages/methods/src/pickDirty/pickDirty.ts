import {
  type BaseFormStore,
  type DeepPartial,
  type FormSchema,
  getFieldBool,
  INTERNAL,
  type InternalFieldStore,
} from '@formisch/core';

/**
 * Pick dirty config interface.
 */
export interface PickDirtyConfig<TValue extends object> {
  /**
   * The value to filter down to its dirty parts. Must be structurally
   * compatible with the form's schema.
   */
  readonly from: TValue;
}

/**
 * Picks only the dirty parts of the given value, using the form's dirty fields
 * as a structural mask. Arrays are treated as atomic and object keys without a
 * dirty descendant are omitted. Returns `undefined` if no field is dirty.
 * Useful for filtering a validated output down to its changed parts before
 * submitting.
 *
 * @param form The form store providing the dirty mask.
 * @param config The pick dirty configuration.
 *
 * @returns The dirty parts of the value, or `undefined`.
 */
// @__NO_SIDE_EFFECTS__
export function pickDirty<TSchema extends FormSchema, TValue extends object>(
  form: BaseFormStore<TSchema>,
  config: PickDirtyConfig<TValue>
): DeepPartial<TValue> | undefined {
  // If no field is dirty, return undefined
  if (!getFieldBool(form[INTERNAL], 'isDirty')) {
    return undefined;
  }

  // Pick the dirty parts of the value using the form as a mask
  const result = pickFieldValue(form[INTERNAL], config.from);

  // Return undefined if no dirty property ended up in the result, which can
  // happen when every dirty key is absent from the supplied value
  return Object.keys(result as object).length
    ? (result as DeepPartial<TValue>)
    : undefined;
}

/**
 * Recursively picks the dirty parts of a value using the field store as a
 * structural mask, reading from the supplied value rather than the form's own
 * input. Objects with non-nullish input recurse into their dirty children that
 * are present in the value, while arrays, primitives, nullish-cleared fields
 * and shape-diverging values are returned as-is.
 *
 * @param internalFieldStore The field store used as the dirty mask.
 * @param value The value to pick the dirty parts from.
 *
 * @returns The dirty parts of the value.
 */
// @__NO_SIDE_EFFECTS__
function pickFieldValue(
  internalFieldStore: InternalFieldStore,
  value: unknown
): unknown {
  // If field store is object with non-nullish input and the value is a
  // matching (non-array) object, recurse into children
  if (
    internalFieldStore.kind === 'object' &&
    internalFieldStore.input.value &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    // Collect dirty parts from each dirty property present in value
    const result: Record<string, unknown> = {};
    for (const key in internalFieldStore.children) {
      const child = internalFieldStore.children[key];
      if (getFieldBool(child, 'isDirty') && key in value) {
        result[key] = pickFieldValue(
          child,
          (value as Record<string, unknown>)[key]
        );
      }
    }
    return result;
  }

  // Otherwise, field is atomic or its shape diverges, so return as-is
  return value;
}
