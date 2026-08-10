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
	SpriteAnimator as ReactSpriteAnimator,
	type SpriteAnimatorProps as ReactSpriteAnimatorProps,
	useSpriteAnimator as useReactSpriteAnimator,
} from '@react-three/drei/core/SpriteAnimator.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	SpriteAnimator,
	type SpriteAnimatorProps,
	type SpriteData,
	type useSpriteAnimator,
} from '../src/index.js';
import { SpriteAnimatorScene } from './_fixtures/sprite-animator.three.tsrx';

type AnimationState = ReturnType<typeof useSpriteAnimator>;
type EventData = { currentFrameName: string; currentFrame: number };
type EventLog = { start: EventData[]; end: EventData[]; loop: EventData[]; frame: EventData[] };

let now = 0;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

beforeEach(() => {
	now = 0;
	vi.spyOn(window.performance, 'now').mockImplementation(() => now);
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

function makeDataset() {
	const texture = new THREE.Texture({ width: 96, height: 32 });
	texture.name = 'sprite-sheet';
	const frames = [0, 32, 64].map((x) => ({
		frame: { x, y: 0, w: 32, h: 32 },
		rotated: false,
		trimmed: false,
		spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
		sourceSize: { w: 32, h: 32 },
	}));
	const spriteData: SpriteData = {
		frames,
		meta: {
			version: '1',
			size: { w: 96, h: 32 },
			rows: 1,
			columns: 3,
			frameWidth: 32,
			frameHeight: 32,
			scale: '1',
		},
	};
	return { spriteTexture: texture, spriteData, aspect: new THREE.Vector3(1, 1, 1) };
}

function eventLog(): EventLog {
	return { start: [], end: [], loop: [], frame: [] };
}

function callbacks(log: EventLog) {
	return {
		onStart: (value: EventData) => log.start.push({ ...value }),
		onEnd: (value: EventData) => log.end.push({ ...value }),
		onLoopEnd: (value: EventData) => log.loop.push({ ...value }),
		onFrame: (value: EventData) => log.frame.push({ ...value }),
	};
}

async function flush(): Promise<void> {
	await act(async () => {
		for (let index = 0; index < 10; index++) await Promise.resolve();
	});
}

async function mountPair(props: SpriteAnimatorProps) {
	let reactGroup!: THREE.Group;
	let octaneGroup!: THREE.Group;
	let reactState!: RootState;
	let reactContext: ReturnType<typeof useReactSpriteAnimator> = null;
	let octaneContext: AnimationState = null;
	const reactEvents = eventLog();
	const octaneEvents = eventLog();
	function ReactCapture() {
		reactContext = useReactSpriteAnimator();
		return null;
	}
	function CaptureRoot() {
		reactState = useThree();
		return null;
	}
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 200, height: 100, left: 0, top: 0 },
	});
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ReactSpriteAnimator,
					{
						...(props as ReactSpriteAnimatorProps),
						...callbacks(reactEvents),
						ref: (value: THREE.Group) => {
							reactGroup = value;
						},
					},
					React.createElement(ReactCapture),
				),
				React.createElement(CaptureRoot),
			),
		),
	);
	const octaneCanvas = document.createElement('canvas');
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 200, height: 100, left: 0, top: 0 },
	});
	octaneRoot.render(SpriteAnimatorScene, {
		...props,
		...callbacks(octaneEvents),
		groupRef: (value: THREE.Group) => {
			octaneGroup = value;
		},
		onContext: (value: AnimationState) => {
			octaneContext = value;
		},
	});
	await flush();
	return {
		reactRoot,
		octaneRoot,
		get reactGroup() {
			return reactGroup;
		},
		get octaneGroup() {
			return octaneGroup;
		},
		get reactContext() {
			return reactContext;
		},
		get octaneContext() {
			return octaneContext;
		},
		reactState,
		reactEvents,
		octaneEvents,
	};
}

async function advancePair(
	pair: Awaited<ReturnType<typeof mountPair>>,
	milliseconds: number,
): Promise<void> {
	now = milliseconds;
	await act(async () => reactAdvance(milliseconds, true, pair.reactState));
	pair.octaneRoot.store.getState().advance(milliseconds / 1000);
	await flush();
}

function findMaterial(group: THREE.Group): THREE.MeshBasicMaterial {
	let material!: THREE.MeshBasicMaterial;
	group.traverse((object) => {
		if ((object as THREE.Mesh).material instanceof THREE.MeshBasicMaterial)
			material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial;
	});
	return material;
}

function snapshot(group: THREE.Group) {
	const material = findMaterial(group);
	let meshCount = 0;
	let instancedCount: number | null = null;
	group.traverse((object) => {
		if ((object as THREE.Mesh).isMesh) meshCount++;
		if ((object as THREE.InstancedMesh).isInstancedMesh)
			instancedCount = (object as THREE.InstancedMesh).count;
	});
	return {
		name: group.name,
		position: group.position.toArray(),
		scale: group.scale.toArray(),
		meshCount,
		instancedCount,
		alphaTest: material.alphaTest,
		transparent: material.transparent,
		toneMapped: material.toneMapped,
		side: material.side,
		mapName: material.map?.name,
		repeat: material.map?.repeat.toArray(),
		offset: material.map?.offset.toArray(),
	};
}

