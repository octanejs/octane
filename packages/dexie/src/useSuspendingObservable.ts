import { use, useEffect, useReducer, useRef } from 'octane';
import type { InteropableObservable } from './useObservable';
import { splitSlot, subSlot } from './internal';

type Observer<T> = {
	next?: (value: T) => void;
	error?: (error: unknown) => void;
	complete?: () => void;
};

type Subscription = { unsubscribe(): unknown } | (() => unknown);

type CacheEntry<T> = {
	key: readonly unknown[];
	source: any;
	current?: T;
	hasValue: boolean;
	error?: unknown;
	promise?: Promise<T>;
	observers: Set<Observer<T>>;
	sourceSubscription?: Subscription;
	cleanup?: ReturnType<typeof setTimeout>;
	subscribe(observer: Observer<T>): Subscription;
};

const cache: CacheEntry<any>[] = [];
const sameKey = (left: readonly unknown[], right: readonly unknown[]) =>
	left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

function stop(subscription: Subscription | undefined) {
	if (subscription === undefined) return;
	if (typeof subscription === 'function') subscription();
	else subscription.unsubscribe();
}

function getEntry<T>(
	getObservable: (() => InteropableObservable<T>) | InteropableObservable<T>,
	cacheKey: readonly unknown[],
): CacheEntry<T> {
	const existing = cache.find((entry) => sameKey(entry.key, cacheKey)) as CacheEntry<T> | undefined;
	if (existing) return existing;

	const source: any =
		typeof getObservable === 'function'
			? getObservable()
			: (getObservable as InteropableObservable<T>);
	const entry = {
		key: [...cacheKey],
		source,
		current: undefined,
		hasValue: false,
		observers: new Set<Observer<T>>(),
	} as unknown as CacheEntry<T>;

	const emit = (observer: Observer<T>, method: 'next' | 'error' | 'complete', value?: unknown) => {
		observer[method]?.(value as never);
	};
	const subscribeSource = () => {
		if (entry.sourceSubscription) return;
		entry.sourceSubscription = source.subscribe({
			next: (value: T) => {
				entry.current = value;
				entry.hasValue = true;
				for (const observer of [...entry.observers]) emit(observer, 'next', value);
			},
			error: (error: unknown) => {
				entry.error = error;
				for (const observer of [...entry.observers]) emit(observer, 'error', error);
				stop(entry.sourceSubscription);
				entry.sourceSubscription = undefined;
			},
			complete: () => {
				for (const observer of [...entry.observers]) emit(observer, 'complete');
				stop(entry.sourceSubscription);
				entry.sourceSubscription = undefined;
			},
		});
	};

	entry.subscribe = (observer) => {
		if (entry.cleanup !== undefined) {
			clearTimeout(entry.cleanup);
			entry.cleanup = undefined;
		}
		entry.observers.add(observer);
		subscribeSource();
		if (entry.hasValue) observer.next?.(entry.current as T);
		if (entry.error !== undefined) observer.error?.(entry.error);
		return () => {
			entry.observers.delete(observer);
			if (entry.observers.size === 0 && entry.cleanup === undefined) {
				entry.cleanup = setTimeout(() => {
					stop(entry.sourceSubscription);
					entry.sourceSubscription = undefined;
					const index = cache.indexOf(entry);
					if (index !== -1) cache.splice(index, 1);
				}, 3000);
			}
		};
	};
	cache.push(entry);
	return entry;
}

export function useSuspendingObservable<T>(
	getObservable: (() => InteropableObservable<T>) | InteropableObservable<T>,
	cacheKey: readonly unknown[],
): T;
export function useSuspendingObservable<T>(
	getObservable: (() => InteropableObservable<T>) | InteropableObservable<T>,
	cacheKey: readonly unknown[],
	slot: symbol | undefined,
): T;
export function useSuspendingObservable<T>(
	getObservable: (() => InteropableObservable<T>) | InteropableObservable<T>,
	...rest: [readonly unknown[], symbol?]
): T {
	const [args, slot] = splitSlot(rest);
	const entry = getEntry(getObservable, args[0] as readonly unknown[]);
	if (!entry.promise) {
		entry.promise = new Promise<T>((resolve, reject) => {
			let subscription: Subscription;
			subscription = entry.subscribe({
				next: (value) => {
					resolve(value);
					queueMicrotask(() => stop(subscription));
				},
				error: (error) => {
					reject(error);
					queueMicrotask(() => stop(subscription));
				},
			});
		});
	}

	const initialValue = use(entry.promise);
	const value = useRef(initialValue, subSlot(slot, 'suspending:value'));
	const error = useRef<unknown>(undefined, subSlot(slot, 'suspending:error'));
	const [, rerender] = useReducer(
		(count: number) => count + 1,
		0,
		subSlot(slot, 'suspending:update'),
	);
	value.current = entry.hasValue ? (entry.current as T) : initialValue;

	useEffect(
		() => {
			const subscription = entry.subscribe({
				next: (next) => {
					if (!Object.is(value.current, next)) {
						value.current = next;
						rerender(0);
					}
				},
				error: (nextError) => {
					error.current = nextError;
					rerender(0);
				},
			});
			return () => stop(subscription);
		},
		[entry],
		subSlot(slot, 'suspending:effect'),
	);

	if (error.current !== undefined) throw error.current;
	return value.current;
}
