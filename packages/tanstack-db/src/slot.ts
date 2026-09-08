import { subSlot } from 'octane';

export { subSlot };

/** Split a compiler-injected trailing slot symbol off hook runtime args. */
export function splitTrailingSlot<T extends Array<unknown>>(
	args: T,
): [Array<unknown>, symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === `symbol` ? tail : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}
