import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import type { FormStore } from '../../types/index.ts';
import { useForm } from './useForm.ts';

describe('useForm', () => {
  test('should return a FormStore typed against the schema', () => {
    const schema = v.object({ name: v.string() });
    const form = useForm({ schema });

    expectTypeOf(form).toEqualTypeOf<FormStore<typeof schema>>();
  });

  test('should accept full, partial, and reject mistyped initialInput', () => {
    const schema = v.object({ name: v.string(), age: v.number() });

    useForm({ schema, initialInput: { name: 'John', age: 30 } });
    useForm({ schema, initialInput: { name: 'John' } });

    // @ts-expect-error wrong leaf type
    useForm({ schema, initialInput: { name: 123 } });
  });
});
