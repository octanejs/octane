/**
 * A React-19-style ref object shape (Octane refs are ordinary objects with a
 * mutable `current`).
 *
 * OCTANE DIVERGENCE[plain-ref-target][types:adapted-octane]
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

/**
 * Octane call sites append a compiler slot Symbol after optional trailing
 * parameters. Treat that Symbol as "argument omitted" so `= {}` defaults apply.
 */
export function withoutSlotOption<T extends object>(
	options: T | symbol | undefined,
): T | undefined {
	if (typeof options === 'symbol' || options === undefined) return undefined;
	return options;
}
