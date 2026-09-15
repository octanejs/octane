export interface UseSelectionInput<T> {
    /** The array of items to select from */
    data: T[];
    /** The initial selection, empty array by default */
    defaultSelection?: T[];
    /** If true, selection is reset when data changes */
    resetSelectionOnDataChange?: boolean;
}
export interface UseSelectionHandlers<T> {
    /** Add an item to the selection */
    select: (selected: T) => void;
    /** Remove an item from the selection */
    deselect: (deselected: T) => void;
    /** Toggle an item's selection state */
    toggle: (toggled: T) => void;
    /** Returns true if all items from the `data` are selected */
    isAllSelected: () => boolean;
    /** Returns true if at least one item from the `data` is selected */
    isSomeSelected: () => boolean;
    /** Set the selection to a specific array of items */
    setSelection: (selection: T[]) => void;
    /** Clear all selections */
    resetSelection: () => void;
}
export type UseSelectionReturnValue<T> = readonly [T[], UseSelectionHandlers<T>];
export declare function useSelection<T>(input: UseSelectionInput<T>): UseSelectionReturnValue<T>;
export declare namespace useSelection {
    type Input<T> = UseSelectionInput<T>;
    type Handlers<T> = UseSelectionHandlers<T>;
    type ReturnValue<T> = UseSelectionReturnValue<T>;
}
