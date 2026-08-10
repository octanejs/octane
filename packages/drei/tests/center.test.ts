import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import {
	Center as ReactCenter,
	type OnCenterCallbackProps as ReactCenterData,
} from '@react-three/drei/core/Center.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { OnCenterCallbackProps } from '../src/index.js';
import { CenterScene } from './_fixtures/center.three.tsrx';

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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(element));
	return root;
}

function callbackSnapshot(value: ReactCenterData | OnCenterCallbackProps) {
	return {
		parent: value.parent.name,
		container: value.container.name,
		width: value.width,
		height: value.height,
		depth: value.depth,
		boxMin: value.boundingBox.min.toArray(),
		boxMax: value.boundingBox.max.toArray(),
		sphereCenter: value.boundingSphere.center.toArray(),
		sphereRadius: value.boundingSphere.radius,
		center: value.center.toArray(),
		verticalAlignment: value.verticalAlignment,
		horizontalAlignment: value.horizontalAlignment,
		depthAlignment: value.depthAlignment,
	};
}

const cases = [
	{ name: 'centered', props: {} },
	{ name: 'top-right-front', props: { top: true, right: true, front: true } },
	{
		name: 'bottom-left-back-disabled-y',
		props: { bottom: true, left: true, back: true, disableY: true },
	},
	{ name: 'fully-disabled', props: { disable: true } },
] as const;

describe('Center', () => {
	for (const testCase of cases) {
		it(`matches measurement, alignment, nesting, callbacks, and refs for ${testCase.name}`, async () => {
			let reactContainer: THREE.Group | null = null;
			let reactData: ReactCenterData | undefined;
			const react = await reactRoot(
				React.createElement(
					'group',
					{ name: 'parent' },
					React.createElement(
						ReactCenter,
						{
							...testCase.props,
							name: 'container',
							precise: true,
							ref: (value: THREE.Group | null) => (reactContainer = value),
							onCentered: (value: ReactCenterData) => (reactData = value),
						},
						React.createElement(
							'mesh',
							{ position: [2, 3, 4] },
							React.createElement('boxGeometry', { args: [2, 4, 6] }),
							React.createElement('meshBasicMaterial'),
						),
					),
				),
			);
			let octaneContainer: THREE.Group | null = null;
			let octaneData: OnCenterCallbackProps | undefined;
			const octane = await createOctaneThree(CenterScene, {
				top: false,
				right: false,
				bottom: false,
				left: false,
				front: false,
				back: false,
				disable: false,
				disableX: false,
				disableY: false,
				disableZ: false,
				object: undefined,
				precise: true,
				cacheKey: 0,
				...testCase.props,
				centerRef: (value: THREE.Group | null) => (octaneContainer = value),
				onCentered: (value: OnCenterCallbackProps) => (octaneData = value),
			});
			expect(callbackSnapshot(octaneData!)).toEqual(callbackSnapshot(reactData!));
			expect(octaneContainer!.children[0].position.toArray()).toEqual(
				reactContainer!.children[0].position.toArray(),
			);
			expect(octaneContainer!.children[0].children[0].children[0].position.toArray()).toEqual(
				reactContainer!.children[0].children[0].children[0].position.toArray(),
			);
			octane.unmount();
			await reactThreeAct(async () => react.unmount());
			expect(octaneContainer).toBeNull();
			expect(reactContainer).toBeNull();
		});
	}

	it('matches measurement of an explicit external object', async () => {
		const object = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 9), new THREE.MeshBasicMaterial());
		object.position.set(-3, 2, 6);
		object.updateMatrixWorld(true);
		let reactData: ReactCenterData | undefined;
		const react = await reactRoot(
			React.createElement(
				'group',
				{ name: 'parent' },
				React.createElement(ReactCenter, {
					object,
					name: 'container',
					onCentered: (value: ReactCenterData) => (reactData = value),
				}),
			),
		);
		let octaneData: OnCenterCallbackProps | undefined;
		const octane = await createOctaneThree(CenterScene, {
			top: false,
			right: false,
			bottom: false,
			left: false,
			front: false,
			back: false,
			disable: false,
			disableX: false,
			disableY: false,
			disableZ: false,
			object,
			precise: true,
			cacheKey: 'external',
			centerRef: () => undefined,
			onCentered: (value: OnCenterCallbackProps) => (octaneData = value),
		});
		expect(callbackSnapshot(octaneData!)).toEqual(callbackSnapshot(reactData!));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
		object.geometry.dispose();
		(object.material as THREE.Material).dispose();
	});
});
