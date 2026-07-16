import { useState } from 'octane';
import {
	createStoreContext,
	useAtom,
	useCreateAtom,
	useCreateStore,
	useSelector,
	useStore,
} from '@octanejs/tanstack-store';
import type { Atom, ReadonlyAtom, ReadonlyStore, Store } from '@tanstack/store';

export function SelectorPair(props: {
	left: Atom<number>;
	right: Atom<number>;
}) @{
	const left = useSelector(props.left);
	const right = useSelector(props.right);

	<p id="pair">
		{left + '/' + right}
	</p>
}

export function ComparedSelection(props: {
	store: Store<{ visible: number; ignored: number }>;
}) @{
	const value = useSelector(props.store, (state) => state, {
		compare: (previous, next) => previous.visible === next.visible,
	});

	<p id="selection">
		{value.visible + '/' + value.ignored}
	</p>
}

export function DerivedPair(props: {
	atom: ReadonlyAtom<number>;
	store: ReadonlyStore<number>;
}) @{
	const atom = useSelector(props.atom);
	const store = useSelector(props.store);

	<p id="derived-pair">
		{atom + '/' + store}
	</p>
}

export function SwitchingSource(props: {
	first: Atom<number>;
	second: Atom<number>;
}) @{
	const [useSecond, setUseSecond] = useState(false);
	const value = useSelector(useSecond ? props.second : props.first);

	<div>
		<p id="switched">
			{value as string}
		</p>
		<button id="switch" onClick={() => setUseSecond(true)}>switch</button>
	</div>
}

export function CreatedAtoms() @{
	const first = useCreateAtom(1);
	const second = useCreateAtom(10);
	const [firstValue, setFirst] = useAtom(first);
	const [secondValue, setSecond] = useAtom(second);
	const [parentRender, setParentRender] = useState(0);

	<div>
		<p id="created-atoms">
			{firstValue + '/' + secondValue + '/' + parentRender}
		</p>
		<button id="first-atom" onClick={() => setFirst((value) => value + 1)}>first</button>
		<button id="second-atom" onClick={() => setSecond((value) => value + 5)}>second</button>
		<button id="parent-render" onClick={() => setParentRender((value) => value + 1)}>parent</button>
	</div>
}

export function CreatedStores() @{
	const plainStore = useCreateStore(1);
	const actionStore = useCreateStore(
		{ count: 10 },
		({ setState }) => ({
			increment: () => setState((state) => ({ count: state.count + 5 })),
		}),
	);
	const plain = useSelector(plainStore);
	const count = useSelector(actionStore, (state) => state.count);

	<div>
		<p id="created-stores">
			{plain + '/' + count}
		</p>
		<button id="plain-store" onClick={() => plainStore.setState((value) => value + 1)}>
			plain
		</button>
		<button id="action-store" onClick={() => actionStore.actions.increment()}>action</button>
	</div>
}

export function AtomTuple(props: { atom: Atom<number> }) @{
	const [value, setValue] = useAtom(props.atom);

	<div>
		<p id="atom-tuple">
			{value as string}
		</p>
		<button id="set-atom" onClick={() => setValue((previous) => previous + 2)}>set</button>
	</div>
}

export function LegacyStore(props: { store: Store<{ value: number; meta: number }> }) @{
	const value = useStore(
		props.store,
		(state) => state,
		(previous, next) => previous.value === next.value,
	);

	<p id="legacy">
		{value.value + '/' + value.meta}
	</p>
}

type ContextValue = { atom: Atom<number> };
const { StoreProvider, useStoreContext } = createStoreContext<ContextValue>();

function ContextValue() @{
	const { atom } = useStoreContext();
	const value = useSelector(atom);

	<p class="context-value">
		{value as string}
	</p>
}

export function NestedProviders(props: {
	outer: Atom<number>;
	inner: Atom<number>;
}) @{
	<StoreProvider value={{ atom: props.outer }}>
		<ContextValue />
		<StoreProvider value={{ atom: props.inner }}>
			<ContextValue />
		</StoreProvider>
	</StoreProvider>
}

export function MissingProvider() @{
	const { atom } = useStoreContext();
	const value = useSelector(atom);
	<p>
		{value as string}
	</p>
}

export function SubscriptionReader(props: {
	source: {
		get: () => number;
		subscribe: (listener: (value: number) => void) => { unsubscribe: () => void };
	};
}) @{
	const value = useSelector(props.source);
	<p id="subscription">
		{value as string}
	</p>
}
