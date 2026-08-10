import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { VideoTexture as ReactVideoTexture } from '@react-three/drei/core/VideoTexture.js';
import { ScreenVideoTexture as ReactScreenVideoTexture } from '@react-three/drei/web/ScreenVideoTexture.js';
import { WebcamVideoTexture as ReactWebcamVideoTexture } from '@react-three/drei/web/WebcamVideoTexture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	ScreenVideoTextureScene,
	VideoTextureScene,
	WebcamVideoTextureScene,
} from './_fixtures/video-textures.three.tsrx';

const mocks = vi.hoisted(() => {
	const instances: any[] = [];
	class Hls {
		static isSupported = () => true;
		listeners = new Map<string, () => void>();
		loadSource = vi.fn();
		attachMedia = vi.fn(() => this.listeners.get('hlsMediaAttached')?.());
		destroy = vi.fn();
		constructor(readonly config: unknown) {
			instances.push(this);
		}
		on(type: string, callback: () => void) {
			this.listeners.set(type, callback);
		}
	}
	return { Hls, instances };
});

vi.mock('hls.js', () => ({ default: mocks.Hls, Events: { MEDIA_ATTACHED: 'hlsMediaAttached' } }));

const originalCreateElement = document.createElement.bind(document);
let videos: HTMLVideoElement[] = [];
let frameCallbacks = new Map<number, VideoFrameRequestCallback>();
let nextFrameHandle = 1;

beforeEach(() => {
	videos = [];
	frameCallbacks = new Map();
	nextFrameHandle = 1;
	mocks.instances.length = 0;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.spyOn(document, 'createElement').mockImplementation(((
		tagName: string,
		options?: ElementCreationOptions,
	) => {
		const element = originalCreateElement(tagName, options);
		if (tagName.toLowerCase() === 'video') {
			const video = element as HTMLVideoElement;
			Object.defineProperty(video, 'play', {
				configurable: true,
				value: vi.fn(async () => undefined),
			});
			Object.defineProperty(video, 'requestVideoFrameCallback', {
				configurable: true,
				value: vi.fn((callback: VideoFrameRequestCallback) => {
					const handle = nextFrameHandle++;
					frameCallbacks.set(handle, callback);
					return handle;
				}),
			});
			Object.defineProperty(video, 'cancelVideoFrameCallback', {
				configurable: true,
				value: vi.fn((handle: number) => frameCallbacks.delete(handle)),
			});
			videos.push(video);
			queueMicrotask(() => video.dispatchEvent(new Event('loadedmetadata')));
		}
		return element;
	}) as typeof document.createElement);
});

afterEach(() => vi.restoreAllMocks());

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

async function flush(): Promise<void> {
	await reactThreeAct(async () => {
		for (let index = 0; index < 12; index++) await Promise.resolve();
	});
}

function textureSnapshot(texture: THREE.VideoTexture) {
	const video = texture.image as HTMLVideoElement;
	return {
		colorSpace: texture.colorSpace,
		src: video.src,
		crossOrigin: video.crossOrigin,
		muted: video.muted,
		loop: video.loop,
		playsInline: video.playsInline,
	};
}

