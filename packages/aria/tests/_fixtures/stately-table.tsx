import { useState } from 'octane';
// The table/grid stately hooks are not on the public entry yet (export wiring is
// owned by the coordinating session), so fixtures import from source paths.
import { Cell } from '../../src/stately/table/Cell';
import { Column } from '../../src/stately/table/Column';
import { Row } from '../../src/stately/table/Row';
import { TableBody } from '../../src/stately/table/TableBody';
import { TableHeader } from '../../src/stately/table/TableHeader';
import { useTableState } from '../../src/stately/table/useTableState';
import { useTableColumnResizeState } from '../../src/stately/table/useTableColumnResizeState';
import { UNSTABLE_useTreeGridState } from '../../src/stately/table/useTreeGridState';
import { enableTableNestedRows } from '../../src/stately/flags';
import { GridCollection } from '../../src/stately/grid/GridCollection';
import { useGridState } from '../../src/stately/grid/useGridState';

// useTreeGridState is gated behind the ported feature flag (upstream contract).
enableTableNestedRows();

// --- useTableState (dynamic columns + rows, selection, sort, disabledKeys) ---

const columnDefs = [
	{ id: 'name', name: 'Name', isRowHeader: true },
	{ id: 'type', name: 'Type', isRowHeader: false },
	{ id: 'date', name: 'Date', isRowHeader: false },
];

const rowDefs = [
	{ id: 'r1', name: 'Games', type: 'File folder', date: '6/7/2020' },
	{ id: 'r2', name: 'Program Files', type: 'File folder', date: '4/7/2021' },
	{ id: 'r3', name: 'bootmgr', type: 'System file', date: '11/20/2010' },
];

export function TableHarness() {
	const [sort, setSort] = useState<any>(null);
	const [mode, setMode] = useState<'multiple' | 'single'>('multiple');
	const state = useTableState({
		children: [
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
		] as any,
		selectionMode: mode,
		disabledKeys: ['r3'],
		sortDescriptor: sort,
		onSortChange: setSort,
	});
	return (
		<div>
			<button data-testid="select-r1" onClick={() => state.selectionManager.select('r1')}>
				{'r1'}
			</button>
			<button data-testid="select-r2" onClick={() => state.selectionManager.select('r2')}>
				{'r2'}
			</button>
			<button data-testid="select-r3" onClick={() => state.selectionManager.select('r3')}>
				{'r3'}
			</button>
			<button data-testid="mode-single" onClick={() => setMode('single')}>
				{'single'}
			</button>
			<button data-testid="sort-name" onClick={() => state.sort('name')}>
				{'sort name'}
			</button>
			<button data-testid="sort-type" onClick={() => state.sort('type')}>
				{'sort type'}
			</button>
			<output data-testid="cols">
				{'cols:' +
					state.collection.columns.map((c: any) => String(c.key) + '=' + c.textValue).join(',')}
			</output>
			<output data-testid="hrows">
				{'hrows:' +
					state.collection.headerRows
						.map(
							(r: any) =>
								String(r.key) +
								'[' +
								[...r.childNodes].map((c: any) => String(c.key)).join('|') +
								']',
						)
						.join(',')}
			</output>
			<output data-testid="rows">
				{'rows:' +
					[...state.collection]
						.map(
							(r: any) =>
								String(r.key) +
								'[' +
								[...state.collection.getChildren(r.key)].map((c: any) => c.textValue).join('|') +
								']',
						)
						.join(',')}
			</output>
			<output data-testid="rowheaders">
				{'rh:' + [...state.collection.rowHeaderColumnKeys].join(',')}
			</output>
			<output data-testid="textvalue">{'tv:' + state.collection.getTextValue('r1')}</output>
			<output data-testid="selected">
				{'s:' + ([...state.selectionManager.selectedKeys].sort().join(',') || 'empty')}
			</output>
			<output data-testid="disabled">{'d:' + [...state.disabledKeys].join(',')}</output>
			<output data-testid="sort">
				{'sort:' +
					(state.sortDescriptor
						? String(state.sortDescriptor.column) + ':' + state.sortDescriptor.direction
						: 'none')}
			</output>
		</div>
	);
}

// --- Tiered (nested-column) header structure through buildHeaderRows ---

const nestedHeader = (
	<TableHeader
		key="head"
		children={
			[
				<Column
					key="info"
					title="Info"
					children={
						[
							<Column key="name" isRowHeader>
								Name
							</Column>,
							<Column key="type">Type</Column>,
						] as any
					}
				/>,
				<Column key="date">Date</Column>,
			] as any
		}
	/>
);

const nestedBody = (
	<TableBody
		key="body"
		children={
			[
				<Row
					key="r1"
					children={[<Cell>Games</Cell>, <Cell>File folder</Cell>, <Cell>6/7/2020</Cell>] as any}
				/>,
			] as any
		}
	/>
);

