// Octane refs are plain objects; it intentionally has no createRef wrapper.
export function createRef<T>(): { current: T | null } {
	return { current: null };
}
