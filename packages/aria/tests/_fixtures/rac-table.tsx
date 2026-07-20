import { useState } from 'octane';
import { Checkbox } from '../../src/components/Checkbox';
import {
	Cell,
	Column,
	ColumnResizer,
	ResizableTableContainer,
	Row,
	Table,
	TableBody,
	TableHeader,
} from '../../src/components/Table';

// Fixtures for the RAC Table components over the Phase-4 collection engine and the
// ported table hooks (useTable/useTableRow/useTableCell/... on the grid machinery).
// The selection Checkbox rides the CheckboxContext `selection` slot: each Row
// provides its own row checkbox, and TableHeaderRow provides the select-all
// checkbox to Columns in the header row.

// ---------------------------------------------------------------------------
// Static table: three columns (Name is the row header), two rows.
// ---------------------------------------------------------------------------

export function StaticTableHarness(props: {
	onRowAction?: (key: any) => void;
	disabledKeys?: any;
	selectionMode?: any;
}) {
	return (
		<Table
			aria-label="Files"
			onRowAction={props.onRowAction}
			disabledKeys={props.disabledKeys}
			selectionMode={props.selectionMode}
		>
			<TableHeader>
				<Column isRowHeader>Name</Column>
				<Column>Type</Column>
				<Column>Date Modified</Column>
			</TableHeader>
			<TableBody>
				<Row id="games" textValue="Games">
					<Cell textValue="Games">Games</Cell>
					<Cell textValue="File folder">File folder</Cell>
					<Cell textValue="6/7/2020">6/7/2020</Cell>
				</Row>
				<Row id="program" textValue="Program Files">
					<Cell textValue="Program Files">Program Files</Cell>
					<Cell textValue="File folder">File folder</Cell>
					<Cell textValue="4/7/2021">4/7/2021</Cell>
				</Row>
			</TableBody>
		</Table>
	);
}

// ---------------------------------------------------------------------------
// Sortable table: controlled sortDescriptor cycled through column presses.
// ---------------------------------------------------------------------------

export function SortableTableHarness(props: { onSortChange?: (descriptor: any) => void }) {
	const [sortDescriptor, setSortDescriptor] = useState<any>(null);
	return (
		<Table
			aria-label="Sortable files"
			sortDescriptor={sortDescriptor}
			onSortChange={(descriptor: any) => {
				setSortDescriptor(descriptor);
				props.onSortChange?.(descriptor);
			}}
		>
			<TableHeader>
				<Column id="name" isRowHeader allowsSorting>
					Name
				</Column>
				<Column id="type" allowsSorting>
					Type
				</Column>
				<Column id="date">Date Modified</Column>
			</TableHeader>
			<TableBody>
				<Row id="games" textValue="Games">
					<Cell textValue="Games">Games</Cell>
					<Cell textValue="File folder">File folder</Cell>
					<Cell textValue="6/7/2020">6/7/2020</Cell>
				</Row>
			</TableBody>
		</Table>
	);
}

// ---------------------------------------------------------------------------
// Selectable table: a leading checkbox column (select-all in the header via
// TableHeaderRow's CheckboxContext, per-row checkboxes via Row's), plus a Row
// className render function observing isSelected.
// ---------------------------------------------------------------------------

const selectableRows = [
	{ id: 'alpha', name: 'Alpha', type: 'File' },
	{ id: 'beta', name: 'Beta', type: 'Folder' },
	{ id: 'gamma', name: 'Gamma', type: 'File' },
];

