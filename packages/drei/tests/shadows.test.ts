import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Shadow as ReactShadow } from '@react-three/drei/core/Shadow.js';
import { ShadowAlpha as ReactShadowAlpha } from '@react-three/drei/core/ShadowAlpha.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ShadowAlphaScene, ShadowScene } from './_fixtures/shadows.three.tsrx';

const contexts = new WeakMap<HTMLCanvasElement, { stops: Array<[number, string]> }>();
const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	HTMLCanvasElement.prototype.getContext = function () {
		const state = { stops: [] as Array<[number, string]> };
		contexts.set(this, state);
		return {
			createRadialGradient: () => ({
				addColorStop: (offset: number, color: string) => state.stops.push([offset, color]),
			}),
			set fillStyle(_: unknown) {},
			fillRect() {},
		} as unknown as CanvasRenderingContext2D;
	} as typeof HTMLCanvasElement.prototype.getContext;
});
afterAll(() => {
	HTMLCanvasElement.prototype.getContext = originalGetContext;
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
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('shadow helpers', () => {
	it('matches Shadow texture generation, geometry, material, transforms, and refs', async () => {
		const props = {
			color: '#336699',
			colorStop: 0.25,
			opacity: 0.7,
			fog: true,
			depthWrite: true,
			renderOrder: 4,
		};
		let reactMesh: THREE.Mesh | null = null;
		const react = await reactRoot(
			React.createElement(ReactShadow, {
				...props,
				ref: (value: THREE.Mesh | null) => (reactMesh = value),
				name: 'shadow',
			}),
		);
		let octaneMesh: THREE.Mesh | null = null;
		const octane = await createOctaneThree(ShadowScene, {
			...props,
			shadowRef: (value: THREE.Mesh | null) => (octaneMesh = value),
		});
		const snapshot = (mesh: THREE.Mesh) => {
			const material = mesh.material as THREE.MeshBasicMaterial;
			const canvas = material.map!.image as HTMLCanvasElement;
			return {
				rotation: mesh.rotation.toArray(),
				renderOrder: mesh.renderOrder,
				positionCount: mesh.geometry.getAttribute('position').count,
				material: {
					opacity: material.opacity,
					fog: material.fog,
					depthWrite: material.depthWrite,
					side: material.side,
					transparent: material.transparent,
				},
				canvas: [canvas.width, canvas.height],
				stops: contexts.get(canvas)?.stops,
			};
		};
		expect(snapshot(octaneMesh!)).toEqual(snapshot(reactMesh!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it.each([
		['inherited alpha map', undefined],
		['disabled alpha map', false],
		['explicit alpha map', new THREE.Texture()],
	])('matches ShadowAlpha shader uniforms for %s', async (_, alphaMap) => {
		const materialAlphaMap = new THREE.Texture();
		let reactMesh: THREE.Mesh | null = null;
		const react = await reactRoot(
			React.createElement(
				'mesh',
				{ ref: (value: THREE.Mesh | null) => (reactMesh = value) },
				React.createElement('boxGeometry'),
				React.createElement('meshBasicMaterial', { opacity: 0.35, alphaMap: materialAlphaMap }),
				React.createElement(ReactShadowAlpha, { alphaMap }),
			),
		);
		let octaneMesh: THREE.Mesh | null = null;
		const octane = await createOctaneThree(ShadowAlphaScene, {
			materialOpacity: 0.35,
			materialAlphaMap,
			alphaMap,
			meshRef: (value: THREE.Mesh | null) => (octaneMesh = value),
		});
		reactAdvance(1, true, react.getState());
		octane.advanceFrames(1, 1);
		const compile = (mesh: THREE.Mesh) => {
			const shader = {
				vertexShader: 'void main() {\n gl_Position = vec4(0.0);\n}',
				fragmentShader: 'void main() {\n gl_FragColor = vec4(1.0);\n}',
				uniforms: {},
			};
			mesh.customDepthMaterial!.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer);
			const uniforms = shader.uniforms as Record<string, { value: unknown }>;
			return {
				vertex: shader.vertexShader.replace(/\s+/g, ' '),
				fragment: shader.fragmentShader.replace(/\s+/g, ' '),
				opacity: uniforms.uShadowOpacity.value,
				alphaMap: uniforms.uAlphaMap.value,
				hasAlphaMap: uniforms.uHasAlphaMap.value,
				depthPacking: (mesh.customDepthMaterial as THREE.MeshDepthMaterial).depthPacking,
				distanceShaderInstalled: typeof mesh.customDistanceMaterial?.onBeforeCompile === 'function',
			};
		};
		expect(compile(octaneMesh!)).toEqual(compile(reactMesh!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
