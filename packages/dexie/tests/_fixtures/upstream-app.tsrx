import { useLiveQuery, useSuspendingLiveQuery } from '@octanejs/dexie';
import { useState } from 'octane';

type Item = { id: number; name: string };

function ItemView({ item, idPrefix = 'item-' }: { item: Item; idPrefix?: string }) @{
	<div class="item-component" id={idPrefix + item.id}>
		<p>
			ID:
			<span class="id-span">
				{item.id as string}
			</span>
		</p>
		<p>
			Name:
			<span class="name-span">
				{item.name as string}
			</span>
		</p>
	</div>
}

function ItemList({ db }: { db: any }) @{
	const items = useLiveQuery(() => db.items.toArray() as Promise<Item[]>, [
		db,
	]) as Item[] | undefined;
	@if (!items) {
		<p>Loading...</p>
	} @else {
		<>
			<h3>Items found:</h3>
			<ul id="itemList">
				@for (const item of items; key item.id) {
					{
						/* Distinct ids from the current-item pane so scoped #item-N
    queries work under happy-dom (duplicate document ids break them). */
					}
					<ItemView item={item} idPrefix="list-item-" />
				}
			</ul>
		</>
	}
}

function ItemLoader({ db, id }: { db: any; id: number }) @{
	// Include db.name so per-test databases do not share the module-level
	// suspending cache entry (upstream uses a singleton db + ['item', id]).
	const item = useSuspendingLiveQuery(() => db.items.get(id) as Promise<Item | undefined>, [
		'item',
		db.name,
		id,
	]) as Item | undefined;
	@if (!item) {
		<p class="not-found-item">
			<span>NOT_FOUND</span>
			{': ' + id}
		</p>
	} @else {
		<ItemView item={item} />
	}
}

function CurrentItem({ db, id }: { db: any; id: number }) @{
	@try {
		<ItemLoader db={db} id={id} />
	} @pending {
		<p>Loading item…</p>
	} @catch (error, reset) {
		<div id="errorBoundrary">
			<h1>Something went wrong.</h1>
			<p>
				{'' + error}
			</p>
			<button id="btnRetry" onClick={() => reset()}>
				Retry
			</button>
		</div>
	}
}

/**
 * Port of dexie-react-hooks test/components/App.tsx for Octane.
 * Drives the four upstream QUnit integration scenarios against @octanejs/dexie.
 */
export function UpstreamApp({ db }: { db: any }) @{
	const [currentId, setCurrentId] = useState(1);

	@try {
		<div>
			<div id="list">
				<h2>All items</h2>
				<ItemList db={db} />
			</div>
			<div id="current">
				<h2>Current item</h2>
				<CurrentItem db={db} id={currentId} />
			</div>
			<div id="controls">
				<button id="btnFirst" onClick={() => setCurrentId(1)}>
					First
				</button>
				<button id="btnNext" onClick={() => setCurrentId((prev) => prev + 1)}>
					Next
				</button>
				<button id="btnInvalidKey" onClick={() => setCurrentId(Number.NaN)}>
					Select invalid key
				</button>
			</div>
		</div>
	} @pending {
		<p>Loading app…</p>
	} @catch (error, reset) {
		<div id="errorBoundrary">
			<h1>Something went wrong.</h1>
			<p>
				{'' + error}
			</p>
			<button id="btnRetry" onClick={() => reset()}>
				Retry
			</button>
		</div>
	}
}
