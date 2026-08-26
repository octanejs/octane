import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getDeepErrors } from './getDeepErrors.ts';

describe('getDeepErrors', () => {
  test('should return null when no errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    const result = getDeepErrors(store);

    expect(result).toBeNull();
  });

  test('should return field errors as flat array', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Name is required'];

    const result = getDeepErrors(store);

    expect(result).toEqual(['Name is required']);
  });

  test('should return nested field errors', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.errors.value = ['Email is required'];
    }

    const result = getDeepErrors(store);

    expect(result).toEqual(['Email is required']);
  });

  test('should return array item errors', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[0].errors.value = ['Item 0 error'];
      itemsStore.children[1].errors.value = ['Item 1 error'];
    }

    const result = getDeepErrors(store);

    expect(result).toEqual(['Item 0 error', 'Item 1 error']);
  });

  test('should return multiple errors for same field', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Too short', 'Invalid format'];

    const result = getDeepErrors(store);

    expect(result).toEqual(['Too short', 'Invalid format']);
  });

  test('should combine errors from multiple fields', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() })
    );
    store.children.name.errors.value = ['Name error'];
    store.children.email.errors.value = ['Email error'];

    const result = getDeepErrors(store);

    expect(result).toEqual(['Name error', 'Email error']);
  });

  test('should return only errors under the given path', () => {
    const store = createTestStore(
      v.object({
        billing: v.object({ name: v.string(), city: v.string() }),
        shipping: v.object({ name: v.string() }),
      }),
      {
        initialInput: {
          billing: { name: '', city: '' },
          shipping: { name: '' },
        },
      }
    );
    const billingStore = store.children.billing;
    const shippingStore = store.children.shipping;
    expect(billingStore.kind).toBe('object');
    expect(shippingStore.kind).toBe('object');
    if (billingStore.kind === 'object' && shippingStore.kind === 'object') {
      billingStore.children.name.errors.value = ['Name is required'];
      billingStore.children.city.errors.value = ['City is required'];
      shippingStore.children.name.errors.value = ['Shipping name is required'];
    }

    const result = getDeepErrors(store, { path: ['billing'] });

    expect(result).toEqual(['Name is required', 'City is required']);
  });

  test('should return null when no errors exist under the given path', () => {
    const store = createTestStore(
      v.object({
        billing: v.object({ name: v.string() }),
        shipping: v.object({ name: v.string() }),
      }),
      {
        initialInput: { billing: { name: '' }, shipping: { name: '' } },
      }
    );
    const shippingStore = store.children.shipping;
    expect(shippingStore.kind).toBe('object');
    if (shippingStore.kind === 'object') {
      shippingStore.children.name.errors.value = ['Shipping name is required'];
    }

    const result = getDeepErrors(store, { path: ['billing'] });

    expect(result).toBeNull();
  });

  test('should include form-level errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = ['Form is invalid'];
    store.children.name.errors.value = ['Name is required'];

    const result = getDeepErrors(store);

    expect(result).toEqual(['Form is invalid', 'Name is required']);
  });
});
