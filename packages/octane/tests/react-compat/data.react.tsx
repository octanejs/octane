/** @jsxImportSource react */
import { Suspense } from 'react';
import type { DataStore } from 'octane/data';
import { listen, pages } from 'octane/data';
import { DataProvider, useDataStore, useFeed, usePages, useRead } from 'octane/data/react';
import { setDone, todoChanges, todoPages, todos } from '../_data-todos.js';

function ReactDoneCount() {
	const { value } = useRead(useDataStore().read(todos), { suspend: false });
	return (
		<output data-react-done="">{value ? value.filter((todo) => todo.done).length : '…'}</output>
	);
}

function ReactToggle() {
	const store = useDataStore();
	const list = useRead(store.read(todos));
	const todo = list[0]!;
	return (
		<button
			data-react-toggle=""
			onClick={() => void store.write(setDone, { id: todo.id, done: !todo.done }).catch(() => {})}
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

/** The same paged list as the Octane page's, through the React binding. */
export function ReactPages(props: { store: DataStore }) {
	return (
		<DataProvider store={props.store}>
			<ReactPageList />
		</DataProvider>
	);
}

function ReactPageList() {
	const shown = usePages(pages(useDataStore(), todoPages));
	return (
		<section data-react-pages="">
			<ul>
				{shown.value?.map((todo) => (
					<li key={todo.id}>{todo.title}</li>
				))}
			</ul>
			{shown.more ? <button onClick={() => void shown.loadMore()}>More</button> : null}
		</section>
	);
}

export function ReactFeed(props: { store: DataStore }) {
	return (
		<DataProvider store={props.store}>
			<ReactFeedList />
		</DataProvider>
	);
}

function ReactFeedList() {
	const feed = useFeed(listen(useDataStore(), todoChanges));
	const list = useRead(useDataStore().read(todos));
	return (
		<section data-react-feed={feed.status}>
			{list.map((todo) => (
				<p key={todo.id}>{todo.title}</p>
			))}
		</section>
	);
}
