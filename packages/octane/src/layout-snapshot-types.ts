/** Configuration for a snapshot measured after a committed layout. */
export interface LayoutSnapshotOptions<T, Previous = T | undefined> {
	/** Returned until the first measurement; only read on the initial render. */
	initial?: T;
	/** Defaults to `Object.is`. */
	equal?: (previous: Previous, next: T) => boolean;
}
