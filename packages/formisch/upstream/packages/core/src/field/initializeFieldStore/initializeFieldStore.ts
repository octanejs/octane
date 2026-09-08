import * as v from 'valibot';
import { createId, createSignal, framework } from '../../framework/index.ts';
import type {
  EmptyInput,
  FieldElement,
  InternalFieldStore,
  InternalFormStore,
  Path,
} from '../../types/index.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FieldSchema =
  | v.ArraySchema<
      v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
      v.ErrorMessage<v.ArrayIssue> | undefined
    >
  | v.BooleanSchema<any>
  | v.DateSchema<any>
  | v.ExactOptionalSchema<any, any>
  | v.IntersectSchema<any, any>
  | v.LazySchema<any>
  | v.LooseObjectSchema<any, any>
  | v.LooseTupleSchema<any, any>
  | v.NonNullableSchema<any, any>
  | v.NonNullishSchema<any, any>
  | v.NonOptionalSchema<any, any>
  | v.NullableSchema<any, any>
  | v.NullishSchema<any, any>
  | v.NumberSchema<any>
  | v.ObjectSchema<v.ObjectEntries, v.ErrorMessage<v.ObjectIssue> | undefined>
  | v.ObjectWithRestSchema<
      v.ObjectEntries,
      v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
      v.ErrorMessage<v.ObjectWithRestIssue> | undefined
    >
  | v.OptionalSchema<any, any>
  | v.PromiseSchema<any>
  | v.RecordSchema<any, any, any>
  | v.StrictObjectSchema<any, any>
  | v.StrictTupleSchema<any, any>
  | v.StringSchema<any>
  | v.TupleSchema<v.TupleItems, v.ErrorMessage<v.TupleIssue> | undefined>
  | v.TupleWithRestSchema<any, any, any>
  | v.UndefinedableSchema<any, any>
  | v.UnionSchema<any, any>
  | v.VariantSchema<any, any, any>;

/**
 * Initializes a field store recursively based on the schema structure. Handles
 * array, object, and value schemas, setting up all necessary signals and
 * children. Supports wrapped schemas and schema options.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The partial field store to initialize.
 * @param schema The Valibot schema defining the field structure.
 * @param initialInput The initial input value.
 * @param path The path to the field in the form.
 * @param nullish Whether the schema is wrapped in a nullish schema.
 */
