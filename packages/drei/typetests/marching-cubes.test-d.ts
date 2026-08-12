import * as THREE from 'three';
import {
	MarchingCube,
	type MarchingCubeProps,
	MarchingCubes,
	type MarchingCubesProps,
	MarchingPlane,
	type MarchingPlaneProps,
} from '../src/index.js';

const cubes: MarchingCubesProps = { children: null, resolution: 32, enableColors: true };
const cube: MarchingCubeProps = { strength: 0.7, subtract: 10, color: new THREE.Color('red') };
const plane: MarchingPlaneProps = { planeType: 'z', strength: 0.2 };
MarchingCubes;
MarchingCube;
MarchingPlane;
cubes;
cube;
plane;

// @ts-expect-error plane type is axis constrained
const invalidPlane: MarchingPlaneProps = { planeType: 'w' };
// @ts-expect-error resolution is numeric
const invalidResolution: MarchingCubesProps = { children: null, resolution: 'high' };
