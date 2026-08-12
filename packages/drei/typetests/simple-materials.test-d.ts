import {
	Mask,
	MeshDiscardMaterial,
	PointMaterial,
	PointMaterialImpl,
	ScreenQuad,
	useMask,
	type MaskProps,
	type MeshDiscardMaterialProps,
	type PointMaterialProps,
	type ScreenQuadProps,
} from '../src/index.js';

const mask: MaskProps = { id: 2, colorWrite: true };
const discard: MeshDiscardMaterialProps = { transparent: true };
const point: PointMaterialProps = { size: 2 };
const quad: ScreenQuadProps = { frustumCulled: false };
const implementation = new PointMaterialImpl({ size: 1 });
const values = useMask(1, true);
Mask;
MeshDiscardMaterial;
PointMaterial;
ScreenQuad;
mask;
discard;
point;
quad;
implementation;
values.stencilRef;

// @ts-expect-error mask ids are numeric stencil references
const invalidMask: MaskProps = { id: 'foreground' };
// @ts-expect-error point size is numeric
const invalidPoint: PointMaterialProps = { size: 'large' };
