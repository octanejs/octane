import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ tagPrefix: ':rxjs:', slotlessPrefix: ':rxjs:' });

export function splitSlot(args: unknown[]): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}
