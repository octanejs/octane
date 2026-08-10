import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type ReconcilerRoot,
} from '@react-three/fiber';
import { RoundedBoxGeometry as ReactRoundedBoxGeometry } from '@react-three/drei';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoundedBoxGeometryScene } from '../_fixtures/rounded-box.three.tsrx';

interface Input {
	args?: [width?: number, height?: number, depth?: number];
	radius?: number;
	smoothness?: number;
	bevelSegments?: number;
	steps?: number;
	creaseAngle?: number;
}

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterAll(() => {
	if (previousActEnvironment === undefined) {
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	} else {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	}
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

function geometrySnapshot(geometry: THREE.ExtrudeGeometry) {
	geometry.computeBoundingBox();
	const position = geometry.getAttribute('position');
	const normal = geometry.getAttribute('normal');
	return {
		parameters: {
			depth: geometry.parameters.options.depth,
			bevelEnabled: geometry.parameters.options.bevelEnabled,
			bevelSegments: geometry.parameters.options.bevelSegments,
			steps: geometry.parameters.options.steps,
			bevelSize: geometry.parameters.options.bevelSize,
			bevelThickness: geometry.parameters.options.bevelThickness,
			curveSegments: geometry.parameters.options.curveSegments,
		},
		positionCount: position.count,
		normalCount: normal.count,
		boundingBox: [geometry.boundingBox!.min.toArray(), geometry.boundingBox!.max.toArray()],
		positions: Array.from(position.array),
		normals: Array.from(normal.array),
	};
}

async function mountReact(input: Input): Promise<{
	geometry: THREE.ExtrudeGeometry;
	root: ReconcilerRoot<HTMLCanvasElement>;
}> {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: noWebGLRenderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	let geometry: THREE.ExtrudeGeometry | null = null;
	await reactThreeAct(async () => {
		root.render(
			React.createElement(
				'mesh',
				null,
				React.createElement(ReactRoundedBoxGeometry, {
					...input,
					ref: (value) => (geometry = value),
				}),
			),
		);
	});
	if (geometry === null) throw new Error('React Drei did not attach RoundedBoxGeometry.');
	return { geometry, root };
}

describe('RoundedBoxGeometry (Octane-only contracts)', () => {
	it('recreates geometry when constructor inputs change and preserves it for equal args', async () => {
		const refs: Array<THREE.ExtrudeGeometry | null> = [];
		const geometryRef = (value: THREE.ExtrudeGeometry | null) => refs.push(value);
		const firstInput = { args: [2, 1, 0.5] as Input['args'], radius: 0.1 };
		const renderer = await createOctaneThree(RoundedBoxGeometryScene, {
			...firstInput,
			geometryRef,
		});
		const first = refs.at(-1)!;

		renderer.update(RoundedBoxGeometryScene, { ...firstInput, geometryRef });
		expect(refs.at(-1)).toBe(first);

		renderer.update(RoundedBoxGeometryScene, {
			args: [3, 1, 0.5],
			radius: 0.1,
			geometryRef,
		});
		const replacement = refs.at(-1)!;
		expect(replacement).not.toBe(first);
		expect(refs).toContain(null);

		renderer.unmount();
		expect(refs.at(-1)).toBeNull();
	});
});
