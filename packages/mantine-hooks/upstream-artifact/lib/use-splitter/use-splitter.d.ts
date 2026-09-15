/** Pane size expressed in CSS units. A bare `number` or `%` string is a flexible size (shares
 * the leftover space), `px`/`rem` strings are fixed sizes that keep their pixel size when the
 * container is resized. */
export type SplitterPaneSize = number | `${number}%` | `${number}px` | `${number}rem`;
/** Keyboard step expressed in CSS units. A bare `number` or `%` string is a percentage of the
 * container, `px`/`rem` strings are resolved to pixels. */
export type SplitterStep = number | `${number}%` | `${number}px` | `${number}rem`;
export interface UseSplitterPanel {
    /** Initial size, a `number`/`%` is a flexible size, `px`/`rem` is a fixed size. A bare number is treated as a percentage. */
    defaultSize: SplitterPaneSize;
    /** Minimum size in the same units as `defaultSize`, `0` by default */
    min?: SplitterPaneSize;
    /** Maximum size in the same units as `defaultSize`, no limit by default */
    max?: SplitterPaneSize;
    /** Whether this panel can be collapsed, `false` by default */
    collapsible?: boolean;
    /** Size below which the panel snaps to collapsed, defaults to `min` */
    collapseThreshold?: SplitterPaneSize;
}
/** Panel configuration resolved to numeric units (percent or pixels) passed to redistribute functions */
export interface UseSplitterResolvedPanel {
    /** Resolved default size in the same units as redistribute sizes */
    defaultSize: number;
    /** Resolved minimum size */
    min?: number;
    /** Resolved maximum size */
    max?: number;
    /** Whether this panel can be collapsed */
    collapsible?: boolean;
    /** Resolved collapse threshold */
    collapseThreshold?: number;
}
export interface UseSplitterRedistributeInput {
    /** Current sizes before applying delta, in resolved units (percent or pixels) */
    sizes: number[];
    /** Resolved panel configurations, in the same units as `sizes` */
    panels: UseSplitterResolvedPanel[];
    /** Index of the handle being dragged */
    handleIndex: number;
    /** Requested size change in resolved units (positive = grow before-panel) */
    delta: number;
}
export type UseSplitterRedistributeFn = (input: UseSplitterRedistributeInput) => number[];
export interface UseSplitterOptions {
    /** Panel configuration array (minimum 2 panels) */
    panels: UseSplitterPanel[];
    /** Layout direction, `'horizontal'` by default */
    orientation?: 'horizontal' | 'vertical';
    /** Controlled sizes, each value keeps the unit it was declared in */
    sizes?: SplitterPaneSize[];
    /** Called during resize with updated sizes, each value keeps its declared unit */
    onSizeChange?: (sizes: SplitterPaneSize[]) => void;
    /** Called when drag starts */
    onResizeStart?: (handleIndex: number) => void;
    /** Called when drag ends */
    onResizeEnd?: (handleIndex: number, sizes: SplitterPaneSize[]) => void;
    /** Called when a panel collapses or expands */
    onCollapseChange?: (panelIndex: number, collapsed: boolean) => void;
    /** How to borrow space from non-adjacent panels when the immediate neighbor is at its min/max.
     * `'nearest'` takes from the nearest panel in the drag direction first.
     * `'equal'` distributes equally among all panels in the drag direction.
     * A function receives sizes, panels, handleIndex and delta, and returns new sizes.
     * When not set, only the two adjacent panels are affected. */
    redistribute?: 'nearest' | 'equal' | UseSplitterRedistributeFn;
    /** Keyboard step size, a `number`/`%` is a percentage, `px`/`rem` is resolved to pixels, `1` by default */
    step?: SplitterStep;
    /** Shift+arrow step size, a `number`/`%` is a percentage, `px`/`rem` is resolved to pixels, `10` by default */
    shiftStep?: SplitterStep;
    /** Text direction for keyboard nav, `'ltr'` by default */
    dir?: 'ltr' | 'rtl';
    /** Restore the two panels adjacent to a handle to their default ratio (preserving their combined size) when the handle is double-clicked, `true` by default */
    resetOnDoubleClick?: boolean;
    /** Enable/disable the hook, `true` by default */
    enabled?: boolean;
}
export interface UseSplitterReturnValue<T extends HTMLElement = any> {
    /** Ref callback for the container element */
    ref: React.RefCallback<T | null>;
    /** Current panel sizes, each value keeps the unit it was declared in */
    sizes: SplitterPaneSize[];
    /** Whether sizes are tracked in pixels because any pane size, `min`, `max`, `step`, `shiftStep`
     * or `collapseThreshold` uses a fixed `px`/`rem` unit */
    pixelMode: boolean;
    /** Which panels are currently collapsed */
    collapsed: boolean[];
    /** Index of handle being dragged, or -1 */
    activeHandle: number;
    /** Get props to spread on each resize handle */
    getHandleProps: (input: {
        index: number;
    }) => {
        ref: React.RefCallback<HTMLElement>;
        role: 'separator';
        'aria-orientation': 'horizontal' | 'vertical';
        'aria-valuenow': number;
        'aria-valuemin': number;
        'aria-valuemax': number;
        tabIndex: number;
        onKeyDown: React.KeyboardEventHandler;
        onDoubleClick: React.MouseEventHandler;
        'data-active': boolean | undefined;
        'data-orientation': 'horizontal' | 'vertical';
    };
    /** Programmatically set sizes, each value keeps its declared unit */
    setSizes: (sizes: SplitterPaneSize[]) => void;
    /** Collapse a panel */
    collapse: (panelIndex: number) => void;
    /** Expand a collapsed panel */
    expand: (panelIndex: number) => void;
    /** Toggle collapse of a panel */
    toggleCollapse: (panelIndex: number) => void;
    /** Reset the two panels adjacent to a handle to their default ratio, preserving
     * their combined size */
    reset: (handleIndex: number) => void;
}
export declare function useSplitter<T extends HTMLElement = any>(options: UseSplitterOptions): UseSplitterReturnValue<T>;
export declare namespace useSplitter {
    type Panel = UseSplitterPanel;
    type Options = UseSplitterOptions;
    type RedistributeInput = UseSplitterRedistributeInput;
    type RedistributeFn = UseSplitterRedistributeFn;
    type ResolvedPanel = UseSplitterResolvedPanel;
    type ReturnValue<T extends HTMLElement = any> = UseSplitterReturnValue<T>;
    type PaneSize = SplitterPaneSize;
    type Step = SplitterStep;
}
