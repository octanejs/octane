export interface UseRovingIndexInput {
    /** Total number of items in the group */
    total: number;
    /** Which arrow keys navigate, `'horizontal'` by default */
    orientation?: 'horizontal' | 'vertical' | 'both';
    /** Whether navigation wraps at boundaries, `true` by default */
    loop?: boolean;
    /** Text direction, `'ltr'` by default */
    dir?: 'rtl' | 'ltr';
    /** Whether to click element when it receives focus via keyboard, `false` by default */
    activateOnFocus?: boolean;
    /** Number of columns for grid (2D) navigation. When set, enables grid mode */
    columns?: number;
    /** Controlled focused index */
    focusedIndex?: number;
    /** Initial focused index for uncontrolled mode, first non-disabled item by default */
    initialIndex?: number;
    /** Called when focused index changes */
    onFocusChange?: (index: number) => void;
    /** Function to check if item at given index is disabled, `() => false` by default */
    isItemDisabled?: (index: number) => boolean;
}
export interface UseRovingIndexGetItemPropsInput {
    /** Index of the item in the group */
    index: number;
    /** Called when item is clicked */
    onClick?: React.MouseEventHandler;
    /** Called when keydown event fires on item */
    onKeyDown?: React.KeyboardEventHandler;
}
export interface UseRovingIndexReturnValue {
    /** Get props to spread on each navigable item */
    getItemProps: (options: UseRovingIndexGetItemPropsInput) => {
        tabIndex: 0 | -1;
        onKeyDown: React.KeyboardEventHandler;
        onClick: React.MouseEventHandler;
        ref: React.RefCallback<HTMLElement>;
    };
    /** Currently focused index */
    focusedIndex: number;
    /** Programmatically set focused index */
    setFocusedIndex: (index: number) => void;
}
export declare function useRovingIndex(input: UseRovingIndexInput): UseRovingIndexReturnValue;
export declare namespace useRovingIndex {
    type Input = UseRovingIndexInput;
    type GetItemPropsInput = UseRovingIndexGetItemPropsInput;
    type ReturnValue = UseRovingIndexReturnValue;
}
