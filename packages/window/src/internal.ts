// Octane appends a compiler-owned hook slot to public hook calls. Binding
// internals derive stable child slots so composed hooks and sibling
// virtualizers never share state.
import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ slotlessPrefix: '@octanejs/window:' });

export function getSlot(args: unknown[]): symbol | undefined {
	const slot = args.at(-1);
	return typeof slot === 'symbol' ? slot : undefined;
}

export function getPublicArgument(args: unknown[], index: number): unknown {
	const publicLength = getSlot(args) === undefined ? args.length : args.length - 1;
	return index < publicLength ? args[index] : undefined;
}
