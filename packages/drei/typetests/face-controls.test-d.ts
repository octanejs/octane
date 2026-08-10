import {
	FaceControls,
	useFaceControls,
	type FaceControlsApi,
	type FaceControlsProps,
} from '@octanejs/drei';
import * as THREE from 'three';

const props: FaceControlsProps = {
	manualDetect: true,
	manualUpdate: true,
	camera: new THREE.PerspectiveCamera(),
	smoothTime: 0,
};
declare const api: FaceControlsApi;
api.update(1 / 60, api.computeTarget());
api.facemeshApiRef.current?.meshRef.current?.geometry.computeBoundingBox();
void [FaceControls, useFaceControls, props];

// @ts-expect-error smoothTime is measured as a number of seconds
const invalid: FaceControlsProps = { smoothTime: 'fast' };
void invalid;
