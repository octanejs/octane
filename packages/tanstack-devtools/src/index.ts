'use client';

// OCTANE DIVERGENCE[core-version][conformance:tanstack-devtools-core-version]
// OCTANE DIVERGENCE[octane-type-names][conformance:tanstack-devtools-octane-type-names]
import * as Devtools from './devtools.tsrx';

export const TanStackDevtools = Devtools.TanStackDevtools;

export type {
	TanStackDevtoolsOctanePlugin,
	TanStackDevtoolsOctaneInit,
} from './devtools.tsrx';

// OCTANE DIVERGENCE[extra-core-reexports][conformance:tanstack-devtools-extra-core-reexports]
// Re-export the framework-agnostic core surface so consumers don't need a direct
// dependency on @tanstack/devtools for plugin authoring types.
export {
	PLUGIN_CONTAINER_ID,
	PLUGIN_TITLE_CONTAINER_ID,
	TanStackDevtoolsCore,
} from '@tanstack/devtools';
export type {
	ClientEventBusConfig,
	TanStackDevtoolsConfig,
	TanStackDevtoolsInit,
	TanStackDevtoolsPlugin,
	TanStackDevtoolsPluginProps,
	TanStackDevtoolsTheme,
} from '@tanstack/devtools';
