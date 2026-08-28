import { createSubSlot } from 'octane';

export function splitSlot<T>(args: T[]): { args: T[]; slot: symbol | undefined } {
	const tail = args.at(-1);
	return typeof tail === 'symbol'
		? { args: args.slice(0, -1), slot: tail }
		: { args, slot: undefined };
}

export const subSlot = createSubSlot({ parentPrefix: '@octanejs/usehooks-ts:' });
