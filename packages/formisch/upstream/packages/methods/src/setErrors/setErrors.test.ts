import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { setErrors } from './setErrors.ts';

describe('setErrors', () => {
  test('should set form-level errors when no path provided', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    setErrors(store, { errors: ['Form error 1', 'Form error 2'] });

    expect(store.errors.value).toEqual(['Form error 1', 'Form error 2']);
  });

  test('should clear form-level errors with null', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.errors.value = ['Existing error'];

    setErrors(store, { errors: null });

    expect(store.errors.value).toBeNull();
  });

  test('should set field-level errors', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    setErrors(store, { path: ['name'], errors: ['Name is required'] });

    expect(store.children.name.errors.value).toEqual(['Name is required']);
  });

  test('should clear field-level errors with null', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    store.children.name.errors.value = ['Existing error'];

    setErrors(store, { path: ['name'], errors: null });

    expect(store.children.name.errors.value).toBeNull();
  });

  test('should set nested field errors', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );

    setErrors(store, {
      path: ['user', 'email'],
      errors: ['Email is required'],
    });

    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      expect(userStore.children.email.errors.value).toEqual([
        'Email is required',
      ]);
    }
  });

  test('should set array item errors', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a'] },
    });

    setErrors(store, { path: ['items', 0], errors: ['Item error'] });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].errors.value).toEqual(['Item error']);
    }
  });
});
