import React from 'react';
export interface UseScrollSpyHeadingData {
    /** Heading depth, 1-6 */
    depth: number;
    /** Heading text content value */
    value: string;
    /** Heading id */
    id: string;
    /** Function to get heading node */
    getNode: () => HTMLElement;
}
export interface UseScrollSpyOptions {
    /** Selector to get headings, `'h1, h2, h3, h4, h5, h6'` by default */
    selector?: string;
    /** A function to retrieve depth of heading, by default depth is calculated based on tag name */
    getDepth?: (element: HTMLElement) => number;
    /** A function to retrieve heading value, by default `element.textContent` is used */
    getValue?: (element: HTMLElement) => string;
    /** Host element or a ref to it to attach scroll event listener, if not provided, `window` is used */
    scrollHost?: HTMLElement | React.RefObject<HTMLElement | null>;
    /** Offset from the top of the viewport to use when determining the active heading, `0` by default */
    offset?: number;
}
export interface UseScrollSpyReturnValue {
    /** Index of the active heading in the `data` array */
    active: number;
    /** Headings data. If not initialize, data is represented by an empty array. */
    data: UseScrollSpyHeadingData[];
    /** True if headings value have been retrieved from the DOM. */
    initialized: boolean;
    /** Function to update headings values after the parent component has mounted. */
    reinitialize: () => void;
}
export declare function useScrollSpy({ selector, getDepth, getValue, offset, scrollHost, }?: UseScrollSpyOptions): UseScrollSpyReturnValue;
export declare namespace useScrollSpy {
    type Options = UseScrollSpyOptions;
    type ReturnValue = UseScrollSpyReturnValue;
}
