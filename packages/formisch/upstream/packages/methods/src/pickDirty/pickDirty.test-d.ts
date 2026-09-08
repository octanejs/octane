import type { DeepPartial } from '@formisch/core';
import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { pickDirty } from './pickDirty.ts';

describe('pickDirty', () => {
  const store = createTestStore(
    v.object({
      name: v.string(),
      address: v.object({ street: v.string(), zip: v.number() }),
    })
  );

  test('should return a deep partial of the supplied value or undefined', () => {
    type Value = { name: string; age: number };
    const from: Value = { name: 'John', age: 30 };

    expectTypeOf(pickDirty(store, { from })).toEqualTypeOf<
      DeepPartial<Value> | undefined
    >();
  });

  test('should deeply partialize nested objects and arrays', () => {
    type Value = { user: { email: string; tags: string[] } };
    const from: Value = { user: { email: 'a@example.com', tags: ['x'] } };

    expectTypeOf(pickDirty(store, { from })).toEqualTypeOf<
      DeepPartial<Value> | undefined
    >();
  });

  test('should infer the value type from `from`, independent of the schema', () => {
    type Value = { anything: boolean };
    const from: Value = { anything: true };

    expectTypeOf(pickDirty(store, { from })).toEqualTypeOf<
      DeepPartial<Value> | undefined
    >();
  });

  test('should require `from` to be an object', () => {
    // @ts-expect-error string is not an object
    pickDirty(store, { from: 'oops' });
    // @ts-expect-error number is not an object
    pickDirty(store, { from: 42 });
    // @ts-expect-error null is not an object
    pickDirty(store, { from: null });
    // @ts-expect-error undefined is not an object
    pickDirty(store, { from: undefined });
  });
});