export function NestedHeaderHarness() {
	const state = useTableState({
		children: [nestedHeader, nestedBody] as any,
	});
	return (
		<div>
			<output data-testid="cols">
				{'cols:' + state.collection.columns.map((c: any) => String(c.key)).join(',')}
			</output>
			<output data-testid="hrows">
				{'hr:' +
					state.collection.headerRows
						.map((r: any) =>
							[...r.childNodes]
								.map(
									(c: any) =>
										(c.type === 'placeholder' ? 'ph' : String(c.key)) + ':' + (c.colSpan ?? 1),
								)
								.join(','),
						)
						.join(';')}
			</output>
			<output data-testid="cells">
				{'cells:' + [...state.collection.getChildren('r1')].map((c: any) => c.textValue).join('|')}
			</output>
		</div>
	);
}

// --- showSelectionCheckboxes structure ---

export function CheckboxTableHarness() {
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
		selectionMode: 'multiple',
		showSelectionCheckboxes: true,
	});
	const firstRowCells = [...state.collection.getChildren('r1')];
	return (
		<div>
			<output data-testid="colcount">{'cc:' + state.collection.columnCount}</output>
			<output data-testid="checkboxcol">
				{'cb:' +
					String(!!state.collection.columns[0].props?.isSelectionCell) +
					':' +
					String(state.collection.columns.length)}
			</output>
			<output data-testid="showcb">{'show:' + String(state.showSelectionCheckboxes)}</output>
			<output data-testid="rowcells">
				{'rc:' +
					firstRowCells
						.map((c: any) => (c.props?.isSelectionCell ? 'selcell' : c.textValue))
						.join('|')}
			</output>
			<output data-testid="rowheaders">
				{'rh:' + [...state.collection.rowHeaderColumnKeys].join(',')}
			</output>
		</div>
	);
}

// --- useTableColumnResizeState (pure math against an explicit tableWidth) ---

const resizeHeader = (
	<TableHeader
		key="head"
		children={
			[
				<Column key="name" defaultWidth={100} isRowHeader>
					Name
				</Column>,
				<Column key="size" width={120}>
					Size
				</Column>,
				<Column key="type">Type</Column>,
			] as any
		}
	/>
);

const resizeBody = (
	<TableBody
		key="body"
		children={
			[
				<Row
					key="r1"
					children={[<Cell>Games</Cell>, <Cell>4 KB</Cell>, <Cell>File folder</Cell>] as any}
				/>,
			] as any
		}
	/>
);

// Hoisted so the children identity is stable across renders: the resize hook's
// render-phase "columns changed" adjustment re-runs the component, and a fresh
// children array each pass would rebuild the collection forever.
const resizeChildren = [resizeHeader, resizeBody];

export function ResizeHarness() {
	const [returned, setReturned] = useState('none');
	const state = useTableState({ children: resizeChildren as any });
	const resizeState = useTableColumnResizeState({ tableWidth: 500 }, state);
	return (
		<div>
			<button
				data-testid="resize-name-150"
				onClick={() =>
					setReturned(
						[...resizeState.updateResizedColumns('name', 150)]
							.map(([k, v]) => String(k) + ':' + String(v))
							.join(','),
					)
				}
			>
				{'resize 150'}
			</button>
			<button
				data-testid="resize-name-10"
				onClick={() => resizeState.updateResizedColumns('name', 10)}
			>
				{'resize 10'}
			</button>
			<button data-testid="start" onClick={() => resizeState.startResize('name')}>
				{'start'}
			</button>
			<button data-testid="end" onClick={() => resizeState.endResize()}>
				{'end'}
			</button>
			<output data-testid="widths">
				{'w:' +
					[...resizeState.columnWidths].map(([k, v]) => String(k) + ':' + String(v)).join(',')}
			</output>
			<output data-testid="getwidth">
				{'gw:' +
					resizeState.getColumnWidth('name') +
					':' +
					resizeState.getColumnWidth('size') +
					':' +
					resizeState.getColumnWidth('type')}
			</output>
			<output data-testid="minmax">
				{'mm:' +
					resizeState.getColumnMinWidth('name') +
					':' +
					String(resizeState.getColumnMaxWidth('name') === Number.MAX_SAFE_INTEGER)}
			</output>
			<output data-testid="resizing">{'rz:' + String(resizeState.resizingColumn)}</output>
			<output data-testid="returned">{'ret:' + returned}</output>
		</div>
	);
}

// --- UNSTABLE_useTreeGridState (expandable nested rows) ---

const treeColumnDefs = [
	{ id: 'name', name: 'Name', isRowHeader: true },
	{ id: 'type', name: 'Type', isRowHeader: false },
];

