import * as THREE from 'three';
import { Sparkles, type SparklesProps } from '../src/index.js';

const props: SparklesProps = {
	count: 20,
	speed: new Float32Array([1]),
	color: '#fff',
	scale: new THREE.Vector3(1, 2, 3),
	noise: [1, 2, 3],
};
Sparkles;
props;

// @ts-expect-error count is numeric
const invalidCount: SparklesProps = { count: 'many' };
// @ts-expect-error scale must be scalar or 3D
const invalidScale: SparklesProps = { scale: [1, 2] };
