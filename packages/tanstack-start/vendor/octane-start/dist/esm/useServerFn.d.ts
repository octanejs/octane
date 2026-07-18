export declare function useServerFn<T extends (...deps: Array<any>) => Promise<any>>(serverFn: T): (...args: Parameters<T>) => ReturnType<T>;
