import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { PositionalAudio as ReactPositionalAudio } from '@react-three/drei/core/PositionalAudio.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	AudioContext,
	AudioLoader,
	PerspectiveCamera,
	PositionalAudio as ThreePositionalAudio,
	type AudioBuffer,
	type WebGLRenderer,
} from 'three';
import * as THREE from 'three';
import { PositionalAudioScene } from './_fixtures/positional-audio.three.tsrx';

const originalLoad = AudioLoader.prototype.load;
const buffer = { duration: 2 } as AudioBuffer;

function audioParam(value = 0) {
	return { value, setTargetAtTime() {}, linearRampToValueAtTime() {} };
}

function audioNode(extra: Record<string, unknown> = {}) {
	return { connect() {}, disconnect() {}, ...extra };
}

const context = {
	currentTime: 0,
	destination: audioNode(),
	listener: {
		positionX: audioParam(),
		positionY: audioParam(),
		positionZ: audioParam(),
		forwardX: audioParam(),
		forwardY: audioParam(),
		forwardZ: audioParam(),
		upX: audioParam(),
		upY: audioParam(),
		upZ: audioParam(),
	},
	createGain: () => audioNode({ gain: audioParam(1) }),
	createPanner: () =>
		audioNode({
			panningModel: 'HRTF',
			distanceModel: 'inverse',
			refDistance: 1,
			rolloffFactor: 1,
			maxDistance: 10_000,
			coneInnerAngle: 360,
			coneOuterAngle: 0,
			coneOuterGain: 0,
			positionX: audioParam(),
			positionY: audioParam(),
			positionZ: audioParam(),
			orientationX: audioParam(),
			orientationY: audioParam(),
			orientationZ: audioParam(),
		}),
	createBufferSource: () =>
		audioNode({
			start() {},
			stop() {},
			detune: audioParam(),
			playbackRate: audioParam(1),
		}),
};

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	AudioContext.setContext(context as unknown as globalThis.AudioContext);
	AudioLoader.prototype.load = function (_url, onLoad) {
		queueMicrotask(() => onLoad?.(buffer));
		return this;
	};
});

afterAll(() => {
	AudioLoader.prototype.load = originalLoad;
});

function renderer(canvas: HTMLCanvasElement): WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: '',
		toneMapping: 0,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as WebGLRenderer;
}

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function snapshot(sound: ThreePositionalAudio) {
	return {
		buffer: sound.buffer,
		refDistance: sound.getRefDistance(),
		loop: sound.getLoop(),
		autoplay: sound.autoplay,
		position: sound.position.toArray(),
		listenerParent: sound.listener.parent?.type,
	};
}

describe('PositionalAudio', () => {
	it('matches the pinned React Drei configuration, ref, update, and camera listener lifecycle', async () => {
		const props = {
			url: '/sound.ogg',
			distance: 4,
			loop: false,
			autoplay: false,
			position: [1, 2, 3] as const,
		};
		let reactSound!: ThreePositionalAudio;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({
			gl: renderer(canvas),
			frameloop: 'never',
			dpr: 1,
			size: { width: 64, height: 64, top: 0, left: 0 },
			camera: new PerspectiveCamera(),
		});
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactPositionalAudio, {
						...props,
						ref: (value) => (reactSound = value!),
					}),
				),
			),
		);
		let octaneSound!: ThreePositionalAudio;
		const octaneRoot = await createOctaneThree(PositionalAudioScene, {
			...props,
			ref: (value: ThreePositionalAudio) => (octaneSound = value),
		});
		await flush();

		expect(snapshot(octaneSound)).toEqual(snapshot(reactSound));
		expect(octaneSound.listener.parent).toBeInstanceOf(PerspectiveCamera);

		octaneRoot.update(PositionalAudioScene, {
			...props,
			distance: 9,
			loop: true,
			ref: (value: ThreePositionalAudio) => (octaneSound = value),
		});
		await flush();
		expect(octaneSound.getRefDistance()).toBe(9);
		expect(octaneSound.getLoop()).toBe(true);

		const octaneListener = octaneSound.listener;
		octaneRoot.unmount();
		await flush();
		expect(octaneListener.parent).toBeNull();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
