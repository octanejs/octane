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
} from '../_fixtures/sampler.three.tsrx';

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

describe('Sampler (Octane-only contracts)', () => {
	it('matches automatic child discovery for the sampled and controlled meshes', async () => {
		let sampled!: THREE.Mesh;
		let instances!: THREE.InstancedMesh;
		const root = await createOctaneThree(SamplerAutoScene, {
			meshRef: (value: THREE.Mesh) => (sampled = value),
			instancesRef: (value: THREE.InstancedMesh) => (instances = value),
			geometry: new THREE.PlaneGeometry(2, 2),
			meshMaterial: new THREE.MeshBasicMaterial(),
			instanceGeometry: new THREE.BoxGeometry(),
			instanceMaterial: new THREE.MeshBasicMaterial(),
			count: 2,
			transform,
		});
		expect(sampled.type).toBe('Mesh');
		expect(instances.isInstancedMesh).toBe(true);
		expect(matrices(instances, 2).slice(12, 15)).toEqual([1, 1.25 + 1, -1]);
		expect(instances.instanceMatrix.version).toBeGreaterThan(0);
		root.unmount();
	});
});
