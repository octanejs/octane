import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { isValid } from './isValid.ts';

describe('isValid', () => {
  test('should return true when no errors exist', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    expect(isValid(store)).toBe(true);
  });

  test('should return false when a field has errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Name is required'];

    expect(isValid(store)).toBe(false);
  });

  test('should return false for nested field errors', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.errors.value = ['Email is required'];
    }

    expect(isValid(store)).toBe(false);
  });

  test('should return false for array item errors', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].errors.value = ['Item 1 error'];
    }

    expect(isValid(store)).toBe(false);
  });

  test('should return false for form-level errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = ['Form is invalid'];

    expect(isValid(store)).toBe(false);
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
      shippingStore.children.name.errors.value = ['Shipping name is required'];
    }

    // The billing subtree has no errors, so it is valid, while the whole form
    // is not
    expect(isValid(store, { path: ['billing'] })).toBe(true);
    expect(isValid(store)).toBe(false);
  });

  test('should return false when the given path has errors', () => {
    const store = createTestStore(
      v.object({ billing: v.object({ name: v.string() }) }),
      { initialInput: { billing: { name: '' } } }
    );
    const billingStore = store.children.billing;
    expect(billingStore.kind).toBe('object');
    if (billingStore.kind === 'object') {
      billingStore.children.name.errors.value = ['Name is required'];
    }

    expect(isValid(store, { path: ['billing'] })).toBe(false);
  });
});