describe('VideoTexture', () => {
	it('matches video configuration, suspension, ref/render callback, frame callback, start, and disposal', async () => {
		const props = {
			src: '/movie.mp4',
			unsuspend: 'loadedmetadata' as const,
			start: true,
			crossOrigin: 'use-credentials',
			muted: false,
			loop: false,
			playsInline: false,
		};
		let reactTexture: THREE.VideoTexture | null = null;
		const reactFrames = vi.fn();
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactVideoTexture, {
						...props,
						onVideoFrame: reactFrames,
						ref: (value) => (reactTexture = value),
						children: (value) => void (reactTexture = value) || null,
					}),
				),
			),
		);
		await flush();

		let octaneTexture: THREE.VideoTexture | null = null;
		const octaneFrames = vi.fn();
		const octaneRoot = await createOctaneThree(VideoTextureScene, {
			...props,
			onVideoFrame: octaneFrames,
			ref: (value: THREE.VideoTexture | null) => (octaneTexture = value),
			children: (value: THREE.VideoTexture) => void (octaneTexture = value) || null,
		});
		await flush();
		expect(textureSnapshot(octaneTexture!)).toEqual(textureSnapshot(reactTexture!));
		expect((octaneTexture!.image as HTMLVideoElement).play).toHaveBeenCalledOnce();
		expect((reactTexture!.image as HTMLVideoElement).play).toHaveBeenCalledOnce();

		for (const callback of [...frameCallbacks.values()])
			callback(1, {} as VideoFrameCallbackMetadata);
		expect(octaneFrames).toHaveBeenCalledTimes(reactFrames.mock.calls.length);
		const octaneDispose = vi.spyOn(octaneTexture!, 'dispose');
		const reactDispose = vi.spyOn(reactTexture!, 'dispose');
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		await flush();
		expect(octaneDispose).toHaveBeenCalledOnce();
		expect(reactDispose).toHaveBeenCalledOnce();
	});

	it('attaches and destroys HLS for m3u8 sources', async () => {
		let reactTexture: THREE.VideoTexture | null = null;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactVideoTexture, {
						src: '/live.m3u8',
						start: false,
						ref: (value) => (reactTexture = value),
						children: () => null,
					}),
				),
			),
		);
		await flush();
		videos.at(-1)!.dispatchEvent(new Event('loadedmetadata'));
		await flush();
		const reactHls = mocks.instances.at(-1)!;
		expect(reactHls.attachMedia).toHaveBeenCalledWith(reactTexture!.image);
		await reactThreeAct(async () => reactRoot.unmount());
		await flush();

		let texture: THREE.VideoTexture | null = null;
		const root = await createOctaneThree(VideoTextureScene, {
			src: '/live.m3u8',
			unsuspend: 'loadedmetadata',
			start: false,
			crossOrigin: 'anonymous',
			muted: true,
			loop: true,
			playsInline: true,
			onVideoFrame: undefined,
			ref: (value: THREE.VideoTexture | null) => (texture = value),
			children: () => null,
		});
		await flush();
		videos.at(-1)!.dispatchEvent(new Event('loadedmetadata'));
		await flush();
		const hls = mocks.instances.at(-1)!;
		expect(hls.attachMedia).toHaveBeenCalledWith(texture!.image);
		expect(hls.loadSource).toHaveBeenCalledWith('/live.m3u8');
		root.unmount();
		await flush();
		expect(hls.destroy.mock.calls.length).toBe(reactHls.destroy.mock.calls.length);
	});
});

describe('screen and webcam video textures', () => {
	it('matches media acquisition options/defaults and stops every track on cleanup', async () => {
		const screenTrack = { stop: vi.fn() };
		const reactWebcamTrack = { stop: vi.fn() };
		const octaneWebcamTrack = { stop: vi.fn() };
		const screenStream = { getTracks: () => [screenTrack] } as unknown as MediaStream;
		const reactWebcamStream = { getTracks: () => [reactWebcamTrack] } as unknown as MediaStream;
		const octaneWebcamStream = { getTracks: () => [octaneWebcamTrack] } as unknown as MediaStream;
		const getDisplayMedia = vi.fn(async () => screenStream);
		const getUserMedia = vi
			.fn()
			.mockResolvedValueOnce(reactWebcamStream)
			.mockResolvedValueOnce(octaneWebcamStream);
		Object.defineProperty(navigator, 'mediaDevices', {
			configurable: true,
			value: { getDisplayMedia, getUserMedia },
		});

		const screenOptions = { video: { displaySurface: 'window' as const } };
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactScreenVideoTexture, {
						options: screenOptions,
						start: false,
						children: () => null,
					}),
				),
			),
		);
		await flush();
		expect(getDisplayMedia).toHaveBeenLastCalledWith(screenOptions);
		await reactThreeAct(async () => reactRoot.unmount());
		await flush();

		const octaneScreen = await createOctaneThree(ScreenVideoTextureScene, {
			options: screenOptions,
			ref: () => {},
			children: () => null,
		});
		await flush();
		expect(getDisplayMedia).toHaveBeenLastCalledWith(screenOptions);
		octaneScreen.unmount();
		await flush();

		const constraints = { audio: false, video: { facingMode: 'environment' } };
		const reactWebcamCanvas = document.createElement('canvas');
		const reactWebcamRoot = createReactThreeRoot(reactWebcamCanvas);
		await reactWebcamRoot.configure({
			gl: renderer(reactWebcamCanvas),
			frameloop: 'never',
			dpr: 1,
		});
		await reactThreeAct(async () =>
			reactWebcamRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactWebcamVideoTexture, {
						constraints,
						start: false,
						children: function () {
							return null;
						},
					}),
				),
			),
		);
		await flush();
		expect(getUserMedia).toHaveBeenLastCalledWith(constraints);
		await reactThreeAct(async () => reactWebcamRoot.unmount());
		await flush();
		expect(reactWebcamTrack.stop).toHaveBeenCalledOnce();

		const octaneWebcam = await createOctaneThree(WebcamVideoTextureScene, {
			constraints,
			ref: () => {},
			children: function () {
				return null;
			},
		});
		await flush();
		expect(getUserMedia).toHaveBeenLastCalledWith(constraints);
		octaneWebcam.unmount();
		await flush();
		expect(screenTrack.stop.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(octaneWebcamTrack.stop).toHaveBeenCalledOnce();
	});
});
