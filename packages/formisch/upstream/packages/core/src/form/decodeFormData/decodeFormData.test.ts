import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { decodeFormData } from './decodeFormData.ts';

// Creates form data object from list of entries
function createFormData(entries: [string, string | File][]): FormData {
  const formData = new FormData();
  for (const [key, value] of entries) {
    formData.append(key, value);
  }
  return formData;
}

describe('decodeFormData', () => {
  describe('value decoding', () => {
    test('should keep strings as strings', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([['["name"]', 'Jane']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });

    test('should decode numbers', () => {
      const schema = v.object({
        int: v.number(),
        float: v.number(),
        negative: v.number(),
        positive: v.number(),
        leadingDot: v.number(),
        scientific: v.number(),
        scientificNegative: v.number(),
      });
      const formData = createFormData([
        ['["int"]', '42'],
        ['["float"]', '3.14'],
        ['["negative"]', '-7'],
        ['["positive"]', '+5'],
        ['["leadingDot"]', '.5'],
        ['["scientific"]', '1.5e3'],
        ['["scientificNegative"]', '2e-2'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        int: 42,
        float: 3.14,
        negative: -7,
        positive: 5,
        leadingDot: 0.5,
        scientific: 1500,
        scientificNegative: 0.02,
      });
    });

    test('should decode empty number to null', () => {
      const schema = v.object({ age: v.number() });
      const formData = createFormData([['["age"]', '']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ age: null });
    });

    test('should decode "null" and "undefined" numbers', () => {
      const schema = v.object({ a: v.number(), b: v.number() });
      const formData = createFormData([
        ['["a"]', 'null'],
        ['["b"]', 'undefined'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        a: null,
        b: undefined,
      });
    });

    test('should decode non-numeric number values to NaN', () => {
      const schema = v.object({ value: v.number() });
      const formData = createFormData([['["value"]', 'not-a-number']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ value: NaN });
    });

    test('should decode booleans', () => {
      const schema = v.object({
        on: v.boolean(),
        truthy: v.boolean(),
        one: v.boolean(),
        off: v.boolean(),
        falsy: v.boolean(),
        zero: v.boolean(),
      });
      const formData = createFormData([
        ['["on"]', 'on'],
        ['["truthy"]', 'true'],
        ['["one"]', '1'],
        ['["off"]', 'off'],
        ['["falsy"]', 'false'],
        ['["zero"]', '0'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        on: true,
        truthy: true,
        one: true,
        off: false,
        falsy: false,
        zero: false,
      });
    });

    test('should default absent and "undefined" booleans to false', () => {
      // Unchecked checkboxes are absent from the form data, and the "undefined"
      // string decodes to `undefined`; both are filled to `false`
      const schema = v.object({ a: v.boolean(), b: v.boolean() });
      const formData = createFormData([['["b"]', 'undefined']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        a: false,
        b: false,
      });
    });

    test('should preserve decoded null for nullable booleans', () => {
      // A nullable boolean keeps its decoded `null` (from an empty string or
      // the "null" string) instead of being coerced to `false` by default
      // filling
      const schema = v.object({
        a: v.nullable(v.boolean()),
        b: v.nullable(v.boolean()),
      });
      const formData = createFormData([
        ['["a"]', ''],
        ['["b"]', 'null'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        a: null,
        b: null,
      });
    });

    test('should decode the common date and date-time formats', () => {
      const schema = v.object({
        date: v.date(),
        month: v.date(),
        dateTime: v.date(),
        dateTimeSecond: v.date(),
        dateTimeMs: v.date(),
        timestamp: v.date(),
      });
      const formData = createFormData([
        ['["date"]', '2023-06-15'],
        ['["month"]', '2023-06'],
        ['["dateTime"]', '2023-06-15T14:30'],
        ['["dateTimeSecond"]', '2023-06-15T14:30:45'],
        ['["dateTimeMs"]', '2023-06-15T14:30:45.123'],
        ['["timestamp"]', '2023-06-15T14:30:00.000Z'],
      ]);
      const result = decodeFormData(schema, formData) as Record<string, Date>;
      // Dates, months and full timestamps are parsed as UTC by `new Date`
      expect(result.date.toISOString()).toBe('2023-06-15T00:00:00.000Z');
      expect(result.month.toISOString()).toBe('2023-06-01T00:00:00.000Z');
      expect(result.timestamp.toISOString()).toBe('2023-06-15T14:30:00.000Z');
      // Timezone-less date-times are forced to UTC, with or without seconds and
      // fractional seconds
      expect(result.dateTime.toISOString()).toBe('2023-06-15T14:30:00.000Z');
      expect(result.dateTimeSecond.toISOString()).toBe(
        '2023-06-15T14:30:45.000Z'
      );
      expect(result.dateTimeMs.toISOString()).toBe('2023-06-15T14:30:45.123Z');
    });

    test('should decode empty, "null" and "undefined" dates', () => {
      const schema = v.object({
        a: v.date(),
        b: v.date(),
        c: v.date(),
      });
      const formData = createFormData([
        ['["a"]', ''],
        ['["b"]', 'null'],
        ['["c"]', 'undefined'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        a: null,
        b: null,
        c: undefined,
      });
    });

    test('should decode bigints', () => {
      const schema = v.object({
        valid: v.bigint(),
        invalid: v.bigint(),
        empty: v.bigint(),
        nullish: v.bigint(),
        undef: v.bigint(),
      });
      const formData = createFormData([
        ['["valid"]', '9007199254740993'],
        ['["invalid"]', 'not-a-bigint'],
        ['["empty"]', ''],
        ['["nullish"]', 'null'],
        ['["undef"]', 'undefined'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        valid: 9007199254740993n,
        invalid: 'not-a-bigint',
        empty: null,
        nullish: null,
        undef: undefined,
      });
    });

    test('should keep enum, picklist and literal values as strings', () => {
      const schema = v.object({
        enum: v.enum({ Light: 'light', Dark: 'dark' }),
        picklist: v.picklist(['a', 'b']),
        literal: v.literal('x'),
      });
      const formData = createFormData([
        ['["enum"]', 'dark'],
        ['["picklist"]', 'b'],
        ['["literal"]', 'x'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        enum: 'dark',
        picklist: 'b',
        literal: 'x',
      });
    });
  });

  describe('files', () => {
    test('should keep selected files unchanged', () => {
      const schema = v.object({ avatar: v.file() });
      const file = new File(['content'], 'avatar.png', { type: 'image/png' });
      const formData = createFormData([['["avatar"]', file]]);
      const result = decodeFormData(schema, formData) as { avatar: File };
      expect(result.avatar).toBe(file);
    });

    test('should keep files for non-file schemas unchanged', () => {
      const schema = v.object({ data: v.string() });
      const file = new File(['content'], 'data.bin');
      const formData = createFormData([['["data"]', file]]);
      const result = decodeFormData(schema, formData) as { data: File };
      expect(result.data).toBe(file);
    });

    test('should skip empty file inputs of unselected files', () => {
      const schema = v.object({ avatar: v.file() });
      const emptyFile = new File([], '');
      const formData = createFormData([['["avatar"]', emptyFile]]);
      expect(decodeFormData(schema, formData)).toStrictEqual({});
    });

    test('should keep empty files that have a name', () => {
      const schema = v.object({ avatar: v.file() });
      const namedEmptyFile = new File([], 'empty.txt');
      const formData = createFormData([['["avatar"]', namedEmptyFile]]);
      const result = decodeFormData(schema, formData) as { avatar: File };
      expect(result.avatar).toBe(namedEmptyFile);
    });
  });

  describe('nested objects', () => {
    test('should decode nested objects and reuse containers', () => {
      const schema = v.object({
        user: v.object({ name: v.string(), age: v.number() }),
      });
      const formData = createFormData([
        ['["user","name"]', 'Jane'],
        ['["user","age"]', '30'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        user: { name: 'Jane', age: 30 },
      });
    });

    test('should leave absent objects absent', () => {
      const schema = v.object({
        settings: v.object({ darkMode: v.boolean() }),
      });
      const result = decodeFormData(schema, createFormData([])) as Record<
        string,
        unknown
      >;
      expect('settings' in result).toBe(false);
    });

    test('should not crash when an object is replaced by a primitive', () => {
      const schema = v.object({
        nested: v.object({ flag: v.boolean() }),
      });
      const formData = createFormData([['["nested"]', 'hello']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        nested: 'hello',
      });
    });

    test('should not crash on a scalar entry before a nested entry', () => {
      const schema = v.object({ user: v.object({ age: v.number() }) });
      const formData = createFormData([
        ['["user"]', 'x'],
        ['["user","age"]', '1'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ user: 'x' });
    });
  });

  describe('arrays', () => {
    test('should decode indexed arrays of objects', () => {
      const schema = v.object({
        todos: v.array(v.object({ label: v.string(), done: v.boolean() })),
      });
      const formData = createFormData([
        ['["todos",0,"label"]', 'First'],
        ['["todos",0,"done"]', 'on'],
        ['["todos",1,"label"]', 'Second'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        todos: [
          { label: 'First', done: true },
          { label: 'Second', done: false },
        ],
      });
    });

    test('should decode indexed arrays of primitives', () => {
      const schema = v.object({ scores: v.array(v.number()) });
      const formData = createFormData([
        ['["scores",0]', '10'],
        ['["scores",1]', '20'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        scores: [10, 20],
      });
    });

    test('should collect repeated keys into an array', () => {
      const schema = v.object({ tags: v.array(v.string()) });
      const formData = createFormData([
        ['["tags"]', 'a'],
        ['["tags"]', 'b'],
        ['["tags"]', 'c'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        tags: ['a', 'b', 'c'],
      });
    });

    test('should decode a single repeated key into an array', () => {
      const schema = v.object({ ids: v.array(v.number()) });
      const formData = createFormData([['["ids"]', '5']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ ids: [5] });
    });

    test('should default absent arrays to empty arrays', () => {
      const schema = v.object({ tags: v.array(v.string()) });
      expect(decodeFormData(schema, createFormData([]))).toStrictEqual({
        tags: [],
      });
    });

    test('should fill boolean defaults within array items', () => {
      const schema = v.object({
        items: v.array(v.object({ name: v.string(), active: v.boolean() })),
      });
      const formData = createFormData([
        ['["items",0,"name"]', 'A'],
        ['["items",0,"active"]', 'on'],
        ['["items",1,"name"]', 'B'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        items: [
          { name: 'A', active: true },
          { name: 'B', active: false },
        ],
      });
    });
  });

  describe('tuples', () => {
    test('should decode tuples', () => {
      const schema = v.object({
        point: v.tuple([v.number(), v.number()]),
      });
      const formData = createFormData([
        ['["point",0]', '1'],
        ['["point",1]', '2'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        point: [1, 2],
      });
    });

    test('should fill boolean holes within tuples', () => {
      const schema = v.object({
        entry: v.tuple([v.boolean(), v.number()]),
      });
      const formData = createFormData([['["entry",1]', '5']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        entry: [false, 5],
      });
    });

    test('should complete missing trailing tuple items', () => {
      const schema = v.object({
        entry: v.tuple([v.number(), v.boolean()]),
      });
      const formData = createFormData([['["entry",0]', '5']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        entry: [5, false],
      });
    });

    test('should complete absent array at end of tuple', () => {
      const schema = v.object({
        entry: v.tuple([v.number(), v.array(v.string())]),
      });
      const formData = createFormData([['["entry",0]', '5']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        entry: [5, []],
      });
    });

    test('should leave absent tuples absent', () => {
      const schema = v.object({
        entry: v.optional(v.tuple([v.number(), v.number()])),
      });
      const result = decodeFormData(schema, createFormData([])) as Record<
        string,
        unknown
      >;
      expect('entry' in result).toBe(false);
    });

    test('should support loose and strict tuples', () => {
      const schema = v.object({
        loose: v.looseTuple([v.number()]),
        strict: v.strictTuple([v.boolean()]),
      });
      const formData = createFormData([
        ['["loose",0]', '1'],
        ['["strict",0]', 'on'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        loose: [1],
        strict: [true],
      });
    });
  });

  describe('combinators', () => {
    test('should descend into union options', () => {
      const schema = v.object({
        value: v.union([
          v.object({ a: v.number() }),
          v.object({ b: v.boolean() }),
        ]),
      });
      const formData = createFormData([['["value","a"]', '5']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        value: { a: 5, b: false },
      });
    });

    test('should fall back to a string when no union option matches', () => {
      const schema = v.object({
        value: v.union([
          v.object({ a: v.number() }),
          v.object({ b: v.boolean() }),
        ]),
      });
      const formData = createFormData([['["value","c"]', 'raw']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        value: { c: 'raw', b: false },
      });
    });

    test('should descend into intersect options', () => {
      const schema = v.object({
        value: v.intersect([
          v.object({ a: v.number() }),
          v.object({ b: v.boolean() }),
        ]),
      });
      const formData = createFormData([
        ['["value","a"]', '5'],
        ['["value","b"]', 'on'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        value: { a: 5, b: true },
      });
    });

    test('should descend into variant options', () => {
      const schema = v.object({
        value: v.variant('type', [
          v.object({ type: v.literal('a'), count: v.number() }),
          v.object({ type: v.literal('b'), flag: v.boolean() }),
        ]),
      });
      const formData = createFormData([
        ['["value","type"]', 'a'],
        ['["value","count"]', '3'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        value: { type: 'a', count: 3, flag: false },
      });
    });

    test('should support an intersect root schema', () => {
      const schema = v.intersect([
        v.object({ name: v.string() }),
        v.object({ active: v.boolean() }),
      ]);
      const formData = createFormData([['["name"]', 'Jane']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        name: 'Jane',
        active: false,
      });
    });
  });

  describe('wrappers', () => {
    test('should unwrap every wrapper schema for decoding', () => {
      const schema = v.object({
        opt: v.optional(v.number()),
        nul: v.nullable(v.number()),
        nsh: v.nullish(v.number()),
        udf: v.undefinedable(v.number()),
        exo: v.exactOptional(v.number()),
        nonOpt: v.nonOptional(v.optional(v.number())),
        nonNul: v.nonNullable(v.nullable(v.number())),
        nonNsh: v.nonNullish(v.nullish(v.number())),
      });
      const formData = createFormData([
        ['["opt"]', '1'],
        ['["nul"]', '2'],
        ['["nsh"]', '3'],
        ['["udf"]', '4'],
        ['["exo"]', '5'],
        ['["nonOpt"]', '6'],
        ['["nonNul"]', '7'],
        ['["nonNsh"]', '8'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        opt: 1,
        nul: 2,
        nsh: 3,
        udf: 4,
        exo: 5,
        nonOpt: 6,
        nonNul: 7,
        nonNsh: 8,
      });
    });

    test('should unwrap wrapped containers', () => {
      const schema = v.object({
        user: v.optional(v.object({ name: v.string() })),
        tags: v.nullable(v.array(v.string())),
      });
      const formData = createFormData([
        ['["user","name"]', 'Jane'],
        ['["tags"]', 'a'],
        ['["tags"]', 'b'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        user: { name: 'Jane' },
        tags: ['a', 'b'],
      });
    });
  });

  describe('lazy schemas', () => {
    test('should unwrap lazy schemas', () => {
      const schema = v.object({
        node: v.lazy(() => v.object({ value: v.number() })),
      });
      const formData = createFormData([['["node","value"]', '42']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        node: { value: 42 },
      });
    });
  });

  describe('pipelines', () => {
    test('should decode values through pipe schemas', () => {
      const schema = v.object({
        age: v.pipe(v.number(), v.minValue(0)),
        nested: v.pipe(
          v.object({ active: v.boolean() }),
          v.check(() => true)
        ),
        tags: v.pipe(v.array(v.string()), v.minLength(0)),
      });
      const formData = createFormData([
        ['["age"]', '25'],
        ['["nested","active"]', 'on'],
        ['["tags"]', 'x'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        age: 25,
        nested: { active: true },
        tags: ['x'],
      });
    });
  });

  describe('booleans defaults', () => {
    test('should default absent booleans to false', () => {
      const schema = v.object({
        subscribe: v.boolean(),
        terms: v.boolean(),
      });
      const formData = createFormData([['["subscribe"]', 'on']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        subscribe: true,
        terms: false,
      });
    });

    test('should default booleans inside present nested objects', () => {
      const schema = v.object({
        prefs: v.object({ darkMode: v.boolean(), name: v.string() }),
      });
      const formData = createFormData([['["prefs","name"]', 'Jane']]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        prefs: { darkMode: false, name: 'Jane' },
      });
    });
  });

  describe('extra and unknown fields', () => {
    test('should build unknown nested fields as objects', () => {
      const schema = v.object({ known: v.string() });
      const formData = createFormData([
        ['["known"]', 'value'],
        ['["extra","sub"]', 'deep'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        known: 'value',
        extra: { sub: 'deep' },
      });
    });

    test('should decode unknown leaf values as strings', () => {
      const schema = v.object({ known: v.string() });
      const formData = createFormData([['["unknown"]', 'raw']]);
      const result = decodeFormData(schema, formData) as Record<
        string,
        unknown
      >;
      expect(result).toStrictEqual({ unknown: 'raw' });
    });
  });

  describe('prototype pollution', () => {
    test('should ignore __proto__ keys', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['["__proto__"]', 'polluted'],
        ['["__proto__","polluted"]', 'true'],
      ]);
      const result = decodeFormData(schema, formData);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(result).toStrictEqual({});
    });

    test('should ignore constructor and prototype keys', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['["constructor","x"]', 'a'],
        ['["prototype","y"]', 'b'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({});
    });

    test('should stop at a dangerous key deeper in the path', () => {
      const schema = v.object({
        config: v.object({}),
      });
      const formData = createFormData([['["config","__proto__","x"]', 'a']]);
      const result = decodeFormData(schema, formData) as Record<
        string,
        unknown
      >;
      expect(({} as Record<string, unknown>).x).toBeUndefined();
      expect(result).toStrictEqual({ config: {} });
    });
  });

  describe('invalid keys', () => {
    test('should ignore keys that are not valid JSON', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['not json{', 'x'],
        ['["name"]', 'Jane'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });

    test('should ignore keys that do not parse to an array', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['"name"', 'x'],
        ['5', 'y'],
        ['["name"]', 'Jane'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });

    test('should ignore empty array keys', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['[]', 'x'],
        ['["name"]', 'Jane'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });

    test('should ignore keys with non-string or non-number segments', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['[true]', 'x'],
        ['[null]', 'y'],
        ['["name"]', 'Jane'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });

    test('should ignore keys with empty segments', () => {
      const schema = v.object({ name: v.string() });
      const formData = createFormData([
        ['[""]', 'x'],
        ['["name"]', 'Jane'],
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({ name: 'Jane' });
    });
  });

  describe('limits', () => {
    test('should throw when an array index exceeds the maximum length', () => {
      const schema = v.object({ flags: v.array(v.boolean()) });
      const formData = createFormData([['["flags",1000000000]', 'on']]);
      expect(() => decodeFormData(schema, formData)).toThrowError(
        'Array exceeds the maximum length of 5000'
      );
    });

    test('should ignore string properties on arrays', () => {
      const schema = v.object({ flags: v.array(v.string()) });
      const formData = createFormData([
        ['["flags","length"]', '1000000000'], // would inflate via `length`
        ['["flags","push"]', 'x'], // would clobber the `push` method
        ['["flags","1000000000"]', 'x'], // numeric index sent as a string
        ['["flags"]', 'real'], // later append must still work
      ]);
      expect(decodeFormData(schema, formData)).toStrictEqual({
        flags: ['real'],
      });
    });
  });

  describe('integration', () => {
    test('should produce values that validate against the schema', () => {
      const schema = v.object({
        heading: v.string(),
        published: v.boolean(),
        views: v.number(),
        todos: v.array(
          v.object({
            label: v.string(),
            done: v.boolean(),
          })
        ),
        tags: v.array(v.string()),
      });
      const formData = createFormData([
        ['["heading"]', 'My Post'],
        ['["published"]', 'on'],
        ['["views"]', '128'],
        ['["todos",0,"label"]', 'Write'],
        ['["todos",0,"done"]', 'on'],
        ['["todos",1,"label"]', 'Review'],
        ['["tags"]', 'tech'],
        ['["tags"]', 'news'],
      ]);
      const result = v.safeParse(schema, decodeFormData(schema, formData));
      expect(result.success).toBe(true);
      expect(result.output).toStrictEqual({
        heading: 'My Post',
        published: true,
        views: 128,
        todos: [
          { label: 'Write', done: true },
          { label: 'Review', done: false },
        ],
        tags: ['tech', 'news'],
      });
    });
  });
});
