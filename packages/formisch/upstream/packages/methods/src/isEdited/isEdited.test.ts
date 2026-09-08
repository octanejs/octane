import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { isEdited } from './isEdited.ts';

describe('isEdited', () => {
  test('should return false when no field is edited', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    expect(isEdited(store)).toBe(false);
  });

  test('should return true when a field is edited', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.isEdited.value = true;

    expect(isEdited(store)).toBe(true);
  });

  test('should return true for a nested edited field', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.isEdited.value = true;
    }

    expect(isEdited(store)).toBe(true);
  });

  test('should return true for an edited array item', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].isEdited.value = true;
    }

    expect(isEdited(store)).toBe(true);
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
      shippingStore.children.name.isEdited.value = true;
    }

    expect(isEdited(store, { path: ['shipping'] })).toBe(true);
    expect(isEdited(store, { path: ['billing'] })).toBe(false);
  });
});
