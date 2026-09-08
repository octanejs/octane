import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { getDirtyFieldInput } from './getDirtyFieldInput.ts';

describe('getDirtyFieldInput', () => {
  test('should return undefined when no field is dirty', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      { initialInput: { name: 'John', age: 25 } }
    );
    expect(getDirtyFieldInput(store)).toBeUndefined();
  });

  test('should omit clean siblings of a dirty value', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;
    expect(getDirtyFieldInput(store)).toStrictEqual({
      email: 'b@example.com',
    });
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
    expect(getDirtyFieldInput(store)).toStrictEqual({
      items: ['a', 'B', 'c'],
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
    expect(getDirtyFieldInput(store)).toStrictEqual({
      user: { email: 'b@example.com' },
    });
  });

  test('should return undefined when called directly on a clean value field', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });
    expect(getDirtyFieldInput(store.children.name)).toBeUndefined();
  });

  test('should return the value when called directly on a dirty value field', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });
    store.children.name.input.value = 'Jane';
    store.children.name.isDirty.value = true;
    expect(getDirtyFieldInput(store.children.name)).toBe('Jane');
  });
});
