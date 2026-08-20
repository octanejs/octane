import { ComponentProps } from 'react';
import { CSSProperties } from 'react';
import { HTMLAttributes } from 'react';
import { JSX } from 'react';
import { ReactElement } from 'react';
import { ReactNode } from 'react';
import { Ref } from 'react';
import { useRef } from 'react';
import { useState } from 'react';

export declare type Align = "auto" | "center" | "end" | "smart" | "start";

declare type CellComponent<CellProps extends object> = GridProps<CellProps>["cellComponent"];

export declare type CellComponentProps<CellProps extends object = object> = ComponentProps<CellComponent<CellProps>>;

export declare type DynamicRowHeight = {
    getAverageRowHeight(): number;
    getRowHeight(index: number): number | undefined;
    setRowHeight(index: number, size: number): void;
    observeRowElements: (elements: Element[] | NodeListOf<Element>) => () => void;
};

declare type ExcludeForbiddenKeys<Type> = {
    [Key in keyof Type]: Key extends ForbiddenKeys ? never : Type[Key];
};

declare type ExcludeForbiddenKeys_2<Type> = {
    [Key in keyof Type]: Key extends ForbiddenKeys_2 ? never : Type[Key];
};

declare type ForbiddenKeys = "ariaAttributes" | "columnIndex" | "rowIndex" | "style";

declare type ForbiddenKeys_2 = "ariaAttributes" | "index" | "style";

export declare function getScrollbarSize(recalculate?: boolean): number;

/**
 * Renders data with many rows and columns.
 *
 * ℹ️ Unlike `List` rows, `Grid` cell sizes must be known ahead of time.
 * Either static sizes or something that can be derived (from the data in `CellProps`) without rendering.
 */
export declare function Grid<CellProps extends object, TagName extends TagNames = "div">({ cellComponent: CellComponentProp, cellProps: cellPropsUnstable, children, className, columnCount, columnKey, columnWidth, defaultHeight, defaultWidth, dir, gridRef, onCellsRendered, onResize, overscanCount, rowCount, rowHeight, rowKey, style, tagName, ...rest }: GridProps<CellProps, TagName>): ReactElement;

/**
 * Ref used to interact with this component's imperative API.
 *
 * This API has imperative methods for scrolling and a getter for the outermost DOM element.
 *
 * ℹ️ The `useGridRef` and `useGridCallbackRef` hooks are exported for convenience use in TypeScript projects.
 */
export declare interface GridImperativeAPI {
    /**
     * Outermost HTML element for the grid if mounted and null (if not mounted.
     */
    get element(): HTMLDivElement | null;
    /**
     * Scrolls the grid so that the specified row and column are visible.
     *
     * @param behavior Determines whether scrolling is instant or animates smoothly
     * @param columnAlign Determines the horizontal alignment of the element within the list
     * @param columnIndex Index of the column to scroll to (0-based)
     * @param rowAlign Determines the vertical alignment of the element within the list
     * @param rowIndex Index of the row to scroll to (0-based)
     *
     * @throws RangeError if an invalid row or column index is provided
     */
    scrollToCell: ({ behavior, columnAlign, columnIndex, rowAlign, rowIndex }: {
        behavior?: "auto" | "instant" | "smooth";
        columnAlign?: "auto" | "center" | "end" | "smart" | "start";
        columnIndex: number;
        rowAlign?: "auto" | "center" | "end" | "smart" | "start";
        rowIndex: number;
    }) => void;
    /**
     * Scrolls the grid so that the specified column is visible.
     *
     * @param align Determines the horizontal alignment of the element within the list
     * @param behavior Determines whether scrolling is instant or animates smoothly
     * @param index Index of the column to scroll to (0-based)
     *
     * @throws RangeError if an invalid column index is provided
     */
    scrollToColumn: ({ align, behavior, index }: {
        align?: "auto" | "center" | "end" | "smart" | "start";
        behavior?: "auto" | "instant" | "smooth";
        index: number;
    }) => void;
    /**
     * Scrolls the grid so that the specified row is visible.
     *
     * @param align Determines the vertical alignment of the element within the list
     * @param behavior Determines whether scrolling is instant or animates smoothly
     * @param index Index of the row to scroll to (0-based)
     *
     * @throws RangeError if an invalid row index is provided
     */
    scrollToRow: ({ align, behavior, index }: {
        align?: "auto" | "center" | "end" | "smart" | "start";
        behavior?: "auto" | "instant" | "smooth";
        index: number;
    }) => void;
}

