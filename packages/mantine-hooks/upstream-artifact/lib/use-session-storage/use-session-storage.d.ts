import { UseStorageOptions, UseStorageReturnValue } from '../use-local-storage/create-storage';
export declare function useSessionStorage<T = string>(props: UseStorageOptions<T> & {
    defaultValue: T;
}): UseStorageReturnValue<T>;
export declare function useSessionStorage<T = string>(props: UseStorageOptions<T>): UseStorageReturnValue<T | undefined>;
interface ReadStorageValue {
    <T>(options: UseStorageOptions<T> & {
        defaultValue: T;
    }): T;
    <T>(options: UseStorageOptions<T>): T | undefined;
}
export declare const readSessionStorageValue: ReadStorageValue;
export {};
