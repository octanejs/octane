// Ported verbatim from .base-ui/packages/react/src/floating-ui-react/components/FloatingTreeStore.ts.
// Backing store for `FloatingTree` — a flat list of nodes + an event bus for parent/child popup
// communication (nested dismiss, nested hover). Pure.
import type { FloatingNodeType, FloatingEvents } from './types';
import { createEventEmitter } from './createEventEmitter';

export class FloatingTreeStore {
	readonly nodesRef: { current: Array<FloatingNodeType> } = { current: [] };

	readonly events: FloatingEvents = createEventEmitter();

	addNode(node: FloatingNodeType) {
		this.nodesRef.current.push(node);
	}

	removeNode(node: FloatingNodeType) {
		const index = this.nodesRef.current.findIndex((n) => n === node);
		if (index !== -1) {
			this.nodesRef.current.splice(index, 1);
		}
	}
}
