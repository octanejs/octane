import React, { CSSProperties } from 'react';
export declare function getElementHeight(elementRef: React.RefObject<HTMLElement | null>): number | "auto";
export declare function isMeasured(size: number | string): size is number;
export interface UseCollapseInput {
    /** Expanded state  */
    expanded: boolean;
    /** Transition duration in milliseconds, by default calculated based on content height */
    transitionDuration?: number;
    /** Transition timing function, `ease` by default */
    transitionTimingFunction?: string;
    /** Called when transition ends */
    onTransitionEnd?: () => void;
    /** Called when transition starts */
    onTransitionStart?: () => void;
    /** If true, collapsed content is kept in the DOM and hidden with `display: none` styles */
    keepMounted?: boolean;
}
interface GetCollapsePropsInput {
    style?: CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
}
interface GetCollapsePropsReturnValue {
    'aria-hidden': boolean;
    inert: boolean;
    ref: React.RefCallback<HTMLDivElement>;
    onTransitionEnd: (event: React.TransitionEvent<Element>) => void;
    style: React.CSSProperties;
}
export type UseCollapseState = 'entering' | 'entered' | 'exiting' | 'exited';
export interface UseCollapseReturnValue {
    /** Current transition state */
    state: UseCollapseState;
    /** Props to pass down to the collapsible element */
    getCollapseProps: (input?: GetCollapsePropsInput) => GetCollapsePropsReturnValue;
}
export declare function useCollapse({ transitionDuration, transitionTimingFunction, onTransitionEnd, onTransitionStart, expanded, keepMounted, }: UseCollapseInput): UseCollapseReturnValue;
export declare namespace useCollapse {
    type Input = UseCollapseInput;
    type ReturnValue = UseCollapseReturnValue;
    type State = UseCollapseState;
}
export {};
