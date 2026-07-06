// Ambient declaration for `.tsrx` modules so TypeScript can resolve imports
// from .ts entry files (the octane Vite plugin compiles them at build time).
declare module '*.tsrx';

// `.mdx` documents compile (via @octanejs/mdx) to octane component modules with
// a default export and an optional `frontmatter` const.
declare module '*.mdx' {
	const MDXContent: (props?: Record<string, unknown>) => unknown;
	export default MDXContent;
	export const frontmatter: Record<string, unknown>;
}

// (Asset imports like the logo `.svg` are typed by vite/client.)

// JSX is not used directly — `.tsrx` files have their own parser. The ambient
// `any` keeps incidental TSC passes over `.tsrx` from drowning in implicit-any
// noise about <div>, <span>, etc.
declare namespace JSX {
	interface IntrinsicElements {
		[tag: string]: any;
	}
}
