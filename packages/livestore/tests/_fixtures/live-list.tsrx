import type { Todo } from '@livestore/framework-toolkit/testing';
import type { LiveQueryDef, Store } from '@livestore/livestore';
import { LiveList } from '@octanejs/livestore/experimental';

function TodoRow(props: {
	item: Todo;
	index: number;
	isInitialListRender: boolean;
	onRender: (entry: string) => void;
}) @{
	props.onRender(`${props.item.id}:${props.index}:${props.isInitialListRender}`);
	<li
		data-id={props.item.id}
		data-index={props.index}
		data-initial={String(props.isInitialListRender)}
	>{props.item.text}</li>
}

export function TodoLiveList(props: {
	store: Store<any>;
	items$: LiveQueryDef<ReadonlyArray<Todo>>;
	onRender: (entry: string) => void;
}) @{
	<ul>
		<LiveList
			store={props.store}
			items$={props.items$}
			getKey={(item) => item.id}
			renderItem={(item, options) =>
				<TodoRow
					item={item}
					index={options.index}
					isInitialListRender={options.isInitialListRender}
					onRender={props.onRender}
				/>}
		/>
	</ul>
}
