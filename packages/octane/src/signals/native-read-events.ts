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
	// below the delegation root, so mirror the runtime's capture-flush backstop
	// (finishCaptureDispatch). The browser checkpoints microtasks after every
	// listener of an event it dispatches itself, so a microtask would publish the
	// capture handlers' writes before the target and bubble handlers run: a
	// subscribed component would re-render a controlled input to its old value
	// before onInput could read the user's edit. Only a task runs after the whole
	// trusted propagation. A script-dispatched event keeps the dispatching script
	// on the stack, so its microtask still waits for the bubble segment.
	const fallback = () => {
		if (batch.depth !== 0 || batch.closed) return;
		try {
			finish(event, batch);
		} catch (error) {
			onError(error);
		}
	};
	if (event.isTrusted) setTimeout(fallback, 0);
	else queueMicrotask(fallback);
}
