/**
 * Panel plugin registry: lets bindings and applications add their own tabs to
 * the devtools panel (a query-cache inspector for `@octanejs/tanstack-query`,
 * a store viewer for `@octanejs/zustand`, …). A plugin contributes a label
 * and an Octane component; the panel renders the component as the tab body
 * with the live bridge as its prop. Registration is order-preserving,
 * idempotent by id (re-registering replaces in place — HMR-friendly), and
 * observable, so plugins registered after the panel mounted still appear.
 */

import type { OctaneDevtools } from 'octane/devtools';

export interface DevtoolsPanelPluginProps {
	/** The live `octane/devtools` bridge the panel itself uses. */
	hook: OctaneDevtools;
}

export interface DevtoolsPanelPlugin {
	/** Unique, stable identifier (namespace it: `'tanstack-query'`). */
	id: string;
	/** Tab label shown in the panel's tab bar. */
	label: string;
	/**
	 * The tab body — an Octane component (any function usable at a `<C/>`
	 * site). It renders inside the panel's shadow root while its tab is
	 * active and receives {@link DevtoolsPanelPluginProps}.
	 */
	component: (props: DevtoolsPanelPluginProps, ...rest: never[]) => unknown;
}

const plugins: DevtoolsPanelPlugin[] = [];
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// A faulty subscriber must not break other panels/plugins.
		}
	}
}

/**
 * Register a panel tab plugin. Re-registering an id replaces that plugin in
 * place. Returns an unregister function (a stale unregister — after the id
 * was re-registered by someone else — is a no-op).
 */
export function registerDevtoolsPanelPlugin(plugin: DevtoolsPanelPlugin): () => void {
	if (
		plugin === null ||
		typeof plugin !== 'object' ||
		typeof plugin.id !== 'string' ||
		plugin.id === '' ||
		typeof plugin.label !== 'string' ||
		plugin.label === '' ||
		typeof plugin.component !== 'function'
	) {
		throw new TypeError(
			'registerDevtoolsPanelPlugin requires { id: string, label: string, component: Function }.',
		);
	}
	const existing = plugins.findIndex((entry) => entry.id === plugin.id);
	if (existing >= 0) plugins[existing] = plugin;
	else plugins.push(plugin);
	notify();
	return () => {
		const index = plugins.indexOf(plugin);
		if (index < 0) return;
		plugins.splice(index, 1);
		notify();
	};
}

/** The currently registered plugins, in registration order (a fresh array). */
export function getDevtoolsPanelPlugins(): DevtoolsPanelPlugin[] {
	return plugins.slice();
}

/** Subscribe to registry changes. Returns an unsubscribe function. */
export function subscribeDevtoolsPanelPlugins(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
