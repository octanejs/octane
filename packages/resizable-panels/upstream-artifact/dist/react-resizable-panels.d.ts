import { CSSProperties } from 'react';
import { Dispatch } from 'react';
import { HTMLAttributes } from 'react';
import { JSX } from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { Ref } from 'react';
import { RefObject } from 'react';
import { SetStateAction } from 'react';

declare type BasePanelAttributes = Omit<HTMLAttributes<HTMLDivElement>, "onResize">;

declare type BaseSeparatorAttributes = Omit<HTMLAttributes<HTMLDivElement>, "role" | "tabIndex">;

/**
 * A Group wraps a set of resizable Panel components.
 * Group content can be resized _horizontally_ or _vertically_.
 *
 * Group elements always include the following attributes:
 *
 * ```html
 * <div data-group data-testid="group-id-prop" id="group-id-prop">
 * ```
 *
 * ℹ️ [Test id](https://testing-library.com/docs/queries/bytestid/) can be used to narrow selection when unit testing.
 */
export declare function Group({ children, className, defaultLayout, disableCursor, disabled, elementRef: elementRefProp, groupRef, id: idProp, onLayoutChange: onLayoutChangeUnstable, onLayoutChanged: onLayoutChangedUnstable, orientation, resizeTargetMinimumSize, style, ...rest }: GroupProps): JSX.Element;

export declare namespace Group {
    var displayName: string;
}

/**
 * Imperative Group API.
 *
 * ℹ️ The `useGroupRef` and `useGroupCallbackRef` hooks are exported for convenience use in TypeScript projects.
 */
export declare interface GroupImperativeHandle {
    /**
     * Get the Group's current layout as a map of Panel id to percentage (0..100)
     *
     * @return Map of Panel id to percentages (specified as numbers ranging between 0..100)
     */
    getLayout: () => {
        [panelId: string]: number;
    };
    /**
     * Set a new layout for the Group
     *
     * @param layout Map of Panel id to percentage (a number between 0..100)
     * @return Applied layout (after validation)
     */
    setLayout: (layout: {
        [panelId: string]: number;
    }) => Layout;
}

export declare type GroupProps = HTMLAttributes<HTMLDivElement> & {
    /**
     * Panel and Separator components that comprise this group.
     */
    children?: ReactNode | undefined;
    /**
     * CSS class name.
     */
    className?: string | undefined;
    /**
     * Default layout for the Group.
     *
     * ℹ️ This value allows layouts to be remembered between page reloads.
     *
     * ⚠️ Slight layout shift may occur when server-rendering panels with percentage-based default sizes.
     * Refer to the documentation for suggestions on how to minimize the impact of this.
     */
    defaultLayout?: Layout | undefined;
    /**
     * This library sets custom mouse cursor styles to indicate drag state.
     * Use this prop to disable that behavior for Panels and Separators in this group.
     */
    disableCursor?: boolean | undefined;
    /**
     * Disable resize functionality.
     */
    disabled?: boolean | undefined;
    /**
     * Ref attached to the root `HTMLDivElement`.
     */
    elementRef?: Ref<HTMLDivElement | null> | undefined;
    /**
     * Exposes the following imperative API:
     * - `getLayout(): Layout`
     * - `setLayout(layout: Layout): void`
     *
     * ℹ️ The `useGroupRef` and `useGroupCallbackRef` hooks are exported for convenience use in TypeScript projects.
     */
    groupRef?: Ref<GroupImperativeHandle | null> | undefined;
    /**
     * Uniquely identifies this group within an application.
     * Falls back to `useId` when not provided.
     *
     * ℹ️ This value will also be assigned to the `data-group` attribute.
     */
    id?: string | number | undefined;
    /**
     * Called when the Group's layout is changing.
     *
     * ⚠️ For layout changes caused by pointer events, this method is called each time the pointer is moved.
     * For most cases, it is recommended to use the `onLayoutChanged` callback instead.
     */
    onLayoutChange?: (layout: Layout) => void | undefined;
    /**
     * Called after the Group's layout has  been changed.
     *
     * ℹ️ For layout changes caused by pointer events, this method is not called until the pointer has been released.
     * This method is recommended when saving layouts to some storage api.
     *
     * ℹ️ The second argument contains meta information about the layout change.
     * The `isUserInteraction` attribute signals whether the resize was caused by direct user input.
     * It is true for resizes caused by pointer or keyboard input
     * and false for other triggers (e.g. imperative API calls, initial mount, etc.)
     */
    onLayoutChanged?: (layout: Layout, meta: LayoutChangedMeta) => void;
    /**
     * Minimum size of the resizable hit target area (either `Separator` or `Panel` edge)
     * This threshold ensures are large enough to avoid mis-clicks.
     *
     * - Coarse inputs (typically a finger on a touchscreen) have reduced accuracy;
     * to ensure accessibility and ease of use, hit targets should be larger to prevent mis-clicks.
     * - Fine inputs (typically a mouse) can be smaller
     *
     * ℹ️ [Apple interface guidelines](https://developer.apple.com/design/human-interface-guidelines/accessibility) suggest `20pt` (`27px`) on desktops and `28pt` (`37px`) for touch devices
     * In practice this seems to be much larger than many of their own applications use though.
     */
    resizeTargetMinimumSize?: {
        coarse: number;
        fine: number;
    };
    /**
     * Specifies the resizable orientation ("horizontal" or "vertical"); defaults to "horizontal"
     */
    orientation?: "horizontal" | "vertical" | undefined;
    /**
     * CSS properties.
     *
     * ⚠️ The following styles cannot be overridden: `display`, `flex-direction`, `flex-wrap`, and `overflow`.
     */
    style?: CSSProperties | undefined;
};

