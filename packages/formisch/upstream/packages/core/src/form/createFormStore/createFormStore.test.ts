import * as v from 'valibot';
import { describe, expect, test, vi } from 'vitest';
import { createFormStore } from './createFormStore.ts';

describe('createFormStore', () => {
  describe('default configuration', () => {
    test('should use default validation modes when not specified', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.validate).toBe('submit');
      expect(store.revalidate).toBe('input');
    });

    test('should initialize validators to 0', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.validators).toBe(0);
    });

    test('should initialize all boolean signals to false', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.isSubmitting.value).toBe(false);
      expect(store.isSubmitted.value).toBe(false);
      expect(store.isValidating.value).toBe(false);
    });

    test('should assign the parse function', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.parse).toBe(parse);
    });
  });

  describe('custom configuration', () => {
    test('should use custom validate mode', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema, validate: 'blur' }, parse);

      expect(store.validate).toBe('blur');
    });

    test('should use custom revalidate mode', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema, revalidate: 'change' }, parse);

      expect(store.revalidate).toBe('change');
    });

    test('should use both custom validation modes', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore(
        { schema, validate: 'touch', revalidate: 'blur' },
        parse
      );

      expect(store.validate).toBe('touch');
      expect(store.revalidate).toBe('blur');
    });
  });

  describe('field store initialization', () => {
    test('should initialize simple object schema', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.kind).toBe('object');
      expect(store.name).toBe('[]');
      expect(store.children).toHaveProperty('name');
      expect(store.children.name.kind).toBe('value');
    });

    test('should initialize with initial input', () => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore(
        { schema, initialInput: { name: 'John' } },
        parse
      );

      expect(store.children.name.input.value).toBe('John');
    });

    test('should initialize nested object schema', () => {
      const schema = v.object({
        user: v.object({
          name: v.string(),
          age: v.number(),
        }),
      });
      const parse = vi.fn();
      const store = createFormStore({ schema }, parse);

      expect(store.kind).toBe('object');
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.name.kind).toBe('value');
        expect(userStore.children.age.kind).toBe('value');
      }
    });

    test('should initialize array schema', () => {
      const schema = v.object({
        items: v.array(v.string()),
      });
      const parse = vi.fn();
      const store = createFormStore(
        { schema, initialInput: { items: ['a', 'b'] } },
        parse
      );

      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children).toHaveLength(2);
        expect(itemsStore.children[0].input.value).toBe('a');
        expect(itemsStore.children[1].input.value).toBe('b');
      }
    });
  });

  describe('validation modes', () => {
    test.each([
      'initial',
      'touch',
      'input',
      'change',
      'blur',
      'submit',
    ] as const)('should accept "%s" as validate mode', (mode) => {
      const schema = v.object({ name: v.string() });
      const parse = vi.fn();
      const store = createFormStore({ schema, validate: mode }, parse);

      expect(store.validate).toBe(mode);
    });

    test.each(['touch', 'input', 'change', 'blur', 'submit'] as const)(
      'should accept "%s" as revalidate mode',
      (mode) => {
        const schema = v.object({ name: v.string() });
        const parse = vi.fn();
        const store = createFormStore({ schema, revalidate: mode }, parse);

        expect(store.revalidate).toBe(mode);
      }
    );
  });
});
