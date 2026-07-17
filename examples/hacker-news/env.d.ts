/// <reference types="vite/client" />

declare module '@octanejs/stylex/vite' {
	import type { Plugin } from 'vite';

	export function stylex(options?: Record<string, unknown>): Plugin & {
		api: { getCss(): string };
	};
}

declare module '*.tsrx';

declare namespace JSX {
	interface ElementChildrenAttribute {
		children: unknown;
	}

	interface IntrinsicAttributes {
		key?: string | number;
	}

	interface IntrinsicElements {
		[tag: string]: any;
	}
}
