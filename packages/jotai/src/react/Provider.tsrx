// Provider — port of the component half of jotai's react/Provider.ts. Upstream
// only allocates a store when no `store` prop is given (the useRef stays null
// otherwise); the port keeps that laziness but renders through a SINGLE JSX
// path instead of upstream's two createElement returns — the children
// descriptor shape must stay stable across renders for octane's reconciler.
import { useRef, type OctaneNode } from 'octane';
import { createStore } from 'jotai/vanilla';
import { StoreContext, type Store } from './store.ts';

export function Provider(props: { children?: OctaneNode; store?: Store }) @{
	const { children, store } = props;

	const storeRef = useRef<Store | null>(null);
	if (!store && storeRef.current === null) {
		storeRef.current = createStore();
	}

	<StoreContext.Provider value={store || storeRef.current!}>{children}</StoreContext.Provider>
}