export declare type GridProps<CellProps extends object, TagName extends TagNames = "div"> = Omit<HTMLAttributes<HTMLDivElement>, "onResize"> & {
    /**
     * React component responsible for rendering a cell.
     *
     * This component will receive an `index` and `style` prop by default.
     * Additionally it will receive prop values passed to `cellProps`.
     *
     * ℹ️ The prop types for this component are exported as `CellComponentProps`
     */
    cellComponent: (props: {
        ariaAttributes: {
            "aria-colindex": number;
            role: "gridcell";
        };
        columnIndex: number;
        rowIndex: number;
        style: CSSProperties;
    } & CellProps) => ReactElement | null;
    /**
     * Additional props to be passed to the cell-rendering component.
     * Grid will automatically re-render cells when values in this object change.
     *
     * ⚠️ This object must not contain `ariaAttributes`, `columnIndex`, `rowIndex`, or `style` props.
     */
    cellProps: ExcludeForbiddenKeys<CellProps>;
    /**
     * Additional content to be rendered within the grid (above cells).
     * This property can be used to render things like overlays or tooltips.
     */
    children?: ReactNode;
    /**
     * CSS class name.
     */
    className?: string;
    /**
     * Number of columns to be rendered in the grid.
     */
    columnCount: number;
    /**
     * Grids use the column index as a `key` by default.
     * This prop can be used along with the `rowKey` prop to provide a custom `key` value.
     *
     * ℹ️ Custom keys can ensure better UX for sortable or filterable grids,
     * particularly if your cell components are stateful.
     * Refer to the [React documentation](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key) for more info.
     *
     * ⚠️ This prop cannot be auto-memoized because it is called during render.
     * It is important to always `useCallback` for this prop; do not use an inline function.
     */
    columnKey?: (args: {
        columnIndex: number;
        data: CellProps;
        rowIndex: number;
    }) => React.Key;
    /**
     * Column width; the following formats are supported:
     * - number of pixels (number)
     * - percentage of the grid's current width (string)
     * - function that returns the column width (in pixels) given an index and `cellProps`
     */
    columnWidth: number | string | ((index: number, cellProps: CellProps) => number);
    /**
     * Default height of grid for initial render.
     * This value is important for server rendering.
     */
    defaultHeight?: number;
    /**
     * Default width of grid for initial render.
     * This value is important for server rendering.
     */
    defaultWidth?: number;
    /**
     * Indicates the directionality of grid cells.
     *
     * ℹ️ See HTML `dir` [global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/dir) for more information.
     */
    dir?: "ltr" | "rtl";
    /**
     * Imperative Grid API.
     *
     * ℹ️ The `useGridRef` and `useGridCallbackRef` hooks are exported for convenience use in TypeScript projects.
     */
    gridRef?: Ref<{
        /**
         * Outermost HTML element for the grid if mounted and null (if not mounted.
         */
        get element(): HTMLDivElement | null;
        /**
         * Scrolls the grid so that the specified row and column are visible.
         *
         * @param behavior Determines whether scrolling is instant or animates smoothly
         * @param columnAlign Determines the horizontal alignment of the element within the list
         * @param columnIndex Index of the column to scroll to (0-based)
         * @param rowAlign Determines the vertical alignment of the element within the list
         * @param rowIndex Index of the row to scroll to (0-based)
         *
         * @throws RangeError if an invalid row or column index is provided
         */
        scrollToCell(config: {
            behavior?: "auto" | "instant" | "smooth";
            columnAlign?: "auto" | "center" | "end" | "smart" | "start";
            columnIndex: number;
            rowAlign?: "auto" | "center" | "end" | "smart" | "start";
            rowIndex: number;
        }): void;
        /**
         * Scrolls the grid so that the specified column is visible.
         *
         * @param align Determines the horizontal alignment of the element within the list
         * @param behavior Determines whether scrolling is instant or animates smoothly
         * @param index Index of the column to scroll to (0-based)
         *
         * @throws RangeError if an invalid column index is provided
         */
        scrollToColumn(config: {
            align?: "auto" | "center" | "end" | "smart" | "start";
            behavior?: "auto" | "instant" | "smooth";
            index: number;
        }): void;
        /**
         * Scrolls the grid so that the specified row is visible.
         *
         * @param align Determines the vertical alignment of the element within the list
         * @param behavior Determines whether scrolling is instant or animates smoothly
         * @param index Index of the row to scroll to (0-based)
         *
         * @throws RangeError if an invalid row index is provided
         */
        scrollToRow(config: {
            align?: "auto" | "center" | "end" | "smart" | "start";
            behavior?: "auto" | "instant" | "smooth";
            index: number;
        }): void;
    }>;
    /**
     * Callback notified when the range of rendered cells changes.
     */
    onCellsRendered?: (visibleCells: {
        columnStartIndex: number;
        columnStopIndex: number;
        rowStartIndex: number;
        rowStopIndex: number;
    }, allCells: {
        columnStartIndex: number;
        columnStopIndex: number;
        rowStartIndex: number;
        rowStopIndex: number;
    }) => void;
    /**
     * Callback notified when the Grid's outermost HTMLElement resizes.
     * This may be used to (re)scroll a cell into view.
     */
    onResize?: (size: {
        height: number;
        width: number;
    }, prevSize: {
        height: number;
        width: number;
    }) => void;
    /**
     * How many additional rows/columns to render outside of the visible area.
     * This can reduce visual flickering near the edges of a grid when scrolling.
     */
    overscanCount?: number;
    /**
     * Number of rows to be rendered in the grid.
     */
    rowCount: number;
    /**
     * Row height; the following formats are supported:
     * - number of pixels (number)
     * - percentage of the grid's current height (string)
     * - function that returns the row height (in pixels) given an index and `cellProps`
     */
    rowHeight: number | string | ((index: number, cellProps: CellProps) => number);
    /**
     * Grids use the row index as a `key` by default.
     * This prop can be used along with the `columnKey` prop to provide a custom `key` value.
     *
     * ℹ️ Custom keys can ensure better UX for sortable or filterable grids,
     * particularly if your cell components are stateful.
     * Refer to the [React documentation](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key) for more info.
     *
     * ⚠️ This prop cannot be auto-memoized because it is called during render.
     * It is important to always `useCallback` for this prop; do not use an inline function.
     */
    rowKey?: (args: {
        data: CellProps;
        rowIndex: number;
    }) => React.Key;
    /**
     * Optional CSS properties.
     * The grid of cells will fill the height and width defined by this style.
     */
    style?: CSSProperties;
    /**
     * Can be used to override the root HTML element rendered by the List component.
     * The default value is "div", meaning that List renders an HTMLDivElement as its root.
     *
     * ⚠️ In most use cases the default ARIA roles are sufficient and this prop is not needed.
     */
    tagName?: TagName;
};

