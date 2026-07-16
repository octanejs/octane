import { extend, type Instance, type InstanceProps, type ThreeElements } from '@octanejs/three';
import type { JSX as RendererJSX } from '@octanejs/three/intrinsics/jsx-runtime';
import * as THREE from 'three';

type Assert<T extends true> = T;
type Equal<Left, Right> =
	(<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

type RendererElements = RendererJSX.IntrinsicElements;
type _NoDomDiv = Assert<Equal<'div' extends keyof RendererElements ? true : false, false>>;
type _NoConflictingLine = Assert<
	Equal<'line' extends keyof RendererElements ? true : false, false>
>;
type _HasThreeLine = Assert<Equal<'threeLine' extends keyof RendererElements ? true : false, true>>;
type _PublicCatalogueMatchesRenderer = Assert<Equal<keyof ThreeElements, keyof RendererElements>>;
type _InstanceObjectIsGeneric = Assert<Equal<Instance<THREE.Group>['object'], THREE.Group>>;

const meshProps: RendererElements['mesh'] = {
	position: [1, 2, 3],
	scale: 2,
	visible: true,
};
const lineProps: RendererElements['threeLine'] = {
	position: new THREE.Vector3(4, 5, 6),
};

class HeatSource extends THREE.Object3D {
	constructor(
		readonly intensity: number,
		readonly label = 'heat',
	) {
		super();
	}
}

type HeatInstanceProps = InstanceProps<HeatSource, typeof HeatSource>;
type _InstancePropsKeepsRequiredArgs = Assert<
	Equal<HeatInstanceProps['args'], [intensity: number, label?: string | undefined]>
>;
const instanceProps: HeatInstanceProps = { args: [3], object: new HeatSource(3) };

const Heat = extend(HeatSource);
type HeatProps = Parameters<typeof Heat>[0];

const heatProps: HeatProps = {
	args: [3, 'rim'],
	position: [1, 2, 3],
};

declare const instance: Instance<THREE.Group>;
const instanceObject: THREE.Group = instance.object;

// @ts-expect-error The stable public descriptor cannot replace its managed object.
instance.object = new THREE.Group();

// @ts-expect-error Public child topology is read-only driver state.
instance.children.push(instance);

// @ts-expect-error The constructor's required first argument makes args required.
const missingArgs: HeatProps = { position: [1, 2, 3] };

// @ts-expect-error Constructor-form extend retains the constructor tuple type.
const invalidArgs: HeatProps = { args: ['hot'] };

void meshProps;
void lineProps;
void heatProps;
void instanceProps;
void instanceObject;
void missingArgs;
void invalidArgs;
