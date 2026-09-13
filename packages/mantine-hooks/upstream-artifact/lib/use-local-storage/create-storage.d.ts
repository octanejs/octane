export type StorageType = 'localStorage' | 'sessionStorage';
export interface UseStorageOptions<T> {
    /** Storage key */
    key: string;
    /** Default value that will be set if value is not found in storage */
    defaultValue?: T;
    /** If set to true, value will be updated in useEffect after mount. Default value is true. */
    getInitialValueInEffect?: boolean;
    /** Determines whether the value must be synced between browser tabs, `true` by default */
    sync?: boolean;
    /** Function to serialize value into string to be save in storage */
    serialize?: (value: T) => string;
    /** Function to deserialize string value from storage to value */
    deserialize?: (value: string | undefined) => T;
}
export type UseStorageReturnValue<T> = [
    T,
    (val: T | ((prevState: T) => T)) => void,
    () => void
];
export declare function createStorage<T>(type: StorageType, hookName: string): ({ key, defaultValue, getInitialValueInEffect, sync, deserialize, serialize, }: UseStorageOptions<T>) => UseStorageReturnValue<T>;
export declare function readValue(type: StorageType): <T>({ key, defaultValue, deserialize, }: UseStorageOptions<T>) => T;
