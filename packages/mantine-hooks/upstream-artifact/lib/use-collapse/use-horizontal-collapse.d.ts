import React, { CSSProperties } from 'react';
export declare function getElementWidth(elementRef: React.RefObject<HTMLElement | null>): number | "auto";
export interface UseHorizontalCollapseInput {
    /** Expanded state  */
    expanded: boolean;
    /** Transition duration in milliseconds, by default calculated based on content width */
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
interface GetHorizontalCollapsePropsInput {
    style?: CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
}
interface GetHorizontalCollapsePropsReturnValue {
    'aria-hidden': boolean;
    inert: boolean;
    ref: React.RefCallback<HTMLDivElement>;
    onTransitionEnd: (event: React.TransitionEvent<Element>) => void;
    style: React.CSSProperties;
}
export type UseHorizontalCollapseState = 'entering' | 'entered' | 'exiting' | 'exited';
export interface UseHorizontalCollapseReturnValue {
    /** Current transition state */
    state: UseHorizontalCollapseState;
    /** Props to pass down to the collapsible element */
    getCollapseProps: (input?: GetHorizontalCollapsePropsInput) => GetHorizontalCollapsePropsReturnValue;
}
export declare function useHorizontalCollapse({ transitionDuration, transitionTimingFunction, onTransitionEnd, onTransitionStart, expanded, keepMounted, }: UseHorizontalCollapseInput): UseHorizontalCollapseReturnValue;
export declare namespace useHorizontalCollapse {
    type Input = UseHorizontalCollapseInput;
    type ReturnValue = UseHorizontalCollapseReturnValue;
    type State = UseHorizontalCollapseState;
}
export {};
