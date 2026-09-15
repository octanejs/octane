export interface UseListStateHandlers<T> {
    setState: React.Dispatch<React.SetStateAction<T[]>>;
    append: (...items: T[]) => void;
    prepend: (...items: T[]) => void;
    insert: (index: number, ...items: T[]) => void;
    pop: () => void;
    shift: () => void;
    apply: (fn: (item: T, index?: number) => T) => void;
    applyWhere: (condition: (item: T, index: number) => boolean, fn: (item: T, index?: number) => T) => void;
    remove: (...indices: number[]) => void;
    reorder: ({ from, to }: {
        from: number;
        to: number;
    }) => void;
    swap: ({ from, to }: {
        from: number;
        to: number;
    }) => void;
    setItem: (index: number, item: T) => void;
    setItemProp: <K extends keyof T, U extends T[K]>(index: number, prop: K, value: U) => void;
    filter: (fn: (item: T, i: number) => boolean) => void;
}
export type UseListStateReturnValue<T> = [T[], UseListStateHandlers<T>];
export declare function useListState<T>(initialValue?: T[] | (() => T[])): UseListStateReturnValue<T>;
export declare namespace useListState {
    type ReturnValue<T> = UseListStateReturnValue<T>;
    type Handlers<T> = UseListStateHandlers<T>;
}
