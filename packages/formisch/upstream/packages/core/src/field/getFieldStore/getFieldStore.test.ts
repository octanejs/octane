import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { getFieldStore } from './getFieldStore.ts';

describe('getFieldStore', () => {
  test('should return root store for empty path', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    expect(getFieldStore(store, [])).toBe(store);
  });

  test('should return child store for single-key path', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    expect(getFieldStore(store, ['name'])).toBe(store.children.name);
  });

  test('should return nested store for multi-key path', () => {
    const store = createTestStore(
      v.object({ user: v.object({ name: v.string() }) })
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      expect(getFieldStore(store, ['user', 'name'])).toBe(
        userStore.children.name
      );
    }
  });

  test('should return array item store', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(getFieldStore(store, ['items', 0])).toBe(itemsStore.children[0]);
      expect(getFieldStore(store, ['items', 1])).toBe(itemsStore.children[1]);
    }
  });

  test('should return deeply nested array item store', () => {
    const store = createTestStore(
      v.object({
        users: v.array(v.object({ name: v.string() })),
      }),
      { initialInput: { users: [{ name: 'John' }] } }
    );
    const usersStore = store.children.users;
    expect(usersStore.kind).toBe('array');
    if (usersStore.kind === 'array') {
      const userStore = usersStore.children[0];
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(getFieldStore(store, ['users', 0, 'name'])).toBe(
          userStore.children.name
        );
      }
    }
  });
});