async function unmountPair(pair: Awaited<ReturnType<typeof mountPair>>): Promise<void> {
	pair.octaneRoot.unmount();
	await act(async () => pair.reactRoot.unmount());
}

describe('SpriteAnimator', () => {
	it('matches spriteDataset rendering, group/ref/context/mesh props, asSprite, and instances', async () => {
		const spritePair = await mountPair({
			spriteDataset: makeDataset(),
			fps: 0,
			endFrame: 1,
			asSprite: true,
			flipX: true,
			alphaTest: 0.35,
			name: 'hero',
			position: [1, 2, 3],
			scale: 2,
			meshProps: { frustumCulled: false, renderOrder: 4 },
			roundFramePosition: true,
		});
		await advancePair(spritePair, 100);
		expect(snapshot(spritePair.octaneGroup)).toEqual(snapshot(spritePair.reactGroup));
		expect(
			spritePair.octaneContext && {
				imageUrl: spritePair.octaneContext.imageUrl,
				hasEnded: spritePair.octaneContext.hasEnded,
			},
		).toEqual(
			spritePair.reactContext && {
				imageUrl: spritePair.reactContext.imageUrl,
				hasEnded: spritePair.reactContext.hasEnded,
			},
		);
		expect(spritePair.octaneContext?.ref).toBeDefined();

		const instancePair = await mountPair({
			spriteDataset: makeDataset(),
			fps: 0,
			asSprite: false,
			instanceItems: [
				[1, 0, 0],
				[0, 2, 0],
			],
			maxItems: 4,
		});
		await advancePair(instancePair, 100);
		expect(snapshot(instancePair.octaneGroup)).toEqual(snapshot(instancePair.reactGroup));
		expect(snapshot(instancePair.octaneGroup).instancedCount).toBe(2);

		// Negative control: changing the alpha threshold must break the parity snapshot.
		const changed = { ...snapshot(instancePair.octaneGroup), alphaTest: 0.75 };
		expect(changed).not.toEqual(snapshot(instancePair.reactGroup));
		await unmountPair(spritePair);
		await unmountPair(instancePair);
	});

	it('matches static/manual frame selection and paused progression boundaries', async () => {
		const manual = await mountPair({
			spriteDataset: makeDataset(),
			fps: 0,
			startFrame: 0,
			endFrame: 2,
			offset: 0.5,
			autoPlay: true,
			roundFramePosition: true,
		});
		await advancePair(manual, 100);
		await advancePair(manual, 200);
		expect(snapshot(manual.octaneGroup)).toEqual(snapshot(manual.reactGroup));
		expect(manual.octaneEvents).toEqual(manual.reactEvents);
		expect(manual.octaneEvents.frame.at(-1)?.currentFrame).toBe(1);

		const paused = await mountPair({
			spriteDataset: makeDataset(),
			fps: 10,
			autoPlay: false,
			play: true,
			pause: true,
		});
		await advancePair(paused, 500);
		expect(paused.octaneEvents.frame).toEqual(paused.reactEvents.frame);
		expect(paused.octaneEvents.frame).toHaveLength(0);
		await unmountPair(manual);
		await unmountPair(paused);
	});

	it('matches timed start/end/loop callbacks and backwards progression', async () => {
		const looping = await mountPair({
			spriteDataset: makeDataset(),
			fps: 10,
			loop: true,
			startFrame: 0,
			endFrame: 2,
			autoPlay: true,
		});
		for (const time of [101, 202, 303, 404]) await advancePair(looping, time);
		expect(looping.octaneEvents).toEqual(looping.reactEvents);
		expect(looping.octaneEvents.loop).toEqual([{ currentFrameName: '', currentFrame: 0 }]);
		expect(snapshot(looping.octaneGroup)).toEqual(snapshot(looping.reactGroup));

		now = 0;
		const backwards = await mountPair({
			spriteDataset: makeDataset(),
			fps: 10,
			loop: false,
			endFrame: 2,
			playBackwards: true,
			autoPlay: true,
		});
		for (const time of [101, 202, 303, 404]) await advancePair(backwards, time);
		expect(backwards.octaneEvents).toEqual(backwards.reactEvents);
		expect(backwards.octaneEvents.end).toEqual([{ currentFrameName: '', currentFrame: 2 }]);
		expect(backwards.octaneContext?.hasEnded).toBe(backwards.reactContext?.hasEnded);
		expect(backwards.octaneContext?.hasEnded).toBe(true);

		now = 0;
		const resetting = await mountPair({
			spriteDataset: makeDataset(),
			fps: 10,
			loop: false,
			endFrame: 2,
			resetOnEnd: true,
			autoPlay: true,
		});
		for (const time of [101, 202, 303, 404, 505]) await advancePair(resetting, time);
		expect(resetting.octaneEvents).toEqual(resetting.reactEvents);
		expect(resetting.octaneEvents.end).toEqual([{ currentFrameName: '', currentFrame: 0 }]);
		expect(resetting.octaneContext?.hasEnded).toBe(false);
		expect(resetting.octaneEvents.frame).toHaveLength(4);
		await unmountPair(looping);
		await unmountPair(backwards);
		await unmountPair(resetting);
	});
});
