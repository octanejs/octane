import { describe, expectTypeOf, it } from 'vitest';

import type { DeepPartial, UseChatOptions, UseChatReturn } from '../src/index';

type Person = { name: string; age: number; email: string };

/**
 * A hand-rolled shape matching `@standard-schema/spec`'s `StandardSchemaV1`
 * interface (version/vendor/validate/types). `@standard-schema/spec` is only
 * a transitive dependency of `@tanstack/ai` (nested under its own
 * `node_modules`, not hoisted for direct resolution here), so this test
 * reproduces the structural contract instead of importing it directly.
 * `SchemaInput`'s `StandardSchemaV1` branch is a plain structural interface,
 * so this type satisfies it identically for `InferSchemaType`.
 */
type StandardSchemaLike<Input, Output = Input> = {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
		) =>
			| { readonly value: Output; readonly issues?: undefined }
			| { readonly issues: ReadonlyArray<{ readonly message: string }> };
		readonly types?: {
			readonly input: Input;
			readonly output: Output;
		};
	};
};

type PersonSchema = StandardSchemaLike<Person, Person>;

describe('useChat() return type', () => {
	describe('with outputSchema', () => {
		it('exposes typed partial + final', () => {
			type R = UseChatReturn<any, PersonSchema>;
			expectTypeOf<R['partial']>().toEqualTypeOf<DeepPartial<Person>>();
			expectTypeOf<R['final']>().toEqualTypeOf<Person | null>();
		});

		it('still exposes the base shape (messages, sendMessage, isLoading, …)', () => {
			type R = UseChatReturn<any, PersonSchema>;
			expectTypeOf<R['sendMessage']>().toBeFunction();
			expectTypeOf<R['isLoading']>().toBeBoolean();
			expectTypeOf<R['messages']>().toBeArray();
		});

		it('options accept outputSchema with the schema type', () => {
			type O = UseChatOptions<any, PersonSchema>;
			expectTypeOf<O['outputSchema']>().toEqualTypeOf<PersonSchema | undefined>();
		});
	});

	describe('without outputSchema', () => {
		it('does NOT expose partial or final', () => {
			type R = UseChatReturn<any>;
			// The conditional resolves to Record<never, never>, so accessing
			// `partial` / `final` keys is a type error.
			// @ts-expect-error - partial only exists when outputSchema is supplied
			type _Partial = R['partial'];
			// @ts-expect-error - final only exists when outputSchema is supplied
			type _Final = R['final'];
		});

		it('preserves the base return shape', () => {
			type R = UseChatReturn<any>;
			expectTypeOf<R['sendMessage']>().toBeFunction();
			expectTypeOf<R['isLoading']>().toBeBoolean();
		});
	});
});
