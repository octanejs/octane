import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import type { FieldStore, FormStore } from '../../types/index.ts';
import { useForm } from '../useForm/index.ts';
import { useField } from './useField.ts';

describe('useField', () => {
  test('should return a FieldStore typed against the form schema and path', () => {
    const schema = v.object({ name: v.string() });
    const form = useForm({ schema });
    const field = useField(form, { path: ['name'] });

    expectTypeOf(field).toEqualTypeOf<FieldStore<typeof schema, ['name']>>();
  });

  test('should narrow input type for primitive leaves', () => {
    const schema = v.object({ name: v.string(), age: v.number() });
    const form = useForm({ schema });

    expectTypeOf(useField(form, { path: ['name'] }).input).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(useField(form, { path: ['age'] }).input).toEqualTypeOf<
      number | undefined
    >();
  });

  test('should narrow input type through nested object and array index paths', () => {
    const schema = v.object({
      user: v.object({ email: v.string() }),
      tags: v.array(v.string()),
    });
    const form = useForm({ schema });

    expectTypeOf(
      useField(form, { path: ['user', 'email'] }).input
    ).toEqualTypeOf<string | undefined>();
    expectTypeOf(useField(form, { path: ['tags', 0] }).input).toEqualTypeOf<
      string | undefined
    >();
  });

  test('should accept a partial FormStore typed with a generic object schema (#147)', () => {
    // Reusable field logic (e.g. a custom hook) types its `FormStore`
    // parameter with a generic object schema so it accepts any form whose
    // input includes the required field. This must type-check against
    // `useField`.
    function useEmailField(
      form: FormStore<v.GenericSchema<{ email: string }>>
    ) {
      return useField(form, { path: ['email'] });
    }

    const form = useForm({
      schema: v.object({ email: v.string(), name: v.string() }),
    });

    expectTypeOf(useEmailField(form).input).toEqualTypeOf<string | undefined>();
  });

  test('should reject invalid paths', () => {
    const schema = v.object({ name: v.string() });
    const form = useForm({ schema });

    // @ts-expect-error nonexistent field
    useField(form, { path: ['nonexistent'] });

    // @ts-expect-error path through a string leaf
    useField(form, { path: ['name', 'nested'] });
  });
});
