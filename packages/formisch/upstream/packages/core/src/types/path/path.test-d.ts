import { describe, expectTypeOf, test } from 'vitest';
import type {
  DirtyPath,
  ExactKeysOf,
  ExactKeysOfArrayPath,
  ExactRequired,
  FieldPath,
  Path,
  PathKey,
  PathValue,
  PropertiesOf,
  PropertiesOfArrayPath,
  RequiredPath,
  ValidArrayPath,
  ValidPath,
} from './path.ts';

describe('ExactKeysOf', () => {
  test('should return the keys of a plain object', () => {
    expectTypeOf<ExactKeysOf<{ a: number; b: string }>>().toEqualTypeOf<
      'a' | 'b'
    >();
  });

  test('should return the literal indices of a tuple', () => {
    expectTypeOf<ExactKeysOf<[number, string, boolean]>>().toEqualTypeOf<
      0 | 1 | 2
    >();
  });

  test('should return `number` for a dynamic array', () => {
    expectTypeOf<ExactKeysOf<string[]>>().toEqualTypeOf<number>();
    expectTypeOf<ExactKeysOf<readonly string[]>>().toEqualTypeOf<number>();
  });

  test('should return the union of keys across object union members', () => {
    expectTypeOf<ExactKeysOf<{ a: number } | { b: string }>>().toEqualTypeOf<
      'a' | 'b'
    >();
  });

  test('should return the union of keys across object and tuple union members', () => {
    expectTypeOf<ExactKeysOf<{ a: string } | [string]>>().toEqualTypeOf<
      'a' | 0
    >();
  });

  test('should return `never` for primitives', () => {
    expectTypeOf<ExactKeysOf<string>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<number>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<boolean>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<null>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<undefined>>().toEqualTypeOf<never>();
  });

  test('should return `never` for `any`, `unknown`, and `never`', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<ExactKeysOf<any>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<unknown>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOf<never>>().toEqualTypeOf<never>();
  });
});

describe('PropertiesOf', () => {
  test('should return the same shape for a plain object', () => {
    expectTypeOf<PropertiesOf<{ a: number; b: string }>>().toEqualTypeOf<{
      a: number;
      b: string;
    }>();
  });

  test('should produce an indexed object for tuples', () => {
    expectTypeOf<PropertiesOf<[number, string]>>().toEqualTypeOf<{
      0: number;
      1: string;
    }>();
  });

  test('should produce an index signature for dynamic arrays', () => {
    expectTypeOf<PropertiesOf<string[]>>().toEqualTypeOf<
      Record<number, string>
    >();
  });

  test('should merge keys across object union members', () => {
    expectTypeOf<PropertiesOf<{ a: number } | { b: string }>>().toEqualTypeOf<{
      a: number;
      b: string;
    }>();
  });

  test('should union value types for keys shared across union members', () => {
    expectTypeOf<
      PropertiesOf<{ a: number; b: string } | { a: boolean; c: Date }>
    >().toEqualTypeOf<{
      a: number | boolean;
      b: string;
      c: Date;
    }>();
  });

  test('should produce `{}` for primitives and non-indexable types', () => {
    expectTypeOf<PropertiesOf<string>>().toEqualTypeOf<{}>();
    expectTypeOf<PropertiesOf<number>>().toEqualTypeOf<{}>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<PropertiesOf<any>>().toEqualTypeOf<{}>();
    expectTypeOf<PropertiesOf<unknown>>().toEqualTypeOf<{}>();
    expectTypeOf<PropertiesOf<never>>().toEqualTypeOf<{}>();
  });
});

