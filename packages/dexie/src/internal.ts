import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ slotlessPrefix: ':' });

export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}
