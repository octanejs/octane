export interface UseHashInput {
    getInitialValueInEffect?: boolean;
}
export type UseHashReturnValue = [string, (value: string) => void];
export declare function useHash({ getInitialValueInEffect }?: UseHashInput): UseHashReturnValue;
export declare namespace useHash {
    type Options = UseHashInput;
    type ReturnValue = UseHashReturnValue;
}