describe('ValidPath', () => {
  test('should accept a valid path on a simple object', () => {
    expectTypeOf<ValidPath<{ name: string }, ['name']>>().toEqualTypeOf<
      ['name']
    >();
  });

  test('should accept a nested path', () => {
    expectTypeOf<
      ValidPath<{ user: { name: string } }, ['user', 'name']>
    >().toEqualTypeOf<['user', 'name']>();
  });

  test('should accept a path that traverses a union', () => {
    expectTypeOf<
      ValidPath<
        { data: { type: 'a'; name: string } | { type: 'b'; age: number } },
        ['data', 'name']
      >
    >().toEqualTypeOf<['data', 'name']>();
  });

  test('should accept a path through an optional field', () => {
    expectTypeOf<
      ValidPath<{ profile?: { name: string } }, ['profile', 'name']>
    >().toEqualTypeOf<['profile', 'name']>();
  });

  test('should accept a path that indexes into a tuple', () => {
    expectTypeOf<
      ValidPath<{ coords: [number, number] }, ['coords', 0]>
    >().toEqualTypeOf<['coords', 0]>();
  });

  test('should return a suggestion when the last segment is invalid', () => {
    expectTypeOf<
      ValidPath<{ user: { name: string } }, ['user', 'wrong']>
    >().toEqualTypeOf<readonly ['user', 'name']>();
  });

  test('should return a suggestion when the first segment is invalid', () => {
    expectTypeOf<
      ValidPath<{ user: { name: string } }, ['wrong']>
    >().toEqualTypeOf<readonly ['user']>();
  });
});

describe('ExactRequired', () => {
  test('should pass primitive and nullish types through unchanged', () => {
    expectTypeOf<ExactRequired<string>>().toEqualTypeOf<string>();
    expectTypeOf<ExactRequired<number>>().toEqualTypeOf<number>();
    expectTypeOf<ExactRequired<boolean>>().toEqualTypeOf<boolean>();
    expectTypeOf<ExactRequired<null>>().toEqualTypeOf<null>();
    expectTypeOf<ExactRequired<undefined>>().toEqualTypeOf<undefined>();
  });

  test('should strip the optional marker while preserving the exact value (v.exactOptional case, strict mode)', () => {
    expectTypeOf<ExactRequired<{ a?: string }>>().toEqualTypeOf<{
      a: string;
    }>();
  });

  test('should preserve required properties unchanged', () => {
    expectTypeOf<ExactRequired<{ a: string }>>().toEqualTypeOf<{
      a: string;
    }>();
  });

  test('should preserve `| undefined` written explicitly on optional values (v.optional case)', () => {
    expectTypeOf<ExactRequired<{ a?: string | undefined }>>().toEqualTypeOf<{
      a: string | undefined;
    }>();
  });

  test('should preserve `| null` without adding undefined to required nullable values', () => {
    expectTypeOf<ExactRequired<{ a: string | null }>>().toEqualTypeOf<{
      a: string | null;
    }>();
  });

  test('should preserve explicit nullish values on optional properties (v.nullish case)', () => {
    expectTypeOf<
      ExactRequired<{ a?: string | null | undefined }>
    >().toEqualTypeOf<{ a: string | null | undefined }>();
  });

  test('should treat mixed required and optional keys correctly', () => {
    expectTypeOf<
      ExactRequired<{
        a?: string;
        b: number;
        c?: boolean | null | undefined;
      }>
    >().toEqualTypeOf<{
      a: string;
      b: number;
      c: boolean | null | undefined;
    }>();
  });

  test('should preserve the `readonly` modifier', () => {
    expectTypeOf<
      ExactRequired<{ readonly a?: string; readonly b: number }>
    >().toEqualTypeOf<{
      readonly a: string;
      readonly b: number;
    }>();
    expectTypeOf<
      ExactRequired<readonly (string | undefined)[]>
    >().toEqualTypeOf<readonly (string | undefined)[]>();
    expectTypeOf<
      ExactRequired<readonly [string, string | undefined]>
    >().toEqualTypeOf<readonly [string, string | undefined]>();
  });

  test('should produce an empty object for an empty object', () => {
    expectTypeOf<ExactRequired<{}>>().toEqualTypeOf<{}>();
  });

  test('should distribute over unions and preserve each member precisely', () => {
    expectTypeOf<
      ExactRequired<
        | { type: 'a'; value?: string }
        | { type: 'b'; count?: number | undefined }
      >
    >().toEqualTypeOf<
      { type: 'a'; value: string } | { type: 'b'; count: number | undefined }
    >();
  });

  test('should pass primitive members of unions through unchanged', () => {
    expectTypeOf<
      ExactRequired<string | { a?: number | undefined }>
    >().toEqualTypeOf<string | { a: number | undefined }>();
  });

  test('should pass arrays through unchanged', () => {
    expectTypeOf<ExactRequired<string[]>>().toEqualTypeOf<string[]>();
    expectTypeOf<ExactRequired<{ id: number }[]>>().toEqualTypeOf<
      { id: number }[]
    >();
  });

  test('should preserve `| undefined` in array element types (unlike plain `Required<T>`)', () => {
    expectTypeOf<ExactRequired<(string | undefined)[]>>().toEqualTypeOf<
      (string | undefined)[]
    >();
    expectTypeOf<ExactRequired<(string | null | undefined)[]>>().toEqualTypeOf<
      (string | null | undefined)[]
    >();
  });

  test('should pass tuples through unchanged', () => {
    expectTypeOf<ExactRequired<[number, string]>>().toEqualTypeOf<
      [number, string]
    >();
  });

  test('should preserve `| undefined` in tuple element positions', () => {
    expectTypeOf<ExactRequired<[string, string | undefined]>>().toEqualTypeOf<
      [string, string | undefined]
    >();
    expectTypeOf<
      ExactRequired<[string, string | null | undefined]>
    >().toEqualTypeOf<[string, string | null | undefined]>();
  });
});

