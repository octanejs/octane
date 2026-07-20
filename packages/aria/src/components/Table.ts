// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Table.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded
// ref is `props.ref` (Table passes it into `useContextProps` explicitly; the element-type
// helpers, Column, Row, Cell, ColumnResizer and the drop-indicator wrapper adapt theirs
// with `useObjectRef` exactly like upstream's forwarded refs); the plain-`.ts` components
// use the S()/subSlot component-slot convention. The collection composes the Phase-4
// engine: `CollectionBuilder`/`createLeafComponent`/`createBranchComponent` from
// `../collections/CollectionBuilder` and the renderer's `CollectionRoot`/`CollectionBranch`
// via `CollectionRendererContext`. The RAC-local `TableCollection` subclass of
// `BaseCollection` is ported faithfully (columns/headerRows bookkeeping, flattened rows,
// expanded-key traversal); `buildHeaderRows` and `ITableCollection` come from the ported
// stately table area. Upstream's RAC-local `CollectionProps` import is our
// `ItemCollectionProps` (see ./Collection.ts). Upstream's `inertValue` (React <19 string
// compat) collapses to the plain boolean — octane follows React 19 `inert` semantics.
// `ReactDOM.createPortal` → octane's `createPortal` as a child value. The dnd branches use
// the PHASE-7 structural aliases from ./useDragAndDrop and stay inert until a consumer can
// construct `dragAndDropHooks` (that includes the `TreeDropTargetDelegate` wiring, which is
// only reachable through `hasDropHooks`). react-aria's private `useLoadMoreSentinel` comes
// from ../utils/useLoadMoreSentinel and `useCachedChildren` from
// ../collections/useCachedChildren. `TableLayout` (Virtualizer) is deferred to PHASE-7:
// the layout plumbing (`layoutDelegate`, `isVirtualized`) stays typed loosely and inert.
// The Parcel glob intl import becomes a module-local dictionary reduced to the one key
// this module reads (`tableResizer`). Explicit dep arrays are preserved verbatim. The
// ColumnResizer's render-phase "mouse released" setState idiom is kept verbatim (octane
// matches React's render-phase-update semantics).
import type {
	AriaLabelingProps,
	DisabledBehavior,
	HoverEvents,
	Key,
	LinkDOMProps,
	Node,
	PressEvents,
	SelectionBehavior,
	SelectionMode,
	SortDirection,
} from '@react-types/shared';
import {
	Fragment,
	createContext,
	createElement,
	createPortal,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import {
	BaseCollection,
	CollectionNode,
	FilterableNode,
	LoaderNode,
	type Mutable,
} from '../collections/BaseCollection';
import {
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../collections/CollectionBuilder';
import { useCachedChildren } from '../collections/useCachedChildren';
import { FocusScope } from '../focus/FocusScope';
import { useFocusRing } from '../focus/useFocusRing';
import { useLocale } from '../i18n/I18nProvider';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import type { GridNode } from '../stately/grid/GridCollection';
import type { ColumnSize, ColumnStaticSize } from '../stately/table/Column';
import { buildHeaderRows, type ITableCollection } from '../stately/table/TableCollection';
import type { MultipleSelectionState } from '../stately/selection/types';
import { useMultipleSelectionState } from '../stately/selection/useMultipleSelectionState';
import {
	type TableProps as SharedTableProps,
	type TableState,
	UNSTABLE_useFilteredTableState,
	useTableState,
} from '../stately/table/useTableState';
import {
	type TableColumnResizeState,
	useTableColumnResizeState,
} from '../stately/table/useTableColumnResizeState';
import { useControlledState } from '../stately/utils/useControlledState';
import { useTable } from '../table/useTable';
import { useTableCell } from '../table/useTableCell';
import { useTableColumnHeader } from '../table/useTableColumnHeader';
import { useTableColumnResize } from '../table/useTableColumnResize';
import { useTableHeaderRow } from '../table/useTableHeaderRow';
import { useTableRow } from '../table/useTableRow';
import { useTableRowGroup } from '../table/useTableRowGroup';
import {
	useTableSelectAllCheckbox,
	useTableSelectionCheckbox,
} from '../table/useTableSelectionCheckbox';
import { filterDOMProps } from '../utils/filterDOMProps';
import { isScrollable } from '../utils/isScrollable';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { type LoadMoreSentinelProps, useLoadMoreSentinel } from '../utils/useLoadMoreSentinel';
import { useObjectRef } from '../utils/useObjectRef';
import { useResizeObserver } from '../utils/useResizeObserver';
import { useVisuallyHidden } from '../visually-hidden/VisuallyHidden';
import {
	FieldInputContext,
	SelectableCollectionContext,
	type SelectableCollectionContextValue,
} from './Autocomplete';
import { ButtonContext } from './Button';
import { CheckboxContext, CheckboxFieldContext } from './Checkbox';
import {
	Collection,
	CollectionRendererContext,
	DefaultCollectionRenderer,
	type ItemCollectionProps,
	type ItemRenderProps,
} from './Collection';
import {
	DragAndDropContext,
	DropIndicatorContext,
	type DropIndicatorProps,
	useDndPersistedKeys,
	useRenderDropIndicator,
} from './DragAndDrop';
import type {
	DragAndDropHooks,
	DraggableCollectionState,
	DraggableItemResult,
	DropIndicatorAria,
	DroppableCollectionResult,
	DroppableCollectionState,
} from './useDragAndDrop';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import { TreeDropTargetDelegate } from './TreeDropTargetDelegate';
import {
	type ClassNameOrFunction,
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	type DOMProps,
	type DOMRenderProps,
	Provider,
	type RenderProps,
	type SlotProps,
	type StyleProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };
type ReactNode = any;
type HTMLAttributes = Record<string, any>;
type DragPreviewRenderer = any;

// The react-aria-components package intl dictionary, reduced to the key this module
// reads. Strings are copied VERBATIM from .react-spectrum/packages/react-aria-components/
// intl/*.json; refresh from the pinned checkout on version bumps, never hand-edit.
const intlMessages = {
	'ar-AE': { tableResizer: 'أداة تغيير الحجم' },
	'bg-BG': { tableResizer: 'Преоразмерител' },
	'cs-CZ': { tableResizer: 'Změna velikosti' },
	'da-DK': { tableResizer: 'Størrelsesændring' },
	'de-DE': { tableResizer: 'Größenanpassung' },
	'el-GR': { tableResizer: 'Αλλαγή μεγέθους' },
	'en-US': { tableResizer: 'Resizer' },
	'es-ES': { tableResizer: 'Cambiador de tamaño' },
	'et-EE': { tableResizer: 'Suuruse muutja' },
	'fi-FI': { tableResizer: 'Koon muuttaja' },
	'fr-FR': { tableResizer: 'Redimensionneur' },
	'he-IL': { tableResizer: 'שינוי גודל' },
	'hr-HR': { tableResizer: 'Promjena veličine' },
	'hu-HU': { tableResizer: 'Átméretező' },
	'it-IT': { tableResizer: 'Ridimensionamento' },
	'ja-JP': { tableResizer: 'サイズ変更ツール' },
	'ko-KR': { tableResizer: '크기 조정기' },
	'lt-LT': { tableResizer: 'Dydžio keitiklis' },
	'lv-LV': { tableResizer: 'Izmēra mainītājs' },
	'nb-NO': { tableResizer: 'Størrelsesendrer' },
	'nl-NL': { tableResizer: 'Resizer' },
	'pl-PL': { tableResizer: 'Zmiana rozmiaru' },
	'pt-BR': { tableResizer: 'Redimensionador' },
	'pt-PT': { tableResizer: 'Redimensionador' },
	'ro-RO': { tableResizer: 'Instrument de redimensionare' },
	'ru-RU': { tableResizer: 'Средство изменения размера' },
	'sk-SK': { tableResizer: 'Nástroj na zmenu veľkosti' },
	'sl-SI': { tableResizer: 'Spreminjanje velikosti' },
	'sr-SP': { tableResizer: 'Promena veličine' },
	'sv-SE': { tableResizer: 'Storleksändrare' },
	'tr-TR': { tableResizer: 'Yeniden boyutlandırıcı' },
	'uk-UA': { tableResizer: 'Засіб змінення розміру' },
	'zh-CN': { tableResizer: '尺寸调整器' },
	'zh-TW': { tableResizer: '大小調整器' },
};

class TableCollection<T> extends BaseCollection<T> implements ITableCollection<T> {
	headerRows: GridNode<T>[] = [];
	columns: GridNode<T>[] = [];
	rows: GridNode<T>[] = [];
	rowHeaderColumnKeys: Set<Key> = new Set();
	head: CollectionNode<T> = new TableHeaderNode<T>(-1);
	columnsDirty = true;
	private expandedKeys: Set<Key> = new Set();

	withExpandedKeys(expandedKeys: Set<Key>): TableCollection<T> {
		let collection = this.clone();
		collection.expandedKeys = expandedKeys;
		collection.frozen = this.frozen;
		collection.rows = Array.from(collection.getRows());
		return collection;
	}

	addNode(node: CollectionNode<T>): void {
		super.addNode(node);

		this.columnsDirty ||= node.type === 'column';
		if (node.type === 'tableheader') {
			this.head = node;
		}
	}

	private getRows(): GridNode<T>[] {
		let rows: GridNode<T>[] = [];
		for (let child of this) {
			if (child.type === 'tablebody' || child.type === 'tablefooter') {
				rows.push(...(this.getChildren(child.key) as Iterable<GridNode<T>>));
			}
		}
		return rows;
	}

	// backward compatibility
	get body(): GridNode<T> {
		for (let child of this) {
			if (child.type === 'tablebody') {
				return child as GridNode<T>;
			}
		}
		return new TableBodyNode<T>(-2) as GridNode<T>;
	}

	commit(firstKey: Key | null, lastKey: Key | null, isSSR = false): void {
		this.updateColumns(isSSR);

		this.firstKey = firstKey;
		this.lastKey = lastKey;
		this.rows = [];
		for (let row of this.getRows()) {
			let lastChildKey = (row as CollectionNode<T>).lastChildKey;
			if (lastChildKey != null) {
				let lastCell = this.getItem(lastChildKey) as GridNode<T> | null;
				while (lastCell && lastCell.type !== 'cell') {
					lastCell =
						lastCell.prevKey != null
							? (this.getItem(lastCell.prevKey) as GridNode<T> | null)
							: null;
				}
				if (lastCell) {
					let numberOfCellsInRow = (lastCell.colIndex ?? lastCell.index) + (lastCell.colSpan ?? 1);
					if (numberOfCellsInRow !== this.columns.length && !isSSR) {
						throw new Error(
							`Cell count must match column count. Found ${numberOfCellsInRow} cells and ${this.columns.length} columns.`,
						);
					}
				}
			}
			this.rows.push(row);
		}

		super.commit(firstKey, lastKey, isSSR);
	}

	private updateColumns(isSSR: boolean): void {
		if (!this.columnsDirty) {
			return;
		}

		this.rowHeaderColumnKeys = new Set();
		this.columns = [];
		let columnKeyMap = new Map();
		let visit = (node: Node<T>) => {
			switch (node.type) {
				case 'column':
					columnKeyMap.set(node.key, node);
					if (!node.hasChildNodes) {
						(node as Mutable<Node<T>>).index = this.columns.length;
						this.columns.push(node as GridNode<T>);

						if (node.props.isRowHeader) {
							this.rowHeaderColumnKeys.add(node.key);
						}
					}
					break;
			}
			for (let child of this.getChildren(node.key)) {
				visit(child);
			}
		};

		for (let node of this.getChildren(this.head.key)) {
			visit(node);
		}

		this.headerRows = buildHeaderRows(columnKeyMap, this.columns);
		this.columnsDirty = false;
		if (this.rowHeaderColumnKeys.size === 0 && this.columns.length > 0 && !isSSR) {
			throw new Error(
				'A table must have at least one Column with the isRowHeader prop set to true',
			);
		}
	}

	get columnCount(): number {
		return this.columns.length;
	}

	*[Symbol.iterator](): IterableIterator<Node<T>> {
		let key = this.firstKey;
		while (key != null) {
			let node = this.getItem(key);
			if (node) {
				yield node;
			}
			key = node?.nextKey ?? null;
		}
	}

	getFirstKey(): Key | null {
		for (let child of this) {
			if (child.type === 'tablebody') {
				return (child as CollectionNode<T>).firstChildKey ?? null;
			}
		}
		return null;
	}

	getLastKey(): Key | null {
		let key = this.lastKey;
		if (key == null) {
			return null;
		}

		let node = this.getItem(key) as CollectionNode<T>;

		while (
			node?.lastChildKey != null &&
			(node.type !== 'item' || this.expandedKeys.has(node.key))
		) {
			node = this.getItem(node.lastChildKey) as CollectionNode<T>;
		}

		return node?.key;
	}

	getKeyAfter(key: Key): Key | null {
		let node = this.getItem(key) as CollectionNode<T>;
		if (node?.type === 'column') {
			return node.nextKey ?? null;
		}

		if (!node) {
			return null;
		}

		// If this is an expanded item, return the first child item if any.
		if (node.type === 'item' && node.firstChildKey != null && this.expandedKeys.has(node.key)) {
			let child = this.getItem(node.firstChildKey) as CollectionNode<T> | null;
			while (child) {
				if (child.type === 'item') {
					return child.key;
				}

				child = child.nextKey != null ? (this.getItem(child.nextKey) as CollectionNode<T>) : null;
			}
		}

		return super.getKeyAfter(key);
	}

	getKeyBefore(key: Key): Key | null {
		let node = this.getItem(key) as CollectionNode<T>;
		if (node?.type === 'column') {
			return node.prevKey ?? null;
		}

		if (!node) {
			return null;
		}

		let k: Key | null = null;
		if (node.prevKey != null) {
			node = this.getItem(node.prevKey) as CollectionNode<T>;

			// Traverse to the deepest expanded child.
			while (
				node &&
				(node.type !== 'item' || this.expandedKeys.has(node.key)) &&
				node.lastChildKey != null
			) {
				node = this.getItem(node.lastChildKey) as CollectionNode<T>;
			}

			k = node?.key ?? null;
		}

		if (k == null) {
			k = node.parentKey;
		}

		if (k != null && this.getItem(k)?.type === 'tableheader') {
			return null;
		}

		return k;
	}

	getChildren(key: Key): Iterable<Node<T>> {
		let item = this.getItem(key);
		if (!item) {
			for (let row of this.headerRows) {
				if (row.key === key) {
					return row.childNodes;
				}
			}
		}

		// Flatten all rows into the body.
		let self = this;
		if (item?.type === 'tablebody' || item?.type === 'tablefooter') {
			return {
				*[Symbol.iterator]() {
					let firstKey = (item as CollectionNode<T>).firstChildKey;
					let node: Node<T> | null = firstKey != null ? self.getItem(firstKey) : null;

					while (node) {
						yield node as Node<T>;
						let key = self.getKeyAfter(node.key);
						node = key != null ? self.getItem(key) : null;
						if (node && node.parentKey === item.parentKey) {
							break;
						}
					}
				},
			};
		}

		return {
			*[Symbol.iterator]() {
				let parent = self.getItem(key) as CollectionNode<T> | null;
				let node =
					parent?.firstChildKey != null
						? (self.getItem(parent.firstChildKey) as CollectionNode<T> | null)
						: null;
				while (node) {
					yield node as Node<T>;
					node =
						node.nextKey != null ? (self.getItem(node.nextKey) as CollectionNode<T> | null) : null;

					// Return only cells as children of rows (nested rows are flattened into the body).
					if (parent?.type === 'item' && node?.type !== 'cell') {
						break;
					}
				}
			},
		};
	}

	clone(): this {
		let collection = super.clone();
		collection.headerRows = this.headerRows;
		collection.columns = this.columns;
		collection.rows = this.rows;
		collection.rowHeaderColumnKeys = this.rowHeaderColumnKeys;
		collection.head = this.head;
		return collection;
	}

	getTextValue(key: Key): string {
		let row = this.getItem(key);
		if (!row) {
			return '';
		}

		// If the row has a textValue, use that.
		if (row.textValue) {
			return row.textValue;
		}

		// Otherwise combine the text of each of the row header columns.
		let rowHeaderColumnKeys = this.rowHeaderColumnKeys;
		let text: string[] = [];
		for (let cell of this.getChildren(key)) {
			let column = this.columns[cell.index!];
			if (rowHeaderColumnKeys.has(column.key) && cell.textValue) {
				text.push(cell.textValue);
			}

			if (text.length === rowHeaderColumnKeys.size) {
				break;
			}
		}

		return text.join(' ');
	}
}

interface ResizableTableContainerContextValue {
	tableWidth: number;
	tableRef: RefObject<HTMLTableElement | null>;
	scrollRef: RefObject<HTMLElement | null>;
	// Dependency inject useTableColumnResizeState so it doesn't affect bundle size unless you're using ResizableTableContainer.
	useTableColumnResizeState: typeof useTableColumnResizeState;
	onResizeStart?: (widths: Map<Key, ColumnSize>) => void;
	onResize?: (widths: Map<Key, ColumnSize>) => void;
	onResizeEnd?: (widths: Map<Key, ColumnSize>) => void;
}

const ResizableTableContainerContext = createContext<ResizableTableContainerContextValue | null>(
	null,
);

export interface ResizableTableContainerProps
	extends DOMProps, DOMRenderProps<'div', undefined>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-ResizableTableContainer'
	 */
	className?: string;
	/**
	 * Handler that is called when a user starts a column resize.
	 */
	onResizeStart?: (widths: Map<Key, ColumnSize>) => void;
	/**
	 * Handler that is called when a user performs a column resize.
	 * Can be used with the width property on columns to put the column widths into
	 * a controlled state.
	 */
	onResize?: (widths: Map<Key, ColumnSize>) => void;
	/**
	 * Handler that is called after a user performs a column resize.
	 * Can be used to store the widths of columns for another future session.
	 */
	onResizeEnd?: (widths: Map<Key, ColumnSize>) => void;
}

export function ResizableTableContainer(props: ResizableTableContainerProps & { ref?: any }): any {
	const slot = S('ResizableTableContainer');
	let containerRef = useObjectRef<HTMLDivElement>((props as any).ref, subSlot(slot, 'container'));
	let tableRef = useRef<HTMLTableElement | null>(null, subSlot(slot, 'table'));
	let scrollRef = useRef<HTMLElement | null>(null, subSlot(slot, 'scroll'));
	let [width, setWidth] = useState(0, subSlot(slot, 'width'));

	useLayoutEffect(
		() => {
			// Walk up the DOM from the Table to the ResizableTableContainer and stop
			// when we reach the first scrollable element. This is what we'll measure
			// to determine column widths (important due to width of scrollbars).
			// This will usually be the ResizableTableContainer for native tables, and
			// the Table itself for virtualized tables.
			let table = tableRef.current as HTMLElement | null;
			while (table && table !== containerRef.current && !isScrollable(table)) {
				table = table.parentElement;
			}
			scrollRef.current = table;
		},
		[containerRef],
		subSlot(slot, 'scrollWalk'),
	);

	useResizeObserver(
		{
			ref: scrollRef,
			box: 'border-box',
			onResize() {
				setWidth(scrollRef.current?.clientWidth ?? 0);
			},
		},
		subSlot(slot, 'resizeObserver'),
	);

	useLayoutEffect(
		() => {
			setWidth(scrollRef.current?.clientWidth ?? 0);
		},
		[],
		subSlot(slot, 'initialWidth'),
	);

	let ctx = useMemo(
		() => ({
			tableRef,
			scrollRef,
			tableWidth: width,
			useTableColumnResizeState,
			onResizeStart: props.onResizeStart,
			onResize: props.onResize,
			onResizeEnd: props.onResizeEnd,
		}),
		[tableRef, width, props.onResizeStart, props.onResize, props.onResizeEnd],
		subSlot(slot, 'ctx'),
	);

	return createElement(dom.div, {
		render: props.render,
		...filterDOMProps(props, { global: true }),
		ref: containerRef,
		className: props.className || 'react-aria-ResizableTableContainer',
		style: props.style,
		onScroll: (props as any).onScroll,
		children: createElement(ResizableTableContainerContext.Provider, {
			value: ctx,
			children: props.children,
		}),
	});
}

export const TableContext =
	createContext<ContextValue<TableProps, HTMLTableElement | HTMLDivElement>>(null);
export const TableStateContext = createContext<TableState<any> | null>(null);
export const TableColumnResizeStateContext = createContext<TableColumnResizeState<unknown> | null>(
	null,
);

export interface TableRenderProps {
	/**
	 * Whether the table is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the table is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the table is currently the active drop target.
	 *
	 * @selector [data-drop-target]
	 */
	isDropTarget: boolean;
	/**
	 * State of the table.
	 */
	state: TableState<unknown>;
}

export interface TableProps
	extends
		Omit<SharedTableProps<any>, 'children'>,
		StyleRenderProps<TableRenderProps, 'table' | 'div'>,
		SlotProps,
		AriaLabelingProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Table'
	 */
	className?: ClassNameOrFunction<TableRenderProps>;
	/** The elements that make up the table. Includes the TableHeader, TableBody, Columns, and Rows. */
	children?: ReactNode;
	/**
	 * How multiple selection should behave in the collection.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/**
	 * Whether `disabledKeys` applies to all interactions, or only selection.
	 *
	 * @default 'all'
	 */
	disabledBehavior?: DisabledBehavior;
	/** Handler that is called when a user performs an action on the row. */
	onRowAction?: (key: Key) => void;
	/**
	 * The drag and drop hooks returned by `useDragAndDrop` used to enable drag and drop behavior for
	 * the Table.
	 */
	dragAndDropHooks?: DragAndDropHooks;
}

