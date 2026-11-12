/** @jsxImportSource react */
import { Suspense } from 'react';
import type { DataStore } from 'octane/data';
import {
	DataProvider,
	useFeed,
	usePages,
	useRead,
	useReadState,
	useWrite,
} from 'octane/data/react';
import { setDone, todoChanges, todoPages, todos } from '../_data-todos.js';

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

/** The same paged list as the Octane page's, through the React binding. */
export function ReactPages(props: { store: DataStore }) {
	return (
		<DataProvider store={props.store}>
			<ReactPageList />
		</DataProvider>
	);
}

function ReactPageList() {
	const pages = usePages(todoPages);
	return (
		<section data-react-pages="">
			<ul>
				{pages.value?.map((todo) => (
					<li key={todo.id}>{todo.title}</li>
				))}
			</ul>
			{pages.more ? <button onClick={() => void pages.loadMore()}>More</button> : null}
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
	const feed = useFeed(todoChanges);
	const list = useRead(todos);
	return (
		<section data-react-feed={feed.status}>
			{list.map((todo) => (
				<p key={todo.id}>{todo.title}</p>
			))}
		</section>
	);
}
