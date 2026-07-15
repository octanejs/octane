// TypeScript does not parse the TSRX file extension. Vite compiles these modules
// with Octane's compiler; this declaration keeps their imports visible to strict
// checking of the TypeScript entry point and support modules.
declare module '*.tsrx';

// The compiler entry point is JavaScript and intentionally has no declaration in
// the workspace source package. The example only relies on its Vite plugin shape.
declare module 'octane/compiler/vite' {
	import type { Plugin } from 'vite';

	export function octane(options?: Record<string, unknown>): Plugin;
}