/**
 * A table displays data in rows and columns and enables a user to navigate its contents via
 * directional navigation keys, and optionally supports row selection and sorting.
 */
export function Table(props: TableProps): any {
	const slot = S('Table');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, TableContext, subSlot(slot, 'ctx'));

	// Separate selection state so we have access to it from collection components via useTableOptions.
	let selectionState = useMultipleSelectionState(props, subSlot(slot, 'selection'));
	let { selectionBehavior, selectionMode, disallowEmptySelection } = selectionState;
	let hasDragHooks = !!props.dragAndDropHooks?.useDraggableCollectionState;
	let ctx = useMemo(
		() => ({
			selectionBehavior: selectionMode === 'none' ? null : selectionBehavior,
			selectionMode,
			disallowEmptySelection,
			allowsDragging: hasDragHooks,
		}),
		[selectionBehavior, selectionMode, disallowEmptySelection, hasDragHooks],
		subSlot(slot, 'options'),
	);

	let content = createElement(TableOptionsContext.Provider, {
		value: ctx,
		children: createElement(Collection, props as any),
	});

	return createElement(CollectionBuilder, {
		content,
		createCollection: () => new TableCollection<any>(),
		children: (collection: TableCollection<Node<object>>) =>
			createElement(TableInner, {
				props,
				forwardedRef: ref,
				selectionState,
				collection,
			}),
	} as any);
}