/**
 * Caches and returns matchMedia()'s computed value for "pointer:coarse"
 */
export declare function isCoarsePointer(): boolean;

/**
 * Map of Panel id to flexGrow value;
 */
export declare type Layout = {
    [id: string]: number;
};

/**
 * Metadata describing a completed layout change, passed as the second argument
 * to the `onLayoutChanged` callback. See #716.
 */
export declare type LayoutChangedMeta = {
    /**
     * `true` when the change was caused by the user directly manipulating a
     * separator — releasing a pointer drag or pressing a resize key (arrow keys,
     * Home/End, Enter). `false` for every other source (programmatic `setLayout`
     * and other imperative API calls, constraint recompute, default-size change,
     * initial mount), because the library cannot attribute the caller's intent
     * there.
     */
    isUserInteraction: boolean;
};

export declare type LayoutStorage = Pick<Storage, "getItem" | "setItem">;

export declare type OnGroupLayoutChange = GroupProps["onLayoutChange"];

export declare type OnPanelResize = PanelProps["onResize"];

/**
 * Panel group orientation loosely relates to the `aria-orientation` attribute.
 * It determines how panels are are laid out within the group group and the direction they can be resized in.
 */
export declare type Orientation = "horizontal" | "vertical";

/**
 * A Panel wraps resizable content and can be configured with min/max size constraints and collapsible behavior.
 *
 * Panel size props can be in the following formats:
 * - Percentage of the parent Group (0..100)
 * - Pixels
 * - Relative font units (em, rem)
 * - Viewport relative units (vh, vw)
 *
 * ℹ️ Numeric values are assumed to be pixels.
 * Strings without explicit units are assumed to be percentages (0%..100%).
 * Percentages may also be specified as strings ending with "%" (e.g. "33%")
 * Pixels may also be specified as strings ending with the unit "px".
 * Other units should be specified as strings ending with their CSS property units (e.g. 1rem, 50vh)
 *
 * Panel elements always include the following attributes:
 *
 * ```html
 * <div data-panel data-testid="panel-id-prop" id="panel-id-prop">
 * ```
 *
 * ℹ️ [Test id](https://testing-library.com/docs/queries/bytestid/) can be used to narrow selection when unit testing.
 *
 * ⚠️ Panel elements must be direct DOM children of their parent Group elements.
 */
