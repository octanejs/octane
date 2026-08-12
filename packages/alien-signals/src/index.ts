import {
	computed as alienComputed,
	effect as alienEffect,
	effectScope as alienEffectScope,
	signal as alienSignal,
} from 'alien-signals';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'octane';
import { splitSlot, subSlot } from './internal';

export interface ReadableSignal<T> {
	(): T;
}

export interface WritableSignal<T> extends ReadableSignal<T> {
	(value: T | ((previous: T) => T)): void;
}

export type DependencyList = readonly unknown[];

export function createSignal<T>(initialValue: T): WritableSignal<T> {
	const source = alienSignal(initialValue);
	return ((...args: [] | [T | ((previous: T) => T)]) => {
		if (args.length === 0) return source();
		const value = args[0];
		source(typeof value === 'function' ? (value as (previous: T) => T)(source()) : value);
	}) as WritableSignal<T>;
}

export function createComputed<T>(compute: () => T): ReadableSignal<T> {
	return alienComputed(compute);
}

export function createEffect<T>(run: () => T): () => void {
	return alienEffect(run);
}

export function createSignalScope<T>(callback: () => T): () => void {
	return alienEffectScope(callback);
}

export function useSignal<T>(
	signal: WritableSignal<T>,
): [T, (value: T | ((previous: T) => T)) => void];
export function useSignal<T>(
	signal: WritableSignal<T>,
	...rest: [slot?: symbol]
): [T, (value: T | ((previous: T) => T)) => void] {
	const [, slot] = splitSlot(rest);
	return [
		useSignalValueInternal<T>(signal, subSlot(slot, 'signal:value')),
		useSetSignalInternal(signal, subSlot(slot, 'signal:setter')),
	];
}

// OCTANE DIVERGENCE[alien-signals-readable-computed][types:alien-signals-adapted]
export function useSignalValue<T>(signal: ReadableSignal<T>): T;
export function useSignalValue<T>(signal: ReadableSignal<T>, ...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	return useSignalValueInternal(signal, slot);
}

function useSignalValueInternal<T>(signal: ReadableSignal<T>, slot: symbol | undefined): T {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			let initialRun = true;
			return createEffect(() => {
				signal();
				if (initialRun) {
					initialRun = false;
				} else {
					onStoreChange();
				}
			});
		},
		[signal],
		subSlot(slot, 'value:subscribe'),
	);
	const getSnapshot = useCallback(() => signal(), [signal], subSlot(slot, 'value:snapshot'));

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot, subSlot(slot, 'value:store'));
}

export function useSetSignal<T>(
	signal: WritableSignal<T>,
): (value: T | ((previous: T) => T)) => void;
export function useSetSignal<T>(
	signal: WritableSignal<T>,
	...rest: [slot?: symbol]
): (value: T | ((previous: T) => T)) => void {
	const [, slot] = splitSlot(rest);
	return useSetSignalInternal(signal, slot);
}

function useSetSignalInternal<T>(
	signal: WritableSignal<T>,
	slot: symbol | undefined,
): (value: T | ((previous: T) => T)) => void {
	return useCallback(
		(value: T | ((previous: T) => T)) => signal(value),
		[signal],
		subSlot(slot, 'setter'),
	);
}

export function useSignalEffect(run: () => void | (() => void)): void;
export function useSignalEffect(run: () => void | (() => void), ...rest: [slot?: symbol]): void {
	const [, slot] = splitSlot(rest);
	useEffect(
		() => {
			let cleanup: void | (() => void);
			const stop = createEffect(() => {
				cleanup?.();
				cleanup = run();
			});

			return () => {
				cleanup?.();
				cleanup = undefined;
				stop();
			};
		},
		[run],
		subSlot(slot, 'effect'),
	);
}

interface ScopeController {
	cancelled: boolean;
	current: (() => void) | undefined;
	disconnect: () => void;
	stop: () => void;
}

export function useSignalScope<T>(callback: () => T): () => void;
// OCTANE DIVERGENCE[alien-signals-use-signal-scope][runtime:5189801c40af28d9]
export function useSignalScope<T>(callback: () => T, ...rest: [slot?: symbol]): () => void {
	const [, slot] = splitSlot(rest);
	const controller = useMemo<ScopeController>(
		() => {
			const scope: ScopeController = {
				cancelled: false,
				current: undefined,
				disconnect: () => {
					const current = scope.current;
					scope.current = undefined;
					current?.();
				},
				stop: () => {
					scope.cancelled = true;
					scope.disconnect();
				},
			};
			return scope;
		},
		[],
		subSlot(slot, 'scope:controller'),
	);

	useEffect(
		() => {
			if (controller.cancelled) {
				return controller.disconnect;
			}
			const stopScope = createSignalScope(callback);
			if (controller.cancelled) {
				stopScope();
				return controller.disconnect;
			}
			controller.current = stopScope;
			return controller.disconnect;
		},
		[controller, callback],
		subSlot(slot, 'scope:effect'),
	);

	return controller.stop;
}

export function useComputed<T>(getter: () => T, deps: DependencyList): T;
export function useComputed<T>(getter: () => T, ...rest: [deps: DependencyList, slot?: symbol]): T {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList;
	const computed = useMemo(
		() => createComputed(getter),
		deps as unknown[],
		subSlot(slot, 'computed:memo'),
	);
	return useSignalValueInternal(computed, subSlot(slot, 'computed:value'));
}