interface TableInnerProps {
	props: TableProps & SelectableCollectionContextValue<unknown>;
	forwardedRef: RefObject<HTMLElement | null>;
	selectionState: MultipleSelectionState;
	collection: TableCollection<Node<object>>;
}

function TableElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.table, props);
}

const EXPANSION_KEYS = {
	expand: {
		ltr: 'ArrowRight',
		rtl: 'ArrowLeft',
	},
	collapse: {
		ltr: 'ArrowLeft',
		rtl: 'ArrowRight',
	},
};

function TableInner({ props, forwardedRef, selectionState, collection }: TableInnerProps): any {
	const slot = S('TableInner');
	let ref: any = forwardedRef;
	[props, ref] = useContextProps(
		props,
		ref,
		SelectableCollectionContext,
		subSlot(slot, 'ctx'),
	) as any;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { shouldUseVirtualFocus, disallowTypeAhead, filter, ...DOMCollectionProps } = props;
	let tableContainerContext = useContext(ResizableTableContainerContext);
	ref = useObjectRef(
		useMemo(
			() => mergeRefs(ref, tableContainerContext?.tableRef as any),
			[ref, tableContainerContext?.tableRef],
			subSlot(slot, 'mergedRef'),
		),
		subSlot(slot, 'objectRef'),
	);
	let [expandedKeys, setExpandedKeys] = useControlledState(
		props.expandedKeys ? new Set(props.expandedKeys) : undefined,
		props.defaultExpandedKeys ? new Set(props.defaultExpandedKeys) : new Set(),
		props.onExpandedChange as any,
		subSlot(slot, 'expandedKeys'),
	);
	collection = useMemo(
		() => collection.withExpandedKeys(expandedKeys),
		[collection, expandedKeys],
		subSlot(slot, 'collection'),
	);

	let tableState = useTableState(
		{
			...DOMCollectionProps,
			collection,
			children: undefined,
			UNSAFE_selectionState: selectionState,
			expandedKeys,
			onExpandedChange: setExpandedKeys,
		} as any,
		subSlot(slot, 'state'),
	);

	let filteredState = UNSTABLE_useFilteredTableState(tableState, filter, subSlot(slot, 'filtered'));
	let {
		isVirtualized,
		layoutDelegate,
		dropTargetDelegate: ctxDropTargetDelegate,
		CollectionRoot,
	} = useContext(CollectionRendererContext);
	let { dragAndDropHooks } = props;
	let { gridProps } = useTable(
		{
			...DOMCollectionProps,
			layoutDelegate,
			isVirtualized,
		} as any,
		filteredState,
		ref,
		subSlot(slot, 'table'),
	);
	let selectionManager = filteredState.selectionManager;
	let hasDragHooks = !!dragAndDropHooks?.useDraggableCollectionState;
	let hasDropHooks = !!dragAndDropHooks?.useDroppableCollectionState;
	let dragHooksProvided = useRef(hasDragHooks, subSlot(slot, 'dragProvided'));
	let dropHooksProvided = useRef(hasDropHooks, subSlot(slot, 'dropProvided'));
	useEffect(
		() => {
			if (process.env.NODE_ENV === 'production') {
				return;
			}
			if (dragHooksProvided.current !== hasDragHooks) {
				console.warn(
					'Drag hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
			if (dropHooksProvided.current !== hasDropHooks) {
				console.warn(
					'Drop hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
		},
		[hasDragHooks, hasDropHooks],
		subSlot(slot, 'dndWarn'),
	);

	let dragState: DraggableCollectionState | undefined = undefined;
	let dropState: DroppableCollectionState | undefined = undefined;
	let droppableCollection: DroppableCollectionResult | undefined = undefined;
	let isRootDropTarget = false;
	let dragPreview: any = null;
	let preview = useRef<DragPreviewRenderer>(null, subSlot(slot, 'preview'));
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let [treeDropTargetDelegate] = useState(
		() => new TreeDropTargetDelegate(),
		subSlot(slot, 'dropDelegate'),
	);

	// PHASE-7: these branches call consumer-provided dnd hooks (upstream contract); they are
	// unreachable until `useDragAndDrop` is ported and a consumer can construct hooks.
	if (hasDragHooks && dragAndDropHooks) {
		dragState = dragAndDropHooks.useDraggableCollectionState!({
			collection: filteredState.collection,
			selectionManager,
			preview: dragAndDropHooks.renderDragPreview ? preview : undefined,
		});
		dragAndDropHooks.useDraggableCollection!({}, dragState, ref);

		let DragPreview = dragAndDropHooks.DragPreview!;
		dragPreview = dragAndDropHooks.renderDragPreview
			? createElement(DragPreview, { ref: preview, children: dragAndDropHooks.renderDragPreview })
			: null;
	}

	if (hasDropHooks && dragAndDropHooks) {
		dropState = dragAndDropHooks.useDroppableCollectionState!({
			collection: filteredState.collection,
			selectionManager,
		});

		let keyboardDelegate = new ListKeyboardDelegate({
			collection: filteredState.collection,
			disabledKeys: selectionManager.disabledKeys,
			disabledBehavior: selectionManager.disabledBehavior,
			ref,
			layoutDelegate,
		});
		let dropTargetDelegate =
			dragAndDropHooks.dropTargetDelegate ||
			ctxDropTargetDelegate ||
			new dragAndDropHooks.ListDropTargetDelegate(collection.rows, ref);
		treeDropTargetDelegate.setup(dropTargetDelegate, tableState as any, direction);
		droppableCollection = dragAndDropHooks.useDroppableCollection!(
			{
				keyboardDelegate,
				dropTargetDelegate: treeDropTargetDelegate,
				onDropActivate: (e: any) => {
					// Expand collapsed item when dragging over. For keyboard, allow collapsing.
					if (e.target.type === 'item') {
						let key = e.target.key;
						let item = tableState.collection.getItem(key);
						let isExpanded = expandedKeys.has(key);
						if (
							item &&
							item.hasChildNodes &&
							(!isExpanded || dragAndDropHooks?.isVirtualDragging?.())
						) {
							tableState.toggleKey(key);
						}
					}
				},
				onKeyDown: (e: KeyboardEvent) => {
					let target = dropState?.target;
					if (target && target.type === 'item' && target.dropPosition === 'on') {
						let item = tableState.collection.getItem(target.key);
						if (
							e.key === EXPANSION_KEYS['expand'][direction] &&
							item?.hasChildNodes &&
							!tableState.expandedKeys.has(target.key)
						) {
							tableState.toggleKey(target.key);
						} else if (
							e.key === EXPANSION_KEYS['collapse'][direction] &&
							item?.hasChildNodes &&
							tableState.expandedKeys.has(target.key)
						) {
							tableState.toggleKey(target.key);
						}
					}
				},
			},
			dropState,
			ref,
		);

		isRootDropTarget = dropState.isDropTarget({ type: 'root' });
	}

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-Table',
			values: {
				isDropTarget: isRootDropTarget,
				isFocused,
				isFocusVisible,
				state: filteredState,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	let isListDraggable = !!(hasDragHooks && !dragState?.isDisabled);

	let style = renderProps.style;
	let layoutState: TableColumnResizeState<unknown> | null = null;
	if (tableContainerContext) {
		layoutState = tableContainerContext.useTableColumnResizeState(
			{
				tableWidth: tableContainerContext.tableWidth,
			},
			filteredState,
			subSlot(slot, 'layoutState'),
		);
		if (!isVirtualized) {
			style = {
				...style,
				tableLayout: 'fixed',
				// due to https://bugzilla.mozilla.org/show_bug.cgi?id=1959353, we can't use "fit-content".
				// Causes the table columns to grow to fill the available space in Firefox, ignoring user set column widths
				width: 'min-content',
			};
		}
	}

	let DOMProps = filterDOMProps(props, { global: true });

	// octane adaptation: hooks hoisted out of the createElement argument list (upstream calls
	// them inline in JSX attribute position).
	let persistedKeys = useDndPersistedKeys(
		selectionManager,
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'persisted'),
	);

	return createElement(
		Provider,
		{
			values: [
				[TableStateContext, filteredState],
				[TableColumnResizeStateContext, layoutState],
				[DragAndDropContext, { dragAndDropHooks, dragState, dropState }],
				[DropIndicatorContext, { render: TableDropIndicatorWrapper }],
				[SelectableCollectionContext, null],
				[FieldInputContext, null],
			] as any,
		} as any,
		createElement(FocusScope, {
			children: createElement(TableElementType, {
				...mergeProps(
					DOMProps,
					renderProps,
					gridProps,
					focusProps,
					droppableCollection?.collectionProps,
				),
				style,
				ref,
				slot: props.slot || undefined,
				onScroll: (props as any).onScroll,
				'data-allows-dragging': isListDraggable || undefined,
				'data-drop-target': isRootDropTarget || undefined,
				'data-focused': isFocused || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				children: createElement(SharedElementTransition, {
					children: createElement(CollectionRoot, {
						collection: filteredState.collection,
						scrollRef: tableContainerContext?.scrollRef ?? ref,
						persistedKeys,
					}),
				}),
			}),
		}),
		dragPreview,
	);
}

export interface TableOptionsContextValue {
	/** The type of selection that is allowed in the table. */
	selectionMode: SelectionMode;
	/** The selection behavior for the table. If selectionMode is `"none"`, this will be `null`. */
	selectionBehavior: SelectionBehavior | null;
	/** Whether the table allows empty selection. */
	disallowEmptySelection: boolean;
	/** Whether the table allows rows to be dragged. */
	allowsDragging: boolean;
}

const TableOptionsContext = createContext<TableOptionsContextValue | null>(null);

/**
 * Returns options from the parent `<Table>` component.
 */
export function useTableOptions(): TableOptionsContextValue {
	return useContext(TableOptionsContext)!;
}

export interface TableHeaderRenderProps {
	/**
	 * Whether the table header is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
}

export interface TableHeaderProps<T>
	extends
		StyleRenderProps<TableHeaderRenderProps, 'thead' | 'div'>,
		HoverEvents,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TableHeader'
	 */
	className?: ClassNameOrFunction<TableHeaderRenderProps>;
	/** A list of table columns. */
	columns?: Iterable<T>;
	/**
	 * A list of `Column(s)` or a function. If the latter, a list of columns must be provided using
	 * the `columns` prop.
	 */
	children?: ReactNode | ((item: T) => any);
	/** Values that should invalidate the column cache when using dynamic collections. */
	dependencies?: ReadonlyArray<any>;
}

class TableHeaderNode<T> extends CollectionNode<T> {
	static readonly type = 'tableheader';
}

function THeadElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.thead, props);
}

/**
 * A header within a `<Table>`, containing the table columns.
 */
export const TableHeader: <T extends object = object>(
	props: TableHeaderProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(
	TableHeaderNode,
	function TableHeader<T>(props: TableHeaderProps<T>, ref: any): any {
		const slot = S('TableHeader');
		let collection = useContext(TableStateContext)!.collection as TableCollection<unknown>;
		let headerRows = useCachedChildren(
			{
				items: collection.headerRows,
				children: useCallback(
					(item: Node<unknown>) => {
						switch (item.type) {
							case 'headerrow':
								return createElement(TableHeaderRow, { item });
							default:
								throw new Error('Unsupported node type in TableHeader: ' + item.type);
						}
					},
					[],
					subSlot(slot, 'headerRowFn'),
				),
			},
			subSlot(slot, 'headerRows'),
		);

		let { rowGroupProps } = useTableRowGroup(subSlot(slot, 'rowGroup'));
		let { hoverProps, isHovered } = useHover(
			{
				onHoverStart: props.onHoverStart,
				onHoverChange: props.onHoverChange,
				onHoverEnd: props.onHoverEnd,
			},
			subSlot(slot, 'hover'),
		);

		let renderProps = useRenderProps(
			{
				...props,
				children: undefined,
				defaultClassName: 'react-aria-TableHeader',
				values: {
					isHovered,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		return createElement(THeadElementType, {
			...mergeProps(filterDOMProps(props, { global: true }), rowGroupProps, hoverProps),
			...renderProps,
			ref,
			'data-hovered': isHovered || undefined,
			children: headerRows,
		});
	},
	(props) =>
		createElement(Collection, {
			dependencies: props.dependencies,
			items: props.columns,
			children: props.children,
		}),
);

function TableHeaderRowElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement('div', props);
	}
	return createElement('tr', props);
}

function TableHeaderRow({ item }: { item: GridNode<any> }): any {
	const slot = S('TableHeaderRow');
	let ref = useRef<HTMLTableRowElement | null>(null, subSlot(slot, 'ref'));
	let state = useContext(TableStateContext)!;
	let { isVirtualized, CollectionBranch } = useContext(CollectionRendererContext);
	let { rowProps } = useTableHeaderRow(
		{ node: item, isVirtualized },
		state,
		ref,
		subSlot(slot, 'headerRow'),
	);
	let { checkboxProps } = useTableSelectAllCheckbox(state, subSlot(slot, 'selectAll'));

	return createElement(TableHeaderRowElementType, {
		...rowProps,
		ref,
		children: createElement(Provider, {
			values: [
				[
					CheckboxContext,
					{
						slots: {
							selection: checkboxProps,
						},
					},
				],
				[
					CheckboxFieldContext,
					{
						slots: {
							selection: checkboxProps,
						},
					},
				],
			] as any,
			children: createElement(CollectionBranch, {
				collection: state.collection,
				parent: item,
			}),
		}),
	});
}

export interface ColumnRenderProps {
	/**
	 * Whether the column is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the column is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the column is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the column is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the column allows sorting.
	 *
	 * @selector [data-allows-sorting]
	 */
	allowsSorting: boolean;
	/**
	 * The current sort direction.
	 *
	 * @selector [data-sort-direction="ascending | descending"]
	 */
	sortDirection: SortDirection | undefined;
	/**
	 * Whether the column is currently being resized.
	 *
	 * @selector [data-resizing]
	 */
	isResizing: boolean;
	/**
	 * Triggers sorting for this column in the given direction.
	 */
	sort(direction: SortDirection): void;
	/**
	 * Starts column resizing if the table is contained in a `<ResizableTableContainer>` element.
	 */
	startResize(): void;
}

export interface ColumnProps
	extends RenderProps<ColumnRenderProps, 'th' | 'div'>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Column'
	 */
	className?: ClassNameOrFunction<ColumnRenderProps>;
	/** The unique id of the column. */
	id?: Key;
	/** Whether the column allows sorting. */
	allowsSorting?: boolean;
	/**
	 * Whether a column is a [row header](https://www.w3.org/TR/wai-aria-1.1/#rowheader) and should be
	 * announced by assistive technology during row navigation.
	 */
	isRowHeader?: boolean;
	/** A string representation of the column's contents, used for accessibility announcements. */
	textValue?: string;
	/**
	 * The width of the column. This prop only applies when the `<Table>` is wrapped in a
	 * `<ResizableTableContainer>`.
	 */
	width?: ColumnSize | null;
	/**
	 * The default width of the column. This prop only applies when the `<Table>` is wrapped in a
	 * `<ResizableTableContainer>`.
	 */
	defaultWidth?: ColumnSize | null;
	/**
	 * The minimum width of the column. This prop only applies when the `<Table>` is wrapped in a
	 * `<ResizableTableContainer>`.
	 */
	minWidth?: ColumnStaticSize | null;
	/**
	 * The maximum width of the column. This prop only applies when the `<Table>` is wrapped in a
	 * `<ResizableTableContainer>`.
	 */
	maxWidth?: ColumnStaticSize | null;
}

class TableColumnNode extends CollectionNode<unknown> {
	static readonly type = 'column';
}

function ColumnElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.th, props);
}

/**
 * A column within a `<Table>`.
 */
export const Column: (props: ColumnProps & { ref?: any }) => any =
	/*#__PURE__*/ createLeafComponent(
		TableColumnNode,
		function Column(props: ColumnProps, forwardedRef: any, column?: Node<unknown>): any {
			const slot = S('Column');
			let ref = useObjectRef<HTMLTableCellElement | HTMLDivElement>(
				forwardedRef,
				subSlot(slot, 'objectRef'),
			);
			let state = useContext(TableStateContext)!;
			let { isVirtualized } = useContext(CollectionRendererContext);
			let { columnHeaderProps, isPressed } = useTableColumnHeader(
				{ node: column as GridNode<unknown>, isVirtualized },
				state,
				ref,
				subSlot(slot, 'columnHeader'),
			);
			let { isFocused, isFocusVisible, focusProps } = useFocusRing(
				undefined,
				subSlot(slot, 'focusRing'),
			);

			let layoutState = useContext(TableColumnResizeStateContext);
			let isResizing = false;
			if (layoutState) {
				isResizing = layoutState.resizingColumn === column!.key;
			} else if (process.env.NODE_ENV !== 'production') {
				for (let prop in ['width', 'defaultWidth', 'minWidth', 'maxWidth']) {
					if (prop in column!.props) {
						console.warn(
							`The ${prop} prop on a <Column> only applies when a <Table> is wrapped in a <ResizableTableContainer>. If you aren't using column resizing, you can set the width of a column with CSS.`,
						);
					}
				}
			}

			let { hoverProps, isHovered } = useHover(
				{ isDisabled: !props.allowsSorting },
				subSlot(slot, 'hover'),
			);
			let renderProps = useRenderProps(
				{
					...props,
					id: undefined,
					children: column!.rendered,
					defaultClassName: 'react-aria-Column',
					values: {
						isHovered,
						isPressed,
						isFocused,
						isFocusVisible,
						allowsSorting: column!.props.allowsSorting,
						sortDirection:
							state.sortDescriptor?.column === column!.key
								? state.sortDescriptor.direction
								: undefined,
						isResizing,
						startResize: () => {
							if (layoutState) {
								layoutState.startResize(column!.key);
								state.setKeyboardNavigationDisabled(true);
							} else {
								throw new Error(
									'Wrap your <Table> in a <ResizableTableContainer> to enable column resizing',
								);
							}
						},
						sort: (direction: SortDirection) => {
							state.sort(column!.key, direction);
						},
					},
				} as any,
				subSlot(slot, 'render'),
			);

			let style = renderProps.style;
			if (layoutState) {
				style = { ...style, width: layoutState.getColumnWidth(column!.key) };
			}

			let DOMProps = filterDOMProps(props as any, { global: true });
			delete DOMProps.id;

			return createElement(ColumnElementType, {
				...mergeProps(DOMProps, columnHeaderProps, focusProps, hoverProps),
				...renderProps,
				style,
				ref,
				'data-hovered': isHovered || undefined,
				'data-pressed': isPressed || undefined,
				'data-focused': isFocused || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				'data-resizing': isResizing || undefined,
				'data-allows-sorting': column!.props.allowsSorting || undefined,
				'data-sort-direction':
					state.sortDescriptor?.column === column!.key ? state.sortDescriptor.direction : undefined,
				children: createElement(Provider, {
					values: [
						[ColumnResizerContext, { column: column as GridNode<unknown>, triggerRef: ref }],
						[CollectionRendererContext, DefaultCollectionRenderer],
					] as any,
					children: renderProps.children,
				}),
			});
		},
	);

export interface ColumnResizerRenderProps {
	/**
	 * Whether the resizer is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the resizer is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the resizer is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the resizer is currently being resized.
	 *
	 * @selector [data-resizing]
	 */
	isResizing: boolean;
	/**
	 * The direction that the column is currently resizable.
	 *
	 * @selector [data-resizable-direction="right | left | both"]
	 */
	resizableDirection: 'right' | 'left' | 'both';
}

export interface ColumnResizerProps
	extends HoverEvents, RenderProps<ColumnResizerRenderProps>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ColumnResizer'
	 */
	className?: ClassNameOrFunction<ColumnResizerRenderProps>;
	/** A custom accessibility label for the resizer. */
	'aria-label'?: string;
}

