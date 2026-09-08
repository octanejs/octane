import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getDeepErrorEntries } from './getDeepErrorEntries.ts';

describe('getDeepErrorEntries', () => {
  test('should return empty array when no errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    expect(getDeepErrorEntries(store)).toStrictEqual([]);
  });

  test('should return entry for a top-level field', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Name is required'];

    expect(getDeepErrorEntries(store)).toStrictEqual([
      { path: ['name'], errors: ['Name is required'] },
    ]);
  });

  test('should return entries with nested object paths', () => {
    const store = createTestStore(
      v.object({
        billing: v.object({
          name: v.string(),
          address: v.object({ city: v.string() }),
        }),
      }),
      {
        initialInput: { billing: { name: '', address: { city: '' } } },
      }
    );
    const billingStore = store.children.billing;
    expect(billingStore.kind).toBe('object');
    if (billingStore.kind === 'object') {
      billingStore.children.name.errors.value = ['Name is required'];
      const addressStore = billingStore.children.address;
      if (addressStore.kind === 'object') {
        addressStore.children.city.errors.value = ['City is required'];
      }
    }

    expect(getDeepErrorEntries(store)).toStrictEqual([
      { path: ['billing', 'name'], errors: ['Name is required'] },
      { path: ['billing', 'address', 'city'], errors: ['City is required'] },
    ]);
  });

  test('should return entries with numeric array index paths', () => {
    const store = createTestStore(
      v.object({ items: v.array(v.object({ name: v.string() })) }),
      { initialInput: { items: [{ name: '' }, { name: '' }] } }
    );
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      const item1 = itemsStore.children[1];
      if (item1.kind === 'object') {
        item1.children.name.errors.value = ['Name is required'];
      }
    }

    expect(getDeepErrorEntries(store)).toStrictEqual([
      { path: ['items', 1, 'name'], errors: ['Name is required'] },
    ]);
  });

  test('should return only entries under the given path', () => {
    const store = createTestStore(
      v.object({
        billing: v.object({ name: v.string() }),
        shipping: v.object({ name: v.string() }),
      }),
      {
        initialInput: { billing: { name: '' }, shipping: { name: '' } },
      }
    );
    const billingStore = store.children.billing;
    const shippingStore = store.children.shipping;
    if (billingStore.kind === 'object' && shippingStore.kind === 'object') {
      billingStore.children.name.errors.value = ['Billing name is required'];
      shippingStore.children.name.errors.value = ['Shipping name is required'];
    }

    expect(getDeepErrorEntries(store, { path: ['billing'] })).toStrictEqual([
      { path: ['billing', 'name'], errors: ['Billing name is required'] },
    ]);
  });

  test('should include errors on an intermediate object node', () => {
    const store = createTestStore(
      v.object({ billing: v.object({ name: v.string() }) }),
      { initialInput: { billing: { name: '' } } }
    );
    const billingStore = store.children.billing;
    expect(billingStore.kind).toBe('object');
    if (billingStore.kind === 'object') {
      billingStore.errors.value = ['Billing is incomplete'];
      billingStore.children.name.errors.value = ['Name is required'];
    }

    expect(getDeepErrorEntries(store, { path: ['billing'] })).toStrictEqual([
      { path: ['billing'], errors: ['Billing is incomplete'] },
      { path: ['billing', 'name'], errors: ['Name is required'] },
    ]);
  });

  test('should include form-level errors with an empty path', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = ['Form is invalid'];
    store.children.name.errors.value = ['Name is required'];

    expect(getDeepErrorEntries(store)).toStrictEqual([
      { path: [], errors: ['Form is invalid'] },
      { path: ['name'], errors: ['Name is required'] },
    ]);
  });
});
