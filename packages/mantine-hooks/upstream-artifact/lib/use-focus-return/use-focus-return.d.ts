export interface UseFocusReturnInput {
    opened: boolean;
    shouldReturnFocus?: boolean;
}
export type UseFocusReturnReturnValue = () => void;
export declare function useFocusReturn({ opened, shouldReturnFocus, }: UseFocusReturnInput): UseFocusReturnReturnValue;
export declare namespace useFocusReturn {
    type Input = UseFocusReturnInput;
    type ReturnValue = UseFocusReturnReturnValue;
}
