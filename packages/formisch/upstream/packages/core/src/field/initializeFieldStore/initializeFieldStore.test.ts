import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createTestStore } from '../../vitest/index.ts';

describe('initializeFieldStore', () => {
  describe('value fields', () => {
    test('should initialize with correct properties', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });
      const field = store.children.name;
      expect(field.kind).toBe('value');
      expect(field.name).toBe('["name"]');
      expect(field.path).toStrictEqual(['name']);
      expect(field.input.value).toBe('John');
      expect(field.initialInput.value).toBe('John');
      expect(field.startInput.value).toBe('John');
      expect(field.errors.value).toBeNull();
      expect(field.isTouched.value).toBe(false);
      expect(field.isEdited.value).toBe(false);
      expect(field.isDirty.value).toBe(false);
    });
  });

  describe('empty input config', () => {
    test('should default required string to empty string', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(store.children.name.input.value).toBe('');
      expect(store.children.name.initialInput.value).toBe('');
      expect(store.children.name.startInput.value).toBe('');
    });

    test('should default required piped string to empty string', () => {
      const store = createTestStore(
        v.object({ name: v.pipe(v.string(), v.nonEmpty()) })
      );
      expect(store.children.name.input.value).toBe('');
    });

    test('should not default required non-string to empty string', () => {
      const store = createTestStore(v.object({ age: v.number() }));
      expect(store.children.age.input.value).toBeUndefined();
    });

    test('should keep optional string as undefined', () => {
      const store = createTestStore(v.object({ name: v.optional(v.string()) }));
      expect(store.children.name.input.value).toBeUndefined();
    });

    test('should keep nullable string as undefined', () => {
      const store = createTestStore(v.object({ name: v.nullable(v.string()) }));
      expect(store.children.name.input.value).toBeUndefined();
    });

    test('should keep a non-optional inside an optional as undefined', () => {
      const store = createTestStore(
        v.object({ name: v.optional(v.nonOptional(v.string())) })
      );
      expect(store.children.name.input.value).toBeUndefined();
    });

    test('should keep a non-nullish inside a nullish as undefined', () => {
      const store = createTestStore(
        v.object({ name: v.nullish(v.nonNullish(v.string())) })
      );
      expect(store.children.name.input.value).toBeUndefined();
    });

    test('should use explicit initial input over empty string default', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        initialInput: { name: 'John' },
      });
      expect(store.children.name.input.value).toBe('John');
    });

    test('should default nested required string to empty string', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.name.input.value).toBe('');
      }
    });

    test('should default number and boolean to undefined', () => {
      const store = createTestStore(
        v.object({ age: v.number(), active: v.boolean() })
      );
      expect(store.children.age.input.value).toBeUndefined();
      expect(store.children.active.input.value).toBeUndefined();
    });

    test('should apply configured empty input per type', () => {
      const date = new Date('2020-01-01');
      const store = createTestStore(
        v.object({
          name: v.string(),
          age: v.number(),
          active: v.boolean(),
          birthday: v.date(),
        }),
        { emptyInput: { number: 0, boolean: false, date } }
      );
      expect(store.children.name.input.value).toBe('');
      expect(store.children.age.input.value).toBe(0);
      expect(store.children.active.input.value).toBe(false);
      expect(store.children.birthday.input.value).toBe(date);
    });

    test('should opt out of the empty string default', () => {
      const store = createTestStore(v.object({ name: v.string() }), {
        emptyInput: { string: undefined },
      });
      expect(store.children.name.input.value).toBeUndefined();
    });

    test('should apply configured empty input to nested and array children', () => {
      const store = createTestStore(
        v.object({
          user: v.object({ age: v.number() }),
          scores: v.array(v.number()),
        }),
        { initialInput: { scores: [undefined] }, emptyInput: { number: 0 } }
      );
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.age.input.value).toBe(0);
      }
      const scoresStore = store.children.scores;
      expect(scoresStore.kind).toBe('array');
      if (scoresStore.kind === 'array') {
        expect(scoresStore.children[0].input.value).toBe(0);
      }
    });

    test('should store whether a value field is nullish for resetting', () => {
      const store = createTestStore(
        v.object({ name: v.string(), nickname: v.optional(v.string()) })
      );
      const nameStore = store.children.name;
      const nicknameStore = store.children.nickname;
      if (nameStore.kind === 'value' && nicknameStore.kind === 'value') {
        expect(nameStore.isNullish).toBe(false);
        expect(nicknameStore.isNullish).toBe(true);
      }
    });
  });

  describe('object fields', () => {
    test('should initialize with children', () => {
      const store = createTestStore(v.object({ a: v.string(), b: v.number() }));
      expect(store.kind).toBe('object');
      expect(store.name).toBe('[]');
      expect(store.path).toStrictEqual([]);
      expect(store.children).toHaveProperty('a');
      expect(store.children).toHaveProperty('b');
    });

    test('should set the path for deeply nested fields', () => {
      const store = createTestStore(
        v.object({
          groups: v.array(
            v.object({ tags: v.array(v.object({ label: v.string() })) })
          ),
        }),
        { initialInput: { groups: [{ tags: [{ label: 'a' }] }] } }
      );

      expect(store.path).toStrictEqual([]);
      const groupsStore = store.children.groups;
      expect(groupsStore.kind).toBe('array');
      if (groupsStore.kind === 'array') {
        expect(groupsStore.path).toStrictEqual(['groups']);
        const groupStore = groupsStore.children[0];
        expect(groupStore.path).toStrictEqual(['groups', 0]);
        if (groupStore.kind === 'object') {
          const tagsStore = groupStore.children.tags;
          expect(tagsStore.path).toStrictEqual(['groups', 0, 'tags']);
          if (
            tagsStore.kind === 'array' &&
            tagsStore.children[0].kind === 'object'
          ) {
            expect(tagsStore.children[0].path).toStrictEqual([
              'groups',
              0,
              'tags',
              0,
            ]);
            expect(tagsStore.children[0].children.label.path).toStrictEqual([
              'groups',
              0,
              'tags',
              0,
              'label',
            ]);
          }
        }
      }
    });

    test('should initialize nested object', () => {
      const store = createTestStore(
        v.object({ user: v.object({ name: v.string() }) })
      );
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.name.kind).toBe('value');
      }
    });

    test('should set input to true for object fields', () => {
      const store = createTestStore(v.object({ name: v.string() }));
      expect(store.input.value).toBe(true);
    });
  });

  describe('array fields', () => {
    test('should initialize with children for each item', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a', 'b', 'c'] },
      });
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children).toHaveLength(3);
        expect(itemsStore.items.value).toHaveLength(3);
      }
    });

    test('should initialize empty array', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: [] },
      });
      const itemsStore = store.children.items;
      expect(itemsStore.kind).toBe('array');
      if (itemsStore.kind === 'array') {
        expect(itemsStore.children).toHaveLength(0);
        expect(itemsStore.items.value).toHaveLength(0);
      }
    });

    test('should set input to true for array fields', () => {
      const store = createTestStore(v.object({ items: v.array(v.string()) }), {
        initialInput: { items: ['a'] },
      });
      expect(store.children.items.input.value).toBe(true);
    });
  });

  describe('wrapped schemas', () => {
    test('should unwrap optional schema', () => {
      const store = createTestStore(v.object({ name: v.optional(v.string()) }));
      expect(store.children.name.kind).toBe('value');
    });

    test('should unwrap nullable schema', () => {
      const store = createTestStore(v.object({ name: v.nullable(v.string()) }));
      expect(store.children.name.kind).toBe('value');
    });

    test('should unwrap nullish schema with null input', () => {
      const store = createTestStore(
        v.object({ user: v.nullish(v.object({ name: v.string() })) }),
        { initialInput: { user: null } }
      );
      expect(store.children.user.input.value).toBeNull();
    });

    test('should unwrap non_optional schema', () => {
      const store = createTestStore(
        v.object({ name: v.nonOptional(v.optional(v.string())) })
      );
      expect(store.children.name.kind).toBe('value');
    });
  });

  describe('union schemas', () => {
    test('should initialize for each union option', () => {
      const store = createTestStore(
        v.object({
          field: v.union([
            v.object({ a: v.string() }),
            v.object({ b: v.number() }),
          ]),
        })
      );
      const fieldStore = store.children.field;
      expect(fieldStore.kind).toBe('object');
      if (fieldStore.kind === 'object') {
        expect(fieldStore.children).toHaveProperty('a');
        expect(fieldStore.children).toHaveProperty('b');
      }
    });
  });

  describe('tuple schemas', () => {
    test('should initialize fixed tuple items', () => {
      const store = createTestStore(
        v.object({ tuple: v.tuple([v.string(), v.number()]) })
      );
      const tupleStore = store.children.tuple;
      expect(tupleStore.kind).toBe('array');
      if (tupleStore.kind === 'array') {
        expect(tupleStore.children).toHaveLength(2);
      }
    });
  });

  describe('lazy schemas', () => {
    test('should unwrap lazy schema', () => {
      const store = createTestStore(
        v.object({ name: v.lazy(() => v.string()) })
      );
      expect(store.children.name.kind).toBe('value');
    });

    test('should unwrap nested lazy schema', () => {
      const store = createTestStore(
        v.object({ user: v.lazy(() => v.object({ name: v.string() })) })
      );
      const userStore = store.children.user;
      expect(userStore.kind).toBe('object');
      if (userStore.kind === 'object') {
        expect(userStore.children.name.kind).toBe('value');
      }
    });
  });

  describe('nullable/nullish + option schemas', () => {
    test('should preserve null input for nullable variant', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.variant('type', [
              v.object({ type: v.literal('a'), value: v.string() }),
              v.object({ type: v.literal('b'), count: v.number() }),
            ])
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });

    test('should preserve null input for nullable union', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.union([v.object({ a: v.string() }), v.object({ b: v.number() })])
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });

    test('should preserve null input for nullish variant', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullish(
            v.variant('type', [
              v.object({ type: v.literal('a'), value: v.string() }),
            ])
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });

    test('should preserve undefined input for nullish variant', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullish(
            v.variant('type', [
              v.object({ type: v.literal('a'), value: v.string() }),
            ])
          ),
        }),
        { initialInput: { nest: undefined } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeUndefined();
      }
    });

    test('should initialize normally for nullable variant with value', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.variant('type', [
              v.object({ type: v.literal('a'), value: v.string() }),
            ])
          ),
        }),
        { initialInput: { nest: { type: 'a', value: 'hello' } } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBe(true);
        expect(nestStore.children.value.input.value).toBe('hello');
      }
    });

    test('should preserve null input for nullable intersect', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.intersect([
              v.object({ a: v.string() }),
              v.object({ b: v.number() }),
            ])
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });
  });

  describe('nullable/nullish + lazy + option schemas', () => {
    test('should preserve null input for nullable lazy variant', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.lazy(() =>
              v.variant('type', [
                v.object({ type: v.literal('a'), value: v.string() }),
              ])
            )
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });

    test('should preserve null input for nullable lazy union', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.lazy(() =>
              v.union([
                v.object({ a: v.string() }),
                v.object({ b: v.number() }),
              ])
            )
          ),
        }),
        { initialInput: { nest: null } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBeNull();
      }
    });

    test('should initialize normally for nullable lazy variant with value', () => {
      const store = createTestStore(
        v.object({
          nest: v.nullable(
            v.lazy(() =>
              v.variant('type', [
                v.object({ type: v.literal('a'), value: v.string() }),
              ])
            )
          ),
        }),
        { initialInput: { nest: { type: 'a', value: 'hello' } } }
      );
      const nestStore = store.children.nest;
      expect(nestStore.kind).toBe('object');
      if (nestStore.kind === 'object') {
        expect(nestStore.input.value).toBe(true);
        expect(nestStore.children.value.input.value).toBe('hello');
      }
    });
  });

  describe('unsupported schemas', () => {
    test('should throw for record schema', () => {
      expect(() => {
        createTestStore(v.object({ data: v.record(v.string(), v.number()) }));
      }).toThrow('"record" schema is not supported');
    });

    test('should throw for object_with_rest schema', () => {
      expect(() => {
        createTestStore(
          v.object({ data: v.objectWithRest({ a: v.string() }, v.number()) })
        );
      }).toThrow('"object_with_rest" schema is not supported');
    });
  });

  describe('reinitialization errors', () => {
    test('should throw when reinitializing object as array', () => {
      expect(() => {
        createTestStore(
          v.object({
            field: v.union([
              v.object({ name: v.string() }),
              v.array(v.string()),
            ]),
          })
        );
      }).toThrow('cannot be reinitialized as "array"');
    });

    test('should throw when reinitializing array as object', () => {
      expect(() => {
        createTestStore(
          v.object({
            field: v.union([
              v.array(v.string()),
              v.object({ name: v.string() }),
            ]),
          })
        );
      }).toThrow('cannot be reinitialized as "object"');
    });

    test('should throw when variant branches have same key as value and array', () => {
      expect(() => {
        createTestStore(
          v.object({
            a: v.variant('type', [
              v.object({ type: v.literal('string'), value: v.string() }),
              v.object({
                type: v.literal('array'),
                value: v.array(v.string()),
              }),
            ]),
          }),
          { initialInput: { a: { type: 'string', value: '' } } }
        );
      }).toThrow('cannot be reinitialized as "array"');
    });

    test('should throw when variant branches have same key as array and value', () => {
      expect(() => {
        createTestStore(
          v.object({
            a: v.variant('type', [
              v.object({
                type: v.literal('array'),
                value: v.array(v.string()),
              }),
              v.object({ type: v.literal('string'), value: v.string() }),
            ]),
          }),
          { initialInput: { a: { type: 'array', value: [] } } }
        );
      }).toThrow('cannot be reinitialized as "value"');
    });

    test('should throw when variant branches have same key as value and object', () => {
      expect(() => {
        createTestStore(
          v.object({
            a: v.variant('type', [
              v.object({
                type: v.literal('string'),
                value: v.string(),
              }),
              v.object({
                type: v.literal('nested'),
                value: v.object({ x: v.number() }),
              }),
            ]),
          }),
          { initialInput: { a: { type: 'string', value: '' } } }
        );
      }).toThrow('cannot be reinitialized as "object"');
    });

    test('should throw when variant branches have same key as object and value', () => {
      expect(() => {
        createTestStore(
          v.object({
            a: v.variant('type', [
              v.object({
                type: v.literal('nested'),
                value: v.object({ x: v.number() }),
              }),
              v.object({
                type: v.literal('string'),
                value: v.string(),
              }),
            ]),
          }),
          { initialInput: { a: { type: 'nested', value: { x: 1 } } } }
        );
      }).toThrow('cannot be reinitialized as "value"');
    });
  });
});
