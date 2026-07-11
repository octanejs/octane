// The store context + `useStore` — port of the context half of jotai's
// react/Provider.ts. The context instance is deduped across duplicate module
// instances via a globalThis map keyed by octane's createContext (the same
// hazard exists under Vite dev — duplicate module instances — see
// @octanejs/redux's Context.ts, which this mirrors).
import { createContext, useContext } from 'octane';
import { createStore, getDefaultStore } from 'jotai/vanilla';
import { splitSlot } from '../internal';

export type Store = ReturnType<typeof createStore>;

const ContextKey = Symbol.for('octane-jotai-store-context');
const gT: any = typeof globalThis !== 'undefined' ? globalThis : {};

function getContext() {
	const contextMap: Map<typeof createContext, any> = (gT[ContextKey] ??= new Map());
	let realContext = contextMap.get(createContext);
	if (!realContext) {
		realContext = createContext<Store | undefined>(undefined);
		contextMap.set(createContext, realContext);
	}
	return realContext as ReturnType<typeof createContext<Store | undefined>>;
}

export const StoreContext = getContext();

type Options = {
	store?: Store;
};

// Resolution order (upstream parity): an explicit `options.store` wins, then
// the nearest <Provider>'s store, then the module-global default store. The
// context read is keyed by context identity in octane, so no slot is needed —
// the trailing compiler-injected slot is stripped and dropped.
export function useStore(options?: Options): Store;
export function useStore(...rest: [options?: Options, slot?: symbol]): Store {
	const [user] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	const store = useContext(StoreContext);
	return options?.store || store || getDefaultStore();
}
