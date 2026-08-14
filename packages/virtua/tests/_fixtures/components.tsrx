import type { OctaneElement } from 'octane/jsx-runtime';
import {
	experimental_VGrid as VGrid,
	VList,
	type CustomCellComponent,
	type CustomContainerComponent,
	type CustomItemComponent,
	type VGridHandle,
	type VListHandle,
	type VListProps,
	Virtualizer,
	type VirtualizerProps,
	WindowVirtualizer,
	type WindowVirtualizerHandle,
} from '../../src/index.ts';

interface Item {
	id: number;
	label: string;
}

export const CustomContainer: CustomContainerComponent = ({ children, ref, style }) =>
	<div data-custom-container ref={ref} style={style}>{children}</div>;

export const CustomItem: CustomItemComponent = ({ children, index, ref, style }) =>
	<div data-custom-item={index} ref={ref} style={style}>{children}</div>;

export const CustomCell: CustomCellComponent = ({ children, ref, style }) =>
	<div data-custom-cell ref={ref} style={style}>{children}</div>;

interface ListFixtureProps {
	items: Item[];
	listRef?: { current: VListHandle | null };
	keepMounted?: readonly number[];
	horizontal?: boolean;
	onScroll?: (offset: number) => void;
	onScrollEnd?: () => void;
	ssrCount?: number;
}

export function ListFixture({
	items,
	listRef,
	keepMounted,
	horizontal,
	onScroll,
	onScrollEnd,
	ssrCount,
}: ListFixtureProps): OctaneElement {
	return <VList
		id="octane-list"
		ref={listRef}
		data={items}
		keepMounted={keepMounted}
		horizontal={horizontal}
		onScroll={onScroll}
		onScrollEnd={onScrollEnd}
		ssrCount={ssrCount}
		itemSize={50}
	>
		{(item: Item, index: number) => <div key={item.id} data-index={index}>{item.label}</div>}
	</VList>;
}

export function StaticChildrenFixture(): OctaneElement {
	return <VList itemSize={50}>
		<div data-static-item="first">First</div>
		<div data-static-item="second">Second</div>
	</VList>;
}

interface VirtualizerFixtureProps extends Pick<VirtualizerProps<Item>, 'as' | 'item'> {
	items: Item[];
}

export function VirtualizerFixture({ items, as, item }: VirtualizerFixtureProps): OctaneElement {
	return <div style={{ overflowY: 'auto', height: 500 }}>
		<Virtualizer data={items} as={as} item={item} itemSize={50}>
			{(entry: Item, index: number) => <span key={entry.id} data-index={index}>{entry.label}</span>}
		</Virtualizer>
	</div>;
}

interface WindowFixtureProps {
	items: Item[];
	listRef?: { current: WindowVirtualizerHandle | null };
	ssrCount?: number;
}

export function WindowFixture({ items, listRef, ssrCount }: WindowFixtureProps): OctaneElement {
	return <div id="window-list">
		<WindowVirtualizer ref={listRef} data={items} ssrCount={ssrCount} itemSize={50}>
			{(item: Item, index: number) => <div key={item.id} data-index={index}>{item.label}</div>}
		</WindowVirtualizer>
	</div>;
}

export function AttributeFixture(props: VListProps): OctaneElement {
	return <VList {...props} />;
}

interface BrowserListFixtureProps {
	items: Item[];
	listRef: { current: VListHandle | null };
	onScroll: (offset: number) => void;
}

export function BrowserListFixture({
	items,
	listRef,
	onScroll,
}: BrowserListFixtureProps): OctaneElement {
	return <VList ref={listRef} data={items} onScroll={onScroll} style={{ height: 200, width: 200 }}>
		{(item: Item, index: number) =>
			<div key={item.id} data-index={index} style={{ height: 50 }}>{item.label}</div>}
	</VList>;
}

interface TwoListsFixtureProps {
	first: Item[];
	second: Item[];
	firstRef: { current: VListHandle | null };
	secondRef: { current: VListHandle | null };
}

export function TwoListsFixture({
	first,
	second,
	firstRef,
	secondRef,
}: TwoListsFixtureProps): OctaneElement {
	return <main>
		<VList ref={firstRef} data={first} itemSize={40} style={{ height: 120 }}>
			{(item: Item) => <div key={item.id}>{item.label}</div>}
		</VList>
		<VList ref={secondRef} data={second} itemSize={60} style={{ height: 120 }}>
			{(item: Item) => <div key={item.id}>{item.label}</div>}
		</VList>
	</main>;
}

interface GridFixtureProps {
	row: number;
	col: number;
	gridRef?: { current: VGridHandle | null };
	ssrRowCount?: number;
	ssrColCount?: number;
	item?: CustomCellComponent;
}

export function GridFixture({
	row,
	col,
	gridRef,
	ssrRowCount,
	ssrColCount,
	item,
}: GridFixtureProps): OctaneElement {
	return <VGrid
		id="octane-grid"
		ref={gridRef}
		row={row}
		col={col}
		cellHeight={50}
		cellWidth={100}
		ssrRowCount={ssrRowCount}
		ssrColCount={ssrColCount}
		item={item}
		style={{ height: 500, width: 500 }}
	>
		{({ rowIndex, colIndex }) => <span data-cell={`${rowIndex}-${colIndex}`}>
			{rowIndex}:{colIndex}
		</span>}
	</VGrid>;
}
