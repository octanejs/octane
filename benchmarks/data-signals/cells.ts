/**
 * The prototype the signal lanes read: each store read mirrored into a signal
 * cell of one data scope, holding the read's value. `read$(handle)` stands in
 * for a `store.read$(...)` that would return the cell itself.
 *
 * A store built on signals would keep its values in these cells; this mirror
 * keeps the store's copy too and forwards each notification with one `set`,
 * so it charges the signal lanes one extra call per changed read.
 */
import { createScope, type SignalHandle, type WritableSignal } from 'octane/signals';
import type { ReadHandle } from 'octane/data';

const cells = new WeakMap<ReadHandle<any>, WritableSignal<any>>();

export function read$<T>(handle: ReadHandle<T>): SignalHandle<T> {
	return cells.get(handle)!;
}

/** Mirror `handles`, outside any render. Returns the mirror's teardown. */
export function mirror(handles: ReadonlyArray<[string, ReadHandle<any>]>): () => void {
	const scope = createScope({ scopeKey: 'octane:data' });
	const stops = handles.map(([key, handle]) => {
		const cell$ = scope.signal$(key, handle.getSnapshot().value);
		cells.set(handle, cell$);
		return handle.subscribe(() => cell$.set(handle.getSnapshot().value));
	});
	return () => {
		for (const stop of stops) stop();
		scope.dispose();
	};
}