interface ColumnResizerContextValue {
	column: GridNode<unknown>;
	triggerRef: RefObject<HTMLDivElement | null>;
}

const ColumnResizerContext = createContext<ColumnResizerContextValue | null>(null);

export function ColumnResizer(props: ColumnResizerProps & { ref?: any }): any {
	const slot = S('ColumnResizer');
	let layoutState = useContext(TableColumnResizeStateContext);
	if (!layoutState) {
		throw new Error('Wrap your <Table> in a <ResizableTableContainer> to enable column resizing');
	}
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'react-aria-components',
		subSlot(slot, 'strings'),
	);

	let { onResizeStart, onResize, onResizeEnd } = useContext(ResizableTableContainerContext)!;
	let { column, triggerRef } = useContext(ColumnResizerContext)!;
	let inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'input'));
	let { resizerProps, inputProps, isResizing } = useTableColumnResize(
		{
			column,
			'aria-label': props['aria-label'] || stringFormatter.format('tableResizer'),
			onResizeStart,
			onResize,
			onResizeEnd,
			triggerRef,
		},
		layoutState,
		inputRef,
		subSlot(slot, 'resize'),
	);
	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let { hoverProps, isHovered } = useHover(props, subSlot(slot, 'hover'));

	let isEResizable =
		layoutState.getColumnMinWidth(column.key) >= layoutState.getColumnWidth(column.key);
	let isWResizable =
		layoutState.getColumnMaxWidth(column.key) <= layoutState.getColumnWidth(column.key);
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let resizableDirection: ColumnResizerRenderProps['resizableDirection'] = 'both';
	if (isEResizable) {
		resizableDirection = direction === 'rtl' ? 'right' : 'left';
	} else if (isWResizable) {
		resizableDirection = direction === 'rtl' ? 'left' : 'right';
	} else {
		resizableDirection = 'both';
	}

	let objectRef = useObjectRef<HTMLDivElement>((props as any).ref, subSlot(slot, 'objectRef'));
	let [cursor, setCursor] = useState('', subSlot(slot, 'cursor'));
	useEffect(
		() => {
			if (!objectRef.current) {
				return;
			}
			let style = window.getComputedStyle(objectRef.current);
			setCursor(style.cursor);
		},
		[objectRef, resizableDirection],
		subSlot(slot, 'cursorEffect'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-ColumnResizer',
			values: {
				isFocused,
				isFocusVisible,
				isResizing,
				isHovered,
				resizableDirection,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	let [isMouseDown, setMouseDown] = useState(false, subSlot(slot, 'mouseDown'));
	let onPointerDown = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') {
			setMouseDown(true);
		}
	};

	if (!isResizing && isMouseDown) {
		setMouseDown(false);
	}

	let DOMProps = filterDOMProps(props, { global: true });

	// Positional (non-array) children: the resizer content, the visually hidden input, and
	// the transient full-viewport cursor overlay (a portal while mouse-resizing).
	return createElement(
		dom.div,
		{
			ref: objectRef,
			role: 'presentation',
			...mergeProps(DOMProps, renderProps, resizerProps, { onPointerDown }, hoverProps),
			'data-hovered': isHovered || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-resizing': isResizing || undefined,
			'data-resizable-direction': resizableDirection,
		},
		renderProps.children,
		createElement('input', { ref: inputRef, ...mergeProps(inputProps, focusProps) }),
		isResizing && isMouseDown
			? createPortal(
					createElement('div', {
						style: { position: 'fixed', top: 0, left: 0, bottom: 0, right: 0, cursor },
					}),
					document.body,
				)
			: null,
	);
}

