import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../vitest/index.ts';
import { pickDirty } from './pickDirty.ts';

describe('pickDirty', () => {
  test('should return undefined for a clean form', () => {
    const store = createTestStore(
      v.object({ name: v.string(), age: v.number() }),
      { initialInput: { name: 'John', age: 25 } }
    );

    expect(
      pickDirty(store, { from: { name: 'John', age: 25 } })
    ).toBeUndefined();
  });

  test('should return only the dirty key from a flat object', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;

    expect(
      pickDirty(store, {
        from: { name: 'John', email: 'b@example.com' },
      })
    ).toStrictEqual({ email: 'b@example.com' });
  });

  test('should pull values from the supplied value, not the form', () => {
    const store = createTestStore(v.object({ age: v.string() }), {
      initialInput: { age: '25' },
    });
    store.children.age.input.value = '30';
    store.children.age.isDirty.value = true;

    expect(pickDirty(store, { from: { age: 30 } })).toStrictEqual({
      age: 30,
    });
  });

  test('should return the full current array when any item is dirty', () => {
    const store = createTestStore(v.object({ items: v.array(v.string()) }), {
      initialInput: { items: ['a', 'b', 'c'] },
    });
    const itemsStore = store.children.items;
    expect(itemsStore.kind).toBe('array');
    if (itemsStore.kind === 'array') {
      itemsStore.children[1].input.value = 'B';
      itemsStore.children[1].isDirty.value = true;
    }

    expect(
      pickDirty(store, { from: { items: ['a', 'B', 'c'] } })
    ).toStrictEqual({ items: ['a', 'B', 'c'] });
  });

  test('should include dirty leaves under a clean object parent', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string(), name: v.string() }) }),
      { initialInput: { user: { email: 'a@example.com', name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }

    expect(
      pickDirty(store, {
        from: { user: { email: 'b@example.com', name: 'John' } },
      })
    ).toStrictEqual({ user: { email: 'b@example.com' } });
  });

  test('should include a dirty leaf whose value is undefined', () => {
    const store = createTestStore(v.object({ name: v.optional(v.string()) }), {
      initialInput: { name: 'John' },
    });
    store.children.name.input.value = undefined;
    store.children.name.isDirty.value = true;

    expect(pickDirty(store, { from: { name: undefined } })).toStrictEqual({
      name: undefined,
    });
  });

  test('should pass through the supplied value when an object was cleared to null', () => {
    const store = createTestStore(
      v.object({ user: v.nullish(v.object({ name: v.string() })) }),
      { initialInput: { user: { name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.input.value = null;
      userStore.isDirty.value = true;
    }

    expect(pickDirty(store, { from: { user: null } })).toStrictEqual({
      user: null,
    });
  });

  test('should skip a dirty key that is absent from the supplied value', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.name.input.value = 'Jane';
    store.children.name.isDirty.value = true;
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;

    // `email` is dirty in the form but absent from `from` — it should be
    // skipped rather than included as `undefined`.
    expect(pickDirty(store, { from: { name: 'Jane' } })).toStrictEqual({
      name: 'Jane',
    });
  });

  test('should pass a diverging value through without throwing when an object is expected', () => {
    const store = createTestStore(
      v.object({
        name: v.string(),
        user: v.object({ email: v.string() }),
      }),
      { initialInput: { name: 'John', user: { email: 'a@example.com' } } }
    );
    store.children.name.input.value = 'Jane';
    store.children.name.isDirty.value = true;
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }

    // `user` expects an object, but a primitive, `null` or array is passed —
    // the value is returned as-is rather than crashing on `key in value`.
    expect(
      pickDirty(store, { from: { name: 'Jane', user: 'reshaped' } })
    ).toStrictEqual({ name: 'Jane', user: 'reshaped' });
    expect(
      pickDirty(store, { from: { name: 'Jane', user: null } })
    ).toStrictEqual({ name: 'Jane', user: null });
    expect(
      pickDirty(store, { from: { name: 'Jane', user: ['reshaped'] } })
    ).toStrictEqual({ name: 'Jane', user: ['reshaped'] });
  });

  test('should return undefined when all dirty keys are absent from the supplied value', () => {
    const store = createTestStore(
      v.object({ name: v.string(), email: v.string() }),
      { initialInput: { name: 'John', email: 'a@example.com' } }
    );
    store.children.email.input.value = 'b@example.com';
    store.children.email.isDirty.value = true;

    // The form is dirty, but the only dirty key (`email`) is absent from
    // `from`, so the root result is empty and `undefined` is returned.
    expect(pickDirty(store, { from: { name: 'John' } })).toBeUndefined();
  });

  test('should keep an empty object for a nested object whose dirty key is absent', () => {
    const store = createTestStore(
      v.object({ user: v.object({ email: v.string(), name: v.string() }) }),
      { initialInput: { user: { email: 'a@example.com', name: 'John' } } }
    );
    const userStore = store.children.user;
    expect(userStore.kind).toBe('object');
    if (userStore.kind === 'object') {
      userStore.children.email.input.value = 'b@example.com';
      userStore.children.email.isDirty.value = true;
    }

    // `user` is dirty via `email`, but `email` is absent from the supplied
    // `user` object, so an empty object is kept rather than omitted.
    expect(
      pickDirty(store, { from: { user: { name: 'John' } } })
    ).toStrictEqual({ user: {} });
  });

  test('should return the full array atomically when a nested item field is dirty', () => {
    const store = createTestStore(
      v.object({ users: v.array(v.object({ name: v.string() })) }),
      { initialInput: { users: [{ name: 'John' }, { name: 'Jane' }] } }
    );
    const usersStore = store.children.users;
    expect(usersStore.kind).toBe('array');
    if (usersStore.kind === 'array') {
      const firstItem = usersStore.children[0];
      if (firstItem.kind === 'object') {
        firstItem.children.name.input.value = 'Johnny';
        firstItem.children.name.isDirty.value = true;
      }
    }

    // Arrays are atomic: the whole supplied array is returned, including the
    // clean second item.
    expect(
      pickDirty(store, {
        from: { users: [{ name: 'Johnny' }, { name: 'Jane' }] },
      })
    ).toStrictEqual({ users: [{ name: 'Johnny' }, { name: 'Jane' }] });
  });

  test('should pass through an array that was cleared to nullish', () => {
    const store = createTestStore(
      v.object({ tags: v.nullish(v.array(v.string())) }),
      { initialInput: { tags: ['a', 'b'] } }
    );
    const tagsStore = store.children.tags;
    expect(tagsStore.kind).toBe('array');
    if (tagsStore.kind === 'array') {
      tagsStore.input.value = null;
      tagsStore.isDirty.value = true;
    }

    expect(pickDirty(store, { from: { tags: null } })).toStrictEqual({
      tags: null,
    });
  });
});
