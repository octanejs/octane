import { describe, expectTypeOf, test } from 'vitest';
import type {
  DeepPartial,
  IsAny,
  IsNever,
  MaybePromise,
  PartialValues,
} from './utils.ts';

describe('IsAny', () => {
  test('should return true for `any`', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<IsAny<any>>().toEqualTypeOf<true>();
  });

  test('should return false for `never`', () => {
    expectTypeOf<IsAny<never>>().toEqualTypeOf<false>();
  });

  test('should return false for `unknown`', () => {
    expectTypeOf<IsAny<unknown>>().toEqualTypeOf<false>();
  });

  test('should return false for primitives', () => {
    expectTypeOf<IsAny<string>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<number>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<boolean>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<null>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<undefined>>().toEqualTypeOf<false>();
  });

  test('should return false for objects, arrays, and unions', () => {
    expectTypeOf<IsAny<{ a: number }>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<string[]>>().toEqualTypeOf<false>();
    expectTypeOf<IsAny<string | number>>().toEqualTypeOf<false>();
  });
});

describe('IsNever', () => {
  test('should return true for `never`', () => {
    expectTypeOf<IsNever<never>>().toEqualTypeOf<true>();
  });

  test('should return false for `any`', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<IsNever<any>>().toEqualTypeOf<false>();
  });

  test('should return false for `unknown`', () => {
    expectTypeOf<IsNever<unknown>>().toEqualTypeOf<false>();
  });

  test('should return false for non-`never` types', () => {
    expectTypeOf<IsNever<string>>().toEqualTypeOf<false>();
    expectTypeOf<IsNever<undefined>>().toEqualTypeOf<false>();
    expectTypeOf<IsNever<null>>().toEqualTypeOf<false>();
    expectTypeOf<IsNever<{ a: number }>>().toEqualTypeOf<false>();
  });

  test('should not distribute over unions (returns false for `T | never`)', () => {
    // `never` is the identity of `|`, so `string | never` simplifies to `string`.
    // The non-distributive `[T] extends [never]` check is what makes IsNever
    // safe to call with naked type parameters that could be unions.
    expectTypeOf<IsNever<string | never>>().toEqualTypeOf<false>();
  });
});

describe('MaybePromise', () => {
  test('should produce `T | Promise<T>`', () => {
    expectTypeOf<MaybePromise<string>>().toEqualTypeOf<
      string | Promise<string>
    >();
    expectTypeOf<MaybePromise<number>>().toEqualTypeOf<
      number | Promise<number>
    >();
  });

  test('should distribute over union inputs', () => {
    expectTypeOf<MaybePromise<string | number>>().toEqualTypeOf<
      string | number | Promise<string | number>
    >();
  });
});

describe('DeepPartial', () => {
  test('should make primitives optional', () => {
    expectTypeOf<DeepPartial<string>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<DeepPartial<number>>().toEqualTypeOf<number | undefined>();
    expectTypeOf<DeepPartial<boolean>>().toEqualTypeOf<boolean | undefined>();
  });

  test('should make all object properties optional with optional values', () => {
    expectTypeOf<DeepPartial<{ name: string; age: number }>>().toEqualTypeOf<{
      name?: string | undefined;
      age?: number | undefined;
    }>();
  });

  test('should recurse into nested objects', () => {
    expectTypeOf<
      DeepPartial<{ user: { name: string; age: number } }>
    >().toEqualTypeOf<{
      user?:
        | {
            name?: string | undefined;
            age?: number | undefined;
          }
        | undefined;
    }>();
  });

  test('should preserve already-optional properties', () => {
    expectTypeOf<DeepPartial<{ name?: string }>>().toEqualTypeOf<{
      name?: string | undefined;
    }>();
  });

  test('should handle null and undefined values', () => {
    expectTypeOf<
      DeepPartial<{ name: string | null; age: number | undefined }>
    >().toEqualTypeOf<{
      name?: string | null | undefined;
      age?: number | undefined;
    }>();
  });
});

describe('PartialValues', () => {
  test('should make primitive values optional', () => {
    expectTypeOf<PartialValues<string>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<PartialValues<number>>().toEqualTypeOf<number | undefined>();
    expectTypeOf<PartialValues<boolean>>().toEqualTypeOf<boolean | undefined>();
  });

  test('should keep object keys required but make leaf values optional', () => {
    expectTypeOf<PartialValues<{ name: string }>>().toEqualTypeOf<{
      name: string | undefined;
    }>();
  });

  test('should recurse into nested objects without making intermediates optional', () => {
    expectTypeOf<PartialValues<{ user: { name: string } }>>().toEqualTypeOf<{
      user: { name: string | undefined };
    }>();
  });

  test('should keep dynamic arrays of primitives as-is (no `(T | undefined)[]`)', () => {
    expectTypeOf<PartialValues<string[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<PartialValues<number[]>>().toEqualTypeOf<number[]>();
  });

  test('should make object members of dynamic arrays partial', () => {
    expectTypeOf<PartialValues<{ id: number }[]>>().toEqualTypeOf<
      { id: number | undefined }[]
    >();
  });

  test('should distribute over union element types in dynamic arrays', () => {
    // The reason `infer TItem` is used: without distribution, the conditional
    // would see the whole union, fail both the object and array branch, and
    // skip recursion entirely — leaving `{ id: number }` untouched.
    expectTypeOf<PartialValues<(string | { id: number })[]>>().toEqualTypeOf<
      (string | { id: number | undefined })[]
    >();
  });

  test('should recurse element-wise into tuples', () => {
    expectTypeOf<PartialValues<[string, number]>>().toEqualTypeOf<
      [string | undefined, number | undefined]
    >();
  });

  test('should preserve already-optional properties on objects', () => {
    expectTypeOf<PartialValues<{ name?: string }>>().toEqualTypeOf<{
      name?: string | undefined;
    }>();
  });

  test('should keep null and undefined in primitive value positions', () => {
    expectTypeOf<PartialValues<{ name: string | null }>>().toEqualTypeOf<{
      name: string | null | undefined;
    }>();
  });
});
