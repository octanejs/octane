import { useState } from 'octane';
import { Button } from '../../src/components/Button';
import { Checkbox } from '../../src/components/Checkbox';
import { GridList, GridListItem, GridListLoadMoreItem } from '../../src/components/GridList';
import { Label } from '../../src/components/Label';
import { Tag, TagGroup, TagList } from '../../src/components/TagGroup';

// Fixtures for the RAC TagGroup + GridList components over the Phase-4 collection
// engine. TagGroup builds its own collection from the TagList children; GridList
// builds its own from its children (standalone mode) — the dynamic harnesses drive
// an `items` array through the render-function form.

export function StaticTagGroupHarness(props: {
	selectionMode?: any;
	disabledKeys?: any;
	onSelectionChange?: (keys: any) => void;
	onRemove?: (keys: any) => void;
}) {
	return (
		<TagGroup
			selectionMode={props.selectionMode}
			disabledKeys={props.disabledKeys}
			onSelectionChange={props.onSelectionChange}
			onRemove={props.onRemove}
		>
			<Label>Categories</Label>
			<TagList>
				<Tag id="news" textValue="News">
					News
					{props.onRemove ? <Button slot="remove">x</Button> : null}
				</Tag>
				<Tag id="travel" textValue="Travel">
					Travel
					{props.onRemove ? <Button slot="remove">x</Button> : null}
				</Tag>
				<Tag id="gaming" textValue="Gaming">
					Gaming
					{props.onRemove ? <Button slot="remove">x</Button> : null}
				</Tag>
			</TagList>
		</TagGroup>
	);
}

export function DynamicTagGroupHarness(props: { onRemove?: (keys: any) => void }) {
	const [items, setItems] = useState([
		{ id: 'news', name: 'News' },
		{ id: 'travel', name: 'Travel' },
		{ id: 'gaming', name: 'Gaming' },
	]);
	return (
		<TagGroup
			onRemove={(keys: any) => {
				props.onRemove?.(keys);
				setItems((prev) => prev.filter((item) => !keys.has(item.id)));
			}}
		>
			<Label>Categories</Label>
			<TagList items={items}>
				{(item: any) => (
					<Tag id={item.id} textValue={item.name}>
						{item.name as string}
						<Button slot="remove">x</Button>
					</Tag>
				)}
			</TagList>
		</TagGroup>
	);
}

export function EmptyTagGroupHarness() {
	return (
		<TagGroup>
			<Label>Categories</Label>
			<TagList items={[] as any[]} renderEmptyState={() => 'No tags.'}>
				{(item: any) => <Tag id={item.id}>{item.name as string}</Tag>}
			</TagList>
		</TagGroup>
	);
}

export function StaticGridListHarness(props: {
	selectionMode?: any;
	disabledKeys?: any;
	disabledBehavior?: any;
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<GridList
			aria-label="Favorites"
			selectionMode={props.selectionMode}
			disabledKeys={props.disabledKeys}
			disabledBehavior={props.disabledBehavior}
			onSelectionChange={props.onSelectionChange}
		>
			<GridListItem id="one" textValue="One">
				<Checkbox slot="selection" />
				One
				<Button aria-label="Info One">i</Button>
			</GridListItem>
			<GridListItem id="two" textValue="Two">
				<Checkbox slot="selection" />
				Two
				<Button aria-label="Info Two">i</Button>
			</GridListItem>
			<GridListItem id="three" textValue="Three">
				<Checkbox slot="selection" />
				Three
				<Button aria-label="Info Three">i</Button>
			</GridListItem>
		</GridList>
	);
}

export function DynamicGridListHarness(props: { onSelectionChange?: (keys: any) => void }) {
	const [items, setItems] = useState([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
		{ id: 'c', name: 'Gamma' },
	]);
	return (
		<div>
			<button data-action="reorder" onClick={() => setItems((prev) => [prev[2], prev[0], prev[1]])}>
				reorder
			</button>
			<GridList
				aria-label="Dynamic rows"
				items={items}
				selectionMode="single"
				onSelectionChange={props.onSelectionChange}
			>
				{(item: any) => <GridListItem id={item.id}>{item.name as string}</GridListItem>}
			</GridList>
		</div>
	);
}

export function EmptyGridListHarness() {
	return (
		<GridList aria-label="No rows" items={[] as any[]} renderEmptyState={() => 'No rows found.'}>
			{(item: any) => <GridListItem id={item.id}>{item.name as string}</GridListItem>}
		</GridList>
	);
}

export function LoadMoreGridListHarness(props: { isLoading?: boolean; onLoadMore?: () => void }) {
	return (
		<GridList aria-label="Loadable rows">
			<GridListItem id="a" textValue="Alpha">
				Alpha
			</GridListItem>
			<GridListItem id="b" textValue="Beta">
				Beta
			</GridListItem>
			<GridListLoadMoreItem isLoading={props.isLoading} onLoadMore={props.onLoadMore}>
				Loading more…
			</GridListLoadMoreItem>
		</GridList>
	);
}
