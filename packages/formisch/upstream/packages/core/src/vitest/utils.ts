import type * as v from 'valibot';
import { vi } from 'vitest';
import { createFormStore } from '../form/createFormStore/createFormStore.ts';
import type {
  EmptyInput,
  FormSchema,
  InternalFormStore,
  ValidationMode,
} from '../types/index.ts';

/**
 * Configuration options for creating a test store.
 */
interface CreateTestStoreConfig {
  validate?: ValidationMode | undefined;
  revalidate?: Exclude<ValidationMode, 'initial'> | undefined;
  initialInput?: unknown | undefined;
  emptyInput?: EmptyInput | undefined;
  issues?: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]] | undefined;
}

/**
 * Creates a form store for testing with mocked parse function.
 *
 * @param schema The Valibot schema for the form.
 * @param config Optional configuration for the store.
 *
 * @returns An internal form store for testing.
 */
export function createTestStore<TSchema extends FormSchema>(
  schema: TSchema,
  config: CreateTestStoreConfig = {}
): InternalFormStore<TSchema> {
  const { validate, revalidate, initialInput, emptyInput, issues } = config;

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
  // `createFormStore` returns a non-generic `InternalFormStore`, so cast back to
  // the concrete schema to keep the generic parameter meaningful for callers.
  return createFormStore(
    {
      schema,
      initialInput: initialInput as v.InferInput<TSchema>,
      emptyInput,
      validate,
      revalidate,
    },
    parse
  ) as InternalFormStore<TSchema>;
}

/**
 * Creates an object path item for testing validation issues.
 *
 * @param key The object key.
 * @param value The value at the key.
 *
 * @returns An object path item.
 */
export function objectPath(key: string, value: unknown = ''): v.ObjectPathItem {
  return { type: 'object', origin: 'value', input: {}, key, value };
}

/**
 * Creates an array path item for testing validation issues.
 *
 * @param key The array index.
 * @param value The value at the index.
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
 * @param path The path to the field.
 *
 * @returns A base issue object.
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
 * @returns A base issue object.
 */
export function schemaIssue(message: string): v.BaseIssue<unknown> {
  return {
    kind: 'schema',
    type: 'object',
    input: null,
    expected: 'Object',
    received: 'null',
    message,
  };
}
