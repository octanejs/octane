import { state } from '@rx-state/core';
import type { DefaultedStateObservable, StateObservable, SUSPENSE } from '@rx-state/core';
import type { Observable } from 'rxjs';
import { splitSlot } from './internal.ts';
import { useStateObservable } from './useStateObservable.ts';

type AddStopArg<A extends unknown[]> = number extends A['length']
	? A
	: [...args: A, _stop?: undefined];
type Value<T> = Exclude<T, typeof SUSPENSE>;

export function bind<T>(observable: Observable<T>): [() => Value<T>, StateObservable<T>];
export function bind<T>(
	observable: Observable<T>,
	defaultValue: T,
): [() => Value<T>, DefaultedStateObservable<T>];
export function bind<A extends unknown[], T>(
	factory: (...args: A) => Observable<T>,
): [(...args: AddStopArg<A>) => Value<T>, (...args: AddStopArg<A>) => StateObservable<T>];
export function bind<A extends unknown[], T>(
	factory: (...args: A) => Observable<T>,
	defaultValue: T | ((...args: A) => T),
): [(...args: AddStopArg<A>) => Value<T>, (...args: AddStopArg<A>) => DefaultedStateObservable<T>];
export function bind(source: unknown, defaultValue?: unknown): readonly [unknown, unknown] {
	const hasDefault = arguments.length > 1;
	if (typeof source === 'function') {
		const bound = hasDefault
			? state(source as (...args: unknown[]) => Observable<unknown>, defaultValue)
			: state(source as (...args: unknown[]) => Observable<unknown>);
		// The manual provider adapter appends the call-site slot after every
		// authored argument, so a factory's final Symbol remains user data.
		const useBound = (...runtimeArgs: unknown[]) => {
			const [args, slot] = splitSlot(runtimeArgs);
			return useStateObservable(bound(...args), slot, args);
		};
		return [useBound, bound] as const;
	}
	const bound = hasDefault
		? state(source as Observable<unknown>, defaultValue)
		: state(source as Observable<unknown>);
	const useBound = (slot?: symbol) => useStateObservable(bound, slot);
	return [useBound, bound] as const;
}
