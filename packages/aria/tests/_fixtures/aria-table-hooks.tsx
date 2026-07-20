import { useRef, useState } from 'octane';
// The table hooks are not on the public entry yet (export wiring is owned by the
// coordinating session), so fixtures import from source paths.
import { Cell } from '../../src/stately/table/Cell';
import { Column } from '../../src/stately/table/Column';
import { Row } from '../../src/stately/table/Row';
import { TableBody } from '../../src/stately/table/TableBody';
import { TableHeader } from '../../src/stately/table/TableHeader';
import { useTableState } from '../../src/stately/table/useTableState';
import { useTableColumnResizeState } from '../../src/stately/table/useTableColumnResizeState';
import { useTable } from '../../src/table/useTable';
import { useTableCell } from '../../src/table/useTableCell';
import { useTableColumnHeader } from '../../src/table/useTableColumnHeader';
import { useTableColumnResize } from '../../src/table/useTableColumnResize';
import { useTableHeaderRow } from '../../src/table/useTableHeaderRow';
import { useTableRow } from '../../src/table/useTableRow';
import { useTableRowGroup } from '../../src/table/useTableRowGroup';
import {
	useTableSelectAllCheckbox,
	useTableSelectionCheckbox,
} from '../../src/table/useTableSelectionCheckbox';
import { TableKeyboardDelegate } from '../../src/table/TableKeyboardDelegate';

// ---------------------------------------------------------------------------
// Shared raw-hooks table scaffold: useTableState → useTable + useTableRowGroup +
// useTableHeaderRow + useTableColumnHeader + useTableRow + useTableCell (+ the
// selection checkbox hooks when the state shows selection checkboxes).
// ---------------------------------------------------------------------------

const columnDefs = [
	{ id: 'name', name: 'Name', isRowHeader: true },
	{ id: 'type', name: 'Type', isRowHeader: false },
	{ id: 'date', name: 'Date', isRowHeader: false },
];

const rowDefs = [
	{ id: 'r1', name: 'Games', type: 'File folder', date: '6/7/2020' },
	{ id: 'r2', name: 'Program Files', type: 'File folder', date: '4/7/2021' },
];

