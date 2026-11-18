'use client';
'use strong';

import { OctaneDevtoolsEventClient } from './client';
import { startBridge } from './bridge';
import { OctanePanel } from './panel/OctanePanel.tsrx';

/**
 * A TanStack Devtools plugin exposing live Octane runtime diagnostics. Add it to
 * `<TanStackDevtools plugins={[octaneDevtools()]} />`. Starts the app-side bridge
 * on first render; the bridge is a no-op unless the app was built with devtools
 * enabled (`octane({ devtools: true })`).
 */
export function octaneDevtools() {
	const client = new OctaneDevtoolsEventClient();
	let stop: (() => void) | null = null;
	// A panel failure stays inside the panel instead of reaching the app's boundary.
	const OctaneDevtoolsPanel = () => @{
		@try {
			<OctanePanel client={client} />
		} @catch (error) {
			<div class="odt-root">{'Octane DevTools failed: ' + String(error)}</div>
		}
	};
	return {
		id: 'octane',
		name: 'Octane',
		render: () => {
			if (stop === null) stop = startBridge(client);
			return OctaneDevtoolsPanel;
		},
	};
}
