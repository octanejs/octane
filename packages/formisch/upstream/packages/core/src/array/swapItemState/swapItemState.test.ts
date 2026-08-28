import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { swapItemState } from './swapItemState.ts';

describe('swapItemState', () => {
  describe('value fields', () => {
    test('should swap basic state between value fields', () => {
      const store = createTestStore(
        v.object({ first: v.string(), second: v.string() }),
        { initialInput: { first: 'hello', second: 'world' } }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      firstStore.isTouched.value = true;
      firstStore.errors.value = ['First error'];
      secondStore.isDirty.value = true;
      secondStore.isEdited.value = true;

      swapItemState(store, firstStore, secondStore);

      expect(firstStore.input.value).toBe('world');
      expect(secondStore.input.value).toBe('hello');
      expect(firstStore.isTouched.value).toBe(false);
      expect(secondStore.isTouched.value).toBe(true);
      expect(firstStore.isEdited.value).toBe(true);
      expect(secondStore.isEdited.value).toBe(false);
      expect(firstStore.isDirty.value).toBe(true);
      expect(secondStore.isDirty.value).toBe(false);
      expect(firstStore.errors.value).toBe(null);
      expect(secondStore.errors.value).toEqual(['First error']);
    });

    test('should swap elements arrays', () => {
      const store = createTestStore(
        v.object({ first: v.string(), second: v.string() })
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      const input1 = document.createElement('input');
      const input2 = document.createElement('input');
      firstStore.elements = [input1];
      secondStore.elements = [input2];

      swapItemState(store, firstStore, secondStore);

      expect(firstStore.elements).toEqual([input2]);
      expect(secondStore.elements).toEqual([input1]);
    });
  });

  describe('object fields', () => {
    test('should swap nested object state recursively', () => {
      const store = createTestStore(
        v.object({
          first: v.object({ name: v.string() }),
          second: v.object({ name: v.string() }),
        }),
        {
          initialInput: {
            first: { name: 'John' },
            second: { name: 'Jane' },
          },
        }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      expect(firstStore.kind).toBe('object');
      expect(secondStore.kind).toBe('object');

      if (firstStore.kind === 'object' && secondStore.kind === 'object') {
        firstStore.children.name.isTouched.value = true;

        swapItemState(store, firstStore, secondStore);

        expect(firstStore.children.name.input.value).toBe('Jane');
        expect(secondStore.children.name.input.value).toBe('John');
        expect(firstStore.children.name.isTouched.value).toBe(false);
        expect(secondStore.children.name.isTouched.value).toBe(true);
      }
    });
  });

  describe('array fields', () => {
    test('should swap array state including items', () => {
      const store = createTestStore(
        v.object({
          first: v.array(v.string()),
          second: v.array(v.string()),
        }),
        {
          initialInput: {
            first: ['a', 'b'],
            second: ['x', 'y', 'z'],
          },
        }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      expect(firstStore.kind).toBe('array');
      expect(secondStore.kind).toBe('array');

      if (firstStore.kind === 'array' && secondStore.kind === 'array') {
        const firstItems = firstStore.items.value;
        const secondItems = secondStore.items.value;

        swapItemState(store, firstStore, secondStore);

        expect(firstStore.items.value).toEqual(secondItems);
        expect(secondStore.items.value).toEqual(firstItems);
        expect(firstStore.children[0].input.value).toBe('x');
        expect(secondStore.children[0].input.value).toBe('a');
      }
    });

    test('should initialize missing children in first array when second has more items', () => {
      const store = createTestStore(
        v.object({
          first: v.array(v.string()),
          second: v.array(v.string()),
        }),
        {
          initialInput: {
            first: ['a'],
            second: ['x', 'y', 'z'],
          },
        }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      expect(firstStore.kind).toBe('array');
      expect(secondStore.kind).toBe('array');

      if (firstStore.kind === 'array' && secondStore.kind === 'array') {
        expect(firstStore.children.length).toBe(1);
        expect(secondStore.children.length).toBe(3);

        swapItemState(store, firstStore, secondStore);

        // Both should now have 3 children (max of both)
        expect(firstStore.children.length).toBe(3);
        expect(secondStore.children.length).toBe(3);
      }
    });

    test('should initialize missing children in second array when first has more items', () => {
      const store = createTestStore(
        v.object({
          first: v.array(v.string()),
          second: v.array(v.string()),
        }),
        {
          initialInput: {
            first: ['a', 'b', 'c'],
            second: ['x'],
          },
        }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      expect(firstStore.kind).toBe('array');
      expect(secondStore.kind).toBe('array');

      if (firstStore.kind === 'array' && secondStore.kind === 'array') {
        expect(firstStore.children.length).toBe(3);
        expect(secondStore.children.length).toBe(1);

        swapItemState(store, firstStore, secondStore);

        // Both should now have 3 children (max of both)
        expect(firstStore.children.length).toBe(3);
        expect(secondStore.children.length).toBe(3);
        expect(firstStore.children[0].input.value).toBe('x');
        expect(secondStore.children[0].input.value).toBe('a');
      }
    });
  });

  describe('edge cases', () => {
    test('should handle swapping startInput values', () => {
      const store = createTestStore(
        v.object({ first: v.string(), second: v.string() }),
        { initialInput: { first: 'start-first', second: 'start-second' } }
      );

      const firstStore = store.children.first;
      const secondStore = store.children.second;

      swapItemState(store, firstStore, secondStore);

      expect(firstStore.startInput.value).toBe('start-second');
      expect(secondStore.startInput.value).toBe('start-first');
    });

    test('should swap nested objects within array items', () => {
      const store = createTestStore(
        v.object({
          items: v.array(v.object({ name: v.string(), score: v.number() })),
        }),
        {
          initialInput: {
            items: [
              { name: 'Alice', score: 100 },
              { name: 'Bob', score: 50 },
            ],
          },
        }
      );

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        const child0 = itemsStore.children[0];
        const child1 = itemsStore.children[1];

        expect(child0.kind).toBe('object');
        expect(child1.kind).toBe('object');

        if (child0.kind === 'object' && child1.kind === 'object') {
          child0.children.name.isTouched.value = true;

          swapItemState(store, child0, child1);

          expect(child0.children.name.input.value).toBe('Bob');
          expect(child0.children.score.input.value).toBe(50);
          expect(child1.children.name.input.value).toBe('Alice');
          expect(child1.children.score.input.value).toBe(100);
          expect(child0.children.name.isTouched.value).toBe(false);
          expect(child1.children.name.isTouched.value).toBe(true);
        }
      }
    });

    test('should swap items within same array (typical array reorder use case)', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['first', 'second', 'third'] },
      });

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');

      if (itemsStore.kind === 'array') {
        const child0 = itemsStore.children[0];
        const child2 = itemsStore.children[2];

        child0.isTouched.value = true;

        swapItemState(store, child0, child2);

        expect(child0.input.value).toBe('third');
        expect(child2.input.value).toBe('first');
        expect(child0.isTouched.value).toBe(false);
        expect(child2.isTouched.value).toBe(true);
      }
    });
  });
});
