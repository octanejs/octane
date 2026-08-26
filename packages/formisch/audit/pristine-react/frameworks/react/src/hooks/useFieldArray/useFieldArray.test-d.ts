import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import type { FieldArrayStore } from '../../types/index.ts';
import { useForm } from '../useForm/index.ts';
import { useFieldArray } from './useFieldArray.ts';

describe('useFieldArray', () => {
  test('should return a FieldArrayStore typed against the form schema and path', () => {
    const schema = v.object({ tags: v.array(v.string()) });
    const form = useForm({ schema });
    const fieldArray = useFieldArray(form, { path: ['tags'] });

    expectTypeOf(fieldArray).toEqualTypeOf<
      FieldArrayStore<typeof schema, ['tags']>
    >();
  });

  test('should always type items as string[] regardless of element type', () => {
    const stringForm = useForm({
      schema: v.object({ tags: v.array(v.string()) }),
    });
    const objectForm = useForm({
      schema: v.object({
        users: v.array(v.object({ name: v.string(), age: v.number() })),
      }),
    });

    expectTypeOf(
      useFieldArray(stringForm, { path: ['tags'] }).items
    ).toEqualTypeOf<string[]>();
    expectTypeOf(
      useFieldArray(objectForm, { path: ['users'] }).items
    ).toEqualTypeOf<string[]>();
  });

  test('should narrow path through nested array paths', () => {
    const schema = v.object({
      user: v.object({ hobbies: v.array(v.string()) }),
    });
    const form = useForm({ schema });
    const fieldArray = useFieldArray(form, { path: ['user', 'hobbies'] });

    expectTypeOf(fieldArray.path).toEqualTypeOf<['user', 'hobbies']>();
  });

  test('should reject non-array and invalid paths', () => {
    const schema = v.object({
      name: v.string(),
      tags: v.array(v.string()),
    });
    const form = useForm({ schema });

    // @ts-expect-error name is a string field, not an array
    useFieldArray(form, { path: ['name'] });

    // @ts-expect-error nonexistent field
    useFieldArray(form, { path: ['nonexistent'] });
  });

  test('should accept an array field present in only some variant options', () => {
    const schema = v.object({
      data: v.variant('type', [
        v.object({ type: v.literal('a'), items: v.array(v.string()) }),
        v.object({ type: v.literal('b'), name: v.string() }),
      ]),
    });
    const form = useForm({ schema });
    const fieldArray = useFieldArray(form, { path: ['data', 'items'] });

    expectTypeOf(fieldArray).toEqualTypeOf<
      FieldArrayStore<typeof schema, ['data', 'items']>
    >();
  });
});
