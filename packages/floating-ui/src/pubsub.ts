// The tiny event emitter shared by useFloatingRootContext and FloatingTree. Kept
// in its own module so context.ts and tree.ts don't form an import cycle.
import type { FloatingEvents } from './types';

export function createPubSub(): FloatingEvents {
	const map = new Map<string, Set<(data: any) => void>>();
	return {
		emit(event: string, data: any) {
			map.get(event)?.forEach((listener) => listener(data));
		},
		on(event: string, listener: (data: any) => void) {
			if (!map.has(event)) {
				map.set(event, new Set());
			}
			map.get(event)!.add(listener);
		},
		off(event: string, listener: (data: any) => void) {
			map.get(event)?.delete(listener);
		},
	};
}
