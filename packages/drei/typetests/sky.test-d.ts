import * as THREE from 'three';
import { Sky, type SkyProps, calcPosFromAngles } from '../src/index.js';

const target = new THREE.Vector3();
const position: THREE.Vector3 = calcPosFromAngles(0.6, 0.1, target);
const props: SkyProps = { distance: 500, sunPosition: [1, 2, 3], turbidity: 8 };
Sky;
position;
props;

// @ts-expect-error distance must be numeric
const invalidDistance: SkyProps = { distance: 'far' };
// @ts-expect-error sun position must be vector-like
const invalidSun: SkyProps = { sunPosition: 'overhead' };
