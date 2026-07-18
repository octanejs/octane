/**
 * Canonicalize extensionless absolute IDs like `/src/foo.server` to the
 * physical file when possible.
 *
 * Keeps a small cache plus a reverse index so we can invalidate on HMR
 * updates without clearing the whole map.
 */
export declare class ExtensionlessAbsoluteIdResolver {
    private entries;
    private keysByDep;
    clear(): void;
    /**
     * Invalidate any cached entries that might be affected by changes to `id`.
     * We invalidate both the file and its containing directory.
     */
    invalidateByFile(id: string): void;
    resolve(id: string): string;
    private invalidateDep;
    private buildDepsForKey;
    private indexDeps;
    private deleteKey;
}
