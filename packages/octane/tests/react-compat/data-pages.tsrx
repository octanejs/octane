import { ReactCompat } from 'octane/react';
import type { DataStore } from 'octane/data';
import { pages } from 'octane/data';
import { DataProvider, useDataStore, usePages } from 'octane/data/octane';
import { todoPages } from '../_data-todos.js';
import { ReactPages } from './data.react.js';

function OctanePages() @{
	const shown = usePages(pages(useDataStore(), todoPages));
	<section data-octane-pages="">
		<ul>
			@for (const todo of shown.value ?? []; key todo.id) {
				<li>{todo.title as string}</li>
			}
		</ul>
		@if (shown.more) {
			<button onClick={() => void shown.loadMore()}>{'More'}</button>
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
