import {
	MeshDistortMaterial,
	type MeshDistortMaterialProps,
	MeshWobbleMaterial,
	type WobbleMaterialProps,
} from '../src/index.js';

const distort: MeshDistortMaterialProps = { speed: 2, distort: 0.4, radius: 1.2, roughness: 0.5 };
const wobble: WobbleMaterialProps = { speed: 1, factor: 0.8, metalness: 0.2 };
MeshDistortMaterial;
MeshWobbleMaterial;
distort;
wobble;

// @ts-expect-error distort speed must be numeric
const invalidDistort: MeshDistortMaterialProps = { speed: 'fast' };
// @ts-expect-error wobble factor must be numeric
const invalidWobble: WobbleMaterialProps = { factor: 'large' };
