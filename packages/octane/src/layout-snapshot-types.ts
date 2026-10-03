/** Configuration for a snapshot measured after a committed layout. */
export interface LayoutSnapshotOptions<T> {
	/** Returned until the first measurement; only read when the hook mounts. */
	initial?: T;
	/** Defaults to `Object.is`. Without an initial value, `previous` starts as `undefined`. */
	equal?: (previous: T | undefined, next: T) => boolean;
}

/**
 * Options whose `initial` value is always present, so the snapshot is never
 * `undefined`. Annotate a reusable options object with this type to keep that
 * guarantee; a `LayoutSnapshotOptions` annotation makes `initial` optional.
 */
export interface LayoutSnapshotOptionsWithInitial<T> {
	/** Returned until the first measurement; only read when the hook mounts. */
	initial: T;
	/** Defaults to `Object.is`. */
	equal?: (previous: T, next: T) => boolean;
}
