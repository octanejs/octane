import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type ReconcilerRoot,
} from '@react-three/fiber';
import * as ReactDrei from '@react-three/drei';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShapeScene } from './_fixtures/shapes.three.tsrx';

type ShapeName = keyof Pick<
	typeof ReactDrei,
	| 'Box'
	| 'Capsule'
	| 'Circle'
	| 'Cone'
	| 'Cylinder'
	| 'Dodecahedron'
	| 'Extrude'
	| 'Icosahedron'
	| 'Lathe'
	| 'Octahedron'
	| 'Plane'
	| 'Polyhedron'
	| 'Ring'
	| 'Shape'
	| 'Sphere'
	| 'Tetrahedron'
	| 'Torus'
	| 'TorusKnot'
	| 'Tube'
>;

const path = new THREE.CatmullRomCurve3([
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(0.5, 1, 0),
	new THREE.Vector3(1, 0, 0),
]);
const shape = new THREE.Shape().moveTo(0, 0).lineTo(2, 0).lineTo(2, 1).lineTo(0, 1).closePath();
const cases: ReadonlyArray<readonly [ShapeName, unknown[]]> = [
	['Box', [2, 3, 4, 2, 2, 2]],
	['Capsule', [0.5, 1.5, 6, 12]],
	['Circle', [1.5, 12, 0.2, 4]],
	['Cone', [1, 2, 12, 2, false, 0.1, 4]],
	['Cylinder', [1, 0.5, 2, 12, 2, false, 0.1, 4]],
	['Dodecahedron', [1.25, 1]],
	['Extrude', [shape, { depth: 0.4, bevelEnabled: false, steps: 2 }]],
	['Icosahedron', [1.25, 1]],
	['Lathe', [[new THREE.Vector2(0, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0.5, 2)], 10]],
	['Octahedron', [1.25, 1]],
	['Plane', [2, 3, 3, 2]],
	[
		'Polyhedron',
		[[1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1], [2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1], 1, 0],
	],
	['Ring', [0.5, 1.5, 12, 3, 0.2, 4]],
	['Shape', [shape, 8]],
	['Sphere', [1.25, 12, 8, 0.1, 4, 0.2, 2]],
	['Tetrahedron', [1.25, 1]],
	['Torus', [1.2, 0.3, 8, 16, 4]],
	['TorusKnot', [1, 0.25, 32, 6, 2, 3]],
	['Tube', [path, 12, 0.2, 6, false]],
];

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

function noWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
	} as unknown as THREE.WebGLRenderer;
}

function snapshot(mesh: THREE.Mesh) {
	const geometry = mesh.geometry;
	return {
		geometryType: geometry.type,
		position: Array.from(geometry.getAttribute('position').array),
		normal: geometry.getAttribute('normal')
			? Array.from(geometry.getAttribute('normal').array)
			: null,
		uv: geometry.getAttribute('uv') ? Array.from(geometry.getAttribute('uv').array) : null,
		index: geometry.index ? Array.from(geometry.index.array) : null,
		name: mesh.name,
		positionProp: mesh.position.toArray(),
		materialType: (mesh.material as THREE.Material).type,
		materialColor: (mesh.material as THREE.MeshBasicMaterial).color.getHexString(),
	};
}

async function mountReact(
	name: ShapeName,
	args: unknown[],
): Promise<{ mesh: THREE.Mesh; root: ReconcilerRoot<HTMLCanvasElement> }> {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: noWebGLRenderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	let mesh: THREE.Mesh | null = null;
	const Component = ReactDrei[name] as React.ElementType;
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				Component,
				{
					args,
					name: 'parity-shape',
					position: [1, 2, 3],
					ref: (value: THREE.Mesh | null) => (mesh = value),
				},
				React.createElement('meshBasicMaterial', { color: 'hotpink' }),
			),
		),
	);
	if (mesh === null) throw new Error(`React Drei did not attach ${name}.`);
	return { mesh, root };
}

describe('shape primitives', () => {
	it.each(cases)('%s matches the pinned React Drei oracle', async (name, args) => {
		const refs: Array<THREE.Mesh | null> = [];
		const octane = await createOctaneThree(ShapeScene, {
			name,
			args,
			meshRef: (value: THREE.Mesh | null) => refs.push(value),
		});
		const react = await mountReact(name, args);
		const octaneMesh = refs.at(-1);
		if (octaneMesh == null) throw new Error(`Octane did not attach ${name}.`);

		expect(snapshot(octaneMesh)).toEqual(snapshot(react.mesh));

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(refs.at(-1)).toBeNull();
	});
});
