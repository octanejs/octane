// Vite compiles TSRX modules with Octane's compiler. TypeScript does not parse
// that extension, so strict support-code checking uses this import declaration.
declare module '*.tsrx';

declare module 'octane/compiler/vite' {
	import type { Plugin } from 'vite';

	export function octane(options?: Record<string, unknown>): Plugin;
}
