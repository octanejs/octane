import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { setInput } from './setInput.ts';

describe('setInput', () => {
  test('should set field input value', () => {
    const store = createTestStore(v.object({ name: v.string() }));

    setInput(store, { path: ['name'], input: 'John' });

    expect(store.children.name.input.value).toBe('John');
  });

  test('should mark field as dirty when value changes', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });

    setInput(store, { path: ['name'], input: 'Jane' });

    expect(store.children.name.isDirty.value).toBe(true);
  });

  test('should not mark field dirty when value same as initial', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });

    setInput(store, { path: ['name'], input: 'John' });

    expect(store.children.name.isDirty.value).toBe(false);
  });

  test('should set nested field input', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: '' } } }
    );

    setInput(store, { path: ['user', 'email'], input: 'test@example.com' });

    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      expect(userStore.children.email.input.value).toBe('test@example.com');
    }
  });

  test('should set array item input', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    setInput(store, { path: ['items', 0], input: 'x' });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].input.value).toBe('x');
    }
  });

  test('should set full form input', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      {
        initialInput: { name: 'John', age: 30 },
      }
    );

    setInput(store, { input: { name: 'Jane', age: 25 } });

    expect(store.children.name.input.value).toBe('Jane');
    expect(store.children.age.input.value).toBe(25);
  });

  test('should trigger validation when validate option is set', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      validate: 'input',
    });

    setInput(store, { path: ['name'], input: 'John' });

    // Check that validators count increased, indicating validation was triggered
    expect(store.validators).toBe(1);
  });
});
