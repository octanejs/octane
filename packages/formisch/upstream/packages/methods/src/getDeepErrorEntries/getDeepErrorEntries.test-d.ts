import type { Path } from '@formisch/core';
import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import {
  type DeepErrorEntry,
  getDeepErrorEntries,
} from './getDeepErrorEntries.ts';

describe('getDeepErrorEntries', () => {
  const store = createTestStore(
    v.object({
      name: v.string(),
      address: v.object({ street: v.string() }),
      items: v.array(v.object({ label: v.string() })),
    })
  );

  type Value = {
    name: string;
    address: { street: string };
    items: { label: string }[];
  };

  test('should return entries typed for the inferred form value', () => {
    expectTypeOf(getDeepErrorEntries(store)).toEqualTypeOf<
      DeepErrorEntry<Value>[]
    >();
  });

  test('should return the same entry type when scoped to a field path', () => {
    expectTypeOf(
      getDeepErrorEntries(store, { path: ['address'] })
    ).toEqualTypeOf<DeepErrorEntry<Value>[]>();
  });

  test('should type entry paths as every field path plus the empty form path', () => {
    expectTypeOf<DeepErrorEntry<Value>['path']>().toEqualTypeOf<
      | readonly []
      | readonly ['name']
      | readonly ['address']
      | readonly ['address', 'street']
      | readonly ['items']
      | readonly ['items', number]
      | readonly ['items', number, 'label']
    >();
  });

  test('should fall back to a loose path without a value type', () => {
    expectTypeOf<DeepErrorEntry['path']>().toEqualTypeOf<Path>();
  });

  test('should reject a path that does not exist on the form', () => {
    // @ts-expect-error - `nonexistent` is not a field of the form
    getDeepErrorEntries(store, { path: ['nonexistent'] });
  });
});