describe('PathValue', () => {
  test('should extract the value type at a simple path', () => {
    expectTypeOf<
      PathValue<{ name: string }, ['name']>
    >().toEqualTypeOf<string>();
  });

  test('should extract the value type through a union', () => {
    expectTypeOf<
      PathValue<
        { data: { type: 'a'; name: string } | { type: 'b'; name: number } },
        ['data', 'name']
      >
    >().toEqualTypeOf<string | number>();
  });

  test('should extract an array element type', () => {
    expectTypeOf<
      PathValue<{ items: { id: number }[] }, ['items', 0, 'id']>
    >().toEqualTypeOf<number>();
  });

  test('should extract a whole array when path stops at the array field', () => {
    expectTypeOf<
      PathValue<{ items: { id: number }[] }, ['items']>
    >().toEqualTypeOf<{ id: number }[]>();
  });

  test('should extract a tuple element by index', () => {
    expectTypeOf<
      PathValue<{ coords: [number, string] }, ['coords', 1]>
    >().toEqualTypeOf<string>();
  });

  test('should strip optionality from intermediate fields', () => {
    expectTypeOf<
      PathValue<{ profile?: { name: string } }, ['profile', 'name']>
    >().toEqualTypeOf<string>();
  });

  test('should preserve nullability at the leaf', () => {
    expectTypeOf<PathValue<{ name: string | null }, ['name']>>().toEqualTypeOf<
      string | null
    >();
  });

  test('should return unknown for an invalid path', () => {
    expectTypeOf<
      PathValue<{ name: string }, ['wrong']>
    >().toEqualTypeOf<unknown>();
  });

  test('should preserve `| undefined` when navigating to an optional field with explicit undefined (issue #15, v.optional case)', () => {
    expectTypeOf<
      PathValue<{ group?: { name: string } | undefined }, ['group']>
    >().toEqualTypeOf<{ name: string } | undefined>();
  });

  test('should preserve `| undefined` for nullish leaf values (issue #15, v.nullish case)', () => {
    expectTypeOf<
      PathValue<{ group?: { name: string } | null | undefined }, ['group']>
    >().toEqualTypeOf<{ name: string } | null | undefined>();
  });

  test('should produce the exact value at an optional field without adding undefined (v.exactOptional case)', () => {
    expectTypeOf<
      PathValue<{ group?: { name: string } }, ['group']>
    >().toEqualTypeOf<{ name: string }>();
  });
});

