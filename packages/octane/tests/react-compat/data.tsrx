import { ReactCompat } from 'octane/react';
import type { DataStore } from 'octane/data';
import { useTransition } from 'octane';
import { DataProvider, useDataStore, useRead, useWrite } from 'octane/data/octane';
import { setDone, todos } from '../_data-todos.js';
import { ReactTodoPanel } from './data.react.js';

function OctaneDoneCount() @{
	const state = useRead(useDataStore().read(todos), { suspend: false });
	<output data-octane-done="">
		{(state.value ? String(state.value.filter((todo) => todo.done).length) : '…') as string}
	</output>
}

function OctaneTitles() @{
	const list = useRead(useDataStore().read(todos));
	const save = useWrite(setDone);
	<ul>
		@for (const todo of list; key todo.id) {
			<li>
				<span>{todo.title as string}</span>
				<button
					data-octane-toggle=""
					onClick={() => void save({ id: todo.id, done: !todo.done }).catch(() => {})}
				>
					{(todo.done ? 'Mark active' : 'Complete') as string}
				</button>
			</li>
		}
	</ul>
}

/** A write inside a transition: its edit shows at once, and the transition stays pending until it settles. */
function TransitionToggle() @{
	const list = useRead(useDataStore().read(todos));
	const save = useWrite(setDone);
	const [pending, start] = useTransition();
	const todo = list[0]!;
	<button
		data-transition-toggle=""
		onClick={() =>
			start(async () => {
				await save({ id: todo.id, done: !todo.done }).catch(() => {});
			})
		}
	>
		{(pending ? 'Saving' : 'Idle') as string}
	</button>
}

/** An Octane page and a React island, both reading one store. */
export function DataPage(props: { store: DataStore; island: boolean }) @{
	<DataProvider store={props.store}>
		<OctaneDoneCount />
		@try {
			<>
				<OctaneTitles />
				<TransitionToggle />
			</>
		} @pending {
			<p>Octane loading</p>
		} @catch (error) {
			<p data-octane-error="">{(error as Error).message as string}</p>
		}
		@if (props.island) {
			<ReactCompat>
				<ReactTodoPanel store={props.store} />
			</ReactCompat>
		}
	</DataProvider>
}
