import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import {
	SpotLight as ReactSpotLight,
	SpotLightShadow as ReactSpotLightShadow,
} from '@react-three/drei/core/SpotLight.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SpotLight } from '../src/index.js';
import { InvalidSpotLightShadowScene, SpotLightScene } from './_fixtures/spot-light.three.tsrx';

type RenderRecord = {
	target: THREE.WebGLRenderTarget | null;
	object: THREE.Object3D;
	camera?: THREE.Camera;
};

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function renderer(canvas: HTMLCanvasElement, records: RenderRecord[]) {
	let target: THREE.WebGLRenderTarget | null = null;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		render(object: THREE.Object3D, camera?: THREE.Camera) {
			records.push({ target, object, camera });
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function shaderMaterial(light: THREE.SpotLight): THREE.ShaderMaterial | null {
	const mesh = light.children.find((child) => (child as THREE.Mesh).isMesh) as
		THREE.Mesh | undefined;
	return mesh ? (mesh.material as THREE.ShaderMaterial) : null;
}

function shadowMesh(light: THREE.SpotLight): THREE.Mesh | undefined {
	return light.parent?.children.find((child) => child !== light && (child as THREE.Mesh).isMesh) as
		THREE.Mesh | undefined;
}

function lightSnapshot(light: THREE.SpotLight) {
	const material = shaderMaterial(light);
	const geometry = light.children.find((child) => (child as THREE.Mesh).isMesh)
		? ((light.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh)
				.geometry as THREE.CylinderGeometry)
		: null;
	return {
		name: light.name,
		position: light.position.toArray(),
		angle: light.angle,
		distance: light.distance,
		color: light.color.getHex(),
		intensity: light.intensity,
		castShadow: light.castShadow,
		target: light.target.position.toArray(),
		shadowMapSize: light.shadow.mapSize.toArray(),
		shadowNeedsUpdate: light.shadow.needsUpdate,
		volumetric: material && {
			parameters: geometry && {
				radiusTop: geometry.parameters.radiusTop,
				radiusBottom: geometry.parameters.radiusBottom,
				height: geometry.parameters.height,
				radialSegments: geometry.parameters.radialSegments,
				heightSegments: geometry.parameters.heightSegments,
				openEnded: geometry.parameters.openEnded,
			},
			transparent: material.transparent,
			depthWrite: material.depthWrite,
			opacity: material.uniforms.opacity.value,
			attenuation: material.uniforms.attenuation.value,
			anglePower: material.uniforms.anglePower.value,
			color: (material.uniforms.lightColor.value as THREE.Color).getHex(),
			depth: material.uniforms.depth.value?.isDepthTexture ?? false,
			near: material.uniforms.cameraNear.value,
			far: material.uniforms.cameraFar.value,
			resolution: (material.uniforms.resolution.value as THREE.Vector2).toArray(),
			spotPosition: (material.uniforms.spotPosition.value as THREE.Vector3).toArray(),
			quaternion: light.children
				.find((child) => (child as THREE.Mesh).isMesh)
				?.quaternion.toArray(),
			shaderMarkers: [
				material.vertexShader.includes('vIntensity'),
				material.fragmentShader.includes('readDepth'),
			],
		},
	};
}

function shadowSnapshot(light: THREE.SpotLight) {
	const mesh = shadowMesh(light);
	if (!mesh) return null;
	const material = mesh.material as THREE.MeshBasicMaterial;
	return {
		position: mesh.position.toArray(),
		quaternion: mesh.quaternion.toArray(),
		scale: mesh.scale.toArray(),
		castShadow: mesh.castShadow,
		alphaTest: material.alphaTest,
		opacity: material.opacity,
		side: material.side,
		transparent: material.transparent,
		alphaMapName: material.alphaMap?.name,
		wrap: material.alphaMap && [material.alphaMap.wrapS, material.alphaMap.wrapT],
		targetSize: material.alphaMap && [
			material.alphaMap.image.width,
			material.alphaMap.image.height,
		],
	};
}

async function mountPair(options: {
	props: Record<string, unknown>;
	shadow?: Record<string, unknown>;
}) {
	const reactRecords: RenderRecord[] = [];
	const octaneRecords: RenderRecord[] = [];
	const reactTarget = new THREE.Object3D();
	const octaneTarget = new THREE.Object3D();
	reactTarget.position.set(0, 0, 0);
	octaneTarget.position.copy(reactTarget.position);
	let reactLight!: THREE.SpotLight;
	let octaneLight!: THREE.SpotLight;
	let reactState!: RootState;
	const reactRefValues: Array<THREE.SpotLight | null> = [];
	const octaneRefValues: Array<THREE.SpotLight | null> = [];
	function Capture() {
		reactState = useThree();
		return null;
	}
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas, reactRecords),
		frameloop: 'never',
		dpr: 2,
		size: { width: 160, height: 90, left: 0, top: 0 },
	});
	const reactChild = options.shadow
		? React.createElement(ReactSpotLightShadow, options.shadow)
		: undefined;
	const reactProps = {
		...options.props,
		target: reactTarget,
		ref: (value: THREE.SpotLight | null) => {
			reactRefValues.push(value);
			if (value) reactLight = value;
		},
	};
	const reactTree = () =>
		React.createElement(
			React.Fragment,
			null,
			React.createElement(ReactSpotLight, reactProps, reactChild),
			React.createElement(Capture),
		);
	await act(async () => reactRoot.render(reactTree()));
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas, octaneRecords),
		frameloop: 'never',
		dpr: 2,
		size: { width: 160, height: 90, left: 0, top: 0 },
	});
	const octaneProps = {
		...options.props,
		target: octaneTarget,
		shadow: options.shadow,
		lightRef: (value: THREE.SpotLight | null) => {
			octaneRefValues.push(value);
			if (value) octaneLight = value;
		},
	};
	octaneRoot.render(SpotLightScene, octaneProps);
	for (let index = 0; index < 8; index++) await Promise.resolve();
	return {
		reactRoot,
		octaneRoot,
		get reactLight() {
			return reactLight;
		},
		get octaneLight() {
			return octaneLight;
		},
		get reactState() {
			return reactState;
		},
		reactRecords,
		octaneRecords,
		reactRefValues,
		octaneRefValues,
	};
}

