type UseToggleAction<T> = (value?: React.SetStateAction<T>) => void;
export type UseToggleReturnValue<T> = [T, UseToggleAction<T>];
export declare function useToggle<T = boolean>(options?: readonly T[]): UseToggleReturnValue<T>;
export declare namespace useToggle {
    type ReturnValue<T> = UseToggleReturnValue<T>;
}
export {};
