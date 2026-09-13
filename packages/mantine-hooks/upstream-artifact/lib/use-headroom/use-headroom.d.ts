export { useScrollDirection } from '../use-scroll-direction/use-scroll-direction';
export declare const isFixed: (current: number, fixedAt: number) => boolean;
export declare const isPinned: (current: number, previous: number) => boolean;
export declare const isReleased: (current: number, previous: number, fixedAt: number) => boolean;
export declare const isPinnedOrReleased: (current: number, fixedAt: number, isCurrentlyPinnedRef: React.RefObject<boolean>, isScrollingUp: boolean, onPin?: () => void, onRelease?: () => void) => void;
export interface UseHeadroomInput {
    /** Number in px at which element should be fixed */
    fixedAt?: number;
    /** Number of px to scroll to fully reveal or hide the element, 100 by default */
    scrollDistance?: number;
    /** Called when element is pinned */
    onPin?: () => void;
    /** Called when element is at fixed position */
    onFix?: () => void;
    /** Called when element is unpinned */
    onRelease?: () => void;
}
export interface UseHeadroomReturnValue {
    /** True when the element is at least partially visible */
    pinned: boolean;
    /** Reveal progress: 0 = fully hidden, 1 = fully visible */
    scrollProgress: number;
}
export declare function useHeadroom({ fixedAt, scrollDistance, onPin, onFix, onRelease, }?: UseHeadroomInput): UseHeadroomReturnValue;
export declare namespace useHeadroom {
    type Input = UseHeadroomInput;
    type ReturnValue = UseHeadroomReturnValue;
}
