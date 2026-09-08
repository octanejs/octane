import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { swap } from './swap.ts';

describe('swap', () => {
  test('should swap two items in array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    swap(store, { path: ['items'], at: 0, and: 2 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].input.value).toBe('c');
      expect(itemsStore.children[1].input.value).toBe('b');
      expect(itemsStore.children[2].input.value).toBe('a');
    }
  });

  test('should swap adjacent items', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    swap(store, { path: ['items'], at: 0, and: 1 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].input.value).toBe('b');
      expect(itemsStore.children[1].input.value).toBe('a');
      expect(itemsStore.children[2].input.value).toBe('c');
    }
  });

  test('should not change array when swapping same index', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    swap(store, { path: ['items'], at: 0, and: 0 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].input.value).toBe('a');
      expect(itemsStore.children[1].input.value).toBe('b');
    }
  });

  test('should mark array as touched after swap', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    swap(store, { path: ['items'], at: 0, and: 1 });

    expect(store.children.items.isTouched.value).toBe(true);
  });

  test('should mark array as edited after swap', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    swap(store, { path: ['items'], at: 0, and: 1 });

    expect(store.children.items.isEdited.value).toBe(true);
  });

  test('should mark array as dirty after swap', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    swap(store, { path: ['items'], at: 0, and: 1 });

    expect(store.children.items.isDirty.value).toBe(true);
  });

  test('should swap object items correctly', () => {
    const store = createTestStore(
      v.object({ users: v.array(v.object({ name: v.string() })) }),
      { initialInput: { users: [{ name: 'John' }, { name: 'Jane' }] } }
    );

    swap(store, { path: ['users'], at: 0, and: 1 });

    const usersStore = store.children.users;
    expect(usersStore.kind).toBe('array');
    if (usersStore.kind === 'array') {
      const first = usersStore.children[0];
      const second = usersStore.children[1];
      expect(first.kind).toBe('object');
      expect(second.kind).toBe('object');
      if (first.kind === 'object' && second.kind === 'object') {
        expect(first.children.name.input.value).toBe('Jane');
        expect(second.children.name.input.value).toBe('John');
      }
    }
  });
});