describe('ExactKeysOfArrayPath', () => {
  test('should return only the keys whose values are arrays', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: string[]; b: number }>
    >().toEqualTypeOf<'a'>();
  });

  test('should return every array-leading key when multiple are present', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: string[]; b: number[]; c: string }>
    >().toEqualTypeOf<'a' | 'b'>();
  });

  test('should return keys whose values contain a nested array', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: { b: string[] }; c: number }>
    >().toEqualTypeOf<'a'>();
  });

  test('should return the literal tuple index of array-leading positions', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<[string[], number, boolean[]]>
    >().toEqualTypeOf<0 | 2>();
  });

  test('should return `number` for a dynamic array whose elements contain arrays', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ items: string[] }[]>
    >().toEqualTypeOf<number>();
  });

  test('should return `never` for a dynamic array whose elements have no arrays', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ name: string }[]>
    >().toEqualTypeOf<never>();
  });

  test('should merge array-leading keys across object union members', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: string[] } | { b: number[] }>
    >().toEqualTypeOf<'a' | 'b'>();
  });

  test('should accept array fields present in only one union variant', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: string[]; t: 'x' } | { name: string; t: 'y' }>
    >().toEqualTypeOf<'a'>();
  });

  test('should return `never` for objects without array-leading keys', () => {
    expectTypeOf<
      ExactKeysOfArrayPath<{ a: string; b: number }>
    >().toEqualTypeOf<never>();
  });

  test('should return `never` for primitives, `any`, `never`, and `unknown`', () => {
    expectTypeOf<ExactKeysOfArrayPath<string>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOfArrayPath<number>>().toEqualTypeOf<never>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<ExactKeysOfArrayPath<any>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOfArrayPath<never>>().toEqualTypeOf<never>();
    expectTypeOf<ExactKeysOfArrayPath<unknown>>().toEqualTypeOf<never>();
  });
});

describe('PropertiesOfArrayPath', () => {
  test('should return only the array-leading properties of an object', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: string[]; b: number }>
    >().toEqualTypeOf<{ a: string[] }>();
  });

  test('should return multiple array-leading properties', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: string[]; b: number[]; c: string }>
    >().toEqualTypeOf<{ a: string[]; b: number[] }>();
  });

  test('should return properties whose values contain nested arrays', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: { b: string[] }; c: number }>
    >().toEqualTypeOf<{ a: { b: string[] } }>();
  });

  test('should return array-leading tuple positions', () => {
    expectTypeOf<
      PropertiesOfArrayPath<[string[], number, boolean[]]>
    >().toEqualTypeOf<{ 0: string[]; 2: boolean[] }>();
  });

  test('should merge array-leading properties across object union members', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: string[] } | { b: number[] }>
    >().toEqualTypeOf<{ a: string[]; b: number[] }>();
  });

  test('should union value types for array-leading keys shared across union members', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: string[] } | { a: number[] }>
    >().toEqualTypeOf<{ a: string[] | number[] }>();
  });

  test('should produce `{}` for objects without array-leading keys', () => {
    expectTypeOf<
      PropertiesOfArrayPath<{ a: string; b: number }>
    >().toEqualTypeOf<{}>();
  });

  test('should produce `{}` for primitives and non-indexable types', () => {
    expectTypeOf<PropertiesOfArrayPath<string>>().toEqualTypeOf<{}>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expectTypeOf<PropertiesOfArrayPath<any>>().toEqualTypeOf<{}>();
    expectTypeOf<PropertiesOfArrayPath<never>>().toEqualTypeOf<{}>();
    expectTypeOf<PropertiesOfArrayPath<unknown>>().toEqualTypeOf<{}>();
  });
});

