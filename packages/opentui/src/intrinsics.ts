import type { OpenTUIIntrinsicElements } from './types.js';
import type { UniversalKey, UniversalRenderable } from 'octane/universal';

export type * from './types.js';

/** TypeScript resolves this namespace through the renderer-local intrinsic entry point. */
export namespace JSX {
	export type Element = UniversalRenderable;
	export interface ElementChildrenAttribute {
		children: {};
	}
	export interface IntrinsicAttributes {
		key?: UniversalKey;
	}
	export interface IntrinsicElements extends OpenTUIIntrinsicElements {}
}
