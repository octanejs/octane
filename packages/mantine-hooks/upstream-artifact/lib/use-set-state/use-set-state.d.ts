export type UseSetStateCallback<T> = (state: Partial<T> | ((currentState: T) => Partial<T>)) => void;
export type UseSetStateReturnValue<T> = [T, UseSetStateCallback<T>];
export declare function useSetState<T extends Record<string, any>>(initialState: T): UseSetStateReturnValue<T>;
export declare namespace useSetState {
    type Callback<T> = UseSetStateCallback<T>;
    type ReturnValue<T> = UseSetStateReturnValue<T>;
}
