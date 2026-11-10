// When `useLayoutSnapshot` measures (#2309). Apps that never call this module
// keep the default, measuring at the end of each commit, and do not ship the
// layout queue.
import { flushLayoutSync, readLayout, writeLayout } from './layout-phases.js';
import { setFrameLayoutSnapshots } from './runtime/engine.js';

/** When `useLayoutSnapshot` measures. */
export type LayoutSnapshotTiming = 'commit' | 'frame';

/**
 * Choose when every `useLayoutSnapshot` in the document measures.
 *
 * - `'commit'` (the default) measures at the end of each commit, so a changed
 *   snapshot has rendered when `flushSync` returns.
 * - `'frame'` measures in the next frame's `readLayout` pass, together with
 *   any other queued reads. Changed snapshots commit in the following
 *   `writeLayout` pass, and the measurements that commit queues run in a later
 *   pass of the same frame. Use it on hosts whose layout is asynchronous, or
 *   to keep snapshots out of commits that `flushSync` waits for.
 *
 * Snapshots already waiting for a measurement switch with the setting.
 */
export function setLayoutSnapshotTiming(timing: LayoutSnapshotTiming): void {
	setFrameLayoutSnapshots(
		timing === 'frame' ? { read: readLayout, write: writeLayout, flush: flushLayoutSync } : null,
	);
}
