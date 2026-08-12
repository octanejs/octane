/** @jsxImportSource @octanejs/three/intrinsics */
import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { type ThreeRef, useFrame, useThree } from '@octanejs/three';
import {
	type RefObject,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from '@octanejs/three/renderer';
import { createContext, useContext } from 'octane';
import { easing } from 'maath';
import * as THREE from 'three';
import { VideoTexture, type VideoTextureProps } from '../core/VideoTexture.three.tsrx';
import { Facemesh, type FacemeshApi, type FacemeshProps } from './Facemesh.three.tsrx';
import { useFaceLandmarker } from './FaceLandmarker.three.tsrx';
import { WebcamVideoTexture } from './media-textures.three.tsrx';

type VideoFrame = Parameters<FaceLandmarker['detectForVideo']>[0];

function mean(v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
	return v1.clone().add(v2).multiplyScalar(0.5);
}

function localToLocal(objSrc: THREE.Object3D, value: THREE.Vector3, objDst: THREE.Object3D): THREE.Vector3 {
	return objDst.worldToLocal(objSrc.localToWorld(value));
}

export type FaceControlsProps = {
	camera?: THREE.Camera;
	videoTexture?: VideoTextureProps;
	manualDetect?: boolean;
	faceLandmarkerResult?: FaceLandmarkerResult;
	manualUpdate?: boolean;
	makeDefault?: boolean;
	smoothTime?: number;
	offset?: boolean;
	offsetScalar?: number;
	eyes?: boolean;
	eyesAsOrigin?: boolean;
	depth?: number;
	debug?: boolean;
	facemesh?: FacemeshProps;
};

export type FaceControlsApi = THREE.EventDispatcher & {
	computeTarget: () => THREE.Object3D;
	update: (delta: number, target?: THREE.Object3D) => void;
	facemeshApiRef: RefObject<FacemeshApi | null>;
};

const FaceControlsContext = createContext({} as FaceControlsApi);

export function FaceControls({
	camera,
	videoTexture = { start: true } as VideoTextureProps,
	manualDetect = false,
	faceLandmarkerResult,
	manualUpdate = false,
	makeDefault,
	smoothTime = 0.25,
	offset = true,
	offsetScalar = 80,
	eyes = false,
	eyesAsOrigin = true,
	depth = 0.15,
	debug = false,
	facemesh,
	ref,
}: FaceControlsProps & { ref?: ThreeRef<FaceControlsApi> }) @{
	const scene = useThree((state) => state.scene);
	const defaultCamera = useThree((state) => state.camera);
	const set = useThree((state) => state.set);
	const get = useThree((state) => state.get);
	const explCamera = camera || defaultCamera;
	const facemeshApiRef = useRef<FacemeshApi | null>(null);
	const [target] = useState(() => new THREE.Object3D());
	const [irisRightDirPos] = useState(() => new THREE.Vector3());
	const [irisLeftDirPos] = useState(() => new THREE.Vector3());
	const [irisRightLookAt] = useState(() => new THREE.Vector3());
	const [irisLeftLookAt] = useState(() => new THREE.Vector3());
	const computeTarget = useCallback<FaceControlsApi['computeTarget']>(() => {
		target.parent = explCamera.parent;
		const facemeshApi = facemeshApiRef.current;
		if (facemeshApi) {
			const { outerRef, eyeRightRef, eyeLeftRef } = facemeshApi;
			if (eyeRightRef.current && eyeLeftRef.current) {
				const { irisDirRef: irisRightDirRef } = eyeRightRef.current;
				const { irisDirRef: irisLeftDirRef } = eyeLeftRef.current;
				if (irisRightDirRef.current && irisLeftDirRef.current && outerRef.current) {
					irisRightDirPos.copy(localToLocal(irisRightDirRef.current, new THREE.Vector3(0, 0, 0), outerRef.current));
					irisLeftDirPos.copy(localToLocal(irisLeftDirRef.current, new THREE.Vector3(0, 0, 0), outerRef.current));
					target.position.copy(localToLocal(outerRef.current, mean(irisRightDirPos, irisLeftDirPos), explCamera.parent || scene));
					irisRightLookAt.copy(localToLocal(irisRightDirRef.current, new THREE.Vector3(0, 0, 1), outerRef.current));
					irisLeftLookAt.copy(localToLocal(irisLeftDirRef.current, new THREE.Vector3(0, 0, 1), outerRef.current));
					target.lookAt(outerRef.current.localToWorld(mean(irisRightLookAt, irisLeftLookAt)));
				}
			} else if (outerRef.current) {
				target.position.copy(localToLocal(outerRef.current, new THREE.Vector3(0, 0, 0), explCamera.parent || scene));
				target.lookAt(outerRef.current.localToWorld(new THREE.Vector3(0, 0, 1)));
			}
		}
		return target;
	}, [explCamera, irisLeftDirPos, irisLeftLookAt, irisRightDirPos, irisRightLookAt, scene, target]);

	const [current] = useState(() => new THREE.Object3D());
	const update = useCallback<FaceControlsApi['update']>((delta, nextTarget) => {
		if (explCamera) {
			nextTarget ??= computeTarget();
			if (smoothTime > 0) {
				const eps = 1e-9;
				easing.damp3(current.position, nextTarget.position, smoothTime, delta, undefined, undefined, eps);
				easing.dampE(current.rotation, nextTarget.rotation, smoothTime, delta, undefined, undefined, eps);
			} else {
				current.position.copy(nextTarget.position);
				current.rotation.copy(nextTarget.rotation);
			}
			explCamera.position.copy(current.position);
			explCamera.rotation.copy(current.rotation);
		}
	}, [explCamera, computeTarget, smoothTime, current.position, current.rotation]);
	useFrame((_, delta) => { if (!manualUpdate) update(delta); });

	const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
	const [_faceLandmarkerResult, setFaceLandmarkerResult] = useState<FaceLandmarkerResult | undefined>(undefined);
	const faceLandmarker = useFaceLandmarker();
	const onVideoFrame = useCallback<NonNullable<VideoTextureProps['onVideoFrame']>>((now) => {
		const texture = videoTextureRef.current;
		if (!texture) return;
		const videoFrame = texture.source.data as VideoFrame;
		setFaceLandmarkerResult(faceLandmarker?.detectForVideo(videoFrame, now));
	}, [faceLandmarker]);

	const api = useMemo<FaceControlsApi>(() => Object.assign(Object.create(THREE.EventDispatcher.prototype), {
		computeTarget, update, facemeshApiRef,
	}), [computeTarget, update]);
	useImperativeHandle((ref ?? null) as any, () => api, [api]);
	useEffect(() => {
		if (makeDefault) {
			const old = get().controls;
			set({ controls: api });
			return () => set({ controls: old });
		}
	}, [makeDefault, api, get, set]);

	const result = faceLandmarkerResult ?? _faceLandmarkerResult;
	const points = result?.faceLandmarks[0];
	const facialTransformationMatrix = result?.facialTransformationMatrixes?.[0];
	const faceBlendshapes = result?.faceBlendshapes?.[0];
	const videoTextureProps = { onVideoFrame, ...videoTexture };
	const facemeshChildren = facemesh?.children ?? <meshNormalMaterial side={THREE.DoubleSide} />;
	<FaceControlsContext.Provider value={api}>
		{!manualDetect &&
			('src' in videoTextureProps
				? <VideoTexture ref={videoTextureRef} {...videoTextureProps as VideoTextureProps} />
				: <WebcamVideoTexture ref={videoTextureRef} {...videoTextureProps as any} />)}
		<Facemesh
			ref={facemeshApiRef}
			{...facemesh as any}
			points={points}
			depth={depth}
			facialTransformationMatrix={facialTransformationMatrix}
			faceBlendshapes={faceBlendshapes}
			eyes={eyes}
			eyesAsOrigin={eyesAsOrigin}
			offset={offset}
			offsetScalar={offsetScalar}
			debug={debug}
			rotation-z={Math.PI}
			visible={debug}
			children={facemeshChildren}
		/>
	</FaceControlsContext.Provider>
}

export const useFaceControls = (): FaceControlsApi => useContext(FaceControlsContext);