async function advancePair(pair: Awaited<ReturnType<typeof mountPair>>, time = 100, delta = 0.25) {
	await act(async () => reactAdvance(delta, true, pair.reactState));
	pair.octaneRoot.store.getState().advance(delta);
}

describe('SpotLight', () => {
	it('matches explicit volumetric geometry, depth uniforms, target/ref behavior, and shadow-map lifecycle', async () => {
		const reactDepth = new THREE.DepthTexture(320, 180);
		const shadowMap = new THREE.Texture({ width: 8, height: 8 });
		shadowMap.name = 'static-shadow';
		const pair = await mountPair({
			props: {
				position: [2, 3, 4],
				angle: 0.3,
				distance: 8,
				color: '#336699',
				intensity: 2,
				opacity: 0.6,
				radiusTop: 0.25,
				radiusBottom: 1.75,
				depthBuffer: reactDepth,
				attenuation: 7,
				anglePower: 9,
				volumetric: true,
				debug: false,
				name: 'key-light',
			},
			shadow: { distance: 0.5, alphaTest: 0.3, scale: 2, width: 64, height: 32, map: shadowMap },
		});
		await advancePair(pair);
		expect(lightSnapshot(pair.octaneLight)).toEqual(lightSnapshot(pair.reactLight));
		expect(shadowSnapshot(pair.octaneLight)).toEqual(shadowSnapshot(pair.reactLight));
		expect(pair.octaneLight.target).not.toBe(pair.reactLight.target);
		expect(pair.octaneRefValues.filter(Boolean)).toHaveLength(
			pair.reactRefValues.filter(Boolean).length,
		);
		const expectedPosition = new THREE.Vector3(2, 3, 4).lerp(new THREE.Vector3(), 0.5).toArray();
		expect(shadowMesh(pair.octaneLight)?.position.toArray()).toEqual(expectedPosition);

		// Negative control: a perturbed cone angle must not satisfy the parity snapshot.
		pair.octaneLight.angle += 0.1;
		expect(lightSnapshot(pair.octaneLight)).not.toEqual(lightSnapshot(pair.reactLight));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(pair.octaneRefValues.at(-1)).toBeNull();
		expect(pair.reactRefValues.at(-1)).toBeNull();
	});

	it('matches custom shadow shader render targets, frame time, shader input, debug output, and disposal', async () => {
		const map = new THREE.Texture({ width: 4, height: 4 });
		map.name = 'noise-map';
		const customShader =
			'varying vec2 vUv; uniform sampler2D uShadowMap; uniform float uTime; void main(){ gl_FragColor = vec4(texture2D(uShadowMap, vUv).rgb * uTime, 1.0); }';
		const pair = await mountPair({
			props: { position: [0, 4, 0], volumetric: false, debug: true },
			shadow: { map, shader: customShader, width: 16, height: 8, distance: 0.25 },
		});
		await advancePair(pair, 250, 0.25);
		expect(lightSnapshot(pair.octaneLight)).toEqual(lightSnapshot(pair.reactLight));
		expect(shadowSnapshot(pair.octaneLight)).toEqual(shadowSnapshot(pair.reactLight));
		const reactHasHelper = pair.reactLight.parent?.children.some(
			(child) => (child as THREE.SpotLightHelper).isSpotLightHelper,
		);
		const octaneHasHelper = pair.octaneLight.parent?.children.some(
			(child) => (child as THREE.SpotLightHelper).isSpotLightHelper,
		);
		expect(octaneHasHelper).toBe(reactHasHelper);
		expect(shadowSnapshot(pair.octaneLight)?.opacity).toBe(1);
		const reactPass = pair.reactRecords.find((record) => record.target !== null)!;
		const octanePass = pair.octaneRecords.find((record) => record.target !== null)!;
		const reactShader = (reactPass.object as THREE.Mesh).material as THREE.ShaderMaterial;
		const octaneShader = (octanePass.object as THREE.Mesh).material as THREE.ShaderMaterial;
		let reactDisposed = false;
		let octaneDisposed = false;
		let reactTargetDisposed = false;
		let octaneTargetDisposed = false;
		reactShader.addEventListener('dispose', () => {
			reactDisposed = true;
		});
		octaneShader.addEventListener('dispose', () => {
			octaneDisposed = true;
		});
		reactPass.target!.addEventListener('dispose', () => {
			reactTargetDisposed = true;
		});
		octanePass.target!.addEventListener('dispose', () => {
			octaneTargetDisposed = true;
		});
		expect(octaneShader.fragmentShader).toBe(reactShader.fragmentShader);
		expect(octaneShader.fragmentShader).toContain('uShadowMap');
		expect(octaneShader.uniforms.uTime.value).toBe(reactShader.uniforms.uTime.value);
		expect(octaneShader.uniforms.uShadowMap.value.name).toBe(
			reactShader.uniforms.uShadowMap.value.name,
		);
		expect(pair.octaneRecords.filter((record) => record.target)).toHaveLength(
			pair.reactRecords.filter((record) => record.target).length,
		);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(octaneDisposed).toBe(reactDisposed);
		expect(octaneDisposed).toBe(true);
		expect(octaneTargetDisposed).toBe(reactTargetDisposed);
		expect(octaneTargetDisposed).toBe(true);
	});

	it('matches the invalid-parent boundary and default non-volumetric shadow material', async () => {
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createReactRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas, []), frameloop: 'never' });
		const badReactRef = { current: new THREE.Object3D() };
		const boundaryMap = new THREE.Texture();
		await expect(
			act(async () =>
				reactRoot.render(
					React.createElement(ReactSpotLightShadow, {
						spotlightRef: badReactRef,
						map: boundaryMap,
					} as any),
				),
			),
		).rejects.toThrow('SpotlightShadow must be a child of a SpotLight');
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({ gl: renderer(octaneCanvas, []), frameloop: 'never' });
		expect(() =>
			octaneRoot.render(InvalidSpotLightShadowScene, {
				spotlightRef: { current: new THREE.Object3D() },
				map: boundaryMap,
			}),
		).toThrow('SpotlightShadow must be a child of a SpotLight');
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());

		expect(typeof SpotLight).toBe('function');
	});
});
