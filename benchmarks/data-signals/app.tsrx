import { DataProvider } from 'octane/data/octane';
import type { DataStore } from 'octane/data';
import type { Body, Row, Slot } from './shared.ts';

export interface AppProps {
	store: DataStore;
	slots: readonly Slot[];
	tick: number;
	Row?: Row;
	Body?: Body;
}

function List(props: { slots: readonly Slot[]; tick: number; Row: Row }) @{
	const Row = props.Row;
	<ul>
		@for (const slot of props.slots; key slot.id) {
			<Row id={slot.id} index={slot.index} ids={slot.ids} tick={props.tick} />
		}
	</ul>
}

export function App(props: AppProps) @{
	const Body = props.Body;
	<DataProvider store={props.store}>
		@if (Body) {
			<Body slots={props.slots} tick={props.tick} />
		} @else {
			<List slots={props.slots} tick={props.tick} Row={props.Row!} />
		}
	</DataProvider>
}
