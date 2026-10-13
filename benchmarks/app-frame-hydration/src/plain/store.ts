// The plain twin's `octane/signals`: a module-level external store that the
// plain/ components read through useSyncExternalStore.
export interface WritableSignal<T> {
	get(): T;
	set(value: T): void;
	subscribe(listener: () => void): () => void;
}

export function signal$<T>(initial: T): WritableSignal<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next) {
			if (Object.is(next, value)) return;
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