export interface TableBodyRenderProps {
	/**
	 * Whether the table body has no rows and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the Table is currently the active drop target.
	 *
	 * @selector [data-drop-target]
	 */
	isDropTarget: boolean;
}

export interface TableBodyProps<T>
	extends
		Omit<ItemCollectionProps<T>, 'disabledKeys'>,
		StyleRenderProps<TableBodyRenderProps, 'tbody' | 'div'>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TableBody'
	 */
	className?: ClassNameOrFunction<TableBodyRenderProps>;
	/** Provides content to display when there are no rows in the table. */
	renderEmptyState?: (props: TableBodyRenderProps) => ReactNode;
}

class TableBodyNode<T> extends FilterableNode<T> {
	static readonly type = 'tablebody';
}

function TableBodyElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.tbody, props);
}

/**
 * The body of a `<Table>`, containing the table rows.
 */
export const TableBody: <T extends object = object>(
	props: TableBodyProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(TableBodyNode, function TableBody<
	T,
>(props: TableBodyProps<T>, ref: any, node?: Node<T>): any {
	const slot = S('TableBody');
	let state = useContext(TableStateContext)!;
	let { isVirtualized } = useContext(CollectionRendererContext);
	let collection = state.collection;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);
	let isDroppable = !!dragAndDropHooks?.useDroppableCollectionState && !dropState?.isDisabled;
	let isRootDropTarget =
		isDroppable && !!dropState && (dropState.isDropTarget({ type: 'root' }) ?? false);

	let isEmpty = collection.size === 0;
	let renderValues = {
		isDropTarget: isRootDropTarget,
		isEmpty,
	};
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			children: undefined,
			defaultClassName: 'react-aria-TableBody',
			values: renderValues,
		} as any,
		subSlot(slot, 'render'),
	);

	let emptyState: any = null;
	let numColumns = (collection as ITableCollection<any>).columnCount;

	if (isEmpty && props.renderEmptyState && state) {
		let rowProps: Record<string, any> = {};
		let rowHeaderProps: Record<string, any> = {};
		let style: Record<string, any> = {};
		if (isVirtualized) {
			rowHeaderProps['aria-colspan'] = numColumns;
			style = { display: 'contents' };
		} else {
			rowHeaderProps['colSpan'] = numColumns;
		}

		emptyState = createElement(TableRowElementType, {
			role: 'row',
			...rowProps,
			style,
			children: createElement(TableCellElementType, {
				role: 'rowheader',
				...rowHeaderProps,
				style,
				children: props.renderEmptyState(renderValues),
			}),
		});
	}

	let { rowGroupProps } = useTableRowGroup(subSlot(slot, 'rowGroup'));

	let DOMProps = filterDOMProps(props, { global: true });

	// octane adaptation: hook hoisted out of the createElement argument list.
	let renderDropIndicator = useRenderDropIndicator(
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'dropIndicator'),
	);

	// TODO: TableBody doesn't support being the scrollable body of the table yet, to revisit if needed. Would need to
	// call useLoadMore here and walk up the DOM to the nearest scrollable element to set scrollRef
	return createElement(TableBodyElementType, {
		...mergeProps(DOMProps, renderProps, rowGroupProps),
		ref,
		'data-empty': isEmpty || undefined,
		// Positional (non-array) children, exactly like upstream's JSX.
		children: createElement(
			Fragment,
			null,
			isDroppable ? createElement(RootDropIndicator, {}) : null,
			createElement(CollectionBranch, {
				collection,
				parent: node!,
				renderDropIndicator,
			}),
			emptyState,
		),
	});
});

