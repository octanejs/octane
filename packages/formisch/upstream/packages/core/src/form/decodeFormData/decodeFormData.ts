import type { FormSchema } from '../../types/index.ts';

// Matches decimal number with optional sign, fraction and exponent (e.g. "42",
// "-7", "+0.5", ".5", "1.5e3"), rejecting junk like hex or "Infinity"
// eslint-disable-next-line security/detect-unsafe-regex
const NUMBER_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

// Matches timezone-less ISO date and time with optional seconds and fractional
// seconds (e.g. "2023-06-15T14:30" or "2023-06-15T14:30:45.123"), as emitted by
// `<input type="datetime-local">`
const ISO_DATE_TIME_REGEX =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:[12]\d|0[1-9]|3[01])T(?:0\d|1\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/u;

// Hint: Maximum number of items allowed per array field. A numeric path
// segment is used as an array index, so a single crafted key like
// `["items",1000000000]` would set the array length to one billion. Creating
// the sparse array is cheap, but every later pass that walks it by length
// then runs in O(length), such as `fillDefaults` and the schema validation
// the caller runs on the result. An array of booleans even writes a value at
// every index, so a tiny request can exhaust CPU and memory. The limit is a
// fixed number because a legitimate sparse array (one checked checkbox at a
// high index, the rest unchecked and absent) is indistinguishable from an
// attack; only the index magnitude differs. Throwing rather than truncating
// avoids silently returning wrong data.
const MAX_ARRAY_LENGTH = 5000;

/**
 * Internal schema type with the structural properties that are read while
 * traversing a Valibot schema.
 */
interface InternalSchema {
  readonly type: string;
  readonly wrapped?: InternalSchema;
  readonly getter?: (input: undefined) => InternalSchema;
  readonly entries?: Record<string, InternalSchema>;
  readonly item?: InternalSchema;
  readonly items?: InternalSchema[];
  readonly options?: InternalSchema[];
}

/**
 * Unwraps wrapper and lazy schemas until a concrete schema is reached.
 *
 * @param schema The schema to unwrap.
 *
 * @returns The unwrapped schema.
 */
function unwrapSchema(schema: InternalSchema): InternalSchema {
  switch (schema.type) {
    case 'exact_optional':
    case 'nullable':
    case 'nullish':
    case 'optional':
    case 'undefinedable':
    case 'non_nullable':
    case 'non_nullish':
    case 'non_optional':
      return unwrapSchema(schema.wrapped!);
    case 'lazy':
      return unwrapSchema(schema.getter!(undefined));
    default:
      return schema;
  }
}

/**
 * Returns the child schema for the given key by traversing objects, arrays,
 * tuples and schema options. Returns `undefined` if no child schema is found.
 *
 * @param schema The parent schema.
 * @param key The path key.
 *
 * @returns The child schema or `undefined`.
 */
function getChildSchema(
  schema: InternalSchema | undefined,
  key: string | number
): InternalSchema | undefined {
  if (schema) {
    // Unwrap schema before reading its structure
    const unwrapped = unwrapSchema(schema);

    // If schema is object, return entry schema
    if (
      unwrapped.type === 'object' ||
      unwrapped.type === 'loose_object' ||
      unwrapped.type === 'strict_object'
    ) {
      return unwrapped.entries![key];
    }

    // If schema is array, return item schema
    if (unwrapped.type === 'array') {
      return unwrapped.item;
    }

    // If schema is tuple, return item schema at index
    if (
      unwrapped.type === 'tuple' ||
      unwrapped.type === 'loose_tuple' ||
      unwrapped.type === 'strict_tuple'
    ) {
      return unwrapped.items![key as number];
    }

    // If schema has options, return first matching child schema
    if (
      unwrapped.type === 'union' ||
      unwrapped.type === 'intersect' ||
      unwrapped.type === 'variant'
    ) {
      // Hint: The first matching option is used. For a union or variant where
      // the same key has different types across options, the value is decoded
      // based on the first option, since the matching branch is only known
      // during validation.
      for (const option of unwrapped.options!) {
        const childSchema = getChildSchema(option, key);
        if (childSchema !== undefined) {
          return childSchema;
        }
      }
    }
  }
}

/**
 * Decodes a stringified date based on its format. Empty strings become `null`.
 *
 * @param value The stringified value.
 *
 * @returns The decoded date.
 */
function decodeDate(value: string): Date | null | undefined {
  if (!value || value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }
  // Hint: A timezone-less date and time (from `<input type="datetime-local">`)
  // is interpreted as local time by `new Date`, so it is forced to UTC. Dates,
  // months and full timestamps are already parsed as UTC.
  if (ISO_DATE_TIME_REGEX.test(value)) {
    return new Date(`${value}Z`);
  }
  return new Date(value);
}

/**
 * Decodes a stringified boolean. Empty strings become `null`.
 *
 * @param value The stringified value.
 *
 * @returns The decoded boolean.
 */
function decodeBoolean(value: string): boolean | null | undefined {
  if (!value || value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }
  return !(value === 'false' || value === 'off' || value === '0');
}

/**
 * Decodes a stringified number. Empty strings become `null` and non-numeric
 * values become `NaN`.
 *
 * @param value The stringified value.
 *
 * @returns The decoded number.
 */
function decodeNumber(value: string): number | null | undefined {
  if (!value || value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }
  if (NUMBER_REGEX.test(value)) {
    return Number(value);
  }
  return NaN;
}

/**
 * Decodes a stringified bigint. Empty strings become `null` and invalid values
 * are returned unchanged.
 *
 * @param value The stringified value.
 *
 * @returns The decoded bigint.
 */
function decodeBigint(value: string): bigint | string | null | undefined {
  if (!value || value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }
  try {
    return BigInt(value);
  } catch {
    return value;
  }
}

/**
 * Decodes a single form data value based on the concrete schema type. Files
 * and unknown types are returned unchanged.
 *
 * @param value The form data value.
 * @param schema The schema of the value.
 *
 * @returns The decoded value.
 */
function decodeValue(
  value: FormDataEntryValue,
  schema: InternalSchema | undefined
): unknown {
  // Non-string values (files) and unknown schemas are returned unchanged
  if (typeof value !== 'string' || !schema) {
    return value;
  }

  // Decode value based on concrete schema type
  switch (unwrapSchema(schema).type) {
    case 'number':
      return decodeNumber(value);
    case 'boolean':
      return decodeBoolean(value);
    case 'date':
      return decodeDate(value);
    case 'bigint':
      return decodeBigint(value);
    default:
      return value;
  }
}

/**
 * Fills in default values that are lost during the form data transfer. Booleans
 * of unchecked checkboxes become `false` and absent arrays become empty. Only
 * containers that are present in the decoded data are completed.
 *
 * @param schema The schema of the value.
 * @param parent The parent object or array holding the value.
 * @param key The key of the value within its parent.
 */
function fillDefaults(
  schema: InternalSchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parent: any,
  key: string | number
): void {
  // Unwrap schema before reading its structure
  const unwrappedSchema = unwrapSchema(schema);

  // If schema is boolean, default absent (unchecked checkbox) values to `false`
  // Hint: Only `undefined` is treated as absent so that a decoded `null` (e.g.
  // from a nullable boolean) is preserved instead of being coerced to `false`.
  if (unwrappedSchema.type === 'boolean') {
    if (parent[key] === undefined) {
      parent[key] = false;
    }

    // Otherwise, if schema is array, default absent arrays and complete items
  } else if (unwrappedSchema.type === 'array') {
    if (Array.isArray(parent[key])) {
      for (let index = 0; index < parent[key].length; index++) {
        fillDefaults(unwrappedSchema.item!, parent[key], index);
      }
    } else {
      parent[key] = [];
    }

    // Otherwise, if schema is tuple, complete items of present tuples
  } else if (
    unwrappedSchema.type === 'tuple' ||
    unwrappedSchema.type === 'loose_tuple' ||
    unwrappedSchema.type === 'strict_tuple'
  ) {
    if (Array.isArray(parent[key])) {
      for (let index = 0; index < unwrappedSchema.items!.length; index++) {
        fillDefaults(unwrappedSchema.items![index], parent[key], index);
      }
    }

    // Otherwise, if schema is object, complete present entries
  } else if (
    unwrappedSchema.type === 'object' ||
    unwrappedSchema.type === 'loose_object' ||
    unwrappedSchema.type === 'strict_object'
  ) {
    if (parent[key] && typeof parent[key] === 'object') {
      for (const entryKey in unwrappedSchema.entries) {
        fillDefaults(unwrappedSchema.entries[entryKey], parent[key], entryKey);
      }
    }

    // Otherwise, if schema has options, complete for each option
    // Hint: Defaults from every option are applied because the matching branch
    // of a union or variant is only known during validation, not while
    // decoding. This is correct for intersect (all options apply) and harmless
    // for object options (unknown keys are ignored on parse). A `strictObject`
    // option may reject the extra keys though, so reliably decoding such a
    // variant would require resolving its branch via the discriminator, which
    // is not possible before validation.
  } else if (
    unwrappedSchema.type === 'union' ||
    unwrappedSchema.type === 'intersect' ||
    unwrappedSchema.type === 'variant'
  ) {
    for (const option of unwrappedSchema.options!) {
      fillDefaults(option, parent, key);
    }
  }
}

/**
 * Decodes the entries of a form data object into nested form values using the
 * Valibot schema as the source of truth. Information that is lost during the
 * transfer via HTTP, like numbers, booleans, dates and unchecked checkboxes,
 * is restored based on the schema.
 *
 * The keys of the form data are expected to be the stringified field paths that
 * Formisch assigns to its field elements (for example `["todos",0,"label"]`).
 *
 * @param schema The form schema.
 * @param formData The form data object.
 *
 * @returns The decoded form values.
 */
// @__NO_SIDE_EFFECTS__
export function decodeFormData<TSchema extends FormSchema>(
  schema: TSchema,
  formData: FormData
): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any = {};

  // Build nested values from form data entries
  formData.forEach((value, key) => {
    // Convert stringified key back to field path array, ignore invalid JSON
    let path: unknown = null;
    try {
      path = JSON.parse(key);
    } catch {
      // Ignore invalid JSON keys
    }

    // Only process valid, non-empty field paths whose value is not empty
    // (unselected) file input
    if (
      Array.isArray(path) &&
      path.length > 0 &&
      (typeof value === 'string' || value.size > 0 || value.name !== '')
    ) {
      // Create temporary references for parent value and schema
      let parentValue = values;
      let parentSchema: InternalSchema | undefined = schema as InternalSchema;

      // Traverse path segments and build nested structure based on schema
      for (let index = 0; index < path.length; index++) {
        const segment = path[index];

        // Skip invalid keys and keys that could pollute object prototype
        if (
          (typeof segment !== 'string' && typeof segment !== 'number') ||
          segment === '' ||
          segment === '__proto__' ||
          segment === 'prototype' ||
          segment === 'constructor'
        ) {
          break;
        }

        // Arrays are indexed by numbers; string segments would write properties
        // like `length` or `push` that inflate or corrupt them
        if (Array.isArray(parentValue)) {
          if (typeof segment === 'string') {
            break;
          }

          // Throw on oversized array index (see MAX_ARRAY_LENGTH)
          if (segment >= MAX_ARRAY_LENGTH) {
            throw new Error(
              `Array exceeds the maximum length of ${MAX_ARRAY_LENGTH}`
            );
          }
        }

        // Get child schema for current segment
        const childSchema = getChildSchema(parentSchema, segment);

        // If segment is last one, set or append decoded value
        if (index === path.length - 1) {
          const unwrappedSchema = childSchema && unwrapSchema(childSchema);

          // If schema is dynamic array, append decoded item
          if (unwrappedSchema && unwrappedSchema.type === 'array') {
            parentValue[segment] ??= [];
            parentValue[segment].push(decodeValue(value, unwrappedSchema.item));

            // Otherwise, set decoded value
          } else {
            parentValue[segment] = decodeValue(value, childSchema);
          }

          // Otherwise, create next container and continue traversing
        } else {
          if (parentValue[segment] == null) {
            // Create array for array and tuple schemas, object otherwise
            const schemaType = childSchema && unwrapSchema(childSchema).type;
            parentValue[segment] =
              schemaType === 'array' ||
              schemaType === 'tuple' ||
              schemaType === 'loose_tuple' ||
              schemaType === 'strict_tuple'
                ? []
                : {};

            // Otherwise, stop on conflicting scalar value to avoid writing a
            // property to a non-object, which throws in strict mode
          } else if (typeof parentValue[segment] !== 'object') {
            break;
          }
          parentValue = parentValue[segment];
          parentSchema = childSchema;
        }
      }
    }
  });

  // Fill in default values that are lost during transfer
  fillDefaults(schema as InternalSchema, { values }, 'values');

  return values;
}
