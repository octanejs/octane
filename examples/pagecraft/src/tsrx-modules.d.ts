declare module '*.tsrx';

declare module 'octane/compiler/vite' {
	import type { Plugin } from 'vite';

	export function octane(options?: Record<string, unknown>): Plugin;
}
