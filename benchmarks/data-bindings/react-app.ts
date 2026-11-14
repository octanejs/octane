/** The same rows in React, written with createElement so the build needs no React JSX plugin. */
import { createElement as h, useSyncExternalStore } from 'react';
import { DataProvider, useDataStore, useRead } from 'octane/data/react';
import type { DataStore, ReadHandle } from 'octane/data';
import { ids, item, items, type Item, type bareStore } from './data.ts';

export type Lane = 'hooks' | 'handle' | 'bare';
export type Scenario = 'own' | 'shared' | 'none';
type Bare = ReturnType<typeof bareStore>;
type RowProps = { id: string; index: number; tick: number; bare: Bare; handles: Handles };
type Handles = { item: Map<string, ReadHandle<Item>>; items: ReadHandle<Item[]> };

export const counts = { renders: 0 };
const slots = ids.map((id, index) => ({ id, index }));

function HooksOwn(props: RowProps) {
	counts.renders++;
	const value = useRead(useDataStore().read(item, { id: props.id }));
	return h('li', null, value.label);
}
function HooksShared(props: RowProps) {
	counts.renders++;
	const list = useRead(useDataStore().read(items));
	return h('li', null, list[props.index]!.label);
}
function HandleOwn(props: RowProps) {
	counts.renders++;
	const value = useRead(props.handles.item.get(props.id)!);
	return h('li', null, value.label);
}
function HandleShared(props: RowProps) {
	counts.renders++;
	const list = useRead(props.handles.items);
	return h('li', null, list[props.index]!.label);
}
function BareOwn(props: RowProps) {
	counts.renders++;
	const value = useSyncExternalStore(
		props.bare.subscribe(props.id),
		props.bare.get(props.id),
	) as Item;
	return h('li', null, value.label);
}
function BareShared(props: RowProps) {
	counts.renders++;
	const list = useSyncExternalStore(
		props.bare.subscribe(props.bare.LIST),
		props.bare.get(props.bare.LIST),
	) as Item[];
	return h('li', null, list[props.index]!.label);
}
function NoData(props: RowProps) {
	counts.renders++;
	return h('li', null, props.id);
}

const ROWS = {
	hooks: { own: HooksOwn, shared: HooksShared, none: NoData },
	handle: { own: HandleOwn, shared: HandleShared, none: NoData },
	bare: { own: BareOwn, shared: BareShared, none: NoData },
};

export type AppProps = {
	lane: Lane;
	scenario: Scenario;
	tick: number;
	store: DataStore;
	bare: Bare;
	handles: Handles;
};

export function App(props: AppProps) {
	const Row = ROWS[props.lane][props.scenario];
	return h(
		DataProvider,
		{ store: props.store },
		h(
			'ul',
			null,
			slots.map((slot) =>
				h(Row, {
					key: slot.id,
					id: slot.id,
					index: slot.index,
					tick: props.tick,
					bare: props.bare,
					handles: props.handles,
				}),
			),
		),
	);
}
