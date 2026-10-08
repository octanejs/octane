import type { ThreeKey, ThreeElements as ThreeIntrinsicElements } from './core/catalogue.js';

export type {
	Args,
	Attach,
	AttachFnType,
	AttachType,
	Color,
	ConstructorRepresentation,
	ElementProps,
	Euler,
	EventProps,
	Layers,
	MathProps,
	MathRepresentation,
	MathType,
	MathTypes,
	Matrix3,
	Matrix4,
	PrimitiveProps,
	Quaternion,
	RaycastableRepresentation,
	ReactProps,
	ThreeElement,
	ThreeElements,
	ThreeKey,
	ThreeRef,
	ThreeToJSXElements,
	Vector2,
	Vector3,
	Vector4,
	VectorRepresentation,
} from './core/catalogue.js';

/** TypeScript resolves this namespace through the intrinsic jsx-runtime export. */
export namespace JSX {
	export interface IntrinsicElements extends ThreeIntrinsicElements {}
	export interface ElementChildrenAttribute {
		children: {};
	}
	// Every element accepts a key, components included (a keyed `@for` row
	// places its key on the row's root).
	export interface IntrinsicAttributes {
		key?: ThreeKey;
	}
}
