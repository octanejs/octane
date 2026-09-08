import {
  type BaseFormStore,
  createFormStore,
  type EmptyInput,
  type FormSchema,
  initializeFieldStore,
  INTERNAL,
  type InternalArrayStore,
  type InternalFormStore,
  type ValidationMode,
} from '@formisch/core';
import type * as v from 'valibot';
import { vi } from 'vitest';

/**
 * Configuration options for creating a test store.
 */
interface CreateTestStoreConfig<TSchema extends FormSchema> {
  validate?: ValidationMode | undefined;
  revalidate?: Exclude<ValidationMode, 'initial'> | undefined;
  initialInput?: v.InferInput<TSchema> | undefined;
  emptyInput?: EmptyInput | undefined;
  issues?: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]] | undefined;
}

/**
 * Creates a form store for testing with mocked parse function.
 *
 * @param schema The Valibot schema for the form.
 * @param config Optional configuration for the store.
 *
 * @returns A form store for testing with access to internal state.
 */
export function createTestStore<TSchema extends FormSchema>(
  schema: TSchema,
  config: CreateTestStoreConfig<TSchema> = {}
): BaseFormStore<TSchema> & InternalFormStore<TSchema> {
  const {
    validate = 'submit',
    revalidate = 'input',
    initialInput,
    emptyInput,
    issues,
  } = config;

  const result: v.SafeParseResult<TSchema> = issues
    ? {
        typed: false,
        success: false,
        output: initialInput as v.InferOutput<TSchema>,
        issues,
      }
    : {
        typed: true,
        success: true,
        output: initialInput as v.InferOutput<TSchema>,
        issues: undefined,
      };

  const parse = vi.fn().mockResolvedValue(result);

  // Create internal form store using the real core function
  const internalStore = createFormStore(
    {
      schema,
      initialInput,
      emptyInput,
      validate,
      revalidate,
    },
    parse
  );

  // Create a wrapper object that has both INTERNAL and direct properties
  // This mimics how BaseFormStore works
  const wrapper = {
    [INTERNAL]: internalStore,
  } as BaseFormStore<TSchema> & InternalFormStore<TSchema>;

  // Proxy all properties from internal to wrapper for easy access
  for (const key of Object.keys(internalStore)) {
    Object.defineProperty(wrapper, key, {
      get() {
        return (internalStore as unknown as Record<string, unknown>)[key];
      },
      set(value: unknown) {
        (internalStore as unknown as Record<string, unknown>)[key] = value;
      },
      enumerable: true,
    });
  }

  return wrapper;
}

/**
 * Creates an object path item for testing validation issues.
 *
 * @param key The key of the object property.
 * @param value The value at the path.
 *
 * @returns An object path item.
 */
export function objectPath(key: string, value: unknown = ''): v.ObjectPathItem {
  return { type: 'object', origin: 'value', input: {}, key, value };
}

/**
 * Creates an array path item for testing validation issues.
 *
 * @param key The index of the array item.
 * @param value The value at the path.
 *
 * @returns An array path item.
 */
export function arrayPath(key: number, value: unknown = ''): v.ArrayPathItem {
  return { type: 'array', origin: 'value', input: [], key, value };
}

/**
 * Creates a validation issue for testing.
 *
 * @param message The error message.
 * @param path The path to the issue location.
 *
 * @returns A validation issue object.
 */
export function validationIssue(
  message: string,
  path?: [v.IssuePathItem, ...v.IssuePathItem[]]
): v.BaseIssue<unknown> {
  return {
    kind: 'validation',
    type: 'check',
    input: '',
    expected: null,
    received: 'unknown',
    message,
    path,
  };
}

/**
 * Creates a schema-level issue for testing.
 *
 * @param message The error message.
 *
 * @returns A schema issue object.
 */
export function schemaIssue(message: string): v.BaseIssue<unknown> {
  return {
    kind: 'schema',
    type: 'object',
    input: {},
    expected: 'Object',
    received: 'unknown',
    message,
  };
}

/**
 * Pre-initializes a child slot in an array store to enable testing
 * of insert operations at specific indices.
 *
 * @param internalFormStore The internal form store.
 * @param arrayStore The internal array store.
 * @param index The index to initialize.
 */
export function initializeChildSlot(
  internalFormStore: InternalFormStore,
  arrayStore: InternalArrayStore,
  index: number
): void {
  if (!arrayStore.children[index]) {
    // @ts-expect-error - Creating empty object to be initialized
    arrayStore.children[index] = {};
    initializeFieldStore(
      internalFormStore,
      arrayStore.children[index],
      // @ts-expect-error - Accessing schema item
      arrayStore.schema.item,
      undefined,
      [...arrayStore.path, index]
    );
  }
}
