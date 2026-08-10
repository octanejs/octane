import * as React from 'react';
import { act, createRoot as createReactRoot, extend } from '@react-three/fiber';
import {
	Facemesh as ReactFacemesh,
	FacemeshDatas as ReactFacemeshDatas,
	FacemeshEyeDefaults as ReactFacemeshEyeDefaults,
	type FacemeshApi as ReactFacemeshApi,
} from '@react-three/drei/web/Facemesh.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	Facemesh,
	FacemeshDatas,
	FacemeshEyeDefaults,
	type FacemeshApi,
	type FacemeshProps,
} from '../src/web/Facemesh.three.tsrx';
import { FacemeshScene } from './_fixtures/facemesh.three.tsrx';

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

async function flush(): Promise<void> {
	await act(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

async function mountPair(props: FacemeshProps) {
	let reactApi: ReactFacemeshApi | null = null;
	let octaneApi: FacemeshApi | null = null;
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never', dpr: 1 });
	await act(async () =>
		reactRoot.render(
			React.createElement(
				ReactFacemesh,
				{
					...(props as any),
					ref: (value: ReactFacemeshApi | null) => {
						reactApi = value;
					},
				},
				React.createElement('meshBasicMaterial'),
			),
		),
	);
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({ gl: renderer(octaneCanvas), frameloop: 'never', dpr: 1 });
	octaneRoot.render(FacemeshScene, {
		...props,
		meshRef: (value: FacemeshApi | null) => {
			octaneApi = value;
		},
	});
	await flush();
	if (!reactApi || !octaneApi) throw new Error('Facemesh imperative refs were not assigned');
	return {
		reactRoot,
		octaneRoot,
		reactApi: reactApi as ReactFacemeshApi,
		octaneApi: octaneApi as FacemeshApi,
	};
}

function meshSnapshot(api: ReactFacemeshApi | FacemeshApi) {
	const mesh = api.meshRef.current!;
	const geometry = mesh.geometry;
	const origin = mesh.parent!;
	const scale = origin.parent!;
	const outer = api.outerRef.current!;
	const offset = outer.parent!;
	const root = offset.parent!;
	return {
		positions: Array.from(geometry.getAttribute('position').array),
		normals: Array.from(geometry.getAttribute('normal').array),
		index: Array.from(geometry.index!.array),
		drawRange: { ...geometry.drawRange },
		root: { name: root.name, position: root.position.toArray(), visible: root.visible },
		offset: offset.position.toArray(),
		outerQuaternion: outer.quaternion.toArray(),
		scale: scale.scale.toArray(),
		origin: origin.position.toArray(),
		material: (mesh.material as THREE.MeshBasicMaterial).type,
	};
}

function eyeSnapshot(api: ReactFacemeshApi | FacemeshApi) {
	const geometry = api.meshRef.current!.geometry;
	const blendshapes = FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT.faceBlendshapes[0];
	return [api.eyeRightRef.current!, api.eyeLeftRef.current!].map((eye) => {
		const sphere = eye._computeSphere(geometry).clone();
		eye._update(geometry, blendshapes as any, sphere);
		return {
			sphere: { center: sphere.center.toArray(), radius: sphere.radius },
			position: eye.eyeMeshRef.current!.position.toArray(),
			scale: eye.eyeMeshRef.current!.scale.toArray(),
			irisQuaternion: eye.irisDirRef.current!.quaternion.toArray(),
		};
	});
}

async function unmountPair(pair: Awaited<ReturnType<typeof mountPair>>) {
	pair.octaneRoot.unmount();
	await act(async () => pair.reactRoot.unmount());
}

describe('Facemesh', () => {
	it('matches the complete pinned face data and eye defaults', () => {
		expect(Facemesh).toBeTypeOf('function');
		expect(FacemeshDatas).toEqual(ReactFacemeshDatas);
		expect(FacemeshEyeDefaults).toEqual(ReactFacemeshEyeDefaults);
		const mutated = structuredClone(FacemeshDatas);
		mutated.TRIANGULATION[0] += 1;
		expect(mutated).not.toEqual(ReactFacemeshDatas);
	});

	it('matches React geometry, normals, transforms, props, refs, and eye APIs', async () => {
		const sample = FacemeshDatas.SAMPLE_FACELANDMARKER_RESULT;
		const pair = await mountPair({
			points: sample.faceLandmarks[0],
			facialTransformationMatrix: sample.facialTransformationMatrixes[0],
			faceBlendshapes: sample.faceBlendshapes[0],
			offset: true,
			offsetScalar: 40,
			depth: 2,
			origin: 4,
			eyes: true,
			name: 'tracked-face',
			position: [1, 2, 3],
			visible: false,
		});
		expect(meshSnapshot(pair.octaneApi)).toEqual(meshSnapshot(pair.reactApi));
		expect(eyeSnapshot(pair.octaneApi)).toEqual(eyeSnapshot(pair.reactApi));
		expect(pair.octaneApi.meshRef.current).not.toBe(pair.reactApi.meshRef.current);
		pair.octaneApi.outerRef.current!.rotation.x += 0.1;
		expect(meshSnapshot(pair.octaneApi)).not.toEqual(meshSnapshot(pair.reactApi));
		await unmountPair(pair);
	});

	it('matches the missing-blendshape warning boundary', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const pair = await mountPair({ points: FacemeshDatas.SAMPLE_FACE.keypoints, eyes: true });
		const warning = 'Facemesh `eyes` option only works if `faceBlendshapes` is provided: skipping.';
		// React's development root may replay effects; both roots must emit the exact boundary warning.
		expect(
			warn.mock.calls.filter(([message]) => message === warning).length,
		).toBeGreaterThanOrEqual(2);
		await unmountPair(pair);
		warn.mockRestore();
	});
});
