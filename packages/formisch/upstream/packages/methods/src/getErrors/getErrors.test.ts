import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getErrors } from './getErrors.ts';

describe('getErrors', () => {
  test('should return form-level errors when no path provided', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = ['Form error 1', 'Form error 2'];

    const result = getErrors(store);

    expect(result).toEqual(['Form error 1', 'Form error 2']);
  });

  test('should return null when form has no errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = null;

    const result = getErrors(store);

    expect(result).toBeNull();
  });

  test('should return field-level errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Name is required'];

    const result = getErrors(store, { path: ['name'] });

    expect(result).toEqual(['Name is required']);
  });

  test('should return null when field has no errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = null;

    const result = getErrors(store, { path: ['name'] });

    expect(result).toBeNull();
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

    const result = getErrors(store, { path: ['user', 'email'] });

    expect(result).toEqual(['Email is required']);
  });

  test('should return array item errors', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[0].errors.value = ['Item error'];
    }

    const result = getErrors(store, { path: ['items', 0] });

    expect(result).toEqual(['Item error']);
  });
});