/**
 * Renders data with many rows.
 */
export declare function List<RowProps extends object, TagName extends TagNames = "div">({ children, className, defaultHeight, listRef, onResize, onRowsRendered, overscanCount, rowComponent: RowComponentProp, rowCount, rowHeight: rowHeightProp, rowKey, rowProps: rowPropsUnstable, tagName, style, ...rest }: ListProps<RowProps, TagName>): ReactElement;

/**
 * Imperative List API.
 *
 * ℹ️ The `useListRef` and `useListCallbackRef` hooks are exported for convenience use in TypeScript projects.
 */
export declare interface ListImperativeAPI {
    /**
     * Outermost HTML element for the list if mounted and null (if not mounted.
     */
    get element(): HTMLDivElement | null;
    /**
     * Scrolls the list so that the specified row is visible.
     *
     * @param align Determines the vertical alignment of the element within the list
     * @param behavior Determines whether scrolling is instant or animates smoothly
     * @param index Index of the row to scroll to (0-based)
     *
     * @throws RangeError if an invalid row index is provided
     */
    scrollToRow: ({ align, behavior, index }: {
        align?: "auto" | "center" | "end" | "smart" | "start";
        behavior?: "auto" | "instant" | "smooth";
        index: number;
    }) => void;
}

export declare type ListProps<RowProps extends object, TagName extends TagNames = "div"> = Omit<HTMLAttributes<HTMLDivElement>, "onResize"> & {
    /**
     * Additional content to be rendered within the list (above cells).
     * This property can be used to render things like overlays or tooltips.
     */
    children?: ReactNode;
    /**
     * CSS class name.
     */
    className?: string;
    /**
     * Default height of list for initial render.
     * This value is important for server rendering.
     */
    defaultHeight?: number;
    /**
     * Ref used to interact with this component's imperative API.
     *
     * This API has imperative methods for scrolling and a getter for the outermost DOM element.
     *
     * ℹ️ The `useListRef` and `useListCallbackRef` hooks are exported for convenience use in TypeScript projects.
     */
    listRef?: Ref<{
        /**
         * Outermost HTML element for the list if mounted and null (if not mounted.
         */
        get element(): HTMLDivElement | null;
        /**
         * Scrolls the list so that the specified row is visible.
         *
         * @param align Determines the vertical alignment of the element within the list
         * @param behavior Determines whether scrolling is instant or animates smoothly
         * @param index Index of the row to scroll to (0-based)
         *
         * @throws RangeError if an invalid row index is provided
         */
        scrollToRow(config: {
            align?: "auto" | "center" | "end" | "smart" | "start";
            behavior?: "auto" | "instant" | "smooth";
            index: number;
        }): void;
    }>;
    /**
     * Callback notified when the List's outermost HTMLElement resizes.
     * This may be used to (re)scroll a row into view.
     */
    onResize?: (size: {
        height: number;
        width: number;
    }, prevSize: {
        height: number;
        width: number;
    }) => void;
    /**
     * Callback notified when the range of visible rows changes.
     */
    onRowsRendered?: (visibleRows: {
        startIndex: number;
        stopIndex: number;
    }, allRows: {
        startIndex: number;
        stopIndex: number;
    }) => void;
    /**
     * How many additional rows to render outside of the visible area.
     * This can reduce visual flickering near the edges of a list when scrolling.
     */
    overscanCount?: number;
    /**
     * React component responsible for rendering a row.
     *
     * This component will receive an `index` and `style` prop by default.
     * Additionally it will receive prop values passed to `rowProps`.
     *
     * ℹ️ The prop types for this component are exported as `RowComponentProps`
     */
    rowComponent: (props: {
        ariaAttributes: {
            "aria-posinset": number;
            "aria-setsize": number;
            role: "listitem";
        };
        index: number;
        style: CSSProperties;
    } & RowProps) => ReactElement | null;
    /**
     * Number of items to be rendered in the list.
     */
    rowCount: number;
    /**
     * Row height; the following formats are supported:
     * - number of pixels (number)
     * - percentage of the grid's current height (string)
     * - function that returns the row height (in pixels) given an index and `cellProps`
     * - dynamic row height cache returned by the `useDynamicRowHeight` hook
     *
     * ⚠️ Dynamic row heights are not as efficient as predetermined sizes.
     * It's recommended to provide your own height values if they can be determined ahead of time.
     */
    rowHeight: number | string | ((index: number, cellProps: RowProps) => number) | DynamicRowHeight;
    /**
     * Lists use the row index as a `key` by default.
     * This prop can provide a custom `key` value.
     *
     * ℹ️ Custom keys can ensure better UX for sortable or filterable lists,
     * particularly if your row components are stateful.
     * Refer to the [React documentation](https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key) for more info.
     *
     * ⚠️ This prop cannot be auto-memoized because it is called during render.
     * It is important to always `useCallback` for this prop; do not use an inline function.
     */
    rowKey?: (index: number, data: RowProps) => React.Key;
    /**
     * Additional props to be passed to the row-rendering component.
     * List will automatically re-render rows when values in this object change.
     *
     * ⚠️ This object must not contain `ariaAttributes`, `index`, or `style` props.
     */
    rowProps: ExcludeForbiddenKeys_2<RowProps>;
    /**
     * Optional CSS properties.
     * The list of rows will fill the height defined by this style.
     */
    style?: CSSProperties;
    /**
     * Can be used to override the root HTML element rendered by the List component.
     * The default value is "div", meaning that List renders an HTMLDivElement as its root.
     *
     * ⚠️ In most use cases the default ARIA roles are sufficient and this prop is not needed.
     */
    tagName?: TagName;
};

declare type RowComponent<RowProps extends object> = ListProps<RowProps>["rowComponent"];

export declare type RowComponentProps<RowProps extends object = object> = ComponentProps<RowComponent<RowProps>>;

declare type TagNames = keyof JSX.IntrinsicElements;

export declare function useDynamicRowHeight({ defaultRowHeight, key }: {
    defaultRowHeight: number;
    key?: string | number;
}): DynamicRowHeight;

/**
 * Convenience hook to return a properly typed ref callback for the Grid component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export declare const useGridCallbackRef: typeof useState<GridImperativeAPI | null>;

/**
 * Convenience hook to return a properly typed ref for the Grid component.
 */
export declare const useGridRef: typeof useRef<GridImperativeAPI>;

/**
 * Convenience hook to return a properly typed ref callback for the List component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export declare const useListCallbackRef: typeof useState<ListImperativeAPI | null>;

/**
 * Convenience hook to return a properly typed ref for the List component.
 */
export declare const useListRef: typeof useRef<ListImperativeAPI>;

export { }