export declare function Panel({ children, className, collapsedSize, collapsible, defaultSize, disabled, elementRef: elementRefProp, groupResizeBehavior, id: idProp, maxSize, minSize, onResize: onResizeUnstable, panelRef, style, ...rest }: PanelProps): JSX.Element;

export declare namespace Panel {
    var displayName: string;
}

/**
 * Imperative Panel API
 *
 * ℹ️ The `usePanelRef` and `usePanelCallbackRef` hooks are exported for convenience use in TypeScript projects.
 */
export declare interface PanelImperativeHandle {
    /**
     * Collapse the Panel to it's `collapsedSize`.
     *
     * ⚠️ This method will do nothing if the Panel is not `collapsible` or if it is already collapsed.
     */
    collapse: () => void;
    /**
     * Expand a collapsed Panel to its most recent size.
     *
     * ⚠️ This method will do nothing if the Panel is not currently collapsed.
     */
    expand: () => void;
    /**
     * Get the current size of the Panel in pixels as well as a percentage of the parent group (0..100).
     *
     * @return Panel size (in pixels and as a percentage of the parent group)
     */
    getSize: () => {
        asPercentage: number;
        inPixels: number;
    };
    /**
     * The Panel is currently collapsed.
     */
    isCollapsed: () => boolean;
    /**
     * Update the Panel's size.
     *
     * Size can be in the following formats:
     * - Percentage of the parent Group (0..100)
     * - Pixels
     * - Relative font units (em, rem)
     * - Viewport relative units (vh, vw)
     *
     * ℹ️ Numeric values are assumed to be pixels.
     * Strings without explicit units are assumed to be percentages (0%..100%).
     * Percentages may also be specified as strings ending with "%" (e.g. "33%")
     * Pixels may also be specified as strings ending with the unit "px".
     * Other units should be specified as strings ending with their CSS property units (e.g. 1rem, 50vh)
     *
     * @param size New panel size
     * @return Applied size (after validation)
     */
    resize: (size: number | string) => void;
}

