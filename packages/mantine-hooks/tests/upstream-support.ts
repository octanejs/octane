// Octane refs are plain objects and have no createRef wrapper.
export function createRef<T>(): { current: T | null } {
	return { current: null };
}
