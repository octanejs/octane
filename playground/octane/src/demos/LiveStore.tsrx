import { makeInMemoryAdapter } from '@livestore/adapter-web';
import { Events, makeSchema, State } from '@livestore/common/schema';
import { queryDb } from '@livestore/livestore';
import { omitUndefineds } from '@livestore/utils';
import { Schema } from '@livestore/utils/effect';
import {
	LiveList,
	StoreRegistry,
	StoreRegistryProvider,
	storeOptions,
	useStore,
} from '@octanejs/livestore';
import { useState } from 'octane';

const todos = State.SQLite.table({
	name: 'playground_todos',
	columns: {
		id: State.SQLite.text({ primaryKey: true }),
		text: State.SQLite.text({ default: '', nullable: false }),
		completed: State.SQLite.boolean({ default: false, nullable: false }),
	},
});

const preferences = State.SQLite.clientDocument({
	name: 'playground_preferences',
	schema: Schema.Struct({ compact: Schema.Boolean }),
	default: { id: 'preferences', value: { compact: false } },
});

const events = {
	todoCreated: Events.synced({
		name: 'playground.todoCreated',
		schema: Schema.Struct({
			id: Schema.String,
			text: Schema.String,
			completed: Schema.Boolean,
		}),
	}),
	todoUpdated: Events.synced({
		name: 'playground.todoUpdated',
		schema: Schema.Struct({
			id: Schema.String,
			text: Schema.String.pipe(Schema.optional),
			completed: Schema.Boolean.pipe(Schema.optional),
		}),
	}),
};

const materializers = State.SQLite.materializers(events, {
	'playground.todoCreated': ({ id, text, completed }) => todos.insert({ id, text, completed }),
	'playground.todoUpdated': ({ id, text, completed }) => todos.update({
		...omitUndefineds({ text, completed }),
	}).where({ id }),
});
const schema = makeSchema({
	state: State.SQLite.makeState({ tables: { todos, preferences }, materializers }),
	events,
});
const allTodos$ = queryDb({
	query: 'select * from playground_todos order by text',
	schema: Schema.Array(todos.rowSchema),
});
const registry = new StoreRegistry();
const options = storeOptions({
	storeId: 'octane-playground-livestore',
	schema,
	adapter: makeInMemoryAdapter(),
});

function LiveStorePanel() @{
	const store = useStore(options);
	const list = store.useQuery(allTodos$);
	const [settings, setSettings] = store.useClientDocument(preferences);
	const sync = store.useSyncStatus();
	const [nextId, setNextId] = useState(1);

	<div class={['panel', settings.compact && 'livestore-compact']}>
		<h2 class="demo-title">{'LiveStore on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Suspense-loaded store, reactive query, client document, sync status, and keyed LiveList.'}</p>
		<dl class="metrics-grid">
			<div>
				<dt>{'Rows'}</dt>
				<dd data-testid="livestore-count">{`${list.length}`}</dd>
			</div>
			<div>
				<dt>{'Sync'}</dt>
				<dd>
					{sync.isSynced ? 'synced' : `${sync.pendingCount} pending`}
				</dd>
			</div>
			<div>
				<dt>{'Density'}</dt>
				<dd>
					{settings.compact ? 'compact' : 'comfortable'}
				</dd>
			</div>
		</dl>
		<div class="row">
			<button
				class="btn"
				onClick={() => {
					const id = `todo-${nextId}`;
					store.commit(
						events.todoCreated({
							id,
							text: nextId % 2 === 0 ? `Alpha ${nextId}` : `Task ${nextId}`,
							completed: false,
						}),
					);
					setNextId(nextId + 1);
				}}
			>{'Add todo'}</button>
			<button
				class="btn"
				onClick={() => setSettings((value) => ({ compact: !value.compact }))}
			>{'Toggle density'}</button>
		</div>
		<ul>
			<LiveList
				store={store}
				items$={allTodos$}
				getKey={(todo) => todo.id}
				renderItem={(todo, itemOptions) => <li data-id={todo.id} data-index={itemOptions.index}>
					<button
						class="btn"
						onClick={() => store.commit(
							events.todoUpdated({ id: todo.id, completed: !todo.completed }),
						)}
					>
						{todo.completed ? 'Undo' : 'Complete'}
					</button>
					<span>{todo.text}</span>
				</li>}
			/>
		</ul>
	</div>
}

export function LiveStoreDemo() @{
	<StoreRegistryProvider storeRegistry={registry}>
		@try {
			<LiveStorePanel />
		} @pending {
			<div class="panel" data-testid="livestore-loading">{'Loading LiveStore…'}</div>
		}
	</StoreRegistryProvider>
}
