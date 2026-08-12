import { BufferAttribute, BufferGeometry } from 'three';
import {
	ComputedAttribute,
	type ComputedAttributeProps,
	Detailed,
	type DetailedProps,
	MultiMaterial,
	type MultiMaterialProps,
	ScreenSpace,
	type ScreenSpaceProps,
} from '../src/index.js';

const screenProps: ScreenSpaceProps = { depth: 3, name: 'screen' };
const screenCall: Parameters<typeof ScreenSpace>[0] = { ...screenProps, ref: { current: null } };
const detailedProps: DetailedProps = { distances: [1, 5], hysteresis: 0.1, children: null };
const detailedCall: Parameters<typeof Detailed>[0] = { ...detailedProps, ref: { current: null } };
const computedProps: ComputedAttributeProps = {
	name: 'custom',
	compute: (geometry: BufferGeometry) =>
		new BufferAttribute(new Float32Array(geometry.getAttribute('position').count), 1),
};
const computedCall: Parameters<typeof ComputedAttribute>[0] = computedProps;
const materialProps: MultiMaterialProps = { name: 'materials' };
const materialCall: Parameters<typeof MultiMaterial>[0] = materialProps;
void [screenCall, detailedCall, computedCall, materialCall];

// @ts-expect-error Detailed distances are numeric.
const invalid: DetailedProps = { distances: ['near'], children: null };
void invalid;