class TableFooterNode<T> extends FilterableNode<T> {
	static readonly type = 'tablefooter';
}

export interface TableFooterProps<T>
	extends Omit<ItemCollectionProps<T>, 'disabledKeys'>, StyleProps, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-TableFooter'
	 */
	className?: string;
}

function TableFooterElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.tfoot, props);
}

/**
 * The footer of a `<Table>`, containing table rows.
 */
export const TableFooter: <T extends object = object>(
	props: TableFooterProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(TableFooterNode, function TableFooter<
	T,
>(props: TableFooterProps<T>, ref: any, node?: Node<T>): any {
	const slot = S('TableFooter');
	let state = useContext(TableStateContext)!;
	let collection = state.collection as TableCollection<T>;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);

	let { rowGroupProps } = useTableRowGroup(subSlot(slot, 'rowGroup'));
	let DOMProps = filterDOMProps(props, { global: true });
	let renderProps = useRenderProps(
		{
			style: props.style,
			className: props.className,
			defaultClassName: 'react-aria-TableFooter',
			values: {},
		} as any,
		subSlot(slot, 'render'),
	);

	// octane adaptation: hook hoisted out of the createElement argument list.
	let renderDropIndicator = useRenderDropIndicator(
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'dropIndicator'),
	);

	return createElement(TableFooterElementType, {
		...mergeProps(DOMProps, renderProps, rowGroupProps),
		ref,
		children: createElement(CollectionBranch, {
			collection,
			parent: node!,
			renderDropIndicator,
		}),
	});
});

export interface RowRenderProps extends ItemRenderProps {
	/**
	 * Whether the row's children have keyboard focus.
	 *
	 * @selector [data-focus-visible-within]
	 */
	isFocusVisibleWithin: boolean;
	/** The unique id of the row. */
	id?: Key;
	/**
	 * Whether the row is expanded.
	 *
	 * @selector [data-expanded]
	 */
	isExpanded: boolean;
	/**
	 * Whether the row has child rows.
	 *
	 * @selector [data-has-child-items]
	 */
	hasChildItems: boolean;
	/**
	 * What level the row has within the table.
	 *
	 * @selector [data-level]
	 */
	level: number;
	/**
	 * State of the table.
	 */
	state: TableState<unknown>;
}

export interface RowFocusContextValue {
	isFocusVisibleWithinRow: boolean;
}

export const RowFocusContext = createContext<RowFocusContextValue>({
	isFocusVisibleWithinRow: false,
});

export interface RowProps<T>
	extends
		StyleRenderProps<RowRenderProps, 'tr' | 'div'>,
		LinkDOMProps,
		HoverEvents,
		PressEvents,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Row'
	 */
	className?: ClassNameOrFunction<RowRenderProps>;
	/** A list of columns used when dynamically rendering cells. */
	columns?: Iterable<T>;
	/** The cells within the row. Supports static items or a function for dynamic rendering. */
	children?: ReactNode | ((item: T) => any);
	/**
	 * The object value that this row represents. When using dynamic collections, this is set
	 * automatically.
	 */
	value?: T;
	/** Values that should invalidate the cell cache when using dynamic collections. */
	dependencies?: ReadonlyArray<any>;
	/** A string representation of the row's contents, used for features like typeahead. */
	textValue?: string;
	/** Whether the row is disabled. */
	isDisabled?: boolean;
	/** Whether `disabledKeys` applies to all interactions, or only selection. */
	disabledBehavior?: DisabledBehavior;
	/**
	 * Handler that is called when a user performs an action on the row. The exact user event depends
	 * on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: () => void;
	/** The unique id of the row. */
	id?: Key;
	/** Whether this row has children, even if not loaded yet. */
	hasChildItems?: boolean;
}

class TableRowNode<T> extends CollectionNode<T> {
	static readonly type = 'item';

	filter(
		collection: BaseCollection<T>,
		newCollection: BaseCollection<T>,
		filterFn: (textValue: string, node: Node<T>) => boolean,
	): TableRowNode<T> | null {
		let cells = collection.getChildren(this.key);
		for (let cell of cells) {
			if (filterFn(cell.textValue, cell)) {
				let clone = this.clone();
				newCollection.addDescendants(clone, collection);
				return clone;
			}
		}

		return null;
	}
}

function TableRowElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.tr, props);
}

/**
 * A row within a `<Table>`.
 */
