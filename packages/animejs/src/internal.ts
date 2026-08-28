import { createSubSlot } from 'octane';

export function splitSlot<T>(args: T[]): [T[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

export const subSlot = createSubSlot({ tagPrefix: ':animejs:' });
