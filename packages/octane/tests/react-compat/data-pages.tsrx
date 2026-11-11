import { ReactCompat } from 'octane/react';
import type { DataStore } from 'octane/data';
import { DataProvider, usePages } from 'octane/data/octane';
import { todoPages } from '../_data-todos.js';
import { ReactPages } from './data.react.js';

function OctanePages() @{
	const pages = usePages(todoPages);
	<section data-octane-pages="">
		<ul>
			@for (const todo of pages.value ?? []; key todo.id) {
				<li>{todo.title as string}</li>
			}
		</ul>
		@if (pages.more) {
			<button onClick={() => void pages.loadMore()}>{'More'}</button>
		}
	</section>
}

/** One paged list in an Octane page and in a React island, from one store. */
export function PagesPage(props: { store: DataStore }) @{
	<DataProvider store={props.store}>
		<OctanePages />
		<ReactCompat>
			<ReactPages store={props.store} />
		</ReactCompat>
	</DataProvider>
}
