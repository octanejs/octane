import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { getFieldInput } from './getFieldInput.ts';

describe('getFieldInput', () => {
  describe('value fields', () => {
    test('should return string value', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });
      expect(getFieldInput(store.children.name)).toBe('John');
    });

    test('should return number value', () => {
      const store = createTestStore(v.object({ age: v.number() }), {
        initialInput: { age: 25 },
      });
      expect(getFieldInput(store.children.age)).toBe(25);
    });

    test('should return undefined for uninitialized field', () => {
      const store = createTestStore(v.object({ age: v.number() }));
      expect(getFieldInput(store.children.age)).toBeUndefined();
    });
  });

  describe('object fields', () => {
    test('should collect input from all children', () => {
      const store = createTestStore(
        v.object({ name: v.string(), age: v.number() }),
        { initialInput: { name: 'John', age: 25 } }
      );
      expect(getFieldInput(store)).toStrictEqual({ name: 'John', age: 25 });
    });

    test('should return null for nullish object input', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: null } }
      );
      expect(getFieldInput(store.children.user)).toBeNull();
    });

    test('should return undefined for undefined object input', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: undefined } }
      );
      expect(getFieldInput(store.children.user)).toBeUndefined();
    });
  });

  describe('array fields', () => {
    test('should collect input from all items', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      expect(getFieldInput(store.children.items)).toStrictEqual([
        'a',
        'b',
        'c',
      ]);
    });

    test('should return empty array for empty array input', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: [] },
      });
      expect(getFieldInput(store.children.items)).toStrictEqual([]);
    });

    test('should return null for nullish array input', () => {
      const store = createTestStore(
        v.object({ items: v.nullish(v.array(v.string())) }),
        { initialInput: { items: null } }
      );
      expect(getFieldInput(store.children.items)).toBeNull();
    });
  });

  describe('nested structures', () => {
    test('should collect deeply nested input', () => {
      const store = createTestStore(
        v.object({
          users: v.array(v.object({ name: v.string(), age: v.number() })),
        }),
        {
          initialInput: {
            users: [
              { name: 'John', age: 25 },
              { name: 'Jane', age: 30 },
            ],
          },
        }
      );
      expect(getFieldInput(store)).toStrictEqual({
        users: [
          { name: 'John', age: 25 },
          { name: 'Jane', age: 30 },
        ],
      });
    });
  });
});
