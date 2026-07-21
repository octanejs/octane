import { createStoreContext, useAtom, useSelector } from '@octanejs/tanstack-store';
import type { Atom, Store } from '@tanstack/store';

const { StoreProvider, useStoreContext } = createStoreContext<{
	store: Store<{ count: number }>;
}>();

function ContextCount() @{
	const { store } = useStoreContext();
	const count = useSelector(store, (state) => state.count);
	<span id="context-count">{'context=' + count}</span>
}

export function ServerView(props: {
	store: Store<{ count: number }>;
	atom: Atom<number>;
}) @{
	const count = useSelector(props.store, (state) => state.count);
	const [atomValue] = useAtom(props.atom);

	<StoreProvider value={{ store: props.store }}>
		<p id="server-values">{count + '/' + atomValue}</p>
		<ContextCount />
	</StoreProvider>
}
