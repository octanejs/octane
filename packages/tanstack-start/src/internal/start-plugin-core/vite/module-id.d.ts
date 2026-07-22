/** Checks for a query parameter without rewriting the opaque module ID. */
export declare function hasIdQueryFlag(id: string, flag: string): boolean;
/** Appends an owned query flag without normalizing the existing query. */
export declare function appendIdQueryFlag(id: string, flag: string): string;
/** Removes the owned query flag appended by {@link appendIdQueryFlag}. */
export declare function removeIdQueryFlag(id: string, flag: string): string;
