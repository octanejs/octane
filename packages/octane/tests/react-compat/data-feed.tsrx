import { ReactCompat } from 'octane/react';
import type { DataStore } from 'octane/data';
import { listen } from 'octane/data';
import { DataProvider, useDataStore, useFeed, useRead } from 'octane/data/octane';
import { todoChanges, todos } from '../_data-todos.js';
import { ReactFeed } from './data.react.js';

function OctaneFeed() @{
	const feed = useFeed(listen(useDataStore(), todoChanges));
	const list = useRead(useDataStore().read(todos));
	<section data-octane-feed={feed.status}>
		@for (const todo of list; key todo.id) {
			<p>{todo.title as string}</p>
		}
	</section>
}

/** One feed observed from an Octane page and from a React island, with one store. */
export function FeedPage(props: { store: DataStore; island: boolean }) @{
	<DataProvider store={props.store}>
		<OctaneFeed />
		@if (props.island) {
			<ReactCompat>
				<ReactFeed store={props.store} />
			</ReactCompat>
		}
	</DataProvider>
}
