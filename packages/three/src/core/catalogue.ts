/**
 * Three constructor catalogue and component-form `extend` support.
 *
 * Adapted from React Three Fiber v9.6.1:
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/reconciler.tsx#L138-L190
 */
import * as THREE from 'three';
import {
	defineUniversalComponent,
	type UniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
} from 'octane/universal';

export const THREE_RENDERER_ID = 'three';

export type ConstructorRepresentation<T = unknown> = new (...args: any[]) => T;

export interface Catalogue {
	[name: string]: ConstructorRepresentation;
}

export type Args<T> = T extends ConstructorRepresentation
	? T extends typeof THREE.Color
		? [r: number, g: number, b: number] | [color: THREE.ColorRepresentation]
		: ConstructorParameters<T>
	: unknown[];

type IsOptional<T> = undefined extends T ? true : false;
type IsAllOptional<T extends readonly unknown[]> = T extends readonly [infer First, ...infer Rest]
	? IsOptional<First> extends true
		? IsAllOptional<Rest>
		: false
	: true;

type ArgsProp<T extends ConstructorRepresentation> =
	IsAllOptional<ConstructorParameters<T>> extends true ? { args?: Args<T> } : { args: Args<T> };

export type ThreeAttachFunction<T = unknown> = (parent: unknown, self: T) => void | (() => void);

export type Attach<T = unknown> = string | ThreeAttachFunction<T>;
export type ThreeKey = string | number | symbol | bigint;

export type ThreeRef<T> =
	| ((value: T | null) => void | (() => void))
	| { current: T | null }
	| readonly ThreeRef<T>[];

export interface ThreeInstanceProps<T = unknown> {
	attach?: Attach<T>;
	children?: unknown;
	dispose?: null;
	key?: ThreeKey;
	onUpdate?: (self: T) => void;
	ref?: ThreeRef<T>;
}

/** R3F-compatible logical instance props, separate from authored JSX props. */
export type InstanceProps<T = any, P = any> = (P extends ConstructorRepresentation
	? ArgsProp<P>
	: { args: unknown[] }) & {
	object?: T;
	dispose?: null;
	attach?: Attach<T>;
	onUpdate?: (self: T) => void;
};

type NonFunctionKeys<T> = {
	[K in keyof T]-?: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];

type Properties<T> = Pick<T, NonFunctionKeys<T>>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] | Readonly<T[K]> };
type Overwrite<T, U> = Omit<T, keyof U> & U;

export interface MathRepresentation {
	set(...args: number[]): unknown;
}

export interface VectorRepresentation extends MathRepresentation {
	setScalar(value: number): unknown;
}

export type MathTypes = MathRepresentation | THREE.Euler | THREE.Color;
type MutableOrReadonlyParameters<T extends (...args: any[]) => any> =
	| Parameters<T>
	| Readonly<Parameters<T>>;

export type MathType<T extends MathTypes> = T extends THREE.Color
	? Args<typeof THREE.Color> | THREE.ColorRepresentation
	: T extends VectorRepresentation | THREE.Layers | THREE.Euler
		? T | MutableOrReadonlyParameters<T['set']> | number
		: T | MutableOrReadonlyParameters<T['set']>;

type MathProps<T> = {
	[K in keyof T as T[K] extends MathTypes ? K : never]: T[K] extends MathTypes
		? MathType<T[K]>
		: never;
};

export type ThreeElement<T extends ConstructorRepresentation> = Mutable<
	Overwrite<
		Partial<Overwrite<Properties<InstanceType<T>>, MathProps<InstanceType<T>>>>,
		ArgsProp<T> & ThreeInstanceProps<InstanceType<T>>
	>
>;

export type ThreeToElements<T extends Record<string, unknown>> = {
	[K in keyof T & string as Uncapitalize<K>]: T[K] extends ConstructorRepresentation
		? ThreeElement<T[K]>
		: never;
};

export type ThreeToJSXElements<T extends Record<string, unknown>> = ThreeToElements<T>;

type ThreeNamespaceElements = ThreeToElements<typeof THREE>;

export type PrimitiveProps<T extends object = Record<string, unknown>> = Partial<Properties<T>> &
	ThreeInstanceProps<T> & {
		args?: never;
		object: T;
	};

