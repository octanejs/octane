import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getDirtyInput } from './getDirtyInput.ts';

describe('getDirtyInput', () => {
  test('should return undefined for a clean form', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      { initialInput: { name: 'John', age: 25 } }
    );

    expect(getDirtyInput(store)).toBeUndefined();
  });

  test('should return only the dirty key from a flat object', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;

    expect(getDirtyInput(store)).toStrictEqual({ email: 'b@example.com' });
  });

  test('should return the full current array when any item is dirty', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].input.value = 'B';
      itemsStore.children[1].isDirty.value = true;
    }

    expect(getDirtyInput(store)).toStrictEqual({ items: ['a', 'B', 'c'] });
  });

  test('should preserve clean fields of array items when an item is dirty', () => {
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

    expect(getDirtyInput(store)).toStrictEqual({
      users: [
        { name: 'Johnny', age: 25 },
        { name: 'Jane', age: 30 },
      ],
    });
  });

  test('should include dirty leaves under a clean object parent', () => {
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

    expect(getDirtyInput(store)).toStrictEqual({
      user: { email: 'b@example.com' },
    });
  });

  test('should scope the dirty input to the given path', () => {
    const store = createTestStore(
      v.object({
        user: v.object({ email: v.string(), name: v.string() }),
      }),
      { initialInput: { user: { email: 'a@example.com', name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }

    expect(getDirtyInput(store, { path: ['user'] })).toStrictEqual({
      email: 'b@example.com',
    });
  });

  test('should return undefined for a path with a fully clean subtree', () => {
    const store = createTestStore(
      v.object({
        user: v.object({ email: v.string(), name: v.string() }),
      }),
      { initialInput: { user: { email: 'a@example.com', name: 'John' } } }
    );

    expect(getDirtyInput(store, { path: ['user'] })).toBeUndefined();
  });

  test('should return the dirty value for a value path that is dirty', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });
    store.children.name.input.value = 'Jane';
    store.children.name.isDirty.value = true;

    expect(getDirtyInput(store, { path: ['name'] })).toBe('Jane');
  });

  test('should return undefined for a value path that is clean', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });

    expect(getDirtyInput(store, { path: ['name'] })).toBeUndefined();
  });
});