export function SelectableTableHarness(props: {
	disabledKeys?: any;
	disabledBehavior?: any;
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<Table
			aria-label="Selectable files"
			selectionMode="multiple"
			disabledKeys={props.disabledKeys}
			disabledBehavior={props.disabledBehavior}
			onSelectionChange={props.onSelectionChange}
		>
			<TableHeader>
				<Column>
					<Checkbox slot="selection" />
				</Column>
				<Column isRowHeader>Name</Column>
				<Column>Type</Column>
			</TableHeader>
			<TableBody items={selectableRows}>
				{
					((item: any) => (
						<Row
							id={item.id}
							textValue={item.name}
							className={({ isSelected }: any) => (isSelected ? 'row selected' : 'row')}
						>
							<Cell>
								<Checkbox slot="selection" />
							</Cell>
							<Cell textValue={item.name}>{item.name}</Cell>
							<Cell textValue={item.type}>{item.type}</Cell>
						</Row>
					)) as any
				}
			</TableBody>
		</Table>
	);
}

// ---------------------------------------------------------------------------
// Dynamic table: columns={} and items={} render functions, with structural
// mutations (add/remove/reorder) to observe DOM identity across keyed updates.
// ---------------------------------------------------------------------------

const dynamicColumns = [
	{ id: 'name', label: 'Name', isRowHeader: true },
	{ id: 'type', label: 'Type', isRowHeader: false },
];

const initialDynamicRows = [
	{ id: 'alpha', name: 'Alpha', type: 'File' },
	{ id: 'beta', name: 'Beta', type: 'Folder' },
	{ id: 'gamma', name: 'Gamma', type: 'File' },
];

export function DynamicTableHarness() {
	const [items, setItems] = useState(initialDynamicRows);
	return (
		<div>
			<Table aria-label="Dynamic files" selectionMode="multiple">
				<TableHeader columns={dynamicColumns}>
					{
						((column: any) => (
							<Column id={column.id} isRowHeader={column.isRowHeader}>
								{column.label}
							</Column>
						)) as any
					}
				</TableHeader>
				<TableBody items={items}>
					{
						((item: any) => (
							<Row id={item.id} textValue={item.name} columns={dynamicColumns}>
								{
									((column: any) => (
										<Cell textValue={String(item[column.id])}>{String(item[column.id])}</Cell>
									)) as any
								}
							</Row>
						)) as any
					}
				</TableBody>
			</Table>
			<button
				data-action="reorder"
				onClick={() => setItems((prev: any) => [prev[2], prev[0], prev[1]])}
			>
				reorder
			</button>
			<button
				data-action="add"
				onClick={() =>
					setItems((prev: any) => [...prev, { id: 'delta', name: 'Delta', type: 'Folder' }])
				}
			>
				add
			</button>
			<button
				data-action="remove"
				onClick={() => setItems((prev: any) => prev.filter((item: any) => item.id !== 'beta'))}
			>
				remove
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Empty table: renderEmptyState renders a rowheader spanning every column.
// ---------------------------------------------------------------------------

export function EmptyTableHarness() {
	return (
		<Table aria-label="No files">
			<TableHeader>
				<Column isRowHeader>Name</Column>
				<Column>Type</Column>
			</TableHeader>
			<TableBody renderEmptyState={({ isEmpty }: any) => 'No results: ' + String(isEmpty)}>
				{[]}
			</TableBody>
		</Table>
	);
}

// ---------------------------------------------------------------------------
// Resizable table: ResizableTableContainer + a ColumnResizer inside the first
// column header (wiring/aria only — pixel math is layout-driven and inert in
// jsdom).
// ---------------------------------------------------------------------------

export function ResizableTableHarness() {
	return (
		<ResizableTableContainer>
			<Table aria-label="Resizable files">
				<TableHeader>
					<Column id="name" isRowHeader>
						<div style={{ display: 'flex' }}>
							Name
							<ColumnResizer data-testid="name-resizer" />
						</div>
					</Column>
					<Column id="type">Type</Column>
				</TableHeader>
				<TableBody>
					<Row id="games" textValue="Games">
						<Cell textValue="Games">Games</Cell>
						<Cell textValue="File folder">File folder</Cell>
					</Row>
				</TableBody>
			</Table>
		</ResizableTableContainer>
	);
}
