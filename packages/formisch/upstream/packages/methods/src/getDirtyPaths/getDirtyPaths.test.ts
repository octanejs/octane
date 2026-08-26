import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getDirtyPaths } from './getDirtyPaths.ts';

describe('getDirtyPaths', () => {
  test('should return empty array for a clean form', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      { initialInput: { name: 'John', age: 25 } }
    );

    expect(getDirtyPaths(store)).toStrictEqual([]);
  });

  test('should return path to a dirty top-level value', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;

    expect(getDirtyPaths(store)).toStrictEqual([['email']]);
  });

  test('should return paths to multiple dirty values', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string(), age: v.number() }),
      { initialInput: { name: 'John', email: 'a@example.com', age: 25 } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;
    store.children.age.input.value = 26;
    store.children.age.isDirty.value = true;

    expect(getDirtyPaths(store)).toStrictEqual([['email'], ['age']]);
  });

  test('should return path to a nested dirty value', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string(), name: v.string() }) }),
      { initialInput: { user: { email: 'a@example.com', name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }

    expect(getDirtyPaths(store)).toStrictEqual([['user', 'email']]);
  });

  test('should return the array path when any item is dirty', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].input.value = 'B';
      itemsStore.children[1].isDirty.value = true;
    }

    expect(getDirtyPaths(store)).toStrictEqual([['items']]);
  });

  test('should return only the array path when a nested object field inside an array is dirty', () => {
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
    const usersStore = store.children.users;
    expect(usersStore.kind).toBe('array');
    if (usersStore.kind === 'array') {
      const user0 = usersStore.children[0];
      expect(user0.kind).toBe('object');
      if (user0.kind === 'object') {
        user0.children.name.input.value = 'Johnny';
        user0.children.name.isDirty.value = true;
      }
    }

    expect(getDirtyPaths(store)).toStrictEqual([['users']]);
  });

  test('should return the object path when an object was cleared to null', () => {
    const store = createTestStore(
      v.object({ user: v.nullish(v.object({ name: v.string() })) }),
      { initialInput: { user: { name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.input.value = null;
      userStore.isDirty.value = true;
    }

    expect(getDirtyPaths(store)).toStrictEqual([['user']]);
  });

  test('should return the object path when an object transitioned from nullish without a dirty descendant', () => {
    const store = createTestStore(
      v.object({ user: v.nullish(v.object({ name: v.string() })) }),
      { initialInput: { user: null } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      // Simulate `setInput(form, { path: ['user'], input: {} })`: the object's
      // own dirty flag flips, but the child `name` stays at its initial value.
      userStore.input.value = true;
      userStore.isDirty.value = true;
    }

    expect(getDirtyPaths(store)).toStrictEqual([['user']]);
  });

  test('should emit only the leaf path when both the object and a descendant are dirty', () => {
    const store = createTestStore(
      v.object({ user: v.nullish(v.object({ name: v.string() })) }),
      { initialInput: { user: null } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      // Simulate `setInput(form, { path: ['user'], input: { name: 'John' } })`:
      // both the object itself (null → object) and the `name` child flip dirty.
      userStore.input.value = true;
      userStore.isDirty.value = true;
      userStore.children.name.input.value = 'John';
      userStore.children.name.isDirty.value = true;
    }

    // Only the leaf path is emitted — the parent's dirty state is implied by
    // the descendant path and should not double-emit.
    expect(getDirtyPaths(store)).toStrictEqual([['user', 'name']]);
  });

  test('should scope to the given path', () => {
    const store = createTestStore(
      v.object({
        user: v.object({ email: v.string(), name: v.string() }),
        meta: v.object({ visits: v.number() }),
      }),
      {
        initialInput: {
          user: { email: 'a@example.com', name: 'John' },
          meta: { visits: 0 },
        },
      }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }
    const metaStore = store.children.meta;
    expect(metaStore.kind).toBe('object');
    if (metaStore.kind === 'object') {
      metaStore.children.visits.input.value = 1;
      metaStore.children.visits.isDirty.value = true;
    }

    expect(getDirtyPaths(store, { path: ['user'] })).toStrictEqual([
      ['user', 'email'],
    ]);
  });

  test('should return empty array when scoped to a clean subtree', () => {
    const store = createTestStore(
      v.object({
        user: v.object({ email: v.string() }),
        other: v.string(),
      }),
      { initialInput: { user: { email: 'a@example.com' }, other: 'x' } }
    );
    store.children.other.input.value = 'y';
    store.children.other.isDirty.value = true;

    expect(getDirtyPaths(store, { path: ['user'] })).toStrictEqual([]);
  });

  test('should return the path when scoped to a dirty value field', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });
    store.children.name.input.value = 'Jane';
    store.children.name.isDirty.value = true;

    expect(getDirtyPaths(store, { path: ['name'] })).toStrictEqual([['name']]);
  });

  test('should return the path when scoped to an array with a dirty item', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].input.value = 'B';
      itemsStore.children[1].isDirty.value = true;
    }

    expect(getDirtyPaths(store, { path: ['items'] })).toStrictEqual([
      ['items'],
    ]);
  });
});
