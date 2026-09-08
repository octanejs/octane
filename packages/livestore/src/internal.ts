import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ slotlessPrefix: '@octanejs/livestore:' });

export function splitSlot(
	args: unknown[],
	preserveSingleSymbol?: (value: symbol) => boolean,
): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot =
		typeof tail === 'symbol' && !(args.length === 1 && preserveSingleSymbol?.(tail))
			? tail
			: undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}
