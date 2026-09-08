import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { walkFieldStore } from './walkFieldStore.ts';

describe('walkFieldStore', () => {
  test('should call callback for single value field', () => {
    const store = createTestStore(v.object({ name: v.string() }));
    const names: string[] = [];
    walkFieldStore(store.children.name, (field) => {
      names.push(field.name);
    });
    expect(names).toStrictEqual(['["name"]']);
  });

  test('should walk object fields in depth-first order', () => {
    const store = createTestStore(v.object({ a: v.string(), b: v.string() }));
    const names: string[] = [];
    walkFieldStore(store, (field) => {
      names.push(field.name);
    });
    expect(names).toStrictEqual(['[]', '["a"]', '["b"]']);
  });

  test('should walk array fields in depth-first order', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b'] },
    });
    const names: string[] = [];
    walkFieldStore(store.children.items, (field) => {
      names.push(field.name);
    });
    expect(names).toStrictEqual(['["items"]', '["items",0]', '["items",1]']);
  });

  test('should walk nested structures', () => {
    const store = createTestStore(
      v.object({ user: v.object({ name: v.string(), age: v.number() }) })
    );
    const names: string[] = [];
    walkFieldStore(store, (field) => {
      names.push(field.name);
    });
    expect(names).toStrictEqual([
      '[]',
      '["user"]',
      '["user","name"]',
      '["user","age"]',
    ]);
  });

  test('should walk mixed array and object structures', () => {
    const store = createTestStore(
      v.object({
        users: v.array(v.object({ name: v.string() })),
      }),
      { initialInput: { users: [{ name: 'John' }] } }
    );
    const names: string[] = [];
    walkFieldStore(store, (field) => {
      names.push(field.name);
    });
    expect(names).toStrictEqual([
      '[]',
      '["users"]',
      '["users",0]',
      '["users",0,"name"]',
    ]);
  });

  test('should stop early and return true when callback returns true', () => {
    const store = createTestStore(
      v.object({ a: v.string(), b: v.string(), c: v.string() })
    );
    const names: string[] = [];
    const stopped = walkFieldStore(store, (field) => {
      names.push(field.name);
      return field.name === '["b"]';
    });
    expect(stopped).toBe(true);
    expect(names).toStrictEqual(['[]', '["a"]', '["b"]']);
  });

  test('should return false when callback never stops the walk', () => {
    const store = createTestStore(v.object({ a: v.string(), b: v.string() }));
    const stopped = walkFieldStore(store, () => false);
    expect(stopped).toBe(false);
  });

  test('should stop early within nested structures', () => {
    const store = createTestStore(
      v.object({
        user: v.object({ name: v.string(), age: v.number() }),
        email: v.string(),
      })
    );
    const names: string[] = [];
    const stopped = walkFieldStore(store, (field) => {
      names.push(field.name);
      return field.name === '["user","name"]';
    });
    expect(stopped).toBe(true);
    expect(names).toStrictEqual(['[]', '["user"]', '["user","name"]']);
  });
});
