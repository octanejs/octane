import * as THREE from 'three';
import {
	Splat,
	type SharedState,
	type SplatMaterialType,
	type SplatProps,
	type TargetMesh,
} from '../src/index.js';

const props: SplatProps = {
	src: '/scene.splat',
	toneMapped: false,
	alphaTest: 0.2,
	alphaHash: true,
	chunkSize: 25_000,
	position: [1, 2, 3],
	onClick: (event) => event.stopPropagation(),
};
const material: SplatMaterialType = {
	alphaTest: 0.1,
	alphaHash: false,
	centerAndScaleTexture: new THREE.DataTexture(),
	covAndColorTexture: new THREE.DataTexture(),
	viewport: new THREE.Vector2(800, 600),
	focal: 500,
};
declare const shared: SharedState;
declare const target: TargetMesh;
shared.connect(target);
shared.update(target, new THREE.PerspectiveCamera(), true);
target.ready.valueOf();
target.geometry.instanceCount.valueOf();
Splat;
props;
material;

// @ts-expect-error src is required
const missingSource: SplatProps = { alphaHash: true };
// @ts-expect-error alphaHash is boolean
const invalidHash: SplatProps = { src: '/scene.splat', alphaHash: 'yes' };
// @ts-expect-error chunkSize is numeric
const invalidChunk: SplatProps = { src: '/scene.splat', chunkSize: '25000' };
// @ts-expect-error the pinned public props intentionally omit ref
const invalidRef: SplatProps = { src: '/scene.splat', ref: { current: null } };
