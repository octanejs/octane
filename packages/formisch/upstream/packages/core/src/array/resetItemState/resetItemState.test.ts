// @vitest-environment jsdom
import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { resetItemState } from './resetItemState.ts';

describe('resetItemState', () => {
  describe('value fields', () => {
    test('should reset value field to new input', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });

      const nameStore = store.children.name;

      // Modify state
      nameStore.input.value = 'modified';
      nameStore.isTouched.value = true;
      nameStore.isEdited.value = true;
      nameStore.isDirty.value = true;
      nameStore.errors.value = ['Error'];
      nameStore.elements = [document.createElement('input')];

      resetItemState(store, nameStore, 'reset-value');

      expect(nameStore.input.value).toBe('reset-value');
      expect(nameStore.startInput.value).toBe('reset-value');
      expect(nameStore.isTouched.value).toBe(false);
      expect(nameStore.isEdited.value).toBe(false);
      expect(nameStore.isDirty.value).toBe(false);
      expect(nameStore.errors.value).toBe(null);
      expect(nameStore.elements).toEqual([]);
    });

    test('should handle undefined input', () => {
      const store = createTestStore(
        v.object({ name: v.optional(v.string()) }),
        { initialInput: { name: 'John' } }
      );

      const nameStore = store.children.name;
      nameStore.input.value = 'modified';

      resetItemState(store, nameStore, undefined);

      expect(nameStore.input.value).toBe(undefined);
      expect(nameStore.startInput.value).toBe(undefined);
    });
  });

  describe('object fields', () => {
    test('should reset object field and children', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string(), age: v.number() }) }),
        { initialInput: { user: { name: 'John', age: 30 } } }
      );

      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');

      if (userStore.kind === 'object') {
        // Modify state
        userStore.children.name.input.value = 'modified';
        userStore.children.name.isTouched.value = true;
        userStore.children.age.input.value = 99;

        resetItemState(store, userStore, { name: 'Jane', age: 25 });

        expect(userStore.input.value).toBe(true);
        expect(userStore.startInput.value).toBe(true);
        expect(userStore.isTouched.value).toBe(false);
        expect(userStore.children.name.input.value).toBe('Jane');
        expect(userStore.children.name.isTouched.value).toBe(false);
        expect(userStore.children.age.input.value).toBe(25);
      }
    });

    test('should handle null input for object', () => {
      const store = createTestStore(
        v.object({ user: v.optional(v.object({ name: v.string() })) }),
        { initialInput: { user: { name: 'John' } } }
      );

      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');

      if (userStore.kind === 'object') {
        resetItemState(store, userStore, null);

        expect(userStore.input.value).toBe(null);
        expect(userStore.startInput.value).toBe(null);
      }
    });
  });

  describe('array fields', () => {
    test('should reset array field with new items', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        // Modify state
        itemsStore.children[0].input.value = 'modified';
        itemsStore.isTouched.value = true;

        resetItemState(store, itemsStore, ['x', 'y', 'z']);

        expect(itemsStore.input.value).toBe(true);
        expect(itemsStore.isTouched.value).toBe(false);
        expect(itemsStore.items.value.length).toBe(3);
        expect(itemsStore.startItems.value.length).toBe(3);
        expect(itemsStore.children[0].input.value).toBe('x');
        expect(itemsStore.children[1].input.value).toBe('y');
      }
    });

    test('should reset non-nullish array to present empty when input is nullish', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        resetItemState(store, itemsStore, null);

        expect(itemsStore.items.value).toEqual([]);
        expect(itemsStore.startItems.value).toEqual([]);
        // A non-nullish array stays a present empty array (`true`) instead of
        // becoming `null`, matching how `initializeFieldStore` represents it
        expect(itemsStore.input.value).toBe(true);
      }
    });

    test('should reset nullish array to null when input is null', () => {
      const store = createTestStore(
        v.object({ items: v.nullish(v.array(v.string())) }),
        { initialInput: { items: ['a', 'b'] } }
      );

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        resetItemState(store, itemsStore, null);

        expect(itemsStore.items.value).toEqual([]);
        // A nullish array preserves the explicit nullish value
        expect(itemsStore.input.value).toBe(null);
      }
    });

    test('should generate new IDs for items', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        const originalId = itemsStore.items.value[0];

        resetItemState(store, itemsStore, ['new']);

        expect(itemsStore.items.value[0]).not.toBe(originalId);
      }
    });
  });

  describe('keepStart', () => {
    test('should keep start input as the dirty baseline for value fields', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });

      const nameStore = store.children.name;
      nameStore.errors.value = ['Error'];

      resetItemState(store, nameStore, 'Jane', true);

      // Current input is updated and errors are cleared, but the start input is
      // preserved so the field is still detected as dirty
      expect(nameStore.input.value).toBe('Jane');
      expect(nameStore.startInput.value).toBe('John');
      expect(nameStore.errors.value).toBe(null);
    });

    test('should keep start items as the dirty baseline for array fields', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        const startItems = itemsStore.startItems.value;

        resetItemState(store, itemsStore, ['x', 'y', 'z'], true);

        // Current items grow to the new length while the start items are kept
        expect(itemsStore.items.value.length).toBe(3);
        expect(itemsStore.startItems.value).toBe(startItems);
        expect(itemsStore.children[0].input.value).toBe('x');
        expect(itemsStore.children[0].startInput.value).toBe('a');
      }
    });
  });

  describe('elements', () => {
    test('should keep initialElements in sync when the store owns its array', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'a' },
      });
      const field = store.children.name;
      field.elements.push(document.createElement('input'));
      // Precondition: the store owns its array (elements === initialElements)
      expect(field.elements).toBe(field.initialElements);

      resetItemState(store, field, 'b');

      // Both stay the same (empty) array, so an element registered on remount
      // is reflected in initialElements for a later reset
      expect(field.elements).toBe(field.initialElements);
      expect(field.elements).toHaveLength(0);
      const element = document.createElement('input');
      field.elements.push(element);
      expect(field.initialElements).toContain(element);
    });

    test('should not touch initialElements when a reorder moved the elements', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'a' },
      });
      const field = store.children.name;
      const home = field.initialElements;
      // Simulate a reorder having moved elements (diverged from initialElements)
      field.elements = [document.createElement('input')];
      expect(field.elements).not.toBe(field.initialElements);

      resetItemState(store, field, 'b');

      // The reorder home baseline is preserved
      expect(field.initialElements).toBe(home);
    });
  });

  describe('edge cases', () => {
    test('should initialize missing array children', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        // Reset with more items than children exist
        resetItemState(store, itemsStore, ['x', 'y', 'z']);

        // Should initialize missing children so every item has a field store
        expect(itemsStore.items.value.length).toBe(3);
        expect(itemsStore.children).toHaveLength(3);
        expect(itemsStore.children[0].input.value).toBe('x');
        expect(itemsStore.children[1].input.value).toBe('y');
        expect(itemsStore.children[2].input.value).toBe('z');
        expect(itemsStore.children[2].name).toBe('["items",2]');
      }
    });

    test('should not grow a tuple beyond its fixed children', () => {
      const store = createTestStore(
        v.object({ pair: v.tuple([v.string(), v.number()]) }),
        { initialInput: { pair: ['a', 1] } }
      );

      const pairStore = store.children.pair;
      expect(pairStore.kind).toBe('array');

      if (pairStore.kind === 'array') {
        // Reset with more items than the tuple defines (tuples have no
        // `schema.item`, so the extra entry must not be initialized)
        expect(() =>
          resetItemState(store, pairStore, ['x', 2, 3])
        ).not.toThrow();

        // The tuple keeps its fixed length, ignoring the extra entry
        expect(pairStore.items.value).toHaveLength(2);
        expect(pairStore.children).toHaveLength(2);
        expect(pairStore.children[0].input.value).toBe('x');
        expect(pairStore.children[1].input.value).toBe(2);
      }
    });

    test('should keep a non-nullish tuple at its fixed length when input is nullish', () => {
      const store = createTestStore(
        v.object({ pair: v.tuple([v.string(), v.number()]) }),
        { initialInput: { pair: ['a', 1] } }
      );

      const pairStore = store.children.pair;
      expect(pairStore.kind).toBe('array');

      if (pairStore.kind === 'array') {
        // Reset without input, e.g. replacing an item that omits the tuple key
        resetItemState(store, pairStore, undefined);

        // The tuple stays present with its fixed children reset to their empty
        // input (an empty string for the string, undefined for the number),
        // instead of collapsing to an empty array
        expect(pairStore.input.value).toBe(true);
        expect(pairStore.items.value).toHaveLength(2);
        expect(pairStore.children).toHaveLength(2);
        expect(pairStore.children[0].input.value).toBe('');
        expect(pairStore.children[1].input.value).toBeUndefined();

        // An explicit null input normalizes to the empty input too, so it stays
        // consistent with the initial state
        resetItemState(store, pairStore, null);
        expect(pairStore.children[0].input.value).toBe('');
        expect(pairStore.children[1].input.value).toBeUndefined();
      }
    });
  });
});
