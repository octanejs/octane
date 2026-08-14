import type { OctaneElement } from 'octane/jsx-runtime';
import {
	experimental_VGrid as VGrid,
	VList,
	Virtualizer,
	WindowVirtualizer,
	type CustomCellComponent,
	type CustomCellComponentProps,
	type CustomContainerComponent,
	type CustomContainerComponentProps,
	type CustomItemComponent,
	type CustomItemComponentProps,
	type VGridHandle,
	type VGridItemResize,
	type VGridProps,
	type VListHandle,
	type VListProps,
	type ViewportComponentAttributes,
	type VirtualizerHandle,
	type VirtualizerProps,
	type WindowVirtualizerHandle,
	type WindowVirtualizerProps,
} from '@octanejs/virtua';

interface Row {
	id: number;
	label: string;
}

const rows: Row[] = [
	{ id: 1, label: 'one' },
];
const listRef = { current: null as VListHandle | null };
const virtualizerRef = { current: null as VirtualizerHandle | null };
const windowRef = { current: null as WindowVirtualizerHandle | null };
const gridRef = { current: null as VGridHandle | null };

const listProps: VListProps<Row> = {
	data: rows,
	children: (row: Row, index: number) => <div key={row.id}>{`${index}:${row.label}`}</div>,
	itemSize: 40,
	keepMounted: [0],
	ref: listRef,
};

const virtualizerProps: VirtualizerProps<Row> = {
	data: rows,
	children: (row: Row) => <span key={row.id}>{row.label}</span>,
	ref: virtualizerRef,
};

const windowProps: WindowVirtualizerProps<Row> = {
	data: rows,
	children: (row: Row) => <span key={row.id}>{row.label}</span>,
	ref: windowRef,
};

const gridProps: VGridProps = {
	row: 2,
	col: 3,
	children: ({ rowIndex, colIndex }) => <span>{`${rowIndex}:${colIndex}`}</span>,
	ref: gridRef,
};

const viewportAttrs: ViewportComponentAttributes = {
	role: 'list',
	'aria-label': 'items',
	style: { height: 200 },
};
const resize: VGridItemResize = [0, 40];

const Container: CustomContainerComponent = (props: CustomContainerComponentProps): OctaneElement =>
	<div ref={props.ref}>{props.children}</div>;
const Item: CustomItemComponent = (props: CustomItemComponentProps): OctaneElement =>
	<div ref={props.ref} data-index={props.index}>{props.children}</div>;
const Cell: CustomCellComponent = (props: CustomCellComponentProps): OctaneElement =>
	<div ref={props.ref}>{props.children}</div>;

export const PublicSurface = (): OctaneElement => <main {...viewportAttrs}>
	<VList {...listProps} item={Item} />
	<div style={{ overflow: 'auto', height: 200 }}>
		<Virtualizer {...virtualizerProps} as={Container} item={Item} />
	</div>
	<WindowVirtualizer {...windowProps} as={Container} item={Item} />
	<VGrid {...gridProps} item={Cell} />
	<span>{resize[1]}</span>
</main>;

listRef.current?.scrollToIndex(0);
virtualizerRef.current?.scrollBy(10);
windowRef.current?.scrollToIndex(0);
gridRef.current?.resizeRows([resize]);
