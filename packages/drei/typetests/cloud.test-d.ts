import type { CloudProps, CloudsProps } from '@octanejs/drei';
import * as THREE from 'three';

const cloud: CloudProps = {
	seed: 1,
	segments: 10,
	bounds: [5, 1, 1],
	concentrate: 'inside',
	distribute: (_state, index) => ({ point: new THREE.Vector3(index, 0, 0), volume: 0.5 }),
	color: 'white',
};
const clouds: CloudsProps = {
	texture: '/cloud.png',
	limit: 100,
	range: 50,
	material: THREE.MeshPhongMaterial,
};
void cloud;
void clouds;

// @ts-expect-error concentrate is a closed upstream union.
const wrongConcentration: CloudProps = { concentrate: 'center' };
// @ts-expect-error segment limits are numeric.
const wrongLimit: CloudsProps = { limit: '100' };
void wrongConcentration;
void wrongLimit;
