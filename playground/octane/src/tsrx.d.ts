// Ambient declaration for `.tsrx` modules so TypeScript can resolve imports
// from .ts entry files. At runtime, .tsrx files are transformed by the
// octane Vite plugin (octane/compiler/vite) into ES modules whose
// exports are component functions.
declare module '*.tsrx';

// Vite's `?raw` suffix returns the file's text. The catalog imports demo
// sources this way so the Source tab always shows the file on disk.
declare module '*?raw' {
	const source: string;
	export default source;
}

// JSX is not used directly — `.tsrx` files have their own parser. The
// ambient `any` opens up JSX intrinsic types so any incidental TSC-side
// type-check of a `.tsrx` file doesn't drown the editor in implicit-any
// noise about <div>, <span>, etc.
declare namespace JSX {
	interface IntrinsicElements {
		[tag: string]: any;
	}
}
