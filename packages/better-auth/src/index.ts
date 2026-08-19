import { createAuthClient as createVanillaAuthClient } from 'better-auth/client';
import type {
	AuthClient as VanillaAuthClient,
	BetterAuthClientOptions,
	IsSignal,
	UnionToIntersection,
} from 'better-auth/client';
import type { Store } from 'nanostores';
import { readSlot } from './internal';
import { useStore } from './useStore';

type InferResolvedHooks<Option extends BetterAuthClientOptions> = Option extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends { getAtoms?: infer GetAtoms }
				? GetAtoms extends (...args: any[]) => infer Atoms
					? Atoms extends Record<string, any>
						? {
								[
									Key in keyof Atoms as IsSignal<Key> extends true
										? never
										: Key extends string
											? `use${Capitalize<Key>}`
											: never
								]: (...rest: [slot?: symbol]) => ReturnType<Atoms[Key]['get']>;
							}
						: {}
					: {}
				: {}
		>
	: {};

type SessionHook<Option extends BetterAuthClientOptions> = (
	...rest: [slot?: symbol]
) => ReturnType<VanillaAuthClient<Option>['useSession']['get']>;

export type AuthClient<Option extends BetterAuthClientOptions> = Omit<
	VanillaAuthClient<Option>,
	keyof InferResolvedHooks<Option> | 'useSession'
> &
	InferResolvedHooks<Option> & {
		useSession: SessionHook<Option>;
	};

function isStore(value: unknown): value is Store {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as Store).get === 'function' &&
		typeof (value as Store).listen === 'function'
	);
}

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option,
): AuthClient<Option> {
	const client = createVanillaAuthClient(options);
	const hooks = new Map<PropertyKey, (...rest: unknown[]) => unknown>();

	return new Proxy(client, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof property !== 'string' || !/^use[A-Z]/.test(property) || !isStore(value))
				return value;
			const atomName = property[3].toLowerCase() + property.slice(4);
			const atom = (client.$store.atoms as Record<string, unknown>)[atomName];
			if (value !== atom) return value;

			let hook = hooks.get(property);
			if (hook === undefined) {
				hook = (...rest: unknown[]) => {
					return useStore(value, undefined, readSlot(rest));
				};
				hooks.set(property, hook);
			}
			return hook;
		},
	}) as AuthClient<Option>;
}

export { useStore } from './useStore';
export type { UseStoreOptions } from './useStore';
export type * from 'better-auth/client';
