import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import {
	Sampler as ReactSampler,
	useSurfaceSampler as useReactSurfaceSampler,
} from '@react-three/drei/core/Sampler.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	SamplerAutoScene,
	SamplerExternalScene,
	SurfaceSamplerScene,
} from './_fixtures/sampler.three.tsrx';

const samplerCalls = vi.hoisted(() => [] as Array<{ weight?: string; built: boolean }>);

vi.mock('three-stdlib', async (importOriginal) => {
	const actual = await importOriginal<typeof import('three-stdlib')>();
	return {
		...actual,
		MeshSurfaceSampler: class {
			private index = 0;
			private call = { weight: undefined as string | undefined, built: false };
			constructor(_mesh: THREE.Mesh) {
				samplerCalls.push(this.call);
			}
			setWeightAttribute(weight?: string) {
				this.call.weight = weight;
				return this;
			}
			build() {
				this.call.built = true;
				return this;
			}
			sample(position: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color) {
				const value = ++this.index;
				position.set(value, value + 0.25, -value);
				normal.set(0, 1, 0);
				color.setRGB(value / 10, 0.5, 1 - value / 10);
				return this;
			}
		},
	};
});

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

beforeEach(() => samplerCalls.splice(0));

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

function matrices(mesh: THREE.InstancedMesh, count: number) {
	return Array.from(mesh.instanceMatrix.array.slice(0, count * 16));
}

const transform = ({ dummy, position, normal, color, sampledMesh }: any, index: number) => {
	dummy.position.copy(position).addScaledVector(normal, index + 1);
	dummy.scale.setScalar(color.r + 1);
	dummy.userData.sampledMesh = sampledMesh;
};

async function reactExternal(mesh: THREE.Mesh, instances: THREE.InstancedMesh) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	const meshRef = { current: mesh };
	const instancesRef = { current: instances };
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(ReactSampler, {
				mesh: meshRef,
				instances: instancesRef,
				count: 3,
				weight: 'weight',
				transform,
				position: [4, 5, 6],
			}),
		),
	);
	return { root, meshRef, instancesRef };
}

async function reactSurface(mesh: THREE.Mesh) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let buffer!: THREE.InstancedBufferAttribute;
	function Scene() {
		const meshRef = React.useRef(mesh);
		const value = useReactSurfaceSampler(meshRef, 2);
		React.useLayoutEffect(() => {
			buffer = value;
		}, [value]);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, buffer };
}

describe('Sampler', () => {
	it('matches external refs, weighted sampling, transform payloads, matrices, invalidation, and group props', async () => {
		const reactMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		const octaneMesh = reactMesh.clone();
		const reactInstances = new THREE.InstancedMesh(
			new THREE.SphereGeometry(),
			new THREE.MeshBasicMaterial(),
			3,
		);
		const octaneInstances = new THREE.InstancedMesh(
			new THREE.SphereGeometry(),
			new THREE.MeshBasicMaterial(),
			3,
		);
		const react = await reactExternal(reactMesh, reactInstances);
		const octane = await createOctaneThree(SamplerExternalScene, {
			meshRef: { current: octaneMesh },
			instancesRef: { current: octaneInstances },
			count: 3,
			weight: 'weight',
			transform,
			position: [4, 5, 6],
		});
		expect(matrices(octaneInstances, 3)).toEqual(matrices(reactInstances, 3));
		expect(octaneInstances.instanceMatrix.version).toBeGreaterThan(0);
		expect(reactInstances.instanceMatrix.version).toBeGreaterThan(0);
		expect(samplerCalls).toEqual([
			{ weight: 'weight', built: true },
			{ weight: 'weight', built: true },
		]);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches the hook default transform and returns a replaced buffer over the sampled storage', async () => {
		const react = await reactSurface(
			new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
		);
		let buffer!: THREE.InstancedBufferAttribute;
		const octane = await createOctaneThree(SurfaceSamplerScene, {
			mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
			count: 2,
			transform: undefined,
			weight: undefined,
			onBuffer: (value: THREE.InstancedBufferAttribute) => (buffer = value),
		});
		expect(Array.from(buffer.array)).toEqual(Array.from(react.buffer.array));
		expect(buffer.itemSize).toBe(react.buffer.itemSize);
		expect(buffer.version).toBe(react.buffer.version);
		expect(Array.from(buffer.array).slice(12, 15)).toEqual([1, 1.25, -1]);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
