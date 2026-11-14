import { useSyncExternalStore } from 'octane';
import { useDataStore, useRead, DataProvider } from 'octane/data/octane';
import type { DataStore, ReadHandle } from 'octane/data';
import { ids, item, items, type Item, type bareStore } from './data.ts';

const slots = ids.map((id, index) => ({ id, index }));
import { readSignal } from './signal-read.ts';

export type Lane = 'hooks' | 'handle' | 'signals' | 'bare';
export type Scenario = 'own' | 'shared' | 'none';
type Bare = ReturnType<typeof bareStore>;
type RowProps = { id: string; index: number; tick: number; bare: Bare; handles: Handles };
type Handles = { item: Map<string, ReadHandle<Item>>; items: ReadHandle<Item[]> };

/** Counted by every row render, so each lane is checked to render the same rows. */
export const counts = { renders: 0 };

function HooksOwn(props: RowProps) @{
	counts.renders++;
	const value: Item = useRead(useDataStore().read(item, { id: props.id }));
	<li>{value.label as string}</li>
}
function HooksShared(props: RowProps) @{
	counts.renders++;
	const list: Item[] = useRead(useDataStore().read(items));
	<li>{list[props.index]!.label as string}</li>
}
function HandleOwn(props: RowProps) @{
	counts.renders++;
	const value: Item = useRead(props.handles.item.get(props.id)!);
	<li>{value.label as string}</li>
}
function HandleShared(props: RowProps) @{
	counts.renders++;
	const list: Item[] = useRead(props.handles.items);
	<li>{list[props.index]!.label as string}</li>
}
function SignalsOwn(props: RowProps) @{
	counts.renders++;
	const value: Item = readSignal(useDataStore().read(item, { id: props.id }));
	<li>{value.label as string}</li>
}
function SignalsShared(props: RowProps) @{
	counts.renders++;
	const list: Item[] = readSignal(useDataStore().read(items));
	<li>{list[props.index]!.label as string}</li>
}
function BareOwn(props: RowProps) @{
	counts.renders++;
	const value = useSyncExternalStore(
		props.bare.subscribe(props.id),
		props.bare.get(props.id),
	) as Item;
	<li>{value.label as string}</li>
}
function BareShared(props: RowProps) @{
	counts.renders++;
	const list = useSyncExternalStore(
		props.bare.subscribe(props.bare.LIST),
		props.bare.get(props.bare.LIST),
	) as Item[];
	<li>{list[props.index]!.label as string}</li>
}
function NoData(props: RowProps) @{
	counts.renders++;
	<li>{props.id as string}</li>
}

const ROWS = {
	hooks: { own: HooksOwn, shared: HooksShared, none: NoData },
	handle: { own: HandleOwn, shared: HandleShared, none: NoData },
	signals: { own: SignalsOwn, shared: SignalsShared, none: NoData },
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

export function App(props: AppProps) @{
	const Row = ROWS[props.lane][props.scenario];
	<DataProvider store={props.store}>
		<ul>
			@for (const slot of slots; key slot.id) {
				<Row
					id={slot.id}
					index={slot.index}
					tick={props.tick}
					bare={props.bare}
					handles={props.handles}
				/>
			}
		</ul>
	</DataProvider>
}
