import {
	createAtom,
	createStore,
	createStoreContext,
	useAtom,
	useCreateAtom,
	useCreateStore,
	useSelector,
	useStore,
} from '@octanejs/tanstack-store';

const externalStore = createStore({ count: 1, ignored: 10 });
const externalAtom = createAtom(5);
const { StoreProvider, useStoreContext } = createStoreContext<
	{
		atom: typeof externalAtom;
	}
>();

function ContextReader() @{
	const { atom } = useStoreContext();
	const value = useSelector(atom);
	<span id="context">
		{'context=' + value}
	</span>
}

function Values() @{
	const count = useSelector(externalStore, (state) => state.count);
	const legacy = useStore(
		externalStore,
		(state) => state,
		(previous, next) => previous.count === next.count,
	);
	const [atomValue, setAtomValue] = useAtom(externalAtom);
	const localAtom = useCreateAtom(20);
	const [localAtomValue, setLocalAtomValue] = useAtom(localAtom);
	const localStore = useCreateStore(
		{ count: 30 },
		({ setState }) => ({
			increment: () => setState((state) => ({ count: state.count + 1 })),
		}),
	);
	const localStoreValue = useSelector(localStore, (state) => state.count);

	<div>
		<p id="values">
			{count + '/' + legacy.count + ':' + legacy.ignored + '/' + atomValue + '/' + localAtomValue +
				'/' +
				localStoreValue}
		</p>
		<ContextReader />
		<button
			id="store"
			onClick={() => externalStore.setState((state) => ({ ...state, count: state.count + 1 }))}
		>store</button>
		<button
			id="ignored"
			onClick={() => externalStore.setState((state) => ({ ...state, ignored: state.ignored + 1 }))}
		>ignored</button>
		<button id="atom" onClick={() => setAtomValue((value) => value + 1)}>atom</button>
		<button id="local-atom" onClick={() => setLocalAtomValue((value) => value + 1)}>
			local atom
		</button>
		<button id="local-store" onClick={() => localStore.actions.increment()}>local store</button>
	</div>
}

export function StoreParity() @{
	<StoreProvider value={{ atom: externalAtom }}>
		<Values />
	</StoreProvider>
}
