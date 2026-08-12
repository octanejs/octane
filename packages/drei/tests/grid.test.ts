import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Grid as ReactGrid } from '@react-three/drei/core/Grid.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GridScene } from './_fixtures/grid.three.tsrx';

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

async function reactGrid(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	let value: THREE.Mesh | null = null;
	function Scene() {
		get = reactUseThree((state) => state.get);
		return React.createElement(ReactGrid, {
			...props,
			ref: (mesh: THREE.Mesh | null) => (value = mesh),
			name: 'grid',
		});
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, getState: () => get(), value: value! as THREE.Mesh };
}

function snapshot(mesh: THREE.Mesh) {
	const material = mesh.material as THREE.ShaderMaterial;
	const uniformValue = (name: string) => {
		const value = material.uniforms[name].value;
		return value instanceof THREE.Color ? value.getHex() : value;
	};
	return {
		name: mesh.name,
		frustumCulled: mesh.frustumCulled,
		geometry: (mesh.geometry as THREE.PlaneGeometry).parameters,
		transparent: material.transparent,
		side: material.side,
		vertexShader: material.vertexShader.replace(/\s+/g, ' ').trim(),
		fragmentShader: material.fragmentShader.replace(/\s+/g, ' ').trim(),
		uniforms: [
			'cellSize',
			'sectionSize',
			'cellColor',
			'sectionColor',
			'cellThickness',
			'sectionThickness',
			'fadeDistance',
			'fadeStrength',
			'fadeFrom',
			'infiniteGrid',
			'followCamera',
		].map((name) => [name, uniformValue(name)]),
	};
}

describe('Grid', () => {
	it('matches shaders, custom uniforms, geometry, props, and refs', async () => {
		const props = {
			args: [5, 7, 2, 3],
			cellColor: '#123456',
			sectionColor: '#abcdef',
			cellSize: 0.25,
			sectionSize: 2,
			followCamera: true,
			infiniteGrid: true,
			fadeDistance: 42,
			fadeStrength: 1.5,
			fadeFrom: 0.25,
			cellThickness: 0.75,
			sectionThickness: 1.25,
			side: THREE.DoubleSide,
		};
		const react = await reactGrid(props);
		let octaneValue: THREE.Mesh | null = null;
		const octane = await createOctaneThree(GridScene, {
			...props,
			gridRef: (mesh: THREE.Mesh | null) => (octaneValue = mesh),
		});
		expect(snapshot(octaneValue!)).toEqual(snapshot(react.value));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches projected camera and world-plane uniforms on each frame', async () => {
		const props = { position: [1, 2, 3], followCamera: true };
		const react = await reactGrid(props);
		let octaneValue: THREE.Mesh | null = null;
		const octane = await createOctaneThree(GridScene, {
			...props,
			gridRef: (mesh: THREE.Mesh | null) => (octaneValue = mesh),
		});
		for (const state of [react.getState(), octane.store.getState()]) {
			state.camera.position.set(4, 8, 12);
			state.camera.updateMatrixWorld();
		}
		react.value.updateMatrixWorld();
		octaneValue!.updateMatrixWorld();
		reactAdvance(1, true, react.getState());
		octane.advanceFrames(1, 1);
		const frameUniforms = (mesh: THREE.Mesh) => {
			const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
			return {
				camera: uniforms.worldCamProjPosition.value.toArray(),
				plane: uniforms.worldPlanePosition.value.toArray(),
			};
		};
		expect(frameUniforms(octaneValue!)).toEqual(frameUniforms(react.value));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
