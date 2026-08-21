// Slot mechanics shared by the binding's plain-`.ts` hooks (same helper as
// @octanejs/tanstack-query). The octane compiler injects a per-call-site Symbol slot into
// every hook call in compiled files; these binding files are NOT compiled, so a
// hook here receives the caller's slot as its trailing argument and derives a
// distinct sub-slot for each base hook it composes.

// Memoized: subSlot runs on EVERY hook call every render; the cache returns the
// identical Symbol.for-interned value without the concat + registry lookup.
import { createSubSlot } from 'octane';

// A stable tag-only symbol keeps sibling base hooks distinct when an
// uncompiled caller relies on the ambient withSlot path.
export const subSlot = createSubSlot({ slotlessPrefix: ':' });

// Split the compiler-injected trailing slot off a hook's runtime args, returning
// the user args (everything before it) and the slot.
export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}
