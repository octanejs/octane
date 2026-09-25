// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
// Slot mechanics for @octanejs/blocknote's plain-`.ts` hooks. The Octane
// compiler appends a per-call-site Symbol as the final argument of every
// custom-hook call; these helpers separate it from the public arguments and
// derive one stable sub-slot per base hook a binding hook composes.

import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({
	tagPrefix: ':@octanejs/blocknote:',
	slotlessPrefix: '@octanejs/blocknote:',
});

/** Split a compiler-owned trailing slot from a custom hook's user arguments. */
export function splitSlot(args: readonly unknown[]): [readonly unknown[], symbol | undefined] {
	const tail = args.at(-1);
	return typeof tail === 'symbol' ? [args.slice(0, -1), tail] : [args, undefined];
}
