import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { setFieldBool } from './setFieldBool.ts';

describe('setFieldBool', () => {
  describe('value fields', () => {
    test('should set isTouched to true', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldBool(store.children.name, 'isTouched', true);
      expect(store.children.name.isTouched.value).toBe(true);
    });

    test('should set isTouched to false', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      store.children.name.isTouched.value = true;
      setFieldBool(store.children.name, 'isTouched', false);
      expect(store.children.name.isTouched.value).toBe(false);
    });

    test('should set isDirty', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      setFieldBool(store.children.name, 'isDirty', true);
      expect(store.children.name.isDirty.value).toBe(true);
    });
  });

  describe('object fields', () => {
    test('should set property on all nested children', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string(), age: v.number() }) })
      );
      setFieldBool(store.children.user, 'isTouched', true);
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.name.isTouched.value).toBe(true);
        expect(userStore.children.age.isTouched.value).toBe(true);
      }
    });

    test('should set property on object itself', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      setFieldBool(store.children.user, 'isTouched', true);
      expect(store.children.user.isTouched.value).toBe(true);
    });
  });

  describe('array fields', () => {
    test('should set property on array and all items', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      setFieldBool(store.children.items, 'isTouched', true);
      expect(store.children.items.isTouched.value).toBe(true);
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children[0].isTouched.value).toBe(true);
        expect(itemsStore.children[1].isTouched.value).toBe(true);
      }
    });
  });

  describe('deeply nested', () => {
    test('should set property on all descendants', () => {
      const store = createTestStore(
        v.object({
          users: v.array(v.object({ profile: v.object({ name: v.string() }) })),
        }),
        { initialInput: { users: [{ profile: { name: 'John' } }] } }
      );
      setFieldBool(store.children.users, 'isDirty', true);
      expect(store.children.users.isDirty.value).toBe(true);
      const usersStore = store.children.users;
      expect(usersStore.kind).toBe('array');
      if (usersStore.kind === 'array') {
        const userStore = usersStore.children[0];
        expect(userStore.kind).toBe('object');
        if (userStore.kind === 'object') {
          const profileStore = userStore.children.profile;
          expect(profileStore.kind).toBe('object');
          if (profileStore.kind === 'object') {
            expect(profileStore.children.name.isDirty.value).toBe(true);
          }
        }
      }
    });
  });
});