export const Row: <T extends object = object>(props: RowProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createBranchComponent(
		TableRowNode,
		function Row<T>(props: RowProps<T>, forwardedRef: any, item?: Node<T>): any {
			const slot = S('TableRow');
			let ref = useObjectRef<HTMLTableRowElement | HTMLDivElement>(
				forwardedRef,
				subSlot(slot, 'objectRef'),
			);
			let state = useContext(TableStateContext)!;
			let { dragAndDropHooks, dragState, dropState } = useContext(DragAndDropContext);
			let { isVirtualized, CollectionBranch } = useContext(CollectionRendererContext);
			let isDraggable =
				dragState && !(dragState.isDisabled || dragState.selectionManager.isDisabled(item!.key));
			let { rowProps, expandButtonProps, ...states } = useTableRow(
				{
					node: item as GridNode<T>,
					shouldSelectOnPressUp: !!dragState,
					isVirtualized,
				},
				state,
				ref,
				subSlot(slot, 'row'),
			);
			let { isFocused, isFocusVisible, focusProps } = useFocusRing(
				undefined,
				subSlot(slot, 'focusRing'),
			);
			let { isFocusVisible: isFocusVisibleWithin, focusProps: focusWithinProps } = useFocusRing(
				{
					within: true,
				},
				subSlot(slot, 'focusRingWithin'),
			);
			let { hoverProps, isHovered } = useHover(
				{
					// because of https://bugs.webkit.org/show_bug.cgi?id=214609, supporting hover styles when a item is ONLY isDraggable
					// results in hover styles sticking around after a reorder/drop operation...
					isDisabled: !states.allowsSelection && !states.hasAction && !isDraggable,
					onHoverStart: props.onHoverStart,
					onHoverChange: props.onHoverChange,
					onHoverEnd: props.onHoverEnd,
				},
				subSlot(slot, 'hover'),
			);

			let { checkboxProps } = useTableSelectionCheckbox(
				{ key: item!.key },
				state,
				subSlot(slot, 'checkbox'),
			);

			// PHASE-7: consumer-provided dnd item hooks (unreachable until useDragAndDrop is ported).
			let draggableItem: DraggableItemResult | undefined = undefined;
			if (dragState && dragAndDropHooks) {
				draggableItem = dragAndDropHooks.useDraggableItem!(
					{ key: item!.key, hasDragButton: true },
					dragState,
				);
			}

			let dropIndicator: DropIndicatorAria | undefined = undefined;
			let dropIndicatorRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'dropIndicatorRef'));
			let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
			if (dropState && dragAndDropHooks) {
				dropIndicator = dragAndDropHooks.useDropIndicator!(
					{
						target: { type: 'item', key: item!.key, dropPosition: 'on' },
					},
					dropState,
					dropIndicatorRef,
				);
			}

			let dragButtonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'dragButton'));
			useEffect(
				() => {
					if (dragState && !dragButtonRef.current && process.env.NODE_ENV !== 'production') {
						console.warn(
							'Draggable items in a Table must contain a <Button slot="drag"> element so that keyboard and screen reader users can drag them.',
						);
					}
					// eslint-disable-next-line
				},
				[],
				subSlot(slot, 'dragButtonWarn'),
			);

			let isDragging = dragState && dragState.isDragging(item!.key);
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			let { children: _, ...restProps } = props;
			let hasChildItems =
				props.hasChildItems ||
				state.collection.getItem((item as CollectionNode<T>).lastChildKey!)?.type !== 'cell';
			let isExpanded = hasChildItems && state.expandedKeys.has(item!.key);
			let renderProps = useRenderProps(
				{
					...restProps,
					id: undefined,
					defaultClassName: 'react-aria-Row',
					defaultStyle: {
						'--table-row-level': item!.level + 1,
					},
					values: {
						...states,
						state,
						isHovered,
						isFocused,
						isFocusVisible,
						selectionMode: state.selectionManager.selectionMode,
						selectionBehavior: state.selectionManager.selectionBehavior,
						isDragging,
						isDropTarget: dropIndicator?.isDropTarget,
						isFocusVisibleWithin,
						id: item!.key,
						hasChildItems,
						isExpanded,
						level: item!.level + 1,
					},
				} as any,
				subSlot(slot, 'render'),
			);

			let DOMProps = filterDOMProps(props as any, { global: true });
			delete DOMProps.id;
			delete DOMProps.onClick;

			return createElement(
				Fragment,
				null,
				dropIndicator && !dropIndicator.isHidden
					? createElement(TableRowElementType, {
							role: 'row',
							style: { height: 0 },
							children: createElement(TableCellElementType, {
								role: 'gridcell',
								colSpan: (state.collection as ITableCollection<any>).columnCount,
								style: { padding: 0 },
								children: createElement('div', {
									role: 'button',
									...visuallyHiddenProps,
									...dropIndicator.dropIndicatorProps,
									ref: dropIndicatorRef,
								}),
							}),
						})
					: null,
				createElement(TableRowElementType, {
					...mergeProps(
						DOMProps,
						renderProps,
						rowProps,
						focusProps,
						hoverProps,
						draggableItem?.dragProps,
						focusWithinProps,
					),
					ref,
					'data-disabled': states.isDisabled || undefined,
					'data-selected': states.isSelected || undefined,
					'data-hovered': isHovered || undefined,
					'data-focused': states.isFocused || undefined,
					'data-focus-visible': isFocusVisible || undefined,
					'data-pressed': states.isPressed || undefined,
					'data-dragging': isDragging || undefined,
					'data-drop-target': dropIndicator?.isDropTarget || undefined,
					'data-selection-mode':
						state.selectionManager.selectionMode === 'none'
							? undefined
							: state.selectionManager.selectionMode,
					'data-focus-visible-within': isFocusVisibleWithin || undefined,
					'data-expanded': isExpanded || undefined,
					'data-has-child-items': hasChildItems || undefined,
					'data-level': item!.level + 1,
					children: createElement(Provider, {
						values: [
							[
								CheckboxContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										selection: checkboxProps,
									},
								},
							],
							[
								CheckboxFieldContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										selection: checkboxProps,
									},
								},
							],
							[
								ButtonContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										chevron: expandButtonProps,
										drag: {
											...draggableItem?.dragButtonProps,
											ref: dragButtonRef,
											style: {
												pointerEvents: 'none',
											},
										},
									},
								},
							],
							[SelectionIndicatorContext, { isSelected: states.isSelected }],
							[RowFocusContext, { isFocusVisibleWithinRow: isFocusVisibleWithin }],
						] as any,
						children: createElement(CollectionBranch, {
							collection: state.collection,
							parent: item!,
						}),
					}),
				}),
			);
		},
		(props) => {
			if (props.id == null && typeof props.children === 'function') {
				throw new Error(
					'No id detected for the Row element. The Row element requires a id to be provided to it when the cells are rendered dynamically.',
				);
			}

			let dependencies = [props.value].concat(props.dependencies as any);
			return createElement(Collection, {
				dependencies,
				items: props.columns,
				idScope: props.id,
				children: props.children,
			});
		},
	);

export interface CellRenderProps {
	/**
	 * Whether the cell is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the cell is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the cell is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the cell is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the parent row is currently selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the parent row is non-interactive, i.e. both selection and actions are disabled and the
	 * item may not be focused. Dependent on `disabledKeys` and `disabledBehavior`.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether keyboard focus is visible anywhere within the parent row.
	 *
	 * @selector [data-focus-visible-within-row]
	 */
	isFocusVisibleWithinRow: boolean;
	/**
	 * The unique id of the cell.
	 */
	id?: Key;
	/**
	 * The index of the column that this cell belongs to. Respects col spanning.
	 */
	columnIndex?: number | null;
	/**
	 * Whether the column displays hierarchical data.
	 *
	 * @selector [data-tree-column]
	 */
	isTreeColumn: boolean;
	/**
	 * Whether the parent row is expanded.
	 *
	 * @selector [data-expanded]
	 */
	isExpanded: boolean;
	/**
	 * Whether the parent row has child rows.
	 *
	 * @selector [data-has-child-items]
	 */
	hasChildItems: boolean;
	/**
	 * What level the parent row has within the table.
	 *
	 * @selector [data-level]
	 */
	level: number;
}

export interface CellProps extends RenderProps<CellRenderProps, 'td' | 'div'>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Cell'
	 */
	className?: ClassNameOrFunction<CellRenderProps>;
	/** The unique id of the cell. */
	id?: Key;
	/** A string representation of the cell's contents, used for features like typeahead. */
	textValue?: string;
	/** Indicates how many columns the data cell spans. */
	colSpan?: number;
}

class TableCellNode extends CollectionNode<unknown> {
	static readonly type = 'cell';
}

function TableCellElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.td, props);
}

/**
 * A cell within a table row.
 */
