/**
 * Suspense-aware Three loader cache.
 *
 * The cache key deliberately mirrors React Three Fiber: the loader identity and
 * each normalized input participate in the key, while extensions and progress
 * callbacks configure only the first request for that key.
 */
import * as THREE from 'three';
import { use } from 'octane/universal';
import { buildGraph, type ObjectMap } from './hooks.js';

type InputLike = string | string[] | string[][] | Readonly<string | string[] | string[][]>;
type LoaderLike = THREE.Loader<any, InputLike>;
type LoaderConstructor = new (...args: any[]) => LoaderLike;
type LoaderSource = LoaderLike | LoaderConstructor;
type LoaderInstance<T extends LoaderSource> = T extends LoaderConstructor ? InstanceType<T> : T;
type GLTFLike = { scene: THREE.Object3D };

/** The resolved value produced by a loader, augmented for GLTF-shaped results. */
export type LoaderResult<T extends LoaderSource> =
	Awaited<ReturnType<LoaderInstance<T>['loadAsync']>> extends infer Result
		? Result extends GLTFLike
			? Result & ObjectMap
			: Result
		: never;

/** Configures the concrete loader instance used for a request. */
export type Extensions<T extends LoaderSource> = (loader: LoaderInstance<T>) => void;

type InputKey = string | readonly string[];

interface TrackedLoaderPromise<T> extends Promise<T> {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: unknown;
}

interface LoaderCacheEntry {
	readonly keys: readonly InputKey[];
	readonly promise: TrackedLoaderPromise<unknown[]>;
}

const memoizedLoaders = new WeakMap<LoaderConstructor, LoaderLike>();
const loaderCache = new WeakMap<LoaderSource, LoaderCacheEntry[]>();

function isConstructor(value: LoaderSource): value is LoaderConstructor {
	return typeof value === 'function' && value.prototype?.constructor === value;
}

function inputKeyEquals(previous: InputKey, next: InputKey): boolean {
	if (previous === next) return true;
	if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) {
		return false;
	}
	return previous.every((value, index) => value === next[index]);
}

function keysEqual(previous: readonly InputKey[], next: readonly InputKey[]): boolean {
	return (
		previous.length === next.length &&
		previous.every((value, index) => inputKeyEquals(value, next[index]))
	);
}

function normalizeInput(input: InputLike): InputKey[] {
	return (Array.isArray(input) ? input : [input]) as InputKey[];
}

function resolveLoader(source: LoaderSource): LoaderLike {
	if (!isConstructor(source)) return source;
	let loader = memoizedLoaders.get(source);
	if (loader === undefined) {
		loader = new source();
		memoizedLoaders.set(source, loader);
	}
	return loader;
}

function trackPromise<T>(promise: Promise<T>): TrackedLoaderPromise<T> {
	const tracked = promise as TrackedLoaderPromise<T>;
	tracked.status = 'pending';
	promise.then(
		(value) => {
			tracked.status = 'fulfilled';
			tracked.value = value;
		},
		(reason) => {
			tracked.status = 'rejected';
			tracked.reason = reason;
		},
	);
	return tracked;
}

function loadInputs<L extends LoaderSource>(
	source: L,
	keys: readonly InputKey[],
	extensions?: Extensions<L>,
	onProgress?: (event: ProgressEvent<EventTarget>) => void,
): TrackedLoaderPromise<unknown[]> {
	const loader = resolveLoader(source) as LoaderInstance<L>;
	extensions?.(loader);

	const promise = Promise.all(
		keys.map(
			(input) =>
				new Promise<unknown>((resolve, reject) => {
					loader.load(
						input as InputLike,
						(data) => {
							const scene = (data as { scene?: unknown } | null)?.scene;
							if ((scene as THREE.Object3D | undefined)?.isObject3D === true) {
								Object.assign(data as object, buildGraph(scene as THREE.Object3D));
							}
							resolve(data);
						},
						onProgress,
						(error) => {
							const message = (error as { message?: unknown } | null)?.message;
							reject(new Error(`Could not load ${input}: ${message}`));
						},
					);
				}),
		),
	);
	return trackPromise(promise);
}

function getEntry<L extends LoaderSource>(
	source: L,
	keys: readonly InputKey[],
	extensions?: Extensions<L>,
	onProgress?: (event: ProgressEvent<EventTarget>) => void,
): LoaderCacheEntry {
	let entries = loaderCache.get(source);
	const cached = entries?.find((entry) => keysEqual(entry.keys, keys));
	if (cached !== undefined) return cached;

	const entry: LoaderCacheEntry = {
		keys: [...keys],
		promise: loadInputs(source, keys, extensions, onProgress),
	};
	if (entries === undefined) {
		entries = [];
		loaderCache.set(source, entries);
	}
	entries.push(entry);
	return entry;
}

function splitHookArguments(
	args: readonly unknown[],
): readonly [
	Extensions<LoaderSource> | undefined,
	((event: ProgressEvent<EventTarget>) => void) | undefined,
] {
	const userArgs = typeof args.at(-1) === 'symbol' ? args.slice(0, -1) : args;
	return [
		typeof userArgs[0] === 'function' ? (userArgs[0] as Extensions<LoaderSource>) : undefined,
		typeof userArgs[1] === 'function'
			? (userArgs[1] as (event: ProgressEvent<EventTarget>) => void)
			: undefined,
	];
}

interface UseLoader {
	<I extends InputLike, L extends LoaderSource>(
		loader: L,
		input: I,
		extensions?: Extensions<L>,
		onProgress?: (event: ProgressEvent<EventTarget>) => void,
	): I extends any[] ? LoaderResult<L>[] : LoaderResult<L>;
	preload<I extends InputLike, L extends LoaderSource>(
		loader: L,
		input: I,
		extensions?: Extensions<L>,
	): void;
	clear<I extends InputLike, L extends LoaderSource>(loader: L, input: I): void;
}

function useLoaderImplementation<L extends LoaderSource>(
	loader: L,
	input: InputLike,
	...args: unknown[]
): unknown {
	const [extensions, onProgress] = splitHookArguments(args);
	const keys = normalizeInput(input);
	const results = use(
		getEntry(loader, keys, extensions as Extensions<L> | undefined, onProgress).promise,
	);
	return Array.isArray(input) ? results : results[0];
}

/**
 * Synchronously reads and caches assets loaded by a Three loader.
 * The owning component must provide a Suspense boundary.
 */
export const useLoader = Object.assign(useLoaderImplementation, {
	preload<L extends LoaderSource>(loader: L, input: InputLike, extensions?: Extensions<L>): void {
		getEntry(loader, normalizeInput(input), extensions);
	},
	clear(loader: LoaderSource, input: InputLike): void {
		const entries = loaderCache.get(loader);
		if (entries === undefined) return;
		const keys = normalizeInput(input);
		const index = entries.findIndex((entry) => keysEqual(entry.keys, keys));
		if (index !== -1) entries.splice(index, 1);
		if (entries.length === 0) loaderCache.delete(loader);
	},
}) as UseLoader;