describe('ValidArrayPath', () => {
  test('should accept a simple array path', () => {
    expectTypeOf<ValidArrayPath<{ tags: string[] }, ['tags']>>().toEqualTypeOf<
      ['tags']
    >();
  });

  test('should accept a nested array path', () => {
    expectTypeOf<
      ValidArrayPath<{ user: { hobbies: string[] } }, ['user', 'hobbies']>
    >().toEqualTypeOf<['user', 'hobbies']>();
  });

  test('should accept an array path through array of objects', () => {
    expectTypeOf<
      ValidArrayPath<{ items: { tags: string[] }[] }, ['items', 0, 'tags']>
    >().toEqualTypeOf<['items', 0, 'tags']>();
  });

  test('should accept an array field present in only one union variant', () => {
    expectTypeOf<
      ValidArrayPath<
        { data: { kind: 'a'; items: string[] } | { kind: 'b'; name: string } },
        ['data', 'items']
      >
    >().toEqualTypeOf<['data', 'items']>();
  });

  test('should accept array fields contributed by different union variants', () => {
    interface Schema {
      data: { type: 'A'; items: string[] } | { type: 'B'; values: number[] };
    }
    expectTypeOf<ValidArrayPath<Schema, ['data', 'items']>>().toEqualTypeOf<
      ['data', 'items']
    >();
    expectTypeOf<ValidArrayPath<Schema, ['data', 'values']>>().toEqualTypeOf<
      ['data', 'values']
    >();
  });

  test('should accept a deeply nested array inside a single union variant', () => {
    expectTypeOf<
      ValidArrayPath<
        {
          payload:
            | { type: 'list'; entries: { tags: string[] }[] }
            | { type: 'single'; value: string };
        },
        ['payload', 'entries', 0, 'tags']
      >
    >().toEqualTypeOf<['payload', 'entries', 0, 'tags']>();
  });

  test('should return never when no variant contains an array', () => {
    expectTypeOf<
      ValidArrayPath<
        { data: { type: 'A'; name: string } | { type: 'B'; value: number } },
        ['data']
      >
    >().toEqualTypeOf<never>();
  });

  test('should not accept a non-array path', () => {
    expectTypeOf<
      ValidArrayPath<{ name: string; tags: string[] }, ['name']>
    >().not.toEqualTypeOf<['name']>();
  });

  test('should accept an optional array field', () => {
    expectTypeOf<ValidArrayPath<{ tags?: string[] }, ['tags']>>().toEqualTypeOf<
      ['tags']
    >();
  });

  test('should accept a nullable array field', () => {
    expectTypeOf<
      ValidArrayPath<{ tags: string[] | null }, ['tags']>
    >().toEqualTypeOf<['tags']>();
  });

  test('should accept a leaf array reached through an optional object inside array items', () => {
    expectTypeOf<
      ValidArrayPath<
        { items: { group?: { tags: string[] } }[] },
        ['items', number, 'group', 'tags']
      >
    >().toEqualTypeOf<['items', number, 'group', 'tags']>();
  });

  test('should accept an optional array field on array items', () => {
    expectTypeOf<
      ValidArrayPath<
        { items: { tags?: string[] }[] },
        ['items', number, 'tags']
      >
    >().toEqualTypeOf<['items', number, 'tags']>();
  });

  test('should accept a leaf array reached through multiple optional intermediates', () => {
    expectTypeOf<
      ValidArrayPath<{ a?: { b?: { tags: string[] } } }, ['a', 'b', 'tags']>
    >().toEqualTypeOf<['a', 'b', 'tags']>();
  });

  test('should accept a leaf array under an optional object with explicit `| undefined` (v.optional case)', () => {
    expectTypeOf<
      ValidArrayPath<
        { items: { group?: { tags: string[] } | undefined }[] },
        ['items', number, 'group', 'tags']
      >
    >().toEqualTypeOf<['items', number, 'group', 'tags']>();
  });

  test('should accept a leaf array under a field whose value is explicitly `T | undefined`', () => {
    expectTypeOf<
      ValidArrayPath<
        { group: { tags: string[] } | undefined },
        ['group', 'tags']
      >
    >().toEqualTypeOf<['group', 'tags']>();
  });

  test('should accept a leaf array when the union also contains a primitive', () => {
    expectTypeOf<
      ValidArrayPath<{ data: { items: string[] } | string }, ['data', 'items']>
    >().toEqualTypeOf<['data', 'items']>();
  });

  test('should accept a leaf array when the union also contains a number', () => {
    expectTypeOf<
      ValidArrayPath<
        { data: { values: number[] } | number },
        ['data', 'values']
      >
    >().toEqualTypeOf<['data', 'values']>();
  });

  test('should accept array items whose item type is a union of an object and a primitive', () => {
    expectTypeOf<
      ValidArrayPath<
        { rows: ({ tags: string[] } | string)[] },
        ['rows', number, 'tags']
      >
    >().toEqualTypeOf<['rows', number, 'tags']>();
  });

  test('should reject a fixed tuple as a field array target', () => {
    expectTypeOf<
      ValidArrayPath<{ pair: [string, number] }, ['pair']>
    >().toEqualTypeOf<never>();
  });

  test('should accept a dynamic array nested inside a tuple', () => {
    expectTypeOf<
      ValidArrayPath<{ pair: [string, string[]] }, ['pair', 1]>
    >().toEqualTypeOf<['pair', 1]>();
  });

  test('should accept an array reached by indexing into a tuple of objects', () => {
    expectTypeOf<
      ValidArrayPath<{ t: [{ tags: string[] }, number] }, ['t', 0, 'tags']>
    >().toEqualTypeOf<['t', 0, 'tags']>();
  });

  test('should not suggest a fixed tuple key for an invalid array path', () => {
    expectTypeOf<
      ValidArrayPath<{ pair: [string, number] }, ['missing']>
    >().toEqualTypeOf<never>();
  });

  test('should suggest only dynamic-array keys for an invalid array path', () => {
    expectTypeOf<
      ValidArrayPath<{ pair: [string, number]; tags: string[] }, ['missing']>
    >().toEqualTypeOf<readonly ['tags']>();
  });
});

