/** The data store's Octane binding for the client runtime. See octane-binding.ts. */
// Relative, like the package's other entries, so the built entry resolves the
// same runtime module rather than the package's own source export.
import { createContext, createElement, use, useCallback, useSyncExternalStore } from '../index.js';
import { enableNativeReadCollection, runUrgent } from '../runtime.js';
import { reportNativeRead, type NativeReadSource } from '../signals/read-protocol.js';
import { createOctaneDataBinding } from './octane-binding.js';
import type { ReadHandle } from './store.js';

// Reads are collected around each component's render from the first render on,
// so collection must be on before any component that imports this renders.
enableNativeReadCollection(1);

interface Observed {
	readonly source: NativeReadSource;
	last: unknown;
	version: number;
}
const observed = new WeakMap<ReadHandle<unknown>, Observed>();

const call = (fn: () => void) => fn();

/** A store read as a native read source: its version moves when its snapshot does. */
function observe(handle: ReadHandle<unknown>): void {
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
				// A store change is urgent, as useSyncExternalStore's is: a write's
				// optimistic edit must not wait for the transition that made it.
				subscribe: (notify) => handle.subscribe(() => runUrgent(call, notify)),
			},
			last: handle.getSnapshot(),
			version: 0,
		};
		observed.set(handle, (entry = created));
	}
	reportNativeRead(entry.source, entry.source.getVersion());
}

export const { DataProvider, useDataStore, useRead, useReadState, useWrite } =
	createOctaneDataBinding({
		createContext,
		createElement,
		use,
		useCallback,
		useSyncExternalStore,
		observe,
	});