export declare type PanelProps = BasePanelAttributes & {
    /**
     * CSS class name.
     *
     * ⚠️ Class is applied to nested `HTMLDivElement` to avoid styles that interfere with Flex layout.
     */
    className?: string | undefined;
    /**
     * Panel size when collapsed; defaults to 0%.
     */
    collapsedSize?: number | string | undefined;
    /**
     * This panel can be collapsed.
     *
     * ℹ️ A collapsible panel will collapse when it's size is less than of the specified `minSize`
     */
    collapsible?: boolean | undefined;
    /**
     * Default size of Panel within its parent group; default is auto-assigned based on the total number of Panels.
     *
     * ℹ️ Interpretation rules:
     * - Numbers are interpreted as pixels (e.g. `defaultSize={200}` is 200 pixels)
     * - Strings without explicit units are interpreted as percentage (e.g. `defaultSize="50"` is 50 percent)
     * - Use explicit units (e.g. "px", "%", "em", "rem", "vh", or "vw") to change interpretation
     *
     * ⚠️ Percentage based sizes may cause slight layout shift when server-rendering.
     * For more information see the documentation.
     */
    defaultSize?: number | string | undefined;
    /**
     * When disabled, a panel cannot be resized either directly or indirectly (by resizing another panel).
     */
    disabled?: boolean | undefined;
    /**
     * Ref attached to the root `HTMLDivElement`.
     */
    elementRef?: Ref<HTMLDivElement | null> | undefined;
    /**
     * How should this Panel behave if the parent Group is resized?
     * Defaults to `preserve-relative-size`.
     *
     * - `preserve-relative-size`: Retain the current relative size (as a percentage of the Group)
     * - `preserve-pixel-size`: Retain its current size (in pixels)
     *
     * ℹ️ Panel min/max size constraints may impact this behavior.
     *
     * ⚠️ A Group must contain at least one Panel with `preserve-relative-size` resize behavior.
     */
    groupResizeBehavior?: "preserve-relative-size" | "preserve-pixel-size" | undefined;
    /**
     * Uniquely identifies this panel within the parent group.
     * Falls back to `useId` when not provided.
     *
     * ℹ️ This prop is used to associate persisted group layouts with the original panel.
     *
     * ℹ️ This value will also be assigned to the `data-panel` attribute.
     */
    id?: string | number | undefined;
    /**
     * Maximum size of Panel within its parent group; defaults to `"100%"`.
     *
     * ℹ️ Interpretation rules:
     * - Numbers are interpreted as pixels (e.g. `maxSize={200}` is 200 pixels)
     * - Strings without explicit units are interpreted as percentage (e.g. `maxSize="50"` is 50 percent)
     * - Use explicit units (e.g. "px", "%", "em", "rem", "vh", or "vw") to change interpretation
     */
    maxSize?: number | string | undefined;
    /**
     * Minimum size of Panel within its parent group; defaults to 0%.
     *
     * ℹ️ Interpretation rules:
     * - Numbers are interpreted as pixels (e.g. `minSize={200}` is 200 pixels)
     * - Strings without explicit units are interpreted as percentage (e.g. `minSize="50"` is 50 percent)
     * - Use explicit units (e.g. "px", "%", "em", "rem", "vh", or "vw") to change interpretation
     */
    minSize?: number | string | undefined;
    /**
     * Called when panel sizes change.
     *
     * @param panelSize Panel size (both as a percentage of the parent Group and in pixels)
     * @param id Panel id (if one was provided as a prop)
     * @param prevPanelSize Previous panel size (will be undefined on mount)
     */
    onResize?: ((panelSize: PanelSize, id: string | number | undefined, prevPanelSize: PanelSize | undefined) => void) | undefined;
    /**
     * Exposes the following imperative API:
     * - `collapse(): void`
     * - `expand(): void`
     * - `getSize(): number`
     * - `isCollapsed(): boolean`
     * - `resize(size: number): void`
     *
     * ℹ️ The `usePanelRef` and `usePanelCallbackRef` hooks are exported for convenience use in TypeScript projects.
     */
    panelRef?: Ref<PanelImperativeHandle | null> | undefined;
    /**
     * CSS properties.
     *
     * ⚠️ Style is applied to nested `HTMLDivElement` to avoid styles that interfere with Flex layout.
     */
    style?: CSSProperties | undefined;
};

export declare type PanelSize = {
    asPercentage: number;
    inPixels: number;
};

/**
 * Separators are not _required_ but they are _recommended_ as they improve keyboard accessibility.
 *
 * ⚠️ Separator elements must be direct DOM children of their parent Group elements.
 *
 * Separator elements always include the following attributes:
 *
 * ```html
 * <div data-separator data-testid="separator-id-prop" id="separator-id-prop" role="separator">
 * ```
 *
 * ℹ️ [Test id](https://testing-library.com/docs/queries/bytestid/) can be used to narrow selection when unit testing.
 *
 * ℹ️ In addition to the attributes shown above, separator also renders all required [WAI-ARIA properties](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/separator_role#associated_wai-aria_roles_states_and_properties).
 */
export declare function Separator({ children, className, disabled, disableDoubleClick, elementRef: elementRefProp, id: idProp, style, ...rest }: SeparatorProps): JSX.Element;

export declare namespace Separator {
    var displayName: string;
}

