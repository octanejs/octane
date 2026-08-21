// Slot mechanics for the binding's plain-`.ts` hooks. Octane injects a
// per-call-site Symbol into calls made by compiled components; the binding
// forwards that symbol and derives a distinct sub-slot for each hook it
// composes. This package declares `octane.hookSlots.manual` for `src`, so the
// compiler's plain-`.ts` slotting pass skips these modules and the forwarding
// below is the only thing that keeps two call sites of the same hook apart.
import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ slotlessPrefix: '@octanejs/xstate-store:' });

export function splitSlot(args: unknown[]): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}
