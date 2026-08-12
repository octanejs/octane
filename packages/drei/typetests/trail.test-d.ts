import type { MeshLineGeometry, TrailProps } from '@octanejs/drei';
import type { ThreeRef } from '@octanejs/three';
import type { RefObject } from '@octanejs/three/renderer';
import * as THREE from 'three';

const target: RefObject<THREE.Object3D> = { current: new THREE.Object3D() };
const props: TrailProps = {
	target,
	width: 0.2,
	length: 2,
	decay: 1,
	local: false,
	stride: 0.1,
	interval: 2,
	color: 'hotpink',
	attenuation: (width) => width * width,
};
const ref: ThreeRef<MeshLineGeometry> = { current: null };
void props;
void ref;

// @ts-expect-error interval is a number of frames.
const wrongInterval: TrailProps = { interval: '2' };
// @ts-expect-error attenuation returns a numeric width.
const wrongAttenuation: TrailProps = { attenuation: () => 'wide' };
void wrongInterval;
void wrongAttenuation;
