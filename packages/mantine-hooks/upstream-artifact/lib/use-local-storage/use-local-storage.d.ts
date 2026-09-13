import { UseStorageOptions, UseStorageReturnValue } from './create-storage';
export declare function useLocalStorage<T = string>(props: UseStorageOptions<T> & {
    defaultValue: T;
}): UseStorageReturnValue<T>;
export declare function useLocalStorage<T = string>(props: UseStorageOptions<T>): UseStorageReturnValue<T | undefined>;
interface ReadStorageValue {
    <T>(options: UseStorageOptions<T> & {
        defaultValue: T;
    }): T;
    <T>(options: UseStorageOptions<T>): T | undefined;
}
export declare const readLocalStorageValue: ReadStorageValue;
export {};
