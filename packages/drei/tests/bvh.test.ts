import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Bvh as ReactBvh, useBVH as reactUseBVH } from '@react-three/drei/core/Bvh.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { acceleratedRaycast, CENTER, SAH } from 'three-mesh-bvh';
import { BvhScene, UseBvhScene } from './_fixtures/bvh.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
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

async function reactRoot(Component: React.ComponentType) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return React.createElement(Component);
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

const geometrySnapshot = (geometry: THREE.BufferGeometry & { boundsTree?: unknown }) => ({
	hasTree: Boolean(geometry.boundsTree),
	boundingBox: geometry.boundingBox && [
		geometry.boundingBox.min.toArray(),
		geometry.boundingBox.max.toArray(),
	],
	indexed: Boolean(geometry.index),
});

describe('BVH helpers', () => {
	it('matches deprecated useBVH installation, options, accelerated raycasts, and cleanup', async () => {
		const options = { strategy: CENTER, maxDepth: 12, maxLeafTris: 2, setBoundingBox: true };
		let reactRef!: React.RefObject<THREE.Mesh | undefined>;
		function ReactScene() {
			const mesh = React.useRef<THREE.Mesh>(null);
			reactRef = mesh;
			reactUseBVH(mesh, options);
			return React.createElement(
				'mesh',
				{ ref: mesh, name: 'target' },
				React.createElement('boxGeometry'),
				React.createElement('meshBasicMaterial'),
			);
		}
		const react = await reactRoot(ReactScene);
		let octaneRef!: { current?: THREE.Mesh };
		const octane = await createOctaneThree(UseBvhScene, {
			options,
			onMeshRef: (ref: typeof octaneRef) => (octaneRef = ref),
		});
		expect(geometrySnapshot(octaneRef.current!.geometry)).toEqual(
			geometrySnapshot(reactRef.current!.geometry),
		);
		expect(octaneRef.current!.raycast === acceleratedRaycast).toBe(
			reactRef.current!.raycast === acceleratedRaycast,
		);
		const reactGeometry = reactRef.current!.geometry as THREE.BufferGeometry & {
			boundsTree?: unknown;
		};
		const octaneGeometry = octaneRef.current!.geometry as THREE.BufferGeometry & {
			boundsTree?: unknown;
		};
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(Boolean(octaneGeometry.boundsTree)).toBe(Boolean(reactGeometry.boundsTree));
		expect(octaneGeometry.boundsTree).toBeNull();
	});

	it('matches Bvh traversal filtering, raycaster mode, refs, and restoration', async () => {
		const customRaycast: THREE.Object3D['raycast'] = () => undefined;
		let reactGroup: THREE.Group | null = null;
		let reactMesh: THREE.Mesh | null = null;
		let reactSkipped: THREE.Mesh | null = null;
		const assignSkipped = (mesh: THREE.Mesh | null) => {
			if (mesh) mesh.raycast = customRaycast;
			return mesh;
		};
		const props = { strategy: SAH, maxLeafTris: 1, firstHitOnly: true };
		const react = await reactRoot(() =>
			React.createElement(
				ReactBvh,
				{ ...props, ref: (group: THREE.Group | null) => (reactGroup = group), name: 'bvh' },
				React.createElement(
					'mesh',
					{ ref: (mesh: THREE.Mesh | null) => (reactMesh = mesh), name: 'accelerated' },
					React.createElement('boxGeometry'),
					React.createElement('meshBasicMaterial'),
				),
				React.createElement(
					'mesh',
					{
						ref: (mesh: THREE.Mesh | null) => (reactSkipped = assignSkipped(mesh)),
						name: 'skipped',
					},
					React.createElement('sphereGeometry', { args: [1, 8, 6] }),
					React.createElement('meshBasicMaterial'),
				),
			),
		);
		let octaneGroup: THREE.Group | null = null;
		let octaneMesh: THREE.Mesh | null = null;
		let octaneSkipped: THREE.Mesh | null = null;
		const octane = await createOctaneThree(BvhScene, {
			...props,
			groupRef: (group: THREE.Group | null) => (octaneGroup = group),
			meshRef: (mesh: THREE.Mesh | null) => (octaneMesh = mesh),
			skippedRef: (mesh: THREE.Mesh | null) => (octaneSkipped = assignSkipped(mesh)),
		});
		expect(octaneGroup!.name).toBe(reactGroup!.name);
		expect(geometrySnapshot(octaneMesh!.geometry)).toEqual(geometrySnapshot(reactMesh!.geometry));
		expect(octaneSkipped!.raycast).toBe(customRaycast);
		expect((octane.store.getState().raycaster as any).firstHitOnly).toBe(
			(react.getState().raycaster as any).firstHitOnly,
		);
		const reactGeometry = reactMesh!.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
		const octaneGeometry = octaneMesh!.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
		const octaneMeshObject = octaneMesh!;
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneMeshObject.raycast).toBe(THREE.Mesh.prototype.raycast);
		expect(Boolean(octaneGeometry.boundsTree)).toBe(Boolean(reactGeometry.boundsTree));
		expect((octane.store.getState().raycaster as any).firstHitOnly).toBeUndefined();
	});
});
