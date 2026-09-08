// Slot mechanics for @octanejs/tiptap's plain-`.ts` hooks. The Octane
// compiler injects a per-call-site Symbol as the final argument of every
// custom-hook call. Binding hooks split that argument from their public
// options and derive one stable sub-slot for each base hook they compose.

import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({
	tagPrefix: ':@octanejs/tiptap:',
	slotlessPrefix: '@octanejs/tiptap:',
});

/** Split a compiler-owned trailing slot from a custom hook's user arguments. */
export function splitSlot(args: readonly unknown[]): [readonly unknown[], symbol | undefined] {
	const tail = args.at(-1);
	return typeof tail === 'symbol' ? [args.slice(0, -1), tail] : [args, undefined];
}
