import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import {
	FaceControls as ReactFaceControls,
	type FaceControlsApi as ReactFaceControlsApi,
	useFaceControls as useReactFaceControls,
} from '@react-three/drei/web/FaceControls.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	FaceControls,
	type FaceControlsApi,
	type FaceControlsProps,
} from '../src/web/FaceControls.three.tsrx';
import { FacemeshDatas } from '../src/web/Facemesh.three.tsrx';
import { FaceControlsScene } from './_fixtures/face-controls.three.tsrx';

const mocks = vi.hoisted(() => ({ landmarker: { detectForVideo: vi.fn() } }));
vi.mock('@react-three/drei/web/FaceLandmarker.js', () => ({
	useFaceLandmarker: () => mocks.landmarker,
}));
vi.mock('../src/web/FaceLandmarker.three.tsrx', () => ({
	useFaceLandmarker: () => mocks.landmarker,
}));

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

async function mountPair(props: FaceControlsProps) {
	let reactApi: ReactFaceControlsApi | null = null;
	let octaneApi: FaceControlsApi | null = null;
	let reactContext: ReactFaceControlsApi | null = null;
	let octaneContext: FaceControlsApi | null = null;
	let reactState!: RootState;
	function Capture() {
		reactState = useThree();
		return null;
	}
	function ContextCapture() {
		reactContext = useReactFaceControls();
		return null;
	}
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never', dpr: 1 });
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(ReactFaceControls, {
					...(props as any),
					facemesh: {
						...props.facemesh,
						children: React.createElement(
							React.Fragment,
							null,
							React.createElement('meshNormalMaterial'),
							React.createElement(ContextCapture),
						),
					},
					ref: (value: ReactFaceControlsApi | null) => {
						reactApi = value;
					},
				}),
				React.createElement(Capture),
			),
		),
	);
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({ gl: renderer(octaneCanvas), frameloop: 'never', dpr: 1 });
	octaneRoot.render(FaceControlsScene, {
		...props,
		controlsRef: (value: FaceControlsApi | null) => {
			octaneApi = value;
		},
		onContext: (value: FaceControlsApi) => {
			octaneContext = value;
		},
	});
	await act(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
	if (!reactApi || !octaneApi) throw new Error('FaceControls refs were not assigned');
	return {
		reactRoot,
		octaneRoot,
		reactApi: reactApi as ReactFaceControlsApi,
		octaneApi: octaneApi as FaceControlsApi,
		reactContext: reactContext as ReactFaceControlsApi,
		octaneContext: octaneContext as FaceControlsApi,
		reactState,
	};
}

function faceSnapshot(api: ReactFaceControlsApi | FaceControlsApi) {
	const face = api.facemeshApiRef.current!;
	const mesh = face.meshRef.current!;
	return {
		visible: mesh.parent!.parent!.parent!.parent!.parent!.visible,
		rotationZ: mesh.parent!.parent!.parent!.parent!.parent!.rotation.z,
		positionCount: mesh.geometry.getAttribute('position').count,
		depthScale: mesh.parent!.parent!.scale.toArray(),
		material: (mesh.material as THREE.MeshNormalMaterial).type,
		eyes: [Boolean(face.eyeRightRef.current), Boolean(face.eyeLeftRef.current)],
	};
}

function rounded(values: number[]): number[] {
	return values.map((value) => Number(value.toFixed(12)));
}

async function unmountPair(pair: Awaited<ReturnType<typeof mountPair>>) {
	pair.octaneRoot.unmount();
	await act(async () => pair.reactRoot.unmount());
}

