/**
 * Browser auto-mount entry. The Vite metaframework injects a module that calls
 * `mountOctaneDevtools()` in dev when `devtools: true`; apps without the
 * plugin can call it from their own client entry instead.
 */

import {
	mountDevtoolsPanel,
	type DevtoolsPanelHandle,
	type DevtoolsPanelOptions,
} from './panel/mount.js';

let mounted: DevtoolsPanelHandle | null = null;

/**
 * Idempotently mount the devtools panel once the document is available.
 * Unmounting through the returned handle clears the cache, so a later call
 * mounts a fresh panel instead of returning the dead handle.
 */
export function mountOctaneDevtools(options?: DevtoolsPanelOptions): DevtoolsPanelHandle | null {
	if (typeof document === 'undefined') return null;
	if (mounted !== null) return mounted;
	const handle = mountDevtoolsPanel(options);
	if (handle === null) return null;
	mounted = {
		unmount() {
			mounted = null;
			handle.unmount();
		},
	};
	return mounted;
}
