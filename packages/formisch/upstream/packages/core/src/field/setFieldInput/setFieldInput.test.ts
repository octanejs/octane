import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { getFieldBool } from '../getFieldBool/getFieldBool.ts';
import { getFieldInput } from '../getFieldInput/getFieldInput.ts';
import { setFieldInput } from './setFieldInput.ts';

describe('setFieldInput', () => {
  describe('value fields', () => {
    test('should set string value', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldInput(store, ['name'], 'John');
      expect(getFieldInput(store.children.name)).toBe('John');
    });

    test('should mark field as touched', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldInput(store, ['name'], 'John');
      expect(store.children.name.isTouched.value).toBe(true);
    });

    test('should mark field as edited', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldInput(store, ['name'], 'John');
      expect(store.children.name.isEdited.value).toBe(true);
    });

    test('should keep field edited after reverting to initial value', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });
      setFieldInput(store, ['name'], 'Jane');
      setFieldInput(store, ['name'], 'John');
      // Unlike `isDirty`, `isEdited` stays `true` even after the value is
      // changed back to its initial value
      expect(store.children.name.isDirty.value).toBe(false);
      expect(store.children.name.isEdited.value).toBe(true);
    });

    test('should mark field as dirty when value changes', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });
      setFieldInput(store, ['name'], 'Jane');
      expect(store.children.name.isDirty.value).toBe(true);
    });

    test('should not mark field as dirty for empty string from undefined', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldInput(store, ['name'], '');
      expect(store.children.name.isDirty.value).toBe(false);
    });

    test('should not mark field as dirty for NaN from undefined', () => {
      const store = createTestStore(v.object({ age: v.number() }));
      setFieldInput(store, ['age'], NaN);
      expect(store.children.age.isDirty.value).toBe(false);
    });
  });

  describe('object fields', () => {
    test('should set nested object value', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      setFieldInput(store, ['user', 'name'], 'John');
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(getFieldInput(userStore.children.name)).toBe('John');
      }
    });

    test('should mark parent input as truthy when setting nested field', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: null } }
      );
      setFieldInput(store, ['user', 'name'], 'John');
      expect(store.children.user.input.value).toBe(true);
    });
  });

  describe('array fields', () => {
    test('should set array item value', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      setFieldInput(store, ['items', 0], 'updated');
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(getFieldInput(itemsStore.children[0])).toBe('updated');
      }
    });

    test('should truncate array when setting shorter array', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      setFieldInput(store, ['items'], ['x']);
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.items.value).toHaveLength(1);
      }
    });

    test('should extend array when setting longer array', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });
      setFieldInput(store, ['items'], ['x', 'y', 'z']);
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.items.value).toHaveLength(3);
        expect(getFieldInput(itemsStore)).toStrictEqual(['x', 'y', 'z']);
      }
    });

    test('should set null for nullish array', () => {
      const store = createTestStore(
        v.object({ items: v.nullish(v.array(v.string())) }),
        { initialInput: { items: ['a'] } }
      );
      setFieldInput(store, ['items'], null);
      expect(store.children.items.input.value).toBeNull();
    });

    test('should keep a tuple at its fixed length when given a longer input', () => {
      const store = createTestStore(
        v.object({ pair: v.tuple([v.string(), v.number()]) }),
        { initialInput: { pair: ['a', 1] } }
      );
      const pairStore = store.children.pair;
      expect(pairStore.kind).toBe('array');
      if (pairStore.kind === 'array') {
        // Tuples have no `item` schema, so the extra entry must be ignored
        expect(() => setFieldInput(store, ['pair'], ['x', 2, 3])).not.toThrow();
        expect(pairStore.items.value).toHaveLength(2);
        expect(getFieldInput(pairStore.children[0])).toBe('x');
        expect(getFieldInput(pairStore.children[1])).toBe(2);
      }
    });

    test('should not grow a tuple beyond its children when items were cleared', () => {
      const store = createTestStore(
        v.object({ pair: v.tuple([v.string(), v.number()]) }),
        { initialInput: { pair: ['a', 1] } }
      );
      const pairStore = store.children.pair;
      expect(pairStore.kind).toBe('array');
      if (pairStore.kind === 'array') {
        // Simulate a previously cleared tuple (e.g. reset to `null`), then set
        // a longer-than-fixed input
        pairStore.items.value = [];
        setFieldInput(store, ['pair'], ['x', 2, 3]);

        // Items stay capped to the fixed child count, so reads do not throw
        expect(pairStore.items.value).toHaveLength(2);
        expect(() => getFieldInput(pairStore)).not.toThrow();
        expect(getFieldInput(pairStore.children[0])).toBe('x');
        expect(getFieldInput(pairStore.children[1])).toBe(2);
      }
    });
  });

  describe('dirty state for arrays', () => {
    test('should mark array as dirty when length changes', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      setFieldInput(store, ['items'], ['a']);
      expect(store.children.items.isDirty.value).toBe(true);
    });

    test('should clear array isDirty after reverting to initial input', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c', 'd'] },
      });
      setFieldInput(store, ['items'], ['b', 'c', 'd']);
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(true);
      setFieldInput(store, ['items'], ['a', 'b', 'c', 'd']);
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(false);
    });

    test('should clear array isDirty after reverting from longer back to initial', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      setFieldInput(store, ['items'], ['a', 'b', 'c']);
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(true);
      setFieldInput(store, ['items'], ['a', 'b']);
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(false);
    });
  });

  describe('reusing child stores when growing', () => {
    test('should clear stale errors but keep the dirty baseline when reused', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        // Give the third item a stale error, then shrink the array so its child
        // store becomes a stale, invisible leftover
        itemsStore.children[2].errors.value = ['Stale error'];
        setFieldInput(store, ['items'], ['a']);

        // Grow back so the stale child store is reused for a changed value
        setFieldInput(store, ['items'], ['a', 'x', 'y']);

        // The reused child carries the new value with cleared errors, but stays
        // dirty because its value ('y') differs from its initial input ('c')
        expect(itemsStore.children[2].input.value).toBe('y');
        expect(itemsStore.children[2].errors.value).toBeNull();
        expect(itemsStore.children[2].isDirty.value).toBe(true);
      }
    });

    test('should report dirty after shrinking then growing with changed values', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      setFieldInput(store, ['items'], ['a']); // shrink
      setFieldInput(store, ['items'], ['a', 'x', 'y']); // grow with changed values
      // Same final input as a direct edit, so the array must be dirty
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(true);
    });

    test('should report clean after shrinking then growing back to initial', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      setFieldInput(store, ['items'], ['a']); // shrink
      setFieldInput(store, ['items'], ['a', 'b', 'c']); // grow back to initial
      // Content matches the initial input again, so the array must be clean
      expect(getFieldBool(store.children.items, 'isDirty')).toBe(false);
    });
  });

  describe('dirty state for objects', () => {
    test('should mark object as dirty when input becomes null', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: { name: 'John' } } }
      );
      setFieldInput(store, ['user'], null);
      expect(store.children.user.isDirty.value).toBe(true);
    });
  });
});
