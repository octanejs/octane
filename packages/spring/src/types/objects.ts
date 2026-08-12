import type { Any, Lookup } from './utils';
import type { FluidValue } from './fluid';
import type { SpringValue } from '../core/SpringValue';

/**
 * The set of `SpringValue` objects returned by a `useSpring` call (or similar).
 */
export type SpringValues<T extends Lookup = any> = [T] extends [Any]
	? Lookup<SpringValue<unknown> | undefined>
	: { [P in keyof T]: SpringWrap<T[P]> };

type SpringWrap<T> = [Exclude<T, FluidValue>, Extract<T, readonly any[]>] extends [
	object | void,
	never,
]
	? never
	: SpringValue<Exclude<T, FluidValue | void>> | Extract<T, void>;
