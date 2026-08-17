export function splitSlot<T extends unknown[]>(args: T): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	if (typeof tail === 'symbol') return [args.slice(0, -1), tail];
	return [args, undefined];
}

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot === undefined ? undefined : Symbol.for(`${slot.description ?? ''}:xstate:${tag}`);
}