describe('DirtyPath', () => {
  test('should return the keys of a flat object as single-segment paths', () => {
    expectTypeOf<DirtyPath<{ name: string; age: number }>>().toEqualTypeOf<
      readonly ['name'] | readonly ['age']
    >();
  });

  test('should include both the parent path and nested paths for object children', () => {
    expectTypeOf<
      DirtyPath<{ user: { email: string; name: string } }>
    >().toEqualTypeOf<
      readonly ['user'] | readonly ['user', 'email'] | readonly ['user', 'name']
    >();
  });

  test('should treat arrays and tuples of every shape as atomic', () => {
    expectTypeOf<
      DirtyPath<{
        tags: string[];
        users: { name: string }[];
        matrix: number[][];
        pairs: [number, number][];
        coords: [number, number];
        nodes: [{ x: number }, { y: number }];
      }>
    >().toEqualTypeOf<
      | readonly ['tags']
      | readonly ['users']
      | readonly ['matrix']
      | readonly ['pairs']
      | readonly ['coords']
      | readonly ['nodes']
    >();
  });

  test('should recurse into object siblings while array and tuple siblings stay atomic', () => {
    expectTypeOf<
      DirtyPath<{
        items: string[];
        coords: [number, number];
        user: { name: string; address: { city: string } };
      }>
    >().toEqualTypeOf<
      | readonly ['items']
      | readonly ['coords']
      | readonly ['user']
      | readonly ['user', 'name']
      | readonly ['user', 'address']
      | readonly ['user', 'address', 'city']
    >();
  });

  test('should return `never` for non-object roots', () => {
    expectTypeOf<DirtyPath<string>>().toBeNever();
    expectTypeOf<DirtyPath<string[]>>().toBeNever();
    expectTypeOf<DirtyPath<[number, string]>>().toBeNever();
  });

  test('should narrow paths up to the configured depth', () => {
    expectTypeOf<
      DirtyPath<{ a: { b: { c: { d: { e: string } } } } }>
    >().toEqualTypeOf<
      | readonly ['a']
      | readonly ['a', 'b']
      | readonly ['a', 'b', 'c']
      | readonly ['a', 'b', 'c', 'd']
      | readonly ['a', 'b', 'c', 'd', 'e']
    >();
  });

  test('should fall back to RequiredPath for paths deeper than the depth limit', () => {
    type Result = DirtyPath<{
      a: { b: { c: { d: { e: { f: string } } } } };
    }>;
    // The path `['a', 'b', 'c', 'd', 'e', 'f']` is past depth 5, so the last
    // segments collapse to `PathKey, ...Path` (RequiredPath catch-all).
    expectTypeOf<
      readonly ['a', 'b', 'c', 'd', 'e', PathKey, ...Path]
    >().toMatchTypeOf<Result>();
  });

  test('should merge keys across object union members', () => {
    expectTypeOf<
      DirtyPath<{ shared: string } & ({ a: string } | { b: number })>
    >().toEqualTypeOf<readonly ['shared'] | readonly ['a'] | readonly ['b']>();
  });

  test('should be a subtype of RequiredPath', () => {
    expectTypeOf<
      DirtyPath<{ name: string; user: { email: string } }>
    >().toMatchTypeOf<RequiredPath>();
  });
});

