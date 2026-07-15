declare module '*.tsrx' {
	import type { Component } from 'octane';
	const component: Component<Record<string, unknown>>;
	export { component as App };
}

declare module 'octane/compiler/vite' {
	import type { Plugin } from 'vite';
	export function octane(options?: Record<string, unknown>): Plugin;
}