export declare type SeparatorProps = BaseSeparatorAttributes & {
    /**
     * CSS class name.
     *
     * ℹ️ Use the `data-separator` attribute for custom _hover_ and _active_ styles
     *
     * ⚠️ The following properties cannot be overridden: `flex-grow`, `flex-shrink`
     */
    className?: string | undefined;
    /**
     * When disabled, the separator cannot be used to resize its neighboring panels.
     *
     * ℹ️ The panels may still be resized indirectly (while other panels are being resized).
     * To prevent a panel from being resized at all, it needs to also be disabled.
     */
    disabled?: boolean | undefined;
    /**
     * When true, double-clicking this `Separator` will not reset its `Panel` to its default size.
     */
    disableDoubleClick?: boolean;
    /**
     * Ref attached to the root `HTMLDivElement`.
     */
    elementRef?: Ref<HTMLDivElement> | undefined;
    /**
     * Uniquely identifies the separator within the parent group.
     * Falls back to `useId` when not provided.
     *
     * ℹ️ This value will also be assigned to the `data-separator` attribute.
     */
    id?: string | number | undefined;
    /**
     * CSS properties.
     *
     * ℹ️ Use the `data-separator` attribute for custom _hover_ and _active_ styles
     *
     * ⚠️ The following properties cannot be overridden: `flex-grow`, `flex-shrink`
     */
    style?: CSSProperties | undefined;
};

export declare type SizeUnit = "px" | "%" | "em" | "rem" | "vh" | "vw";

/**
 * Saves and restores group layouts between page loads.
 * It can be configured to store values using `localStorage`, `sessionStorage`, cookies, or any other persistence layer that makes sense for your application.
 */
export declare function useDefaultLayout({ debounceSaveMs, onlySaveAfterUserInteractions, panelIds, storage, ...rest }: {
    /**
     * Debounce save operation by the specified number of milliseconds; defaults to 100ms
     *
     * @deprecated Use the {@link onLayoutChanged} callback instead; it does not require debouncing
     */
    debounceSaveMs?: number;
    /**
     * Only auto-save layouts that were directly caused by user input (e.g. keyboard or mouse events).
     * Ignore layout changes resulting from imperative API calls or window resize events.
     */
    onlySaveAfterUserInteractions?: boolean;
    /**
     * For Groups that contain conditionally-rendered Panels, this prop can be used to save and restore multiple layouts.
     *
     * ℹ️ This prevents layout shift for server-rendered apps.
     *
     * ⚠️ Panel ids must match the Panels rendered within the Group during mount or the initial layout will be incorrect.
     */
    panelIds?: string[] | undefined;
    /**
     * Storage implementation; supports localStorage, sessionStorage, and custom implementations
     * Refer to documentation site for example integrations.
     *
     */
    storage?: LayoutStorage;
} & ({
    /**
     * Group id; must be unique in order for layouts to be saved separately.
     * @deprecated Use the {@link id} param instead
     */
    groupId: string;
} | {
    /**
     * Uniquely identifies a specific group/layout.
     */
    id: string;
})): {
    /**
     * Pass this value to `Group` as the `defaultLayout` prop.
     */
    defaultLayout: Layout | undefined;
    /**
     * Attach this callback on the `Group` as the `onLayoutChange` prop.
     *
     * @deprecated Use the {@link onLayoutChanged} prop instead.
     */
    onLayoutChange: (layout: Layout) => void | undefined;
    /**
     * Attach this callback on the `Group` as the `onLayoutChanged` prop.
     */
    onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void;
};

/**
 * Convenience hook to return a properly typed ref callback for the Group component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export declare function useGroupCallbackRef(): [GroupImperativeHandle | null, Dispatch<SetStateAction<GroupImperativeHandle | null>>];

/**
 * Convenience hook to return a properly typed ref for the Group component.
 */
export declare function useGroupRef(): RefObject<GroupImperativeHandle | null>;

/**
 * Convenience hook to return a properly typed ref callback for the Panel component.
 *
 * Use this hook when you need to share the ref with another component or hook.
 */
export declare function usePanelCallbackRef(): [PanelImperativeHandle | null, Dispatch<SetStateAction<PanelImperativeHandle | null>>];

/**
 * Convenience hook to return a properly typed ref for the Panel component.
 */
export declare function usePanelRef(): RefObject<PanelImperativeHandle | null>;

export { }
