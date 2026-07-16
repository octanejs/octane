import { createContext, useContext } from 'octane';
import type { ComponentBody } from 'octane';

/**
 * Creates a typed Octane context for sharing a bundle of atoms and stores with a subtree.
 *
 * The returned `StoreProvider` only transports the provided object through
 * Octane context. Consumers destructure the contextual atoms and stores, then
 * compose them with the existing hooks like {@link useSelector},
 * {@link useSelector} and {@link useAtom}.
 *
 * The object shape is preserved exactly, so keyed atoms and stores remain fully
 * typed when read back with `useStoreContext()`.
 *
 * @example
 * ```tsx
 * const { StoreProvider, useStoreContext } = createStoreContext<{
 *   countAtom: Atom<number>
 *   totalsStore: Store<{ count: number }>
 * }>()
 *
 * function CountButton() {
 *   const { countAtom, totalsStore } = useStoreContext()
 *   const count = useSelector(countAtom)
 *   const total = useSelector(totalsStore, (state) => state.count)
 *
 *   return (
 *     <button
 *       type="button"
 *       onClick={() => totalsStore.setState((state) => ({ ...state, count: state.count + 1 }))}
 *     >
 *       {count} / {total}
 *     </button>
 *   )
 * }
 * ```
 *
 * @throws When `useStoreContext()` is called outside the matching `StoreProvider`.
 */
export function createStoreContext<TValue extends object>(): {
	StoreProvider: ComponentBody<{
		value: TValue;
		children?: any;
	}>;
	useStoreContext: () => TValue;
} {
	const Context = createContext<TValue | null>(null);
	(Context as typeof Context & { displayName?: string }).displayName = 'StoreContext';

	function StoreProvider({ children, value }: { value: TValue; children?: any }) {
		return <Context.Provider value={value}>{children}</Context.Provider>;
	}

	function useStoreContext() {
		const value = useContext(Context);

		if (value === null) {
			throw new Error('Missing StoreProvider for StoreContext');
		}

		return value;
	}

	return {
		StoreProvider,
		useStoreContext,
	};
}
