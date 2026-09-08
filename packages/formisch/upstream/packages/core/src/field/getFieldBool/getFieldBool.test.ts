import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';
import { getFieldBool } from './getFieldBool.ts';

describe('getFieldBool', () => {
  describe('value fields', () => {
    test('should return false when property is false', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(getFieldBool(store.children.name, 'isTouched')).toBe(false);
    });

    test('should return true when property is true', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      store.children.name.isTouched.value = true;
      expect(getFieldBool(store.children.name, 'isTouched')).toBe(true);
    });

    test('should check errors property', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(getFieldBool(store.children.name, 'errors')).toBe(false);
      store.children.name.errors.value = ['Error'];
      expect(getFieldBool(store.children.name, 'errors')).toBe(true);
    });

    test('should check isDirty property', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(getFieldBool(store.children.name, 'isDirty')).toBe(false);
      store.children.name.isDirty.value = true;
      expect(getFieldBool(store.children.name, 'isDirty')).toBe(true);
    });

    test('should check isEdited property', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(getFieldBool(store.children.name, 'isEdited')).toBe(false);
      store.children.name.isEdited.value = true;
      expect(getFieldBool(store.children.name, 'isEdited')).toBe(true);
    });
  });

  describe('object fields', () => {
    test('should return false when no nested fields have property', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      expect(getFieldBool(store.children.user, 'isTouched')).toBe(false);
    });

    test('should return true when nested field has property', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        userStore.children.name.isTouched.value = true;
      }
      expect(getFieldBool(store.children.user, 'isTouched')).toBe(true);
    });

    test('should return true when object itself has property', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      store.children.user.errors.value = ['Object error'];
      expect(getFieldBool(store.children.user, 'errors')).toBe(true);
    });
  });

  describe('array fields', () => {
    test('should return false when no array items have property', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      expect(getFieldBool(store.children.items, 'isTouched')).toBe(false);
    });

    test('should return true when array item has property', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b'] },
      });
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        itemsStore.children[1].isTouched.value = true;
      }
      expect(getFieldBool(store.children.items, 'isTouched')).toBe(true);
    });

    test('should return true when array itself has property', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });
      store.children.items.errors.value = ['Array error'];
      expect(getFieldBool(store.children.items, 'errors')).toBe(true);
    });
  });

  describe('deeply nested', () => {
    test('should find property in deeply nested structure', () => {
      const store = createTestStore(
        v.object({
          users: v.array(v.object({ profile: v.object({ name: v.string() }) })),
        }),
        { initialInput: { users: [{ profile: { name: 'John' } }] } }
      );
      const usersStore = store.children.users;
      expect(usersStore.kind).toBe('array');
      if (usersStore.kind === 'array') {
        const userStore = usersStore.children[0];
        expect(userStore.kind).toBe('object');
        if (userStore.kind === 'object') {
          const profileStore = userStore.children.profile;
          expect(profileStore.kind).toBe('object');
          if (profileStore.kind === 'object') {
            profileStore.children.name.isDirty.value = true;
          }
        }
      }
      expect(getFieldBool(store.children.users, 'isDirty')).toBe(true);
    });
  });
});