const treeRowDefs = [
	{
		id: 'r1',
		name: 'Row 1',
		type: 'folder',
		childRows: [{ id: 'r1c1', name: 'Child 1', type: 'file' }],
	},
	{ id: 'r2', name: 'Row 2', type: 'file' },
];

function treeChildren() {
	return [
		<TableHeader
			key="head"
			columns={treeColumnDefs}
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
			items={treeRowDefs}
			children={
				((item: any) => (
					<Row
						key={item.id}
						UNSTABLE_childItems={item.childRows}
						children={((colKey: any) => <Cell>{String(item[colKey])}</Cell>) as any}
					/>
				)) as any
			}
		/>,
	];
}

export function TreeGridHarness() {
	const [log, setLog] = useState('none');
	const state = UNSTABLE_useTreeGridState({
		children: treeChildren() as any,
		UNSTABLE_onExpandedChange: (keys: Set<any>) => setLog([...keys].join(',') || 'empty'),
	});
	return (
		<div>
			<button data-testid="toggle-r1" onClick={() => state.toggleKey('r1')}>
				{'toggle r1'}
			</button>
			<output data-testid="expanded">
				{'e:' +
					(state.expandedKeys === 'all' ? 'all' : [...state.expandedKeys].join(',') || 'empty')}
			</output>
			<output data-testid="size">{'size:' + state.collection.size}</output>
			<output data-testid="rows">
				{'rows:' + [...state.collection].map((r: any) => String(r.key)).join(',')}
			</output>
			<output data-testid="child">{'child:' + (state.keyMap.get('r1c1') ? 'yes' : 'no')}</output>
			<output data-testid="ucc">{'ucc:' + state.userColumnCount}</output>
			<output data-testid="treecol">{'tc:' + String(state.treeColumn)}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

export function TreeGridAllHarness() {
	const state = UNSTABLE_useTreeGridState({
		children: treeChildren() as any,
		UNSTABLE_defaultExpandedKeys: 'all',
	});
	return (
		<div>
			<button data-testid="toggle-r1" onClick={() => state.toggleKey('r1')}>
				{'toggle r1'}
			</button>
			<output data-testid="expanded">
				{'e:' +
					(state.expandedKeys === 'all' ? 'all' : [...state.expandedKeys].join(',') || 'empty')}
			</output>
			<output data-testid="size">{'size:' + state.collection.size}</output>
		</div>
	);
}

// --- useGridState over a plain GridCollection ---

function makeCell(rowKey: string, i: number) {
	return {
		type: 'cell',
		key: rowKey + 'c' + (i + 1),
		value: null,
		level: 1,
		rendered: rowKey + 'c' + (i + 1),
		textValue: rowKey + 'c' + (i + 1),
		index: i,
		hasChildNodes: false,
		childNodes: [],
	};
}

function makeRow(key: string, index: number) {
	return {
		type: 'item',
		key,
		value: null,
		level: 0,
		index,
		hasChildNodes: true,
		childNodes: [makeCell(key, 0), makeCell(key, 1)],
	};
}

const gridCollection = new GridCollection<any>({
	columnCount: 2,
	items: [makeRow('g1', 0), makeRow('g2', 1), makeRow('g3', 2)] as any,
});

export function GridHarness() {
	const state = useGridState({
		collection: gridCollection,
		selectionMode: 'multiple',
		disabledKeys: ['g2'],
		focusMode: 'cell',
	});
	return (
		<div>
			<button data-testid="select-g1" onClick={() => state.selectionManager.select('g1')}>
				{'g1'}
			</button>
			<button data-testid="select-g2" onClick={() => state.selectionManager.select('g2')}>
				{'g2'}
			</button>
			<button data-testid="focus-g1" onClick={() => state.selectionManager.setFocusedKey('g1')}>
				{'focus g1'}
			</button>
			<button
				data-testid="focus-g1-last"
				onClick={() => state.selectionManager.setFocusedKey('g1', 'last')}
			>
				{'focus g1 last'}
			</button>
			<output data-testid="keys">
				{'k:' +
					String(gridCollection.getFirstKey()) +
					':' +
					String(gridCollection.getKeyAfter('g1')) +
					':' +
					String(gridCollection.getKeyBefore('g3')) +
					':' +
					String(gridCollection.getLastKey())}
			</output>
			<output data-testid="colcount">{'cc:' + state.collection.columnCount}</output>
			<output data-testid="selected">
				{'s:' + ([...state.selectionManager.selectedKeys].sort().join(',') || 'empty')}
			</output>
			<output data-testid="disabled">{'d:' + [...state.disabledKeys].join(',')}</output>
			<output data-testid="focused">{'f:' + String(state.selectionManager.focusedKey)}</output>
			<output data-testid="kbdnav">{'kbd:' + String(state.isKeyboardNavigationDisabled)}</output>
		</div>
	);
}
