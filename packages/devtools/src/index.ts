/** @jsxImportSource octane */
'use client';

import { createElement } from 'octane';
import { OctaneDevtoolsEventClient } from './client';
import { startBridge } from './bridge';
import { OctanePanel } from './panel/OctanePanel.tsrx';

export { OctaneDevtoolsEventClient } from './client';
export { startBridge } from './bridge';
export { ComponentsTab } from './panel/ComponentsTab.tsrx';
export { ProfilerTab } from './panel/ProfilerTab.tsrx';
export { TransitionsTab } from './panel/TransitionsTab.tsrx';
export { PerfModelTab } from './panel/PerfModelTab.tsrx';
export { OctanePanel } from './panel/OctanePanel.tsrx';
export type { TreeSnapshot, NodeDetail, WireTreeNode } from './client';

/**
 * A TanStack Devtools plugin exposing live Octane runtime diagnostics. Add it to
 * `<TanStackDevtools plugins={[octaneDevtools()]} />`. Starts the app-side bridge
 * on first render; the bridge is a no-op unless the app was built with devtools
 * enabled (`octane({ devtools: true })`).
 */
export function octaneDevtools() {
	const client = new OctaneDevtoolsEventClient();
	let stop: (() => void) | null = null;
	return {
		id: 'octane',
		name: 'Octane',
		render: () => {
			if (stop === null) stop = startBridge(client);
			return createElement(OctanePanel, { client });
		},
	};
}
