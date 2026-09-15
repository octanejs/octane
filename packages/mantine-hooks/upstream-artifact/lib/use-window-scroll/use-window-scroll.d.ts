export interface UseWindowScrollPosition {
    x: number;
    y: number;
}
export type UseWindowScrollTo = (position: Partial<UseWindowScrollPosition>) => void;
export type UseWindowScrollReturnValue = [UseWindowScrollPosition, UseWindowScrollTo];
export declare function useWindowScroll(): UseWindowScrollReturnValue;
export declare namespace useWindowScroll {
    type Position = UseWindowScrollPosition;
    type ScrollTo = UseWindowScrollTo;
    type ReturnValue = UseWindowScrollReturnValue;
}
