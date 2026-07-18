/** Read `build.rollupOptions` or `build.rolldownOptions` from a build config. */
export declare function getBundlerOptions(build: any): any;
export declare function resolveViteId(id: string): string;
export declare function createIdFilter(ids: Array<string>): RegExp;
export declare function escapeRegExp(value: string): string;
export declare function createLogger(prefix: string): {
    log: (...args: any) => void;
    debug: (...args: any) => void;
    info: (...args: any) => void;
    warn: (...args: any) => void;
    error: (...args: any) => void;
};
export declare function normalizePath(id: string): string;
