export interface MutableRef<T> {
	current: T | null;
}

export function createRef<T>(): MutableRef<T> {
	return { current: null };
}