export function initializeFieldStore(
  internalFormStore: InternalFormStore,
  internalFieldStore: Partial<InternalFieldStore>,
  schema: FieldSchema,
  initialInput: unknown,
  path: Path,
  nullish = false
): void {
  // If schema is unsupported, throw error
  if (
    (framework === 'qwik' && schema.type === 'lazy') ||
    schema.type === 'object_with_rest' ||
    schema.type === 'record' ||
    schema.type === 'tuple_with_rest' ||
    schema.type === 'promise'
  ) {
    throw new Error(`"${schema.type}" schema is not supported`);

    // Otherwise, if schema is lazy, unwrap and initialize
  } else if (schema.type === 'lazy') {
    initializeFieldStore(
      internalFormStore,
      internalFieldStore,
      schema.getter(undefined),
      initialInput,
      path,
      nullish
    );

    // Otherwise, if schema is nullish wrapper, unwrap and initialize
  } else if (
    schema.type === 'exact_optional' ||
    schema.type === 'nullable' ||
    schema.type === 'nullish' ||
    schema.type === 'optional' ||
    schema.type === 'undefinedable'
  ) {
    initializeFieldStore(
      internalFormStore,
      internalFieldStore,
      schema.wrapped,
      initialInput === undefined ? v.getDefault(schema) : initialInput,
      path,
      true
    );

    // Otherwise, if schema is non-nullish wrapper, unwrap and initialize
  } else if (
    schema.type === 'non_nullable' ||
    schema.type === 'non_nullish' ||
    schema.type === 'non_optional'
  ) {
    // Forward the nullish flag so an outer optional or nullable wrapper still
    // keeps the field at `undefined`/`null` instead of its empty input (e.g.
    // `v.optional(v.nonOptional(v.string()))`)
    initializeFieldStore(
      internalFormStore,
      internalFieldStore,
      schema.wrapped,
      initialInput,
      path,
      nullish
    );

    // Otherwise, if schema has options, initialize for each option
  } else if (
    schema.type === 'intersect' ||
    schema.type === 'union' ||
    schema.type === 'variant'
  ) {
    // Initialize field store for each schema option
    // Hint: Options share a single field store per key, so per-branch metadata
    // (`schema`, `kind`, `isNullish`) is approximated last-write-wins. A key
    // that differs across branches (e.g. nullish in one, required in another)
    // is therefore not fully represented. See #95 for the long-term fix.
    for (const schemaOption of schema.options) {
      initializeFieldStore(
        internalFormStore,
        internalFieldStore,
        schemaOption,
        initialInput,
        path,
        nullish
      );
    }

    // Otherwise, initialize as concrete schema
  } else {
    // Set basic properties
    internalFieldStore.schema = schema;
    internalFieldStore.name = JSON.stringify(path);
    // Hint: Each field store receives its own freshly built path array (see the
    // `[...path, key]` calls below), so it can be stored directly.
    internalFieldStore.path = path;

    // Store whether property is nullish so resetting can stay consistent
    internalFieldStore.isNullish = nullish;

    // Initialize elements array
    // Hint: `initialElements` and `elements` start as the same array so that
    // `reset` can restore elements that array methods move between field stores
    // (see `initialElements` in the `InternalBaseStore` interface).
    const initialElements: FieldElement[] = [];
    internalFieldStore.initialElements = initialElements;
    internalFieldStore.elements = initialElements;

    // Initialize common signals
    internalFieldStore.errors = createSignal(null);
    internalFieldStore.isTouched = createSignal(false);
    internalFieldStore.isEdited = createSignal(false);
    internalFieldStore.isDirty = createSignal(false);

    // If schema is array or tuple, initialize as array field
    if (
      schema.type === 'array' ||
      schema.type === 'loose_tuple' ||
      schema.type === 'strict_tuple' ||
      schema.type === 'tuple'
    ) {
      // If already initialized as different kind, throw error
      if (internalFieldStore.kind && internalFieldStore.kind !== 'array') {
        throw new Error(
          `Store initialized as "${internalFieldStore.kind}" cannot be reinitialized as "array"`
        );
      }

      // Set kind to array
      internalFieldStore.kind = 'array';

      // Initialize array-specific properties
      if (internalFieldStore.kind === 'array') {
        // Initialize children array if not exists
        internalFieldStore.children ??= [];

        // If schema is dynamic array, initialize children from input
        if (schema.type === 'array') {
          // If initial input provided, initialize children
          if (initialInput) {
            // Initialize child for each input item
            for (
              let index = 0;
              // @ts-expect-error
              index < initialInput.length;
              index++
            ) {
              // Create empty child object
              // @ts-expect-error
              internalFieldStore.children[index] = {};

              // Initialize field store for child
              initializeFieldStore(
                internalFormStore,
                internalFieldStore.children[index],
                schema.item as FieldSchema,
                // @ts-expect-error
                initialInput[index],
                [...path, index]
              );
            }
          }

          // Otherwise, if schema is fixed tuple, initialize children from schema
        } else {
          // Initialize child for each tuple item
          for (let index = 0; index < schema.items.length; index++) {
            // Create empty child object
            // @ts-expect-error
            internalFieldStore.children[index] = {};

            // Initialize field store for child
            initializeFieldStore(
              internalFormStore,
              internalFieldStore.children[index],
              schema.items[index] as FieldSchema,
              // @ts-expect-error
              initialInput?.[index],
              [...path, index]
            );
          }
        }

        // Set array input (nullish or true)
        const arrayInput =
          nullish && initialInput == null ? initialInput : true;
        internalFieldStore.initialInput = createSignal(arrayInput);
        internalFieldStore.startInput = createSignal(arrayInput);
        internalFieldStore.input = createSignal(arrayInput);

        // Set items with unique IDs for each child
        const initialItems = internalFieldStore.children.map(createId);
        internalFieldStore.initialItems = createSignal(initialItems);
        internalFieldStore.startItems = createSignal(initialItems);
        internalFieldStore.items = createSignal(initialItems);
      }

      // Otherwise, if schema is object, initialize as object field
    } else if (
      schema.type === 'loose_object' ||
      schema.type === 'object' ||
      schema.type === 'strict_object'
    ) {
      // If already initialized as different kind, throw error
      if (internalFieldStore.kind && internalFieldStore.kind !== 'object') {
        throw new Error(
          `Store initialized as "${internalFieldStore.kind}" cannot be reinitialized as "object"`
        );
      }

      // Set kind to object
      internalFieldStore.kind = 'object';

      // Initialize object-specific properties
      if (internalFieldStore.kind === 'object') {
        // Initialize children object if not exists
        internalFieldStore.children ??= {};

        // Initialize child for each object entry
        for (const key in schema.entries) {
          // Create empty child object if not exists
          // @ts-expect-error
          internalFieldStore.children[key] ??= {};

          // Initialize field store for child
          initializeFieldStore(
            internalFormStore,
            internalFieldStore.children[key],
            schema.entries[key] as FieldSchema,
            // @ts-expect-error
            initialInput?.[key],
            [...path, key]
          );
        }

        // Set object input (nullish or true)
        const objectInput =
          nullish && initialInput == null ? initialInput : true;
        internalFieldStore.initialInput = createSignal(objectInput);
        internalFieldStore.startInput = createSignal(objectInput);
        internalFieldStore.input = createSignal(objectInput);
      }

      // Otherwise, initialize as value field (leaf node)
    } else {
      // If already initialized as different kind, throw error
      if (internalFieldStore.kind && internalFieldStore.kind !== 'value') {
        throw new Error(
          `Store initialized as "${internalFieldStore.kind}" cannot be reinitialized as "value"`
        );
      }

      // Set kind to value
      internalFieldStore.kind = 'value';

      // Initialize value-specific properties
      if (internalFieldStore.kind === 'value') {
        // Resolve the empty input for this field's type from the configured map
        // (e.g. `''` for a string), so an untouched empty field matches the DOM
        // and validates with its own message instead of a type mismatch.
        // Optional and nullable fields stay `undefined` as they accept it.
        const valueInput =
          initialInput === undefined && !nullish
            ? internalFormStore.emptyInput[schema.type as keyof EmptyInput]
            : initialInput;

        // Set initial, start and current input
        internalFieldStore.initialInput = createSignal(valueInput);
        internalFieldStore.startInput = createSignal(valueInput);
        internalFieldStore.input = createSignal(valueInput);
      }
    }
  }
}
