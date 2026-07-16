declare module '*.tsrx' {
	export const App: () => unknown;
}

declare module 'octane/compiler/vite' {
	import type { Plugin } from 'vite';

	export function octane(options?: Record<string, unknown>): Plugin;
}
