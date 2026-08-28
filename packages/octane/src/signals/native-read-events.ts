import { beginNativeBatch, endNativeBatch, type NativeBatchHooks } from './read-protocol.js';

interface NativeEventBatch {
	hooks: NativeBatchHooks | null;
	depth: number;
	closed: boolean;
}

let events: WeakMap<Event, NativeEventBatch> | null = null;

/** One graph batch covers the delegated handlers of one native event. */
export function beginNativeEventBatch(event: Event): NativeEventBatch | null {
	const existing = events?.get(event);
	if (existing !== undefined) {
		existing.depth++;
		return existing;
	}
	const hooks = beginNativeBatch();
	if (hooks === null) return null;
	const batch = { hooks, depth: 1, closed: false };
	(events ??= new WeakMap()).set(event, batch);
	return batch;
}

function finish(event: Event, batch: NativeEventBatch): void {
	if (batch.closed) return;
	batch.closed = true;
	if (events?.get(event) === batch) events.delete(event);
	const hooks = batch.hooks;
	batch.hooks = null;
	endNativeBatch(hooks);
}

export function endNativeEventBatch(
	event: Event,
	batch: NativeEventBatch | null,
	waitsForBubble: boolean,
	onError: (error: unknown) => void,
): void {
	if (batch === null || batch.closed || --batch.depth !== 0) return;
	if (!waitsForBubble) {
		finish(event, batch);
		return;
	}
	// Capture and bubble are separate native callbacks. Usually the bubble walk
	// closes this lease on the same stack. A native listener can stop propagation
	// below the delegation root, so mirror its existing capture-flush backstop.
	const fallback = () => {
		if (batch.depth !== 0 || batch.closed) return;
		try {
			finish(event, batch);
		} catch (error) {
			onError(error);
		}
	};
	const target = event.target as HTMLInputElement | null;
	const checkableChange =
		event.type === 'change' &&
		target?.localName === 'input' &&
		(target.type === 'checkbox' || target.type === 'radio');
	if (checkableChange) setTimeout(fallback, 0);
	else queueMicrotask(fallback);
}
