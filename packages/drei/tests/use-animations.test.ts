import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { useAnimations as reactUseAnimations } from '@react-three/drei/core/useAnimations.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UseAnimationsScene } from './_fixtures/use-animations.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('useAnimations', () => {
	it('matches names, lazy actions, roots, mixer advancement, and cleanup', async () => {
		const clips = [
			new THREE.AnimationClip('walk', 1, [
				new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 10]),
			]),
			new THREE.AnimationClip('idle', 1, []),
		];
		const reactObject = new THREE.Object3D();
		const octaneObject = new THREE.Object3D();
		let reactApi!: ReturnType<typeof reactUseAnimations>;
		function ReactScene() {
			reactApi = reactUseAnimations(clips, reactObject);
			return null;
		}
		const react = await reactRoot(ReactScene);
		let octaneApi!: ReturnType<typeof reactUseAnimations>;
		const octane = await createOctaneThree(UseAnimationsScene, {
			clips,
			root: octaneObject,
			onApi: (api: typeof octaneApi) => (octaneApi = api),
		});

		expect(octaneApi.names).toEqual(reactApi.names);
		expect(Object.keys(octaneApi.actions)).toEqual(Object.keys(reactApi.actions));
		expect(octaneApi.ref.current).toBe(octaneObject);
		expect(reactApi.ref.current).toBe(reactObject);
		expect(octaneApi.actions.walk?.getRoot()).toBe(octaneObject);
		expect(reactApi.actions.walk?.getRoot()).toBe(reactObject);
		octaneApi.actions.walk?.play();
		reactApi.actions.walk?.play();
		const reactUpdate = reactApi.mixer.update.bind(reactApi.mixer);
		const octaneUpdate = octaneApi.mixer.update.bind(octaneApi.mixer);
		let reactFrameUpdates = 0;
		let octaneFrameUpdates = 0;
		reactApi.mixer.update = (delta) => {
			reactFrameUpdates++;
			return reactUpdate(delta);
		};
		octaneApi.mixer.update = (delta) => {
			octaneFrameUpdates++;
			return octaneUpdate(delta);
		};
		reactAdvance(500, true, react.getState());
		octane.advanceFrames(1, 0.5);
		expect(octaneFrameUpdates).toBe(reactFrameUpdates);
		expect(octaneFrameUpdates).toBe(1);
		reactUpdate(0.5);
		expect(octaneObject.position.x).toBeCloseTo(reactObject.position.x);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(Boolean(octaneApi.mixer.existingAction(clips[0], octaneObject))).toBe(
			Boolean(reactApi.mixer.existingAction(clips[0], reactObject)),
		);
	});
});
