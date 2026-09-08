import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { isDirty } from './isDirty.ts';

describe('isDirty', () => {
  test('should return false when no field is dirty', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    expect(isDirty(store)).toBe(false);
  });

  test('should return true when a field is dirty', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.isDirty.value = true;

    expect(isDirty(store)).toBe(true);
  });

  test('should return true for a nested dirty field', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.isDirty.value = true;
    }

    expect(isDirty(store)).toBe(true);
  });

  test('should return true for a dirty array item', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].isDirty.value = true;
    }

    expect(isDirty(store)).toBe(true);
  });

  test('should check only the given path', () => {
    const store = createTestStore(
      v.object({
        billing: v.object({ name: v.string() }),
        shipping: v.object({ name: v.string() }),
      }),
      { initialInput: { billing: { name: '' }, shipping: { name: '' } } }
    );
    const shippingStore = store.children.shipping;
    expect(shippingStore.kind).toBe('object');
    if (shippingStore.kind === 'object') {
      shippingStore.children.name.isDirty.value = true;
    }

    expect(isDirty(store, { path: ['shipping'] })).toBe(true);
    expect(isDirty(store, { path: ['billing'] })).toBe(false);
  });
});