export interface ThreeElements extends Omit<
	ThreeNamespaceElements,
	'audio' | 'source' | 'line' | 'path'
> {
	primitive: PrimitiveProps<any>;
	threeAudio: ThreeNamespaceElements['audio'];
	threeSource: ThreeNamespaceElements['source'];
	threeLine: ThreeNamespaceElements['line'];
	threePath: ThreeNamespaceElements['path'];
}

const catalogue: Catalogue = Object.create(null);
const constructorComponents = new WeakMap<
	ConstructorRepresentation,
	UniversalComponent<Record<string, unknown>>
>();
let nextExtendedType = 0;
let namespaceRegistered = false;

const PREFIX_REGEX = /^three(?=[A-Z])/;

function toPascalCase(type: string): string {
	return type.length === 0 ? type : `${type[0].toUpperCase()}${type.slice(1)}`;
}

/** Register the built-in Three namespace once, at driver creation time. */
export function registerThreeNamespace(): void {
	if (namespaceRegistered) return;
	namespaceRegistered = true;
	Object.assign(catalogue, THREE);
}

/** Resolve conflicting `threeLine`-style host names without shadowing explicit extensions. */
export function normalizeThreeType(type: string): string {
	return Object.hasOwn(catalogue, toPascalCase(type)) ? type : type.replace(PREFIX_REGEX, '');
}

export function resolveThreeConstructor(type: string): ConstructorRepresentation | null {
	const normalized = normalizeThreeType(type);
	return catalogue[toPascalCase(normalized)] ?? null;
}

export function validateThreeInstance(
	type: string,
	props: Readonly<Record<string, unknown>>,
): string {
	const normalized = normalizeThreeType(type);
	const name = toPascalCase(normalized);
	if (normalized !== 'primitive' && catalogue[name] === undefined) {
		throw new Error(
			`@octanejs/three: ${name} is not in the Three catalogue. Call extend({ ${name} }) before rendering it.`,
		);
	}
	if (normalized === 'primitive' && !props.object) {
		throw new Error('@octanejs/three: Primitives without an object are invalid.');
	}
	if (props.args !== undefined && !Array.isArray(props.args)) {
		throw new Error('@octanejs/three: The args prop must be an array.');
	}
	return normalized;
}

export function createThreeObject(
	type: string,
	props: Readonly<Record<string, unknown>>,
): { object: any; owned: boolean; type: string } {
	const normalized = validateThreeInstance(type, props);
	if (normalized === 'primitive') {
		return { object: props.object, owned: false, type: normalized };
	}
	const Constructor = resolveThreeConstructor(normalized)!;
	return {
		object: new Constructor(...((props.args as readonly unknown[] | undefined) ?? [])),
		owned: true,
		type: normalized,
	};
}

export function extend<T extends ConstructorRepresentation>(
	objects: T,
): UniversalComponent<ThreeElement<T>>;
export function extend<T extends Catalogue>(objects: T): void;
export function extend<T extends Catalogue | ConstructorRepresentation>(
	objects: T,
): UniversalComponent<any> | void {
	// Seed built-ins before user entries so an explicit extension can override a
	// catalogue name deterministically, independent of driver creation order.
	registerThreeNamespace();
	if (typeof objects !== 'function') {
		Object.assign(catalogue, objects);
		return;
	}
	const existing = constructorComponents.get(objects);
	if (existing !== undefined) return existing as UniversalComponent<any>;

	// Unlike R3F's bare numeric token, the branded private host name remains
	// unambiguous in compiler output and diagnostics.
	const type = `octaneThreeExtended${nextExtendedType++}`;
	catalogue[toPascalCase(type)] = objects;
	const plan = universalPlan(THREE_RENDERER_ID, { kind: 'host', type, propsSlot: 0 });
	const component = defineUniversalComponent<Record<string, unknown>>(
		THREE_RENDERER_ID,
		(props) => universalValue(plan, [universalProps([['spread', props]])]),
		{ module: '@octanejs/three' },
	);
	constructorComponents.set(objects, component);
	return component as UniversalComponent<any>;
}

/** Test/evidence helper: return a snapshot without exposing mutable catalogue state. */
export function getThreeCatalogue(): Readonly<Catalogue> {
	return Object.freeze({ ...catalogue });
}
