/**
 * A React-19-style ref object shape (Octane refs are ordinary objects with a
 * mutable `current`).
 */
export interface RefObjectLike<T> {
	current: T;
}

/**
 * Type guard to check if a value is a ref-like object.
 */
export function isRef(value: unknown): value is RefObjectLike<HTMLElement | null> {
	return value !== null && typeof value === 'object' && 'current' in value;
}
