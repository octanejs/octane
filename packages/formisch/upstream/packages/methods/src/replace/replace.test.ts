import { getFieldInput } from '@formisch/core';
import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { replace } from './replace.ts';

describe('replace', () => {
  test('should replace item in array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    replace(store, { path: ['items'], at: 1, initialInput: 'x' });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children).toHaveLength(3);
      expect(itemsStore.children[0].input.value).toBe('a');
      expect(itemsStore.children[1].input.value).toBe('x');
      expect(itemsStore.children[2].input.value).toBe('c');
    }
  });

  test('should replace first item in array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    replace(store, { path: ['items'], at: 0, initialInput: 'z' });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[0].input.value).toBe('z');
    }
  });

  test('should replace last item in array', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    replace(store, { path: ['items'], at: 1, initialInput: 'z' });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children[1].input.value).toBe('z');
    }
  });

  test('should mark array as dirty after replace', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    replace(store, { path: ['items'], at: 0, initialInput: 'x' });

    expect(store.children.items.isDirty.value).toBe(true);
  });

  test('should mark array as edited after replace', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });

    replace(store, { path: ['items'], at: 0, initialInput: 'x' });

    expect(store.children.items.isEdited.value).toBe(true);
  });

  test('should initialize missing children of nested array item', () => {
    const store = createTestStore(
      v.object({ list: v.array(v.object({ tags: v.array(v.string()) })) }),
      { initialInput: { list: [{ tags: ['a'] }] } }
    );

    replace(store, {
      path: ['list'],
      at: 0,
      initialInput: { tags: ['x', 'y', 'z'] },
    });

    const listStore = store.children.list;
    expect(listStore.kind).toBe('array');
    if (listStore.kind === 'array') {
      const itemStore = listStore.children[0];
      expect(itemStore.kind).toBe('object');
      if (itemStore.kind === 'object') {
        const tagsStore = itemStore.children.tags;
        expect(tagsStore.kind).toBe('array');
        if (tagsStore.kind === 'array') {
          expect(tagsStore.items.value).toHaveLength(3);
          expect(tagsStore.children).toHaveLength(3);
          expect(tagsStore.children[0].input.value).toBe('x');
          expect(tagsStore.children[1].input.value).toBe('y');
          expect(tagsStore.children[2].input.value).toBe('z');
        }
      }
    }
  });

  test('should replace with object item', () => {
    const store = createTestStore(
      v.object({ users: v.array(v.object({ name: v.string() })) }),
      { initialInput: { users: [{ name: 'John' }, { name: 'Jane' }] } }
    );

    replace(store, { path: ['users'], at: 0, initialInput: { name: 'Bob' } });

    const usersStore = store.children.users;
    expect(usersStore.kind).toBe('array');
    if (usersStore.kind === 'array') {
      const first = usersStore.children[0];
      expect(first.kind).toBe('object');
      if (first.kind === 'object') {
        expect(first.children.name.input.value).toBe('Bob');
      }
    }
  });

  test('should not change length when replacing', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    replace(store, { path: ['items'], at: 1, initialInput: 'x' });

    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      expect(itemsStore.children).toHaveLength(3);
    }
  });

  test('should keep nested array present and empty when its key is omitted', () => {
    const store = createTestStore(
      v.object({ items: v.array(v.object({ nested: v.array(v.string()) })) }),
      { initialInput: { items: [{ nested: ['a'] }] } }
    );

    replace(store, { path: ['items'], at: 0, initialInput: {} });

    // The omitted nested array must stay a present empty array, consistent with
    // how a fresh form initialized without the key behaves (not `undefined`)
    expect(getFieldInput(store)).toStrictEqual({ items: [{ nested: [] }] });
  });

  test('should fully switch variant items including nested arrays (#139)', () => {
    const store = createTestStore(
      v.object({
        a: v.array(
          v.variant('type', [
            v.object({ type: v.literal('string'), string: v.string() }),
            v.object({ type: v.literal('array'), array: v.array(v.string()) }),
          ])
        ),
      }),
      { initialInput: { a: [{ type: 'string', string: 'foo' }] } }
    );

    // Switch to the "array" variant with a full value
    replace(store, {
      path: ['a'],
      at: 0,
      initialInput: { type: 'array', array: ['foo', 'bar'] },
    });
    expect(getFieldInput(store)).toStrictEqual({
      a: [{ type: 'array', string: '', array: ['foo', 'bar'] }],
    });

    // Switch to the "array" variant but omit the array key -> stays `[]`
    replace(store, {
      path: ['a'],
      at: 0,
      initialInput: { type: 'array' },
    });
    expect(getFieldInput(store)).toStrictEqual({
      a: [{ type: 'array', string: '', array: [] }],
    });
  });

  test('should keep a nested tuple at its fixed length when its key is omitted', () => {
    const store = createTestStore(
      v.object({
        a: v.array(v.object({ pair: v.tuple([v.string(), v.number()]) })),
      }),
      { initialInput: { a: [{ pair: ['x', 1] }] } }
    );

    replace(store, { path: ['a'], at: 0, initialInput: {} });

    // An omitted non-nullish tuple keeps its fixed positions (reset to their
    // empty input: an empty string for the string, undefined for the number)
    // instead of collapsing to an empty array
    expect(getFieldInput(store)).toStrictEqual({
      a: [{ pair: ['', undefined] }],
    });
  });

  test('should reset an omitted required field to its empty input but keep an optional field undefined', () => {
    const store = createTestStore(
      v.object({
        a: v.array(
          v.object({ name: v.string(), nickname: v.optional(v.string()) })
        ),
      }),
      { initialInput: { a: [{ name: 'x', nickname: 'y' }] } }
    );

    replace(store, { path: ['a'], at: 0, initialInput: {} });

    // The omitted required string falls back to its empty input, while the
    // omitted optional string stays undefined as it accepts it
    expect(getFieldInput(store)).toStrictEqual({
      a: [{ name: '', nickname: undefined }],
    });
  });
});