describe('FieldPath', () => {
  test('should return the keys of a flat object as single-segment paths', () => {
    expectTypeOf<FieldPath<{ name: string; age: number }>>().toEqualTypeOf<
      readonly ['name'] | readonly ['age']
    >();
  });

  test('should include both the parent path and nested paths for object children', () => {
    expectTypeOf<
      FieldPath<{ user: { email: string; name: string } }>
    >().toEqualTypeOf<
      readonly ['user'] | readonly ['user', 'email'] | readonly ['user', 'name']
    >();
  });

  test('should recurse into arrays via a numeric index segment', () => {
    expectTypeOf<FieldPath<{ items: string[] }>>().toEqualTypeOf<
      readonly ['items'] | readonly ['items', number]
    >();
  });

  test('should recurse into the fields of array items', () => {
    expectTypeOf<FieldPath<{ users: { name: string }[] }>>().toEqualTypeOf<
      | readonly ['users']
      | readonly ['users', number]
      | readonly ['users', number, 'name']
    >();
  });

  test('should recurse into tuples via their literal index segments', () => {
    expectTypeOf<FieldPath<{ coords: [number, number] }>>().toEqualTypeOf<
      readonly ['coords'] | readonly ['coords', 0] | readonly ['coords', 1]
    >();
  });

  test('should enumerate paths for array and tuple roots', () => {
    expectTypeOf<FieldPath<string[]>>().toEqualTypeOf<readonly [number]>();
    expectTypeOf<FieldPath<[number, string]>>().toEqualTypeOf<
      readonly [0] | readonly [1]
    >();
  });

  test('should return `never` for leaf roots', () => {
    expectTypeOf<FieldPath<string>>().toBeNever();
    expectTypeOf<FieldPath<number>>().toBeNever();
  });

  test('should narrow paths up to the configured depth', () => {
    expectTypeOf<
      FieldPath<{ a: { b: { c: { d: { e: string } } } } }>
    >().toEqualTypeOf<
      | readonly ['a']
      | readonly ['a', 'b']
      | readonly ['a', 'b', 'c']
      | readonly ['a', 'b', 'c', 'd']
      | readonly ['a', 'b', 'c', 'd', 'e']
    >();
  });

  test('should fall back to RequiredPath for paths deeper than the depth limit', () => {
    type Result = FieldPath<{
      a: { b: { c: { d: { e: { f: string } } } } };
    }>;
    // The path `['a', 'b', 'c', 'd', 'e', 'f']` is past depth 5, so the last
    // segments collapse to `PathKey, ...Path` (RequiredPath catch-all).
    expectTypeOf<
      readonly ['a', 'b', 'c', 'd', 'e', PathKey, ...Path]
    >().toMatchTypeOf<Result>();
  });

  test('should be a subtype of RequiredPath', () => {
    expectTypeOf<
      FieldPath<{ tags: string[]; user: { email: string } }>
    >().toMatchTypeOf<RequiredPath>();
  });
});
