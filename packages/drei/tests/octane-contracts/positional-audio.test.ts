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
import { PositionalAudioScene } from '../_fixtures/positional-audio.three.tsrx';

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

describe('PositionalAudio (Octane-only contracts)', () => {
	it('does not invent autoplay when upstream leaves it disabled', async () => {
		const play = vi.spyOn(ThreePositionalAudio.prototype, 'play');
		let sound!: ThreePositionalAudio;
		const root = await createOctaneThree(PositionalAudioScene, {
			url: '/quiet.ogg',
			distance: 1,
			loop: true,
			autoplay: false,
			position: [0, 0, 0],
			ref: (value: ThreePositionalAudio) => (sound = value),
		});
		await flush();
		expect(sound.isPlaying).toBe(false);
		expect(play).not.toHaveBeenCalled();
		play.mockRestore();
		root.unmount();
	});
});