function SelectAllHeader(props: { column: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { columnHeaderProps } = useTableColumnHeader(
		{ node: props.column, isVirtualized: props.v },
		props.state,
		ref,
	);
	const { checkboxProps } = useTableSelectAllCheckbox(props.state);
	return (
		<th {...columnHeaderProps} ref={ref}>
			<input
				type="checkbox"
				data-testid="select-all"
				aria-label={checkboxProps['aria-label']}
				checked={checkboxProps.isSelected}
				disabled={checkboxProps.isDisabled}
				onChange={() => checkboxProps.onChange?.(!checkboxProps.isSelected)}
			/>
		</th>
	);
}

function ColumnHeader(props: { column: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { columnHeaderProps } = useTableColumnHeader(
		{ node: props.column, isVirtualized: props.v },
		props.state,
		ref,
	);
	return (
		<th {...columnHeaderProps} ref={ref} data-testid={'col-' + String(props.column.key)}>
			{props.column.rendered}
		</th>
	);
}

function HeaderRow(props: { headerRow: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { rowProps } = useTableHeaderRow(
		{ node: props.headerRow, isVirtualized: props.v },
		props.state,
		ref,
	);
	return (
		<tr {...rowProps} ref={ref}>
			{[...props.headerRow.childNodes].map((column: any) =>
				column.props?.isSelectionCell ? (
					<SelectAllHeader key={column.key} column={column} state={props.state} v={props.v} />
				) : (
					<ColumnHeader key={column.key} column={column} state={props.state} v={props.v} />
				),
			)}
		</tr>
	);
}

function CheckboxCell(props: { cell: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { gridCellProps } = useTableCell(
		{ node: props.cell, isVirtualized: props.v },
		props.state,
		ref,
	);
	const { checkboxProps } = useTableSelectionCheckbox({ key: props.cell.parentKey }, props.state);
	return (
		<td {...gridCellProps} ref={ref}>
			<input
				type="checkbox"
				data-testid={'checkbox-' + String(props.cell.parentKey)}
				id={checkboxProps.id}
				aria-label={checkboxProps['aria-label']}
				aria-labelledby={checkboxProps['aria-labelledby']}
				checked={checkboxProps.isSelected}
				disabled={checkboxProps.isDisabled}
				onChange={() => checkboxProps.onChange?.(!checkboxProps.isSelected)}
			/>
		</td>
	);
}

function BodyCell(props: { cell: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { gridCellProps } = useTableCell(
		{ node: props.cell, isVirtualized: props.v },
		props.state,
		ref,
	);
	return (
		<td {...gridCellProps} ref={ref}>
			{props.cell.rendered}
		</td>
	);
}

function BodyRow(props: { row: any; state: any; v?: boolean }) {
	const ref = useRef<any>(null);
	const { rowProps } = useTableRow({ node: props.row, isVirtualized: props.v }, props.state, ref);
	return (
		<tr {...rowProps} ref={ref} data-testid={'row-' + String(props.row.key)}>
			{[...props.state.collection.getChildren(props.row.key)].map((cell: any) =>
				cell.props?.isSelectionCell ? (
					<CheckboxCell key={cell.key} cell={cell} state={props.state} v={props.v} />
				) : (
					<BodyCell key={cell.key} cell={cell} state={props.state} v={props.v} />
				),
			)}
		</tr>
	);
}

function TableScaffold(props: { state: any; label: string; v?: boolean }) {
	const state = props.state;
	const ref = useRef<any>(null);
	const { gridProps } = useTable({ 'aria-label': props.label, isVirtualized: props.v }, state, ref);
	const { rowGroupProps: headProps } = useTableRowGroup();
	const { rowGroupProps: bodyProps } = useTableRowGroup();
	return (
		<table {...gridProps} ref={ref}>
			<thead {...headProps}>
				{state.collection.headerRows.map((hr: any) => (
					<HeaderRow key={hr.key} headerRow={hr} state={state} v={props.v} />
				))}
			</thead>
			<tbody {...bodyProps}>
				{[...state.collection].map((row: any) => (
					<BodyRow key={row.key} row={row} state={state} v={props.v} />
				))}
			</tbody>
		</table>
	);
}

function sortableChildren() {
	return [
		<TableHeader
			key="head"
			columns={columnDefs}
			children={
				((c: any) => (
					<Column key={c.id} isRowHeader={c.isRowHeader} allowsSorting>
						{c.name}
					</Column>
				)) as any
			}
		/>,
		<TableBody
			key="body"
			items={rowDefs}
			children={
				((item: any) => (
					<Row
						key={item.id}
						children={((colKey: any) => <Cell>{String(item[colKey])}</Cell>) as any}
					/>
				)) as any
			}
		/>,
	];
}

// Sortable, multi-selectable table with selection checkboxes.
export function TableHarness() {
	const [sort, setSort] = useState<any>(null);
	const state = useTableState({
		children: sortableChildren() as any,
		selectionMode: 'multiple',
		showSelectionCheckboxes: true,
		sortDescriptor: sort,
		onSortChange: setSort,
	});
	return <TableScaffold state={state} label="Files" />;
}

// Same structure rendered with isVirtualized so the aria row/col count and index
// annotations appear.
export function VirtualizedTableHarness() {
	const state = useTableState({
		children: sortableChildren() as any,
		selectionMode: 'multiple',
		showSelectionCheckboxes: true,
	});
	return <TableScaffold state={state} label="Virtual files" v />;
}

// ---------------------------------------------------------------------------
// TableKeyboardDelegate: direct unit assertions on the public delegate class over
// a built TableCollection (no selection column, so cell indices line up with the
// user columns).
// ---------------------------------------------------------------------------

export function DelegateHarness() {
	const state = useTableState({
		children: [
			<TableHeader
				key="head"
				columns={columnDefs}
				children={
					((c: any) => (
						<Column key={c.id} isRowHeader={c.isRowHeader}>
							{c.name}
						</Column>
					)) as any
				}
			/>,
			<TableBody
				key="body"
				items={rowDefs}
				children={
					((item: any) => (
						<Row
							key={item.id}
							children={((colKey: any) => <Cell>{String(item[colKey])}</Cell>) as any}
						/>
					)) as any
				}
			/>,
		] as any,
	});
	const ref = useRef<any>(null);
	const delegate = new TableKeyboardDelegate({
		collection: state.collection,
		disabledKeys: state.disabledKeys,
		ref,
		direction: 'ltr',
		collator: new Intl.Collator('en', { usage: 'search', sensitivity: 'base' }),
	});
	const [nameCol, typeCol, dateCol] = state.collection.columns;
	const r1Cells = [...state.collection.getChildren('r1')];
	const r2Cells = [...state.collection.getChildren('r2')];
	return (
		<div>
			<output data-testid="below">
				{'below:' +
					String(delegate.getKeyBelow(nameCol.key) === r1Cells[0].key) +
					':' +
					String(delegate.getKeyBelow('r1') === 'r2') +
					':' +
					String(delegate.getKeyBelow(r1Cells[1].key) === r2Cells[1].key)}
			</output>
			<output data-testid="above">
				{'above:' +
					String(delegate.getKeyAbove('r2') === 'r1') +
					':' +
					String(delegate.getKeyAbove('r1') === nameCol.key) +
					':' +
					String(delegate.getKeyAbove(r1Cells[1].key) === typeCol.key)}
			</output>
			<output data-testid="rightof">
				{'rightof:' +
					String(delegate.getKeyRightOf(nameCol.key) === typeCol.key) +
					':' +
					String(delegate.getKeyRightOf(dateCol.key) === nameCol.key) +
					':' +
					String(delegate.getKeyRightOf('r1') === r1Cells[0].key) +
					':' +
					String(delegate.getKeyRightOf(r1Cells[0].key) === r1Cells[1].key)}
			</output>
			<output data-testid="leftof">
				{'leftof:' +
					String(delegate.getKeyLeftOf(nameCol.key) === dateCol.key) +
					':' +
					String(delegate.getKeyLeftOf(typeCol.key) === nameCol.key) +
					':' +
					String(delegate.getKeyLeftOf(r1Cells[0].key) === 'r1')}
			</output>
			<output data-testid="firstlast">
				{'fl:' +
					String(delegate.getFirstKey() === 'r1') +
					':' +
					String(delegate.getLastKey() === 'r2')}
			</output>
			<output data-testid="search">{'search:' + String(delegate.getKeyForSearch('Prog'))}</output>
		</div>
	);
}

// ---------------------------------------------------------------------------
// useTableColumnResize: resizer + visually hidden input wired to the resize state
// (wiring only — pixel math is layout-driven and inert in jsdom).
// ---------------------------------------------------------------------------

const resizeHeader = (
	<TableHeader
		key="head"
		columns={columnDefs}
		children={
			((c: any) => (
				<Column key={c.id} isRowHeader={c.isRowHeader}>
					{c.name}
				</Column>
			)) as any
		}
	/>
);

const resizeBody = (
	<TableBody
		key="body"
		items={rowDefs}
		children={
			((item: any) => (
				<Row
					key={item.id}
					children={((colKey: any) => <Cell>{String(item[colKey])}</Cell>) as any}
				/>
			)) as any
		}
	/>
);

// Hoisted so the children identity is stable across renders: the resize hook's
// render-phase "columns changed" adjustment re-runs the component, and a fresh
// children array each pass would rebuild the collection forever.
const resizeChildren = [resizeHeader, resizeBody];

function ResizableHeader(props: { column: any; state: any; layoutState: any; log: any }) {
	const ref = useRef<any>(null);
	const { columnHeaderProps } = useTableColumnHeader({ node: props.column }, props.state, ref);
	const inputRef = useRef<any>(null);
	const { resizerProps, inputProps, isResizing } = useTableColumnResize(
		{
			column: props.column,
			'aria-label': 'Resizer',
			onResizeStart: (w: Map<any, any>) => props.log('start:' + fmtWidths(w)),
			onResize: (w: Map<any, any>) => props.log('resize:' + fmtWidths(w)),
			onResizeEnd: (w: Map<any, any>) => props.log('end:' + fmtWidths(w)),
		},
		props.layoutState,
		inputRef,
	);
	return (
		<th {...columnHeaderProps} ref={ref} data-testid={'col-' + String(props.column.key)}>
			{props.column.rendered}
			<div {...resizerProps} data-testid="resizer" data-resizing={String(isResizing)}>
				<input {...inputProps} ref={inputRef} data-testid="resizer-input" />
			</div>
		</th>
	);
}

function fmtWidths(w: Map<any, any>) {
	return [...w].map(([k, v]) => String(k) + '=' + String(v)).join(',');
}

export function ResizerHarness() {
	const [log, setLog] = useState('');
	const state = useTableState({ children: resizeChildren as any });
	const layoutState = useTableColumnResizeState({ tableWidth: 600 }, state);
	const ref = useRef<any>(null);
	const { gridProps } = useTable({ 'aria-label': 'Resizable' }, state, ref);
	const { rowGroupProps } = useTableRowGroup();
	const nameCol = state.collection.columns[0];
	const appendLog = (entry: string) => setLog((prev: string) => prev + entry + ';');
	return (
		<div>
			<table {...gridProps} ref={ref}>
				<thead {...rowGroupProps}>
					<tr role="row">
						<ResizableHeader
							column={nameCol}
							state={state}
							layoutState={layoutState}
							log={appendLog}
						/>
					</tr>
				</thead>
			</table>
			<button data-testid="start-resize" onClick={() => layoutState.startResize('name')}>
				{'start'}
			</button>
			<output data-testid="resize-log">{'log:' + log}</output>
			<output data-testid="resizing-col">{'rc:' + String(layoutState.resizingColumn)}</output>
		</div>
	);
}
