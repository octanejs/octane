type Key = readonly unknown[];

interface ResourceEntry<T = unknown> {
	readonly keys: Key;
	readonly promise: Promise<T>;
}

const entries: ResourceEntry[] = [];

function equalKeys(previous: Key, next: Key): boolean {
	return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

export function resourcePromise<T>(loader: (...keys: any[]) => Promise<T>, keys: Key): Promise<T> {
	const cached = entries.find((entry) => equalKeys(entry.keys, keys));
	if (cached !== undefined) return cached.promise as Promise<T>;
	const entry: ResourceEntry<T> = { keys: [...keys], promise: loader(...keys) };
	entries.push(entry);
	return entry.promise;
}

export function preloadResource<T>(loader: (...keys: any[]) => Promise<T>, keys: Key): void {
	void resourcePromise(loader, keys);
}

export function clearResource(keys: Key): void {
	const index = entries.findIndex((entry) => equalKeys(entry.keys, keys));
	if (index !== -1) entries.splice(index, 1);
}
