/** @jsxImportSource @octanejs/three/intrinsics */
import type { FaceLandmarker as FaceLandmarkerImpl, FaceLandmarkerOptions } from '@mediapipe/tasks-vision';
import { use, useEffect, useImperativeHandle } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import { clearResource, resourcePromise } from '../core/resource.js';
import { loadFaceLandmarker } from './face-landmarker-resource.js';

const FaceLandmarkerContext = createContext<FaceLandmarkerImpl | undefined>(undefined);

export type FaceLandmarkerProps = {
	basePath?: string;
	options?: FaceLandmarkerOptions;
	children?: OctaneNode;
};

export const FaceLandmarkerDefaults = {
	basePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm',
	options: {
		baseOptions: {
			modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
			delegate: 'GPU',
		},
		runningMode: 'VIDEO',
		outputFaceBlendshapes: true,
		outputFacialTransformationMatrixes: true,
	} as FaceLandmarkerOptions,
};

export function FaceLandmarker({
	basePath = FaceLandmarkerDefaults.basePath,
	options = FaceLandmarkerDefaults.options,
	children,
	ref,
}: FaceLandmarkerProps & { ref?: unknown }) @{
	const serializedOptions = JSON.stringify(options);
	const keys = ['face-landmarker', basePath, serializedOptions] as const;
	const faceLandmarker = use(resourcePromise(loadFaceLandmarker, keys));
	useEffect(() => () => {
		faceLandmarker?.close();
		clearResource(keys);
	}, [faceLandmarker, basePath, serializedOptions]);
	useImperativeHandle((ref ?? null) as any, () => faceLandmarker, [faceLandmarker]);
	<FaceLandmarkerContext.Provider value={faceLandmarker}>{children}</FaceLandmarkerContext.Provider>
}

export function useFaceLandmarker(): FaceLandmarkerImpl | undefined {
	return useContext(FaceLandmarkerContext);
}
