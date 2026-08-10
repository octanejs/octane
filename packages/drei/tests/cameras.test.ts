import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	CubeCamera as ReactCubeCamera,
	useCubeCamera as reactUseCubeCamera,
} from '@react-three/drei/core/CubeCamera.js';
import { OrthographicCamera as ReactOrthographicCamera } from '@react-three/drei/core/OrthographicCamera.js';
import { PerspectiveCamera as ReactPerspectiveCamera } from '@react-three/drei/core/PerspectiveCamera.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	CubeCameraScene,
	OrthographicScene,
	PerspectiveContentScene,
	PerspectiveScene,
	UseCubeCameraScene,
} from './_fixtures/cameras.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

type Recorder = THREE.WebGLRenderer & {
	renderCount: number;
	renderTarget: THREE.WebGLRenderTarget | null;
};

function renderer(canvas: HTMLCanvasElement): Recorder {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		renderCount: 0,
		renderTarget: null,
		render() {
			this.renderCount++;
		},
		setRenderTarget(target: THREE.WebGLRenderTarget | null) {
			this.renderTarget = target;
		},
		getRenderTarget() {
			return this.renderTarget;
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as Recorder;
}

async function reactRoot(element: React.ReactNode, width = 400, height = 200) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	const gl = renderer(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
	}
	await root.configure({
		gl,
		frameloop: 'never',
		dpr: 1,
		size: { width, height, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, gl, getState: () => get() };
}

describe('camera helpers', () => {
	it('matches PerspectiveCamera defaults, functional rendering, frame limit, and cleanup', async () => {
		const environment = new THREE.Texture();
		const originalBackground = new THREE.Color('blue');
		let reactCamera: THREE.PerspectiveCamera | null = null;
		let reactTexture: THREE.Texture | null = null;
		const renderChild = (texture: THREE.Texture) => {
			reactTexture = texture;
			return React.createElement('group', { name: 'functional-content' });
		};
		const react = await reactRoot(
			React.createElement(ReactPerspectiveCamera, {
				ref: (value: THREE.PerspectiveCamera | null) => (reactCamera = value),
				makeDefault: true,
				frames: 1,
				resolution: 64,
				envMap: environment,
				name: 'perspective',
				children: renderChild,
			}),
		);
		let octaneCamera: THREE.PerspectiveCamera | null = null;
		let octaneTexture: THREE.Texture | null = null;
		const octane = await createOctaneThree(
			PerspectiveScene,
			{
				cameraRef: (value: THREE.PerspectiveCamera | null) => (octaneCamera = value),
				makeDefault: true,
				manual: false,
				frames: 1,
				resolution: 64,
				envMap: environment,
				children: (texture: THREE.Texture) => {
					octaneTexture = texture;
					return null;
				},
			},
			{ width: 400, height: 200 },
		);
		react.getState().scene.background = originalBackground;
		octane.scene.background = originalBackground;
		expect(octane.store.getState().camera).toBe(octaneCamera);
		expect(react.getState().camera).toBe(reactCamera);
		expect(octaneCamera!.aspect).toBe(reactCamera!.aspect);
		expect(octaneTexture!.image).toEqual(reactTexture!.image);
		expect(octaneTexture!.image).toMatchObject({ width: 64, height: 200 });
		const reactBefore = react.gl.renderCount;
		const octaneBefore = octane.renderer.frameCount;
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		reactAdvance(2000, true, react.getState());
		octane.advanceFrames(1);
		expect(octane.renderer.frameCount - octaneBefore).toBe(react.gl.renderCount - reactBefore);
		expect(octane.scene.background).toBe(originalBackground);
		expect(react.getState().scene.background).toBe(originalBackground);
		const reactDefault = react.getState().camera;
		const octaneDefault = octane.store.getState().camera;
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octane.store.getState().camera).not.toBe(octaneDefault);
		expect(react.getState().camera).not.toBe(reactDefault);
	});

	it('matches ordinary PerspectiveCamera children and OrthographicCamera viewport bounds', async () => {
		let reactPerspective: THREE.PerspectiveCamera | null = null;
		const reactContent = await reactRoot(
			React.createElement(
				ReactPerspectiveCamera,
				{ ref: (value: THREE.PerspectiveCamera | null) => (reactPerspective = value) },
				React.createElement('group', { name: 'camera-child' }),
			),
		);
		let octanePerspective: THREE.PerspectiveCamera | null = null;
		const octaneContent = await createOctaneThree(PerspectiveContentScene, {
			cameraRef: (value: THREE.PerspectiveCamera | null) => (octanePerspective = value),
		});
		expect(octanePerspective!.children[0].name).toBe(reactPerspective!.children[0].name);

		let reactCamera: THREE.OrthographicCamera | null = null;
		const react = await reactRoot(
			React.createElement(ReactOrthographicCamera, {
				ref: (value: THREE.OrthographicCamera | null) => (reactCamera = value),
			}),
			320,
			180,
		);
		let octaneCamera: THREE.OrthographicCamera | null = null;
		const octane = await createOctaneThree(
			OrthographicScene,
			{
				cameraRef: (value: THREE.OrthographicCamera | null) => (octaneCamera = value),
				makeDefault: false,
				manual: false,
				frames: Infinity,
				resolution: 32,
				envMap: undefined,
				children: undefined,
			},
			{ width: 320, height: 180 },
		);
		const bounds = (camera: THREE.OrthographicCamera) => ({
			left: camera.left,
			right: camera.right,
			top: camera.top,
			bottom: camera.bottom,
		});
		expect(bounds(octaneCamera!)).toEqual(bounds(reactCamera!));
		octane.unmount();
		octaneContent.unmount();
		await reactThreeAct(async () => react.root.unmount());
		await reactThreeAct(async () => reactContent.root.unmount());
	});

	it('matches useCubeCamera construction, temporary scene state, and disposal', async () => {
		const envMap = new THREE.Texture();
		const fog = new THREE.Fog('white', 1, 10);
		let reactValue!: ReturnType<typeof reactUseCubeCamera>;
		function ReactHook() {
			reactValue = reactUseCubeCamera({ resolution: 32, near: 0.5, far: 50, envMap, fog });
			return null;
		}
		const react = await reactRoot(React.createElement(ReactHook));
		let octaneValue!: ReturnType<typeof reactUseCubeCamera>;
		const octane = await createOctaneThree(UseCubeCameraScene, {
			options: { resolution: 32, near: 0.5, far: 50, envMap, fog },
			onValue: (value: ReturnType<typeof reactUseCubeCamera>) => (octaneValue = value),
		});
		const construction = (value: ReturnType<typeof reactUseCubeCamera>) => ({
			width: value.fbo.width,
			height: value.fbo.height,
			type: value.fbo.texture.type,
			near: value.camera.near,
			far: value.camera.far,
		});
		expect(construction(octaneValue)).toEqual(construction(reactValue));
		const reactOriginalBackground = new THREE.Color('red');
		const octaneOriginalBackground = new THREE.Color('red');
		const reactOriginalFog = new THREE.Fog('black', 2, 20);
		const octaneOriginalFog = new THREE.Fog('black', 2, 20);
		react.getState().scene.background = reactOriginalBackground;
		react.getState().scene.fog = reactOriginalFog;
		octane.scene.background = octaneOriginalBackground;
		octane.scene.fog = octaneOriginalFog;
		let reactDuring: unknown;
		let octaneDuring: unknown;
		reactValue.camera.update = (_gl, scene) =>
			(reactDuring = { background: scene.background, fog: scene.fog });
		octaneValue.camera.update = (_gl, scene) =>
			(octaneDuring = { background: scene.background, fog: scene.fog });
		reactValue.update();
		octaneValue.update();
		expect(octaneDuring).toEqual(reactDuring);
		expect(octane.scene.background).toBe(octaneOriginalBackground);
		expect(octane.scene.fog).toBe(octaneOriginalFog);
		let reactDisposed = false;
		let octaneDisposed = false;
		reactValue.fbo.addEventListener('dispose', () => (reactDisposed = true));
		octaneValue.fbo.addEventListener('dispose', () => (octaneDisposed = true));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneDisposed).toBe(reactDisposed);
		expect(octaneDisposed).toBe(true);
	});

	it('matches CubeCamera child texture, camera graph, visibility, and frame limit', async () => {
		let reactTexture: THREE.Texture | null = null;
		const react = await reactRoot(
			React.createElement(ReactCubeCamera, {
				resolution: 16,
				near: 0.25,
				far: 25,
				frames: 1,
				children: (texture: THREE.Texture) => {
					reactTexture = texture;
					return React.createElement('group', { name: 'cube-content' });
				},
			}),
		);
		let octaneTexture: THREE.Texture | null = null;
		const octane = await createOctaneThree(CubeCameraScene, {
			resolution: 16,
			near: 0.25,
			far: 25,
			frames: 1,
			children: (texture: THREE.Texture) => {
				octaneTexture = texture;
				return null;
			},
		});
		const reactCube = react.getState().scene.children[0].children[0] as THREE.CubeCamera;
		const octaneCube = octane.scene.getObjectByName('cube-root')!.children[0] as THREE.CubeCamera;
		let reactUpdates = 0;
		let octaneUpdates = 0;
		reactCube.update = () => void reactUpdates++;
		octaneCube.update = () => void octaneUpdates++;
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		reactAdvance(2000, true, react.getState());
		octane.advanceFrames(1);
		expect(octaneUpdates).toBe(reactUpdates);
		expect(octaneUpdates).toBe(1);
		expect(octaneTexture!.image).toEqual(reactTexture!.image);
		expect((octaneTexture!.image as Array<{ width: number; height: number }>)[0]).toMatchObject({
			width: 16,
			height: 16,
		});
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
