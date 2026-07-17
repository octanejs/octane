'use client';

export { TanStackDevtools } from './devtools.tsrx';
export type { TanStackDevtoolsOctanePlugin, TanStackDevtoolsOctaneInit } from './devtools.tsrx';

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
