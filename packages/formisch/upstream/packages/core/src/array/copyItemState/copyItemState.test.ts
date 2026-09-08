// @vitest-environment jsdom
import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { copyItemState } from './copyItemState.ts';

describe('copyItemState', () => {
  describe('value fields', () => {
    test('should copy basic state between value fields', () => {
      const store = createTestStore(
        v.object({ source: v.string(), target: v.string() }),
        { initialInput: { source: 'hello', target: '' } }
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      // Modify source state
      sourceStore.input.value = 'modified';
      sourceStore.isTouched.value = true;
      sourceStore.isEdited.value = true;
      sourceStore.isDirty.value = true;
      sourceStore.errors.value = ['Error'];

      copyItemState(store, sourceStore, targetStore);

      expect(targetStore.input.value).toBe('modified');
      expect(targetStore.startInput.value).toBe('hello');
      expect(targetStore.isTouched.value).toBe(true);
      expect(targetStore.isEdited.value).toBe(true);
      expect(targetStore.isDirty.value).toBe(true);
      expect(targetStore.errors.value).toEqual(['Error']);
    });

    test('should copy elements array', () => {
      const store = createTestStore(
        v.object({ source: v.string(), target: v.string() })
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      const mockElement = document.createElement('input');
      sourceStore.elements = [mockElement];

      copyItemState(store, sourceStore, targetStore);

      expect(targetStore.elements).toEqual([mockElement]);
    });
  });

  describe('object fields', () => {
    test('should copy nested object state recursively', () => {
      const store = createTestStore(
        v.object({
          source: v.object({ name: v.string(), age: v.number() }),
          target: v.object({ name: v.string(), age: v.number() }),
        }),
        {
          initialInput: {
            source: { name: 'John', age: 30 },
            target: { name: '', age: 0 },
          },
        }
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      expect(sourceStore.kind).toBe('object');
      expect(targetStore.kind).toBe('object');

      if (sourceStore.kind === 'object' && targetStore.kind === 'object') {
        sourceStore.children.name.input.value = 'Jane';
        sourceStore.children.name.isTouched.value = true;
        sourceStore.children.age.input.value = 25;

        copyItemState(store, sourceStore, targetStore);

        expect(targetStore.children.name.input.value).toBe('Jane');
        expect(targetStore.children.name.isTouched.value).toBe(true);
        expect(targetStore.children.age.input.value).toBe(25);
      }
    });
  });

  describe('array fields', () => {
    test('should copy array state including items', () => {
      const store = createTestStore(
        v.object({
          source: v.array(v.string()),
          target: v.array(v.string()),
        }),
        {
          initialInput: {
            source: ['a', 'b'],
            target: ['x'],
          },
        }
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      expect(sourceStore.kind).toBe('array');
      expect(targetStore.kind).toBe('array');

      if (sourceStore.kind === 'array' && targetStore.kind === 'array') {
        sourceStore.children[0].input.value = 'modified-a';
        sourceStore.isTouched.value = true;

        copyItemState(store, sourceStore, targetStore);

        expect(targetStore.items.value).toEqual(sourceStore.items.value);
        expect(targetStore.startItems.value).toEqual(
          sourceStore.startItems.value
        );
        expect(targetStore.isTouched.value).toBe(true);
        expect(targetStore.children[0].input.value).toBe('modified-a');
      }
    });

    test('should initialize missing children when copying larger array', () => {
      const store = createTestStore(
        v.object({
          source: v.array(v.string()),
          target: v.array(v.string()),
        }),
        {
          initialInput: {
            source: ['a', 'b', 'c'],
            target: ['x'],
          },
        }
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      expect(sourceStore.kind).toBe('array');
      expect(targetStore.kind).toBe('array');

      if (sourceStore.kind === 'array' && targetStore.kind === 'array') {
        expect(targetStore.children.length).toBe(1);

        copyItemState(store, sourceStore, targetStore);

        expect(targetStore.children.length).toBe(3);
        expect(targetStore.children[2].input.value).toBe('c');
      }
    });
  });

  describe('edge cases', () => {
    test('should handle null errors', () => {
      const store = createTestStore(
        v.object({ source: v.string(), target: v.string() })
      );

      const sourceStore = store.children.source;
      const targetStore = store.children.target;

      targetStore.errors.value = ['Old error'];
      sourceStore.errors.value = null;

      copyItemState(store, sourceStore, targetStore);

      expect(targetStore.errors.value).toBe(null);
    });
  });
});
