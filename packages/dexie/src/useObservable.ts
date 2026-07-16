import { useDebugValue, useEffect, useMemo, useReducer, useRef } from 'octane';
import { splitSlot, subSlot } from './internal';

export interface InteropableObservable<T> {
	subscribe(
		onNext: (value: T) => unknown,
		onError?: (error: unknown) => unknown,
	): { unsubscribe(): unknown } | (() => unknown);
	getValue?(): T;
	hasValue?(): boolean;
}

type ObservableFactory<T> = () => InteropableObservable<T>;

function unsubscribe(subscription: { unsubscribe(): unknown } | (() => unknown)) {
	if (typeof subscription === 'function') subscription();
	else subscription.unsubscribe();
}

export function useObservable<T>(observable: InteropableObservable<T>): T | undefined;
export function useObservable<T, TDefault>(
	observable: InteropableObservable<T>,
	defaultResult: TDefault,
): T | TDefault;
export function useObservable<T>(
	observableFactory: ObservableFactory<T>,
	deps?: unknown[],
): T | undefined;
export function useObservable<T, TDefault>(
	observableFactory: ObservableFactory<T>,
	deps: unknown[],
	defaultResult: TDefault,
): T | TDefault;
export function useObservable<T, TDefault>(
	observableFactory: ObservableFactory<T>,
	deps: unknown[],
	defaultResult: TDefault | undefined,
	slot: symbol | undefined,
): T | TDefault | undefined;
export function useObservable<T, TDefault>(
	observableOrFactory: InteropableObservable<T> | ObservableFactory<T>,
	...rest: [unknown?, unknown?, symbol?]
): T | TDefault | undefined {
	const [args, slot] = splitSlot(rest);
	const deps = typeof observableOrFactory === 'function' ? ((args[0] as unknown[]) ?? []) : [];
	const defaultResult = (typeof observableOrFactory === 'function' ? args[1] : args[0]) as
		| TDefault
		| undefined;
	const monitor = useRef(
		{
			hasResult: false,
			result: defaultResult as T | TDefault | undefined,
			error: null as unknown,
		},
		subSlot(slot, 'observable:monitor'),
	);
	const [, triggerUpdate] = useReducer(
		(value: number) => value + 1,
		0,
		subSlot(slot, 'observable:update'),
	);
	const observable = useMemo(
		() => {
			const value =
				typeof observableOrFactory === 'function' ? observableOrFactory() : observableOrFactory;
			if (!value || typeof value.subscribe !== 'function') {
				throw new TypeError(
					typeof observableOrFactory === 'function'
						? 'Observable factory did not return a valid observable.'
						: 'Given argument was neither a valid observable nor a function.',
				);
			}
			if (
				!monitor.current.hasResult &&
				typeof window !== 'undefined' &&
				(typeof value.hasValue !== 'function' || value.hasValue())
			) {
				if (typeof value.getValue === 'function') {
					monitor.current.result = value.getValue();
					monitor.current.hasResult = true;
				} else {
					const subscription = value.subscribe((next) => {
						monitor.current.result = next;
						monitor.current.hasResult = true;
					});
					unsubscribe(subscription);
				}
			}
			return value;
		},
		deps,
		subSlot(slot, 'observable:memo'),
	);

	useDebugValue(monitor.current.result, subSlot(slot, 'observable:debug'));
	useEffect(
		() => {
			const subscription = observable.subscribe(
				(next) => {
					const current = monitor.current;
					if (current.error !== null || !Object.is(current.result, next)) {
						current.error = null;
						current.result = next;
						current.hasResult = true;
						triggerUpdate(0);
					}
				},
				(error) => {
					if (monitor.current.error !== error) {
						monitor.current.error = error;
						triggerUpdate(0);
					}
				},
			);
			return () => unsubscribe(subscription);
		},
		[observable],
		subSlot(slot, 'observable:effect'),
	);

	if (monitor.current.error !== null) throw monitor.current.error;
	return monitor.current.result;
}
