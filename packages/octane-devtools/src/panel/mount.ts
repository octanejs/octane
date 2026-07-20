/**
 * Panel bootstrap: a shadow-DOM host appended to `document.body`, an Octane
 * root inside it, and the bridge handshake. The container is marked internal
 * on the bridge BEFORE `createRoot`, so the panel's own root never appears in
 * the tree it inspects.
 */

import { createRoot, type Root } from 'octane';
import type { OctaneDevtools } from 'octane/devtools';
import { waitForDevtoolsHook } from '../snapshot.js';
import { clearHighlight } from './highlight.js';
import { Panel, type PanelOptions } from './panel.tsrx';
import { PANEL_CSS } from './styles.js';

export type { PanelOptions as DevtoolsPanelOptions } from './panel.tsrx';

export interface DevtoolsPanelHandle {
	unmount(): void;
}

/**
 * Layout-independent path prefix of this package's own sources, derived from
 * the compiler-registered source of the panel's root component — works for the
 * monorepo (`…/packages/octane-devtools/src/panel/panel.tsrx`) and installed
 * layouts alike. Null when the bridge has no registration (callers then fall
 * back to a substring heuristic).
 */
export function getPanelSourcePrefix(hook: OctaneDevtools): string | null {
	try {
		const source = hook.getComponentSource(Panel);
		if (source === null) return null;
		const index = source.file.lastIndexOf('/src/');
		return index > 0 ? source.file.slice(0, index) : null;
	} catch {
		return null;
	}
}

/**
 * Mount the devtools panel UI. Returns null outside a DOM environment. The
 * panel renders once the `octane/devtools` bridge connects; if it never does
 * (devtools not enabled for this page), nothing renders and one console.info
 * explains why.
 */
export function mountDevtoolsPanel(options?: PanelOptions): DevtoolsPanelHandle | null {
	if (typeof document === 'undefined') return null;

	const host = document.createElement('div');
	host.setAttribute('data-octane-devtools-panel', '');
	const shadow = host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = PANEL_CSS;
	shadow.appendChild(style);
	const container = document.createElement('div');
	shadow.appendChild(container);
	document.body.appendChild(host);

	let root: Root | null = null;
	let disposed = false;

	waitForDevtoolsHook()
		.then((hook) => {
			if (disposed) return;
			// CRITICAL ORDER: exclude the panel's container from the inspected
			// tree before its root registers with the runtime.
			hook.markContainerInternal(container);
			root = createRoot(container);
			root.render(Panel, { hook, options });
		})
		.catch(() => {
			console.info(
				'[octane-devtools] bridge not found — panel not mounted. Enable it with octane({ devtools: true }) in vite.config and reload the dev server.',
			);
		});

	return {
		unmount() {
			disposed = true;
			clearHighlight();
			root?.unmount();
			root = null;
			host.remove();
		},
	};
}
