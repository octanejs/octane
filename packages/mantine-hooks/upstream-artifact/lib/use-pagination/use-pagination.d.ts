export declare const DOTS = "dots";
export interface UsePaginationOptions {
    /** Page selected on initial render, defaults to 1 or startValue if provided */
    initialPage?: number;
    /** Controlled active page number */
    page?: number;
    /** Total amount of pages */
    total: number;
    /** Siblings amount on left/right side of selected page, defaults to 1 */
    siblings?: number;
    /** Amount of elements visible on left/right edges, defaults to 1  */
    boundaries?: number;
    /** Callback fired after change of each page */
    onChange?: (page: number) => void;
    /** Starting page number, defaults to 1 */
    startValue?: number;
}
export interface UsePaginationReturnValue {
    /** Array of page numbers and dots */
    range: (number | 'dots')[];
    /** Active page number */
    active: number;
    /** Function to set active page */
    setPage: (page: number) => void;
    /** Function to go to next page */
    next: () => void;
    /** Function to go to previous page */
    previous: () => void;
    /** Function to go to first page */
    first: () => void;
    /** Function to go to last page */
    last: () => void;
}
export declare function usePagination({ total, siblings, boundaries, page, initialPage, onChange, startValue, }: UsePaginationOptions): UsePaginationReturnValue;
export declare namespace usePagination {
    type Options = UsePaginationOptions;
    type ReturnValue = UsePaginationReturnValue;
}