describe('FaceControls', () => {
	it('matches manual result propagation, explicit defaults, Facemesh output, API and instant update', async () => {
		const result = FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT as any;
		const pair = await mountPair({
			manualDetect: true,
			manualUpdate: true,
			faceLandmarkerResult: result,
			smoothTime: 0,
			eyes: true,
			eyesAsOrigin: false,
			depth: 0.3,
			offset: true,
			offsetScalar: 40,
			debug: true,
			facemesh: { name: 'overridden-by-controls', visible: false },
		});
		expect(faceSnapshot(pair.octaneApi)).toEqual(faceSnapshot(pair.reactApi));
		expect(pair.octaneApi).toBeInstanceOf(THREE.EventDispatcher);
		expect(pair.reactApi).toBeInstanceOf(THREE.EventDispatcher);
		expect(pair.octaneContext).toBe(pair.octaneApi);
		expect(pair.reactContext).toBe(pair.reactApi);
		const reactTarget = new THREE.Object3D();
		reactTarget.position.set(1, 2, 3);
		reactTarget.rotation.set(0.1, 0.2, 0.3);
		const octaneTarget = reactTarget.clone();
		pair.reactApi.update(0.25, reactTarget);
		pair.octaneApi.update(0.25, octaneTarget);
		expect(pair.octaneRoot.store.getState().camera.position.toArray()).toEqual(
			pair.reactState.camera.position.toArray(),
		);
		expect(
			rounded(pair.octaneRoot.store.getState().camera.rotation.toArray().slice(0, 3) as number[]),
		).toEqual(rounded(pair.reactState.camera.rotation.toArray().slice(0, 3) as number[]));
		pair.octaneRoot.store.getState().camera.position.x += 1;
		expect(pair.octaneRoot.store.getState().camera.position.toArray()).not.toEqual(
			pair.reactState.camera.position.toArray(),
		);
		await unmountPair(pair);
	});

	it('matches automatic video-frame detection and result propagation', async () => {
		mocks.landmarker.detectForVideo
			.mockReset()
			.mockReturnValue(FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT);
		const callbacks: VideoFrameRequestCallback[] = [];
		const originalCreateElement = document.createElement.bind(document);
		const createElement = vi.spyOn(document, 'createElement').mockImplementation(((
			name: string,
			options?: ElementCreationOptions,
		) => {
			const element = originalCreateElement(name, options);
			if (name === 'video') {
				const video = element as HTMLVideoElement;
				Object.defineProperty(video, 'play', {
					value: vi.fn(async () => undefined),
					configurable: true,
				});
				Object.defineProperty(video, 'requestVideoFrameCallback', {
					value: (callback: VideoFrameRequestCallback) => {
						callbacks.push(callback);
						return callbacks.length;
					},
					configurable: true,
				});
				Object.defineProperty(video, 'cancelVideoFrameCallback', {
					value: vi.fn(),
					configurable: true,
				});
				queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata')));
			}
			return element;
		}) as typeof document.createElement);
		const pair = await mountPair({
			manualDetect: false,
			manualUpdate: true,
			videoTexture: { src: '/face.mp4', start: false },
		});
		expect(callbacks.length).toBeGreaterThanOrEqual(2);
		await act(async () => {
			for (const callback of callbacks.slice()) callback(123, {} as VideoFrameCallbackMetadata);
			for (let index = 0; index < 8; index++) await Promise.resolve();
			for (const callback of callbacks.slice(2)) callback(123, {} as VideoFrameCallbackMetadata);
			for (let index = 0; index < 8; index++) await Promise.resolve();
		});
		expect(mocks.landmarker.detectForVideo.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(mocks.landmarker.detectForVideo.mock.calls.every((call) => call[1] === 123)).toBe(true);
		expect(faceSnapshot(pair.octaneApi)).toEqual(faceSnapshot(pair.reactApi));
		expect(faceSnapshot(pair.octaneApi).positionCount).toBe(
			FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.faceLandmarks[0].length,
		);
		await unmountPair(pair);
		createElement.mockRestore();
	});

	it('matches computeTarget, automatic smoothing, makeDefault and cleanup', async () => {
		const pair = await mountPair({
			manualDetect: true,
			faceLandmarkerResult: FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT as any,
			manualUpdate: false,
			makeDefault: true,
			smoothTime: 0.25,
			eyes: false,
			debug: false,
		});
		// Effects have installed each API as the renderer's current controls.
		expect(pair.reactState.controls).toBe(pair.reactApi);
		expect(pair.octaneRoot.store.getState().controls).toBe(pair.octaneApi);
		const reactTarget = pair.reactApi.computeTarget();
		const octaneTarget = pair.octaneApi.computeTarget();
		expect(octaneTarget.position.toArray()).toEqual(reactTarget.position.toArray());
		expect(octaneTarget.quaternion.toArray()).toEqual(reactTarget.quaternion.toArray());
		await act(async () => reactAdvance(0.016, true, pair.reactState));
		pair.octaneRoot.store.getState().advance(0.016);
		expect(pair.octaneRoot.store.getState().camera.position.toArray()).toEqual(
			pair.reactState.camera.position.toArray(),
		);
		await unmountPair(pair);
		expect(pair.octaneRoot.store.getState().controls).toBeNull();
	});
});
