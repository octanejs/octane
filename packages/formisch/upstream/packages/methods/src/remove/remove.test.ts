import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { remove } from './remove.ts';

describe('remove', () => {
  test('should remove item from array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    remove(store, { path: ['items'], at: 1 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      // items.value tracks the actual count after removal
      expect(itemsStore.items.value).toHaveLength(2);
      // Values are shifted - first item is 'a', second becomes 'c'
      expect(itemsStore.children[0].input.value).toBe('a');
      expect(itemsStore.children[1].input.value).toBe('c');
    }
  });

  test('should remove first item from array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    remove(store, { path: ['items'], at: 0 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.items.value).toHaveLength(2);
      expect(itemsStore.children[0].input.value).toBe('b');
      expect(itemsStore.children[1].input.value).toBe('c');
    }
  });

  test('should remove last item from array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    remove(store, { path: ['items'], at: 2 });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.items.value).toHaveLength(2);
      expect(itemsStore.children[0].input.value).toBe('a');
      expect(itemsStore.children[1].input.value).toBe('b');
    }
  });

  test('should mark array as dirty after removal', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    remove(store, { path: ['items'], at: 1 });

    expect(store.children.items.isDirty.value).toBe(true);
  });

  test('should mark array as edited after removal', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    remove(store, { path: ['items'], at: 1 });

    expect(store.children.items.isEdited.value).toBe(true);
  });

  test('should remove item from nested array', () => {
    const store = createTestStore(
      v.object({ outer: v.object({ items: v.array(v.string()) }) }),
      { initialInput: { outer: { items: ['x', 'y'] } } }
    );

    remove(store, { path: ['outer', 'items'], at: 0 });

    const outerStore = store.children.outer;
    expect(outerStore.kind).toBe('object');
    if (outerStore.kind === 'object') {
      const itemsStore = outerStore.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.items.value).toHaveLength(1);
        expect(itemsStore.children[0].input.value).toBe('y');
      }
    }
  });
});
