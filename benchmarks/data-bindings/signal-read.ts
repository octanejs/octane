/**
 * The `signals` lane: a store read reported to the renderer as a native signal
 * read, as #2410 shipped it and #2429 removed it. The renderer subscribes the
 * component that read, so the row uses no hook slot.
 */
import { enableNativeReadCollection, runUrgent } from '../../packages/octane/src/runtime.ts';
import {
	reportNativeRead,
	type NativeReadSource,
} from '../../packages/octane/src/signals/read-protocol.ts';
import type { ReadHandle } from 'octane/data';

interface Observed {
	readonly source: NativeReadSource;
	last: unknown;
	version: number;
}
const observed = new WeakMap<ReadHandle<unknown>, Observed>();
const call = (fn: () => void) => fn();

/** Turn read collection on around every component render, as importing #2410's binding did. */
export function enableSignalReads(): void {
	enableNativeReadCollection(1);
}

/** Read a handle's value as a native signal read. */
export function readSignal<T>(handle: ReadHandle<T>): T {
	let entry = observed.get(handle);
	if (!entry) {
		const created: Observed = {
			source: {
				getVersion() {
					const snapshot = handle.getSnapshot();
					if (snapshot !== created.last) {
						created.last = snapshot;
						created.version++;
					}
					return created.version;
				},
				subscribe: (notify) => handle.subscribe(() => runUrgent(call, notify)),
			},
			last: handle.getSnapshot(),
			version: 0,
		};
		observed.set(handle, (entry = created));
	}
	reportNativeRead(entry.source, entry.source.getVersion());
	return handle.getSnapshot().value as T;
}
