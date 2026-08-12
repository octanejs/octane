import type {
	FacemeshApi,
	FacemeshEyeApi,
	FacemeshEyeProps,
	FacemeshProps,
	MediaPipeFaceMesh,
	MediaPipePoints,
} from '@octanejs/drei';
import { Facemesh, FacemeshDatas, FacemeshEye, FacemeshEyeDefaults } from '@octanejs/drei';

const props: FacemeshProps = { points: FacemeshDatas.SAMPLE_FACE.keypoints, eyes: false, depth: 1 };
const eyeProps: FacemeshEyeProps = { side: 'left', debug: true };
const face: MediaPipeFaceMesh = FacemeshDatas.SAMPLE_FACE;
const points: MediaPipePoints = face.keypoints;
void [Facemesh, FacemeshEye, FacemeshEyeDefaults, props, eyeProps, face, points];
declare const api: FacemeshApi;
declare const eyeApi: FacemeshEyeApi;
api.meshRef.current?.geometry.computeBoundingBox();
eyeApi.irisDirRef.current?.rotation.set(0, 0, 0);

// @ts-expect-error FacemeshEye only supports the pinned left/right side values
const invalidEye: FacemeshEyeProps = { side: 'center' };
void invalidEye;