export const Cell: (props: CellProps & { ref?: any }) => any = /*#__PURE__*/ createLeafComponent(
	TableCellNode,
	function Cell(props: CellProps, forwardedRef: any, cellNode?: Node<unknown>): any {
		const slot = S('TableCell');
		let cell = cellNode as GridNode<unknown>;
		let ref = useObjectRef<HTMLTableCellElement | HTMLDivElement>(
			forwardedRef,
			subSlot(slot, 'objectRef'),
		);
		let state = useContext(TableStateContext)!;
		let { dragState } = useContext(DragAndDropContext);
		let { isVirtualized } = useContext(CollectionRendererContext);

		cell.column = state.collection.columns[cell.index];

		let { gridCellProps, isPressed } = useTableCell(
			{
				node: cell,
				shouldSelectOnPressUp: !!dragState,
				isVirtualized,
			},
			state,
			ref,
			subSlot(slot, 'cell'),
		);
		let { isFocused, isFocusVisible, focusProps } = useFocusRing(
			undefined,
			subSlot(slot, 'focusRing'),
		);
		let { hoverProps, isHovered } = useHover({}, subSlot(slot, 'hover'));
		let { isFocusVisibleWithinRow } = useContext(RowFocusContext);
		let isSelected =
			cell.parentKey != null ? state.selectionManager.isSelected(cell.parentKey) : false;
		// colIndex is null, when there is so span, falling back to using the index
		let columnIndex = cell.colIndex || cell.index;

		let row = state.collection.getItem(cell.parentKey!)! as GridNode<unknown>;
		let hasChildItems =
			row.props.hasChildItems ||
			state.collection.getItem((row as CollectionNode<unknown>).lastChildKey!)?.type !== 'cell';
		let isExpanded = hasChildItems && state.expandedKeys.has(cell.parentKey!);
		let isDisabled = state.selectionManager.isDisabled(cell.parentKey!);
		let renderProps = useRenderProps(
			{
				...props,
				id: undefined,
				defaultClassName: 'react-aria-Cell',
				values: {
					isFocused,
					isFocusVisible,
					isFocusVisibleWithinRow,
					isPressed,
					isHovered,
					isSelected,
					id: cell.key,
					columnIndex,
					hasChildItems,
					isExpanded,
					isDisabled,
					level: row.level + 1,
					isTreeColumn: cell.column!.key === state.treeColumn,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;

		return createElement(TableCellElementType, {
			...mergeProps(DOMProps, renderProps, gridCellProps, focusProps, hoverProps),
			ref,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-focus-visible-within-row': isFocusVisibleWithinRow || undefined,
			'data-pressed': isPressed || undefined,
			'data-selected': isSelected || undefined,
			'data-column-index': columnIndex,
			'data-expanded': isExpanded || undefined,
			'data-has-child-items': hasChildItems || undefined,
			'data-level': row.level + 1,
			'data-tree-column': cell.column!.key === state.treeColumn || undefined,
			'data-disabled': isDisabled || undefined,
			children: createElement(CollectionRendererContext.Provider, {
				value: DefaultCollectionRenderer,
				children: renderProps.children,
			}),
		});
	},
);

function TableDropIndicatorWrapper(props: DropIndicatorProps, forwardedRef: any): any {
	const slot = S('TableDropIndicatorWrapper');
	let ref = useObjectRef<HTMLElement>(forwardedRef, subSlot(slot, 'objectRef'));
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);
	let buttonRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'buttonRef'));
	let { dropIndicatorProps, isHidden, isDropTarget } = dragAndDropHooks!.useDropIndicator!(
		props,
		dropState!,
		buttonRef,
	);

	if (isHidden) {
		return null;
	}

	let level =
		dropState && props.target.type === 'item'
			? (dropState.collection.getItem(props.target.key)?.level || 0) + 1
			: 1;
	return createElement(TableDropIndicator, {
		...props,
		dropIndicatorProps,
		isDropTarget,
		buttonRef,
		level,
		ref,
	});
}

interface TableDropIndicatorProps extends DropIndicatorProps, GlobalDOMAttributes {
	dropIndicatorProps: HTMLAttributes;
	isDropTarget: boolean;
	buttonRef: RefObject<HTMLDivElement | null>;
	level: number;
	ref?: any;
}

function TableDropIndicatorRowElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.tr, props);
}

function TableDropIndicatorTDElementType(props: any): any {
	let { isVirtualized } = useContext(CollectionRendererContext);
	if (isVirtualized) {
		return createElement(dom.div, props);
	}
	return createElement(dom.td, props);
}

// octane adaptation: no forwardRef — the forwarded ref arrives as `props.ref` (upstream wraps
// this in `forwardRef` as TableDropIndicatorForwardRef).
function TableDropIndicator(props: TableDropIndicatorProps): any {
	const slot = S('TableDropIndicator');
	let { dropIndicatorProps, isDropTarget, buttonRef, level, ref, ...otherProps } = props;

	let state = useContext(TableStateContext)!;
	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
	let renderProps = useRenderProps(
		{
			...otherProps,
			defaultClassName: 'react-aria-DropIndicator',
			defaultStyle: {
				'--table-row-level': level + 1,
			},
			values: {
				isDropTarget,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	return createElement(TableDropIndicatorRowElementType, {
		...filterDOMProps(props as any, { global: true }),
		...renderProps,
		role: 'row',
		ref,
		'data-drop-target': isDropTarget || undefined,
		'aria-level': level,
		children: createElement(TableDropIndicatorTDElementType, {
			role: 'gridcell',
			colSpan: (state.collection as ITableCollection<any>).columnCount,
			style: { padding: 0 },
			// Positional (non-array) children, exactly like upstream's JSX.
			children: createElement(
				Fragment,
				null,
				createElement('div', {
					...visuallyHiddenProps,
					role: 'button',
					...dropIndicatorProps,
					ref: buttonRef,
				}),
				renderProps.children,
			),
		}),
	});
}

function RootDropIndicator(): any {
	const slot = S('TableRootDropIndicator');
	let state = useContext(TableStateContext)!;
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);
	let ref = useRef<HTMLDivElement | null>(null, subSlot(slot, 'ref'));
	let { dropIndicatorProps } = dragAndDropHooks!.useDropIndicator!(
		{
			target: { type: 'root' },
		},
		dropState!,
		ref,
	);
	let isDropTarget = dropState!.isDropTarget({ type: 'root' });
	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));

	if (!isDropTarget && dropIndicatorProps['aria-hidden']) {
		return null;
	}

	return createElement(TableRowElementType, {
		role: 'row',
		'aria-hidden': dropIndicatorProps['aria-hidden'],
		style: { height: 0 },
		children: createElement(TableCellElementType, {
			role: 'gridcell',
			colSpan: (state.collection as ITableCollection<any>).columnCount,
			style: { padding: 0 },
			children: createElement('div', {
				role: 'button',
				...visuallyHiddenProps,
				...dropIndicatorProps,
				ref,
			}),
		}),
	});
}

export interface TableLoadMoreItemProps
	extends
		Omit<LoadMoreSentinelProps, 'collection'>,
		StyleProps,
		DOMRenderProps<'tr' | 'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-TableLoadMoreItem'
	 */
	className?: string;
	/**
	 * The load more spinner to render when loading additional items.
	 */
	children?: ReactNode;
	/**
	 * Whether or not the loading spinner should be rendered or not.
	 */
	isLoading?: boolean;
}

export const TableLoadMoreItem: (props: TableLoadMoreItemProps & { ref?: any }) => any =
	createLeafComponent(
		LoaderNode,
		function TableLoadingIndicator(
			props: TableLoadMoreItemProps,
			ref: any,
			item?: Node<object>,
		): any {
			const slot = S('TableLoadMoreItem');
			let state = useContext(TableStateContext)!;
			let { isVirtualized } = useContext(CollectionRendererContext);
			let { isLoading, onLoadMore, scrollOffset, ...otherProps } = props;
			let numColumns = state.collection.columns.length;

			let sentinelRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'sentinel'));
			let memoedLoadMoreProps = useMemo(
				() => ({
					onLoadMore,
					collection: state?.collection,
					sentinelRef,
					scrollOffset,
				}),
				[onLoadMore, scrollOffset, state?.collection],
				subSlot(slot, 'loadMoreProps'),
			);
			useLoadMoreSentinel(
				memoedLoadMoreProps as any,
				sentinelRef as any,
				subSlot(slot, 'loadMore'),
			);

			let renderProps = useRenderProps(
				{
					...otherProps,
					id: undefined,
					children: item!.rendered,
					defaultClassName: 'react-aria-TableLoadingIndicator',
					defaultStyle: {
						'--table-row-level': item!.level + 1,
					},
					values: undefined,
				} as any,
				subSlot(slot, 'render'),
			);
			let rowProps: Record<string, any> = {};
			let rowHeaderProps: Record<string, any> = {};
			let style: Record<string, any> = {};

			if (isVirtualized) {
				// For now don't include aria-rowindex on loader since they aren't keyboard focusable
				// Arguably shouldn't include them ever since it might be confusing to the user to include the loaders as part of the
				// row count
				rowHeaderProps['aria-colspan'] = numColumns;
				style = { display: 'contents' };
			} else {
				rowHeaderProps['colSpan'] = numColumns;
			}

			return createElement(
				Fragment,
				null,
				// Alway render the sentinel. For now onus is on the user for styling when using flex + gap
				// (this would introduce a gap even though it doesn't take room). octane adaptation:
				// upstream `inertValue` is React <19 string compat; octane follows React 19 boolean
				// `inert` semantics.
				createElement(TableRowElementType, {
					style: { height: 0 },
					inert: true,
					children: createElement(TableCellElementType, {
						style: { padding: 0, border: 0 },
						children: createElement('div', {
							'data-testid': 'loadMoreSentinel',
							ref: sentinelRef,
							style: { position: 'relative', height: 1, width: 1 },
						}),
					}),
				}),
				isLoading && renderProps.children
					? createElement(TableRowElementType, {
							...mergeProps(filterDOMProps(props, { global: true }), rowProps),
							...renderProps,
							role: 'row',
							ref,
							'aria-level': item!.level + 1,
							'data-level': item!.level + 1,
							children: createElement(TableCellElementType, {
								role: 'rowheader',
								...rowHeaderProps,
								style,
								children: renderProps.children,
							}),
						})
					: null,
			);
		},
	);
