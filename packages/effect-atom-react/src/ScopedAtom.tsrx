// Ported from @effect/atom-react 4.1.0
// (https://github.com/Effect-TS/effect/blob/9a91b1926a5fbfaffd302a7a41a94d4d53a1154e/packages/atom/react/src/ScopedAtom.ts).
//
// Octane adaptations: the provider renders `<Context value>`, because Octane has
// no `Context.Provider`; the types use Octane's `FC`, `Context` and `OctaneNode`;
// the `"use client"` directive is dropped.
/**
 * React helpers for creating Atom instances that belong to one component
 * subtree. `make` returns a scoped atom with a provider, context, and `use`
 * accessor. Each provider creates its own Atom once, so different subtrees can
 * use the same scoped atom definition without sharing state.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Atom from 'effect/reactivity/Atom';
import { createContext, useContext, useRef, type Context, type FC, type OctaneNode } from 'octane';

/**
 * Literal type used as the `ScopedAtom` type identifier.
 *
 * **Details**
 *
 * Used as the computed property key and marker value stored on `ScopedAtom`
 * objects.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = '~@effect/atom-react/ScopedAtom';

/**
 * Type identifier for ScopedAtom.
 *
 * **Details**
 *
 * Used as the computed property key and marker value stored on `ScopedAtom`
 * objects.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = '~@effect/atom-react/ScopedAtom';

/**
 * Scoped Atom interface with a provider-backed instance.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ScopedAtom<A extends Atom.Atom<any>, Input = never> {
	readonly [TypeId]: TypeId;
	use(): A;
	Provider: [Input] extends [never]
		? FC<{ readonly children?: OctaneNode | undefined }>
		: FC<{ readonly children?: OctaneNode | undefined; readonly value: Input }>;
	Context: Context<A>;
}

/**
 * Creates a ScopedAtom from a factory function.
 *
 * **When to use**
 *
 * Use to create an atom instance that is owned by a React provider and scoped
 * to a component subtree.
 *
 * **Details**
 *
 * The returned scoped atom includes a `Provider`, `Context`, and `use`
 * accessor. The provider creates the atom once for its lifetime, passing the
 * `value` prop to the factory when the scoped atom expects input.
 *
 * **Gotchas**
 *
 * `use` must run under the matching provider. Changing the provider `value`
 * prop after mount does not recreate the atom.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <A extends Atom.Atom<any>, Input = never>(
	f: (() => A) | ((input: Input) => A),
): ScopedAtom<A, Input> => {
	const Context = createContext<A>(undefined as unknown as A);

	const use = (): A => {
		const atom = useContext(Context);
		if (atom === undefined) {
			throw new Error('ScopedAtom used outside of its Provider');
		}
		return atom;
	};

	const Provider: FC<{ readonly children?: OctaneNode | undefined; readonly value?: Input }> = (
		props,
	) => {
		const atom = useRef<A | null>(null);
		if (atom.current === null) {
			if ('value' in props) {
				atom.current = (f as (input: Input) => A)(props.value as Input);
			} else {
				atom.current = (f as () => A)();
			}
		}
		return <Context value={atom.current}>{props.children}</Context>;
	};

	return {
		[TypeId]: TypeId,
		use,
		Provider: Provider as any,
		Context,
	};
};
