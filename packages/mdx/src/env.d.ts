// @types/mdx (pulled in via @mdx-js/mdx's public types) requires a GLOBAL
// `JSX` namespace, which octane deliberately does not declare in its runtime
// types (JSX typing lives in the compiler's volar layer, per-`.tsrx` file).
// Minimal ambient declarations so this package typechecks standalone — no
// octane code reads these.
declare namespace JSX {
	type Element = unknown;

	interface ElementClass {
		[name: string]: unknown;
	}

	interface IntrinsicElements {
		[name: string]: Record<string, unknown>;
	}
}
