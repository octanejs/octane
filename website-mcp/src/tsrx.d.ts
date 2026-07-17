// Ambient declaration for `.tsrx` modules so TypeScript can resolve imports
// from .ts entry files (the octane Vite plugin compiles them at build time).
declare module '*.tsrx';

// JSX is not used directly — `.tsrx` files have their own parser. The ambient
// `any` keeps incidental TSC passes over `.tsrx` from drowning in implicit-any
// noise about <div>, <span>, etc.
declare namespace JSX {
	interface IntrinsicElements {
		[tag: string]: any;
	}
}
