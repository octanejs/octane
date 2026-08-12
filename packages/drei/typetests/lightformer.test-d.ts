import * as THREE from 'three';
import { Lightformer, type LightProps } from '../src/index.js';

const props: LightProps = {
	form: 'ring',
	color: '#fff',
	intensity: 3,
	scale: [2, 4],
	target: new THREE.Vector3(),
	light: { intensity: 2 },
};
Lightformer;
props;

// @ts-expect-error scale supports scalar, 2D tuple, or 3D tuple only
const invalidScale: LightProps = { scale: [1, 2, 3, 4] };
// @ts-expect-error intensity is numeric
const invalidIntensity: LightProps = { intensity: 'bright' };
