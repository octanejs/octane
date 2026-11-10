/** @jsxImportSource react */
import { Suspense } from 'react';
import type { DataStore } from 'octane/data';
import { DataProvider, useRead, useReadState, useWrite } from 'octane/data/react';
import { setDone, todos } from '../_data-todos.js';

function ReactDoneCount() {
	const { value } = useReadState(todos);
	return (
		<output data-react-done="">{value ? value.filter((todo) => todo.done).length : '…'}</output>
	);
}

function ReactToggle() {
	const list = useRead(todos);
	const save = useWrite(setDone);
	const todo = list[0]!;
	return (
		<button
			data-react-toggle=""
			onClick={() => void save({ id: todo.id, done: !todo.done }).catch(() => {})}
		>
			{todo.done ? 'Mark active' : 'Complete'}
		</button>
	);
}

/** A React island with its own provider for a store the Octane page also reads. */
export function ReactTodoPanel(props: { store: DataStore }) {
	return (
		<DataProvider store={props.store}>
			<ReactDoneCount />
			<Suspense fallback={<p>React loading</p>}>
				<ReactToggle />
			</Suspense>
		</DataProvider>
	);
}
