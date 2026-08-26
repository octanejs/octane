import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { getInput } from './getInput.ts';

describe('getInput', () => {
  test('should return full form input when no path provided', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      {
        initialInput: { name: 'John', age: 30 },
      }
    );

    const result = getInput(store);

    expect(result).toEqual({ name: 'John', age: 30 });
  });

  test('should return field input value', () => {
    const store = createTestStore(v.object({ name: v.string() }), {
      initialInput: { name: 'John' },
    });

    const result = getInput(store, { path: ['name'] });

    expect(result).toBe('John');
  });

  test('should return nested field input', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string() }) }),
      { initialInput: { user: { email: 'test@example.com' } } }
    );

    const result = getInput(store, { path: ['user', 'email'] });

    expect(result).toBe('test@example.com');
  });

  test('should return array item input', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    const result = getInput(store, { path: ['items', 1] });

    expect(result).toBe('b');
  });

  test('should return full array input', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });

    const result = getInput(store, { path: ['items'] });

    expect(result).toEqual(['a', 'b', 'c']);
  });

  test('should return nested object within array', () => {
    const store = createTestStore(
      v.object({ users: v.array(v.object({ name: v.string() })) }),
      { initialInput: { users: [{ name: 'John' }, { name: 'Jane' }] } }
    );

    const result = getInput(store, { path: ['users', 0, 'name'] });

    expect(result).toBe('John');
  });

  test('should return undefined for uninitialized field', () => {
    const store = createTestStore(v.object({ name: v.optional(v.string()) }));

    const result = getInput(store, { path: ['name'] });

    expect(result).toBeUndefined();
  });
});
