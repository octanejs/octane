import { Observable } from 'rxjs';
import { SUSPENSE } from '@rx-state/core';
import { bind } from '../bind.ts';

type SubstractTuples<A1, A2> = A2 extends [unknown, ...infer Rest2]
	? A1 extends [unknown, ...infer Rest1]
		? SubstractTuples<Rest1, Rest2>
		: []
	: A1;

const execSelf = <T>(fn: () => T) => fn();

/**
 * Returns a version of bind where its hook will have the first parameters bound
 * the results of the provided functions
 *
 * @param {...React.Context} context - The React.Context that should be bound to the hook.
 */
export function contextBinder<
	A extends (() => any)[],
	OT extends {
		[K in keyof A]: A[K] extends () => infer V ? V : unknown;
	},
>(
	...args: A
): <AA extends any[], T, ARGS extends [...OT, ...AA]>(
	getObservable: (...args: ARGS) => Observable<T>,
	defaultValue?: T | undefined,
) => [
	(...args: SubstractTuples<ARGS, OT>) => Exclude<T, typeof SUSPENSE>,
	(...args: ARGS) => Observable<T>,
];
export function contextBinder(...args: any[]) {
	const useArgs = () => args.map(execSelf);
	return function () {
		const [hook, getter] = bind.apply(null, arguments as any) as any;
		return [(...args: any[]) => (hook as any)(...useArgs(), ...args), getter];
	} as any;
}
