import { observer, runInAction } from '@octanejs/mobx';

export type Item = { id: string; label: string; count: number };
export type ListProps = {
	items: Item[];
	onRef: (id: string, element: HTMLInputElement | null) => void;
};

function RowBody(props: { item: Item; onRef: ListProps['onRef'] }) @{
	<li data-id={props.item.id}>
		<input
			aria-label={props.item.id}
			value={props.item.label}
			ref={(element) => props.onRef(props.item.id, element)}
			onInput={(event) => runInAction(() => {
				props.item.label = event.currentTarget.value;
			})}
		/>
		<button
			onClick={() => runInAction(() => {
				props.item.count++;
			})}
		>{props.item.count as string}</button>
	</li>
}

const Row = observer(RowBody);

function ListBody(props: ListProps) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<Row item={item} onRef={props.onRef} />
		}
	</ul>
}

export const InteractiveList = observer(ListBody);
