import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Clone as ReactClone } from '@react-three/drei/core/Clone.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CloneProps } from '../src/index.js';
import { CloneScene } from './_fixtures/clone.three.tsrx';

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterAll(() => {
	if (previousActEnvironment === undefined)
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	else
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
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

function sourceGraph() {
	const root = new THREE.Group();
	root.name = 'source-root';
	root.position.set(1, 2, 3);
	root.userData = { source: true };
	const geometry = new THREE.BoxGeometry(1, 2, 3);
	const material = new THREE.MeshBasicMaterial({ color: 'royalblue' });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = 'source-mesh';
	const nested = new THREE.Group();
	nested.name = 'nested';
	const nestedMesh = new THREE.Mesh(geometry, material);
	nestedMesh.name = 'nested-mesh';
	nested.add(nestedMesh);
	root.add(mesh, nested);
	return { root, geometry, material };
}

function snapshot(root: THREE.Object3D, source: ReturnType<typeof sourceGraph>) {
	const values: unknown[] = [];
	root.traverse((object) => {
		const mesh = object as THREE.Mesh;
		values.push({
			type: object.type,
			name: object.name,
			position: object.position.toArray(),
			visible: object.visible,
			castShadow: mesh.isMesh ? mesh.castShadow : undefined,
			receiveShadow: mesh.isMesh ? mesh.receiveShadow : undefined,
			geometryIsSource: mesh.isMesh ? mesh.geometry === source.geometry : undefined,
			materialIsSource: mesh.isMesh ? mesh.material === source.material : undefined,
			geometryType: mesh.isMesh ? mesh.geometry.type : undefined,
			materialType: mesh.isMesh ? (mesh.material as THREE.Material).type : undefined,
			color: mesh.isMesh
				? (mesh.material as THREE.MeshBasicMaterial).color.getHexString()
				: undefined,
		});
	});
	return values;
}

async function mountReact(source: ReturnType<typeof sourceGraph>, props: Partial<CloneProps>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	const refs: Array<THREE.Object3D | null> = [];
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				ReactClone,
				{ object: source.root, ...props, ref: (value: THREE.Object3D | null) => refs.push(value) },
				React.createElement('group', { name: 'consumer-child' }),
			),
		),
	);
	return { root, refs };
}

describe('Clone', () => {
	it.each([
		['shallow', false],
		['deep', true],
		['materials only', 'materialsOnly'],
		['geometries only', 'geometriesOnly'],
	] as const)('matches the pinned React Drei oracle for %s cloning', async (_name, deep) => {
		const source = sourceGraph();
		const props = {
			deep,
			castShadow: true,
			receiveShadow: true,
			inject: { visible: false },
			name: 'override-root',
			position: [4, 5, 6] as [number, number, number],
		};
		const react = await mountReact(source, props);
		const octaneRefs: Array<THREE.Object3D | null> = [];
		const octane = await createOctaneThree(CloneScene, {
			object: source.root,
			...props,
			cloneRef: (value: THREE.Object3D | null) => octaneRefs.push(value),
		});
		const reactClone = react.refs.at(-1);
		const octaneClone = octaneRefs.at(-1);
		if (reactClone == null || octaneClone == null) throw new Error('Clone ref did not attach.');

		expect(snapshot(octaneClone, source)).toEqual(snapshot(reactClone, source));
		expect(octaneClone).not.toBe(source.root);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneRefs.at(-1)).toBeNull();
		expect(react.refs.at(-1)).toBeNull();
	});

	it('matches array wrapper structure and consumer children', async () => {
		const first = sourceGraph();
		const second = sourceGraph();
		second.root.name = 'second-root';
		const objects = [first.root, second.root];
		const react = await mountReact(first, { object: objects } as Partial<CloneProps>);
		const octaneRefs: Array<THREE.Object3D | null> = [];
		const octane = await createOctaneThree(CloneScene, {
			object: objects,
			cloneRef: (value: THREE.Object3D | null) => octaneRefs.push(value),
		});
		const reactClone = react.refs.at(-1)!;
		const octaneClone = octaneRefs.at(-1)!;
		expect(octaneClone.children.map((child) => child.name)).toEqual(
			reactClone.children.map((child) => child.name),
		);
		expect(octaneClone.type).toBe(reactClone.type);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
