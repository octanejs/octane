/**
 * Renderer-free activation for an independent island whose only child is a
 * zero-argument `'use dom bindings'` view. The compiler selects this activator
 * only when the view's own module proves that shape; every other island keeps
 * the renderer activator. Importing this module never loads the renderer.
 */
import { formatClientError } from './error-codes.client.generated.js';
import type { BindingSource } from './dom-bindings.js';
import type { BindingRange, CompiledBindingProgram } from './dom-binding-program.js';
import { parseBindingMarker } from './dom-binding-protocol.js';
import { isHydrationSelectionIntentCurrent } from './hydration/event-capture.js';
import type {
	IndependentHydrateActivationContext,
	IndependentHydrateActivator,
} from './hydration/independent-island.js';
import { cloneHydrationReplayEvent } from './hydration/replay-event.js';
import { HYDRATION_START } from './hydration-markers.js';
import { captureSignalOwner } from './signals/owner-context.js';
import type { SignalRendererOwnerIdentity } from './signals/types.js';
import { rendererRangeClose } from './stream-protocol.js';

// A zero-argument view reads module signals; its source snapshot is unused.
const NO_PROPS: BindingSource<undefined> = {
	getSnapshot: () => undefined,
	subscribe: () => () => {},
};

/**
 * The server wraps the view in the island's frame ranges. Only those plain
 * opens and renderer-owned scripts may precede the view's own range.
 */
function islandRoot(
	element: Element,
	program: CompiledBindingProgram<undefined>,
): Element | BindingRange {
	for (let node = element.firstChild; node !== null; node = node.nextSibling) {
		if (node.nodeType === 8) {
			const data = (node as Comment).data;
			const marker = parseBindingMarker(data);
			if (marker?.kind === 'root' && marker.id === program.id) {
				const end = rendererRangeClose(node);
				if (end !== null) return { start: node as Comment, end };
				break;
			}
			if (data === HYDRATION_START) continue;
			break;
		}
		if (node.nodeType === 1) {
			const child = node as Element;
			if (child.localName === 'script') continue;
			if (child.getAttribute('data-octane-bindings') === program.id) return child;
			break;
		}
		if (node.nodeType !== 3 || (node as Text).data.trim() !== '') break;
	}
	throw new Error(formatClientError(286));
}

/** @internal Imported only by a compiler-selected island artifact. */
export function __createBindingIslandActivator(
	program: CompiledBindingProgram<undefined>,
): IndependentHydrateActivator {
	return (context: IndependentHydrateActivationContext) => {
		const { element, signalOwner } = context;
		const root = islandRoot(element, program);
		// Module signals belong to the document; an island root identity only
		// wraps that owner for renderer-created instance scopes.
		const owner =
			(signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner;
		const adopt = () => program.adopt(root, program, NO_PROPS);
		const handle = owner === undefined ? adopt() : captureSignalOwner(owner)(adopt);
		// Adoption publishes synchronously, so captured input replays against the
		// live listeners immediately, in its original order.
		for (const replay of context.intents) {
			if (replay.earlyBinding || !isHydrationSelectionIntentCurrent(replay)) continue;
			const target = replay.event.target as Node | null;
			if (target === null || target.nodeType !== 1 || !element.contains(target)) continue;
			target.dispatchEvent(cloneHydrationReplayEvent(replay.event, target as Element));
		}
		return { unmount: () => handle.dispose() };
	};
}
