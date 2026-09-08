import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { setInitialFieldInput } from './setInitialFieldInput.ts';

describe('setInitialFieldInput', () => {
  describe('value fields', () => {
    test('should set initial input', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setInitialFieldInput(store, store.children.name, 'John');
      expect(store.children.name.initialInput.value).toBe('John');
    });
  });

  describe('object fields', () => {
    test('should set initial input on nested children', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      setInitialFieldInput(store, store.children.user, { name: 'John' });
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.initialInput.value).toBe(true);
        expect(userStore.children.name.initialInput.value).toBe('John');
      }
    });

    test('should set null initial input for nullish object', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: { name: 'John' } } }
      );
      setInitialFieldInput(store, store.children.user, null);
      expect(store.children.user.initialInput.value).toBeNull();
      // Current input is not affected by setting the initial input
      expect(store.children.user.input.value).toBe(true);
    });
  });

  describe('array fields', () => {
    test('should set initial items', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });
      setInitialFieldInput(store, store.children.items, ['x', 'y']);
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.initialInput.value).toBe(true);
        expect(itemsStore.initialItems.value).toHaveLength(2);
      }
    });

    test('should initialize new children when array grows', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });
      setInitialFieldInput(store, store.children.items, ['x', 'y', 'z']);
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children).toHaveLength(3);
        expect(itemsStore.children[2].initialInput.value).toBe('z');
      }
    });

    test('should set null initial input for nullish array', () => {
      const store = createTestStore(
        v.object({ items: v.nullish(v.array(v.string())) }),
        { initialInput: { items: ['a'] } }
      );
      setInitialFieldInput(store, store.children.items, null);
      expect(store.children.items.initialInput.value).toBeNull();
      // Current input is not affected by setting the initial input
      expect(store.children.items.input.value).toBe(true);
    });

    test('should set initial input on existing children', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      const itemsStore = store.children.items;
      setInitialFieldInput(store, itemsStore, ['x', 'y']);
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children[0].initialInput.value).toBe('x');
        expect(itemsStore.children[1].initialInput.value).toBe('y');
      }
    });

    test('should keep a tuple at its fixed length when given a longer input', () => {
      const store = createTestStore(
        v.object({ pair: v.tuple([v.string(), v.number()]) }),
        { initialInput: { pair: ['a', 1] } }
      );
      const pairStore = store.children.pair;
      expect(pairStore.kind).toBe('array');
      if (pairStore.kind === 'array') {
        // Tuples have no `item` schema, so the extra entry must be ignored
        expect(() =>
          setInitialFieldInput(store, pairStore, ['x', 2, 3])
        ).not.toThrow();
        expect(pairStore.initialItems.value).toHaveLength(2);
        expect(pairStore.children[0].initialInput.value).toBe('x');
        expect(pairStore.children[1].initialInput.value).toBe(2);
      }
    });
  });
});
