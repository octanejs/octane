import type { EnvironmentProps } from '@octanejs/drei';
import type { RefObject } from '@octanejs/three/renderer';
import * as THREE from 'three';

const scene: RefObject<THREE.Scene> = { current: new THREE.Scene() };
const props: EnvironmentProps = {
	background: 'only',
	frames: Infinity,
	near: 0.1,
	far: 1000,
	resolution: 256,
	backgroundBlurriness: 0.2,
	backgroundRotation: new THREE.Euler(),
	environmentRotation: new THREE.Euler(),
	map: new THREE.Texture(),
	scene,
	ground: { radius: 10, height: 4, scale: 100 },
	files: '/studio.hdr',
};
void props;

// @ts-expect-error background accepts only booleans or the upstream "only" mode.
const wrongBackground: EnvironmentProps = { background: 'environment' };
// @ts-expect-error ground radius is numeric.
const wrongGround: EnvironmentProps = { ground: { radius: '10' } };
void wrongBackground;
void wrongGround;
