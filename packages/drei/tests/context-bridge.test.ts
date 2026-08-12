import * as React from 'react';
import { act, createRoot } from '@react-three/fiber';
import { useContextBridge as reactUseContextBridge } from '@react-three/drei/core/useContextBridge.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ContextBridgeScene } from './_fixtures/context-bridge.three.tsrx';

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

describe('useContextBridge', () => {
	it('matches React by restoring every captured context over nested providers', async () => {
		const First = React.createContext('first-default');
		const Second = React.createContext('second-default');
		let reactValue: string[] = [];
		function Reader() {
			reactValue = [React.useContext(First), React.useContext(Second)];
			return null;
		}
		function Capture() {
			const Bridge = reactUseContextBridge(First, Second);
			return React.createElement(
				First.Provider,
				{ value: 'wrong-first' },
				React.createElement(
					Second.Provider,
					{ value: 'wrong-second' },
					React.createElement(Bridge, null, React.createElement(Reader)),
				),
			);
		}
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never' });
		await act(async () =>
			reactRoot.render(
				React.createElement(
					First.Provider,
					{ value: 'alpha' },
					React.createElement(Second.Provider, { value: 'beta' }, React.createElement(Capture)),
				),
			),
		);

		let octaneValue: string[] = [];
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({ gl: renderer(octaneCanvas), frameloop: 'never' });
		octaneRoot.render(ContextBridgeScene, {
			first: 'alpha',
			second: 'beta',
			onValue: (value: string[]) => (octaneValue = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(octaneValue).toEqual(reactValue);
		octaneValue[0] = 'mutated';
		expect(octaneValue).not.toEqual(reactValue);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
