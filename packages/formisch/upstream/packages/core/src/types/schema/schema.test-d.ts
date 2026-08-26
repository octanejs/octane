import * as v from 'valibot';
import { describe, expectTypeOf, test } from 'vitest';
import type { FormSchema } from './schema.ts';

// Mirrors how the public APIs (e.g. `useForm`, `createForm`) constrain the form
// root, so `@ts-expect-error` marks exactly the schemas a form must reject.
function acceptFormSchema<TSchema extends FormSchema>(
  schema: TSchema
): TSchema {
  return schema;
}

describe('FormSchema', () => {
  test('should accept object schemas at the root', () => {
    acceptFormSchema(v.object({ name: v.string() }));
    acceptFormSchema(v.looseObject({ name: v.string() }));
    acceptFormSchema(v.strictObject({ name: v.string() }));
  });

  test('should accept async object schemas at the root', () => {
    acceptFormSchema(v.objectAsync({ name: v.string() }));
    acceptFormSchema(v.looseObjectAsync({ name: v.string() }));
    acceptFormSchema(v.strictObjectAsync({ name: v.string() }));
  });

  test('should accept piped object schemas at the root', () => {
    acceptFormSchema(
      v.pipe(
        v.object({ a: v.string(), b: v.string() }),
        v.forward(
          v.partialCheck([['a'], ['b']], (input) => input.a === input.b, ''),
          ['b']
        )
      )
    );
  });

  test('should accept object combinators at the root', () => {
    acceptFormSchema(
      v.intersect([v.object({ a: v.string() }), v.object({ b: v.number() })])
    );
    acceptFormSchema(
      v.union([v.object({ a: v.string() }), v.object({ b: v.number() })])
    );
    acceptFormSchema(
      v.variant('type', [
        v.object({ type: v.literal('a'), a: v.string() }),
        v.object({ type: v.literal('b'), b: v.number() }),
      ])
    );
  });

  test('should accept async object combinators at the root', () => {
    acceptFormSchema(
      v.intersectAsync([
        v.object({ a: v.string() }),
        v.objectAsync({ b: v.number() }),
      ])
    );
    acceptFormSchema(
      v.unionAsync([
        v.object({ a: v.string() }),
        v.objectAsync({ b: v.number() }),
      ])
    );
    acceptFormSchema(
      v.variantAsync('type', [
        v.object({ type: v.literal('a'), a: v.string() }),
        v.objectAsync({ type: v.literal('b'), b: v.number() }),
      ])
    );
  });

  test('should accept combinators whose options are variants (payment shape)', () => {
    acceptFormSchema(
      v.intersect([
        v.object({ owner: v.pipe(v.string(), v.nonEmpty()) }),
        v.variant('type', [
          v.object({ type: v.literal('card'), card: v.string() }),
          v.object({ type: v.literal('paypal'), paypal: v.string() }),
        ]),
      ])
    );
    acceptFormSchema(
      v.union([
        v.variant('type', [
          v.object({ type: v.literal('a'), a: v.string() }),
          v.object({ type: v.literal('b'), b: v.number() }),
        ]),
        v.object({ c: v.string() }),
      ])
    );
  });

  test('should accept lazy schemas wrapping objects at the root', () => {
    acceptFormSchema(v.lazy(() => v.object({ name: v.string() })));
    acceptFormSchema(
      v.lazy(() =>
        v.union([v.object({ a: v.string() }), v.object({ b: v.number() })])
      )
    );
    acceptFormSchema(v.lazyAsync(() => v.objectAsync({ name: v.string() })));
  });

  test('should accept record schemas at the root', () => {
    // The object root is enforced structurally (output extends
    // `Record<string, unknown>`), so a record root type-checks even though it
    // is not a concrete object schema.
    acceptFormSchema(v.record(v.string(), v.string()));
  });

  test('should reject non-object schemas at the root', () => {
    // @ts-expect-error primitive root
    acceptFormSchema(v.string());
    // @ts-expect-error primitive root
    acceptFormSchema(v.number());
    // @ts-expect-error array root
    acceptFormSchema(v.array(v.object({ name: v.string() })));
    // @ts-expect-error optional-wrapped object root
    acceptFormSchema(v.optional(v.object({ name: v.string() })));
    // @ts-expect-error lazy wrapping a non-object
    acceptFormSchema(v.lazy(() => v.string()));
  });

  test('should reject combinators with non-object options at the root', () => {
    // @ts-expect-error union with a non-object option
    acceptFormSchema(v.union([v.object({ a: v.string() }), v.string()]));
  });

  test('should infer the output through combinator and lazy roots', () => {
    expectTypeOf(
      v.parse(v.object({ name: v.string() }), { name: '' })
    ).toEqualTypeOf<{ name: string }>();

    expectTypeOf(
      v.parse(
        v.lazy(() => v.object({ name: v.string() })),
        { name: '' }
      )
    ).toEqualTypeOf<{ name: string }>();

    expectTypeOf(
      v.parse(
        v.union([v.object({ a: v.string() }), v.object({ b: v.number() })]),
        { a: '' }
      )
    ).toEqualTypeOf<{ a: string } | { b: number }>();
  });
});
