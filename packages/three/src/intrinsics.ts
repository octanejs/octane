import type { ThreeElements as ThreeIntrinsicElements } from './core/catalogue.js';

export type {
	Args,
	Attach,
	ConstructorRepresentation,
	PrimitiveProps,
	ThreeElement,
	ThreeElements,
	ThreeKey,
	ThreeRef,
	ThreeToJSXElements,
} from './core/catalogue.js';

/** TypeScript resolves this namespace through the intrinsic jsx-runtime export. */
export namespace JSX {
	export interface IntrinsicElements extends ThreeIntrinsicElements {}
}
