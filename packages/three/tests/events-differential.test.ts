import { resolve } from 'node:path';
import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	events as createReactPointerEvents,
	extend as extendReactThree,
	type RootStore as ReactRootStore,
} from '@react-three/fiber';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createRoot as createOctaneThreeRoot,
	events as createOctanePointerEvents,
	type DomEvent,
	type RootState as OctaneRootState,
} from '@octanejs/three';
import {
	EventDifferentialScene,
	ReconstructedEventScene,
} from './_fixtures/events-differential.three.tsrx';

type Phase = 'hits' | 'propagation' | 'hover' | 'misses' | 'reconstruction';

interface EventLike {
	readonly object: THREE.Object3D;
	readonly eventObject: THREE.Object3D;
	readonly intersections: ReadonlyArray<{ readonly eventObject: THREE.Object3D }>;
	readonly point: THREE.Vector3;
	readonly pointer: THREE.Vector2;
	readonly delta: number;
}

interface SceneProps {
	record(label: string, event: EventLike): void;
	recordMiss(label: string, event: MouseEvent): void;
}

interface ReconstructionSceneProps extends SceneProps {
	readonly revision: string;
	readonly reconstructedName: string;
	readonly version: string;
}

interface NormalizedEvent {
	readonly label: string;
	readonly object: string | null;
	readonly eventObject: string | null;
	readonly intersections: readonly string[];
	readonly point: readonly [number, number, number] | null;
	readonly pointer: readonly [number, number] | null;
	readonly delta: number | null;
	readonly offset: readonly [number, number];
}

type ScenarioLog = Record<Phase, NormalizedEvent[]>;

interface EventStateLike {
	readonly internal: {
		readonly interaction: readonly THREE.Object3D[];
		readonly initialHits: readonly THREE.Object3D[];
		readonly hovered: ReadonlyMap<
			string,
			{ readonly object: THREE.Object3D; readonly eventObject: THREE.Object3D }
		>;
		readonly capturedMap: ReadonlyMap<
			number,
			ReadonlyMap<
				THREE.Object3D,
				{
					readonly intersection: {
						readonly object: THREE.Object3D;
						readonly eventObject: THREE.Object3D;
					};
				}
			>
		>;
	};
}

interface NormalizedEventState {
	readonly interaction: readonly string[];
	readonly initialHits: readonly string[];
	readonly hovered: ReadonlyArray<{ readonly object: string; readonly eventObject: string }>;
	readonly captured: ReadonlyArray<{
		readonly pointerId: number;
		readonly keys: readonly string[];
		readonly intersections: ReadonlyArray<{
			readonly object: string;
			readonly eventObject: string;
		}>;
	}>;
}

interface ReconstructionResult {
	readonly log: readonly NormalizedEvent[];
	readonly afterCapture: NormalizedEventState;
	readonly afterReconstruction: NormalizedEventState;
	readonly afterCapturedMove: NormalizedEventState;
	readonly afterRelease: NormalizedEventState;
	readonly afterExit: NormalizedEventState;
}

interface ScenarioRecorder {
	readonly props: SceneProps;
	readonly result: ScenarioLog;
	select(phase: Phase): void;
	recordRootMiss(event: MouseEvent): void;
}

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterAll(() => {
	if (previousActEnvironment === undefined) {
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	} else {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	}
});

function noWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
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

function createCamera(): THREE.PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
	camera.position.z = 5;
	camera.lookAt(0, 0, 0);
	camera.updateProjectionMatrix();
	return camera;
}

function canonicalNumber(value: number): number {
	const rounded = Math.round(value * 1_000_000) / 1_000_000;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeEvent(label: string, event: EventLike): NormalizedEvent {
	return {
		label,
		object: event.object.name,
		eventObject: event.eventObject.name,
		intersections: event.intersections.map((hit) => hit.eventObject.name),
		point: [
			canonicalNumber(event.point.x),
			canonicalNumber(event.point.y),
			canonicalNumber(event.point.z),
		],
		pointer: [canonicalNumber(event.pointer.x), canonicalNumber(event.pointer.y)],
		delta: event.delta,
		offset: [
			canonicalNumber((event as EventLike & { offsetX: number }).offsetX),
			canonicalNumber((event as EventLike & { offsetY: number }).offsetY),
		],
	};
}

function normalizeMiss(label: string, event: MouseEvent): NormalizedEvent {
	return {
		label,
		object: null,
		eventObject: null,
		intersections: [],
		point: null,
		pointer: null,
		delta: null,
		offset: [canonicalNumber(event.offsetX), canonicalNumber(event.offsetY)],
	};
}

function createRecorder(): ScenarioRecorder {
	const result: ScenarioLog = {
		hits: [],
		propagation: [],
		hover: [],
		misses: [],
		reconstruction: [],
	};
	let phase: Phase = 'hits';
	return {
		result,
		props: {
			record(label, event) {
				result[phase].push(normalizeEvent(label, event));
			},
			recordMiss(label, event) {
				result[phase].push(normalizeMiss(label, event));
			},
		},
		select(nextPhase) {
			phase = nextPhase;
		},
		recordRootMiss(event) {
			result[phase].push(normalizeMiss('miss:root', event));
		},
	};
}

function createCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = 100;
	canvas.height = 100;
	canvas.setPointerCapture = () => {};
	canvas.releasePointerCapture = () => {};
	return canvas;
}

function dispatchPointer(
	target: HTMLCanvasElement,
	type: string,
	x: number,
	y: number,
	pointerId = 1,
): DomEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		clientX: x,
		clientY: y,
	}) as DomEvent;
	Object.defineProperties(event, {
		offsetX: { configurable: true, enumerable: true, value: x },
		offsetY: { configurable: true, enumerable: true, value: y },
		pointerId: { configurable: true, enumerable: true, value: pointerId },
	});
	target.dispatchEvent(event);
	return event;
}

function prepareRaycast(state: Pick<OctaneRootState, 'scene' | 'camera'>): void {
	state.scene.updateMatrixWorld(true);
	state.camera.updateMatrixWorld(true);
}

function normalizeEventState(state: EventStateLike): NormalizedEventState {
	return {
		interaction: state.internal.interaction.map((object) => object.name),
		initialHits: state.internal.initialHits.map((object) => object.name),
		hovered: [...state.internal.hovered.values()].map((event) => ({
			object: event.object.name,
			eventObject: event.eventObject.name,
		})),
		captured: [...state.internal.capturedMap].map(([pointerId, captures]) => ({
			pointerId,
			keys: [...captures.keys()].map((object) => object.name),
			intersections: [...captures.values()].map(({ intersection }) => ({
				object: intersection.object.name,
				eventObject: intersection.eventObject.name,
			})),
		})),
	};
}

function reconstructionProps(
	recorder: ScenarioRecorder,
	revision: string,
	reconstructedName: string,
	version: string,
): ReconstructionSceneProps {
	return { ...recorder.props, revision, reconstructedName, version };
}

function driveScenario(
	canvas: HTMLCanvasElement,
	state: Pick<OctaneRootState, 'scene' | 'camera'>,
	recorder: ScenarioRecorder,
): void {
	prepareRaycast(state);
	recorder.select('hits');
	dispatchPointer(canvas, 'pointerdown', 50, 50);
	dispatchPointer(canvas, 'click', 51, 50);

	recorder.select('propagation');
	dispatchPointer(canvas, 'contextmenu', 50, 50);

	recorder.select('hover');
	dispatchPointer(canvas, 'pointermove', 50, 50);
	dispatchPointer(canvas, 'pointermove', 50, 50);
	dispatchPointer(canvas, 'pointermove', 99, 99);

	recorder.select('misses');
	dispatchPointer(canvas, 'pointerdown', 99, 99);
	dispatchPointer(canvas, 'click', 99, 99);
}

async function runOctaneScenario(): Promise<ScenarioLog> {
	const canvas = createCanvas();
	const recorder = createRecorder();
	const root = createOctaneThreeRoot(canvas);
	try {
		await root.configure({
			gl: noWebGLRenderer(canvas),
			camera: createCamera(),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createOctanePointerEvents,
			onPointerMissed: (event) => recorder.recordRootMiss(event),
		});
		root.render(EventDifferentialScene, recorder.props);
		driveScenario(canvas, root.store.getState(), recorder);
		return recorder.result;
	} finally {
		root.unmount();
	}
}

async function loadReactScene(): Promise<React.ComponentType<SceneProps>> {
	const file = resolve(__dirname, '.react-cache/events-differential.three.js');
	const module = (await import(/* @vite-ignore */ file)) as {
		EventDifferentialScene?: React.ComponentType<SceneProps>;
	};
	if (module.EventDifferentialScene === undefined) {
		throw new Error('The @tsrx/react event oracle did not export EventDifferentialScene.');
	}
	return module.EventDifferentialScene;
}

async function loadReactReconstructionScene(): Promise<
	React.ComponentType<ReconstructionSceneProps>
> {
	const file = resolve(__dirname, '.react-cache/events-differential.three.js');
	const module = (await import(/* @vite-ignore */ file)) as {
		ReconstructedEventScene?: React.ComponentType<ReconstructionSceneProps>;
	};
	if (module.ReconstructedEventScene === undefined) {
		throw new Error('The @tsrx/react event oracle did not export ReconstructedEventScene.');
	}
	return module.ReconstructedEventScene;
}

async function runReactScenario(): Promise<ScenarioLog> {
	const ReactScene = await loadReactScene();
	const canvas = createCanvas();
	const recorder = createRecorder();
	const root = createReactThreeRoot(canvas);
	try {
		await root.configure({
			gl: noWebGLRenderer(canvas),
			camera: createCamera(),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createReactPointerEvents,
			onPointerMissed: (event) => recorder.recordRootMiss(event),
		});
		let store!: ReactRootStore;
		await reactThreeAct(async () => {
			store = root.render(React.createElement(ReactScene, recorder.props));
		});
		driveScenario(canvas, store.getState(), recorder);
		return recorder.result;
	} finally {
		await reactThreeAct(async () => root.unmount());
	}
}

async function runOctaneReconstruction(): Promise<ReconstructionResult> {
	const canvas = createCanvas();
	const recorder = createRecorder();
	recorder.select('reconstruction');
	const root = createOctaneThreeRoot(canvas);
	try {
		await root.configure({
			gl: noWebGLRenderer(canvas),
			camera: createCamera(),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createOctanePointerEvents,
		});
		root.render(
			ReconstructedEventScene,
			reconstructionProps(recorder, 'revision-one', 'reconstructed-before', 'before'),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 50, 50, 9);
		dispatchPointer(canvas, 'pointerdown', 50, 50, 9);
		const afterCapture = normalizeEventState(root.store.getState());

		root.render(
			ReconstructedEventScene,
			reconstructionProps(recorder, 'revision-two', 'reconstructed-after', 'after'),
		);
		prepareRaycast(root.store.getState());
		const afterReconstruction = normalizeEventState(root.store.getState());

		dispatchPointer(canvas, 'pointermove', 99, 99, 9);
		const afterCapturedMove = normalizeEventState(root.store.getState());
		dispatchPointer(canvas, 'pointerup', 99, 99, 9);
		const afterRelease = normalizeEventState(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 99, 99, 9);
		const afterExit = normalizeEventState(root.store.getState());

		return {
			log: recorder.result.reconstruction,
			afterCapture,
			afterReconstruction,
			afterCapturedMove,
			afterRelease,
			afterExit,
		};
	} finally {
		root.unmount();
	}
}

async function runReactReconstruction(): Promise<ReconstructionResult> {
	const ReactScene = await loadReactReconstructionScene();
	const canvas = createCanvas();
	const recorder = createRecorder();
	recorder.select('reconstruction');
	const root = createReactThreeRoot(canvas);
	try {
		await root.configure({
			gl: noWebGLRenderer(canvas),
			camera: createCamera(),
			size: { width: 100, height: 100, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
			events: createReactPointerEvents,
		});
		let store!: ReactRootStore;
		await reactThreeAct(async () => {
			store = root.render(
				React.createElement(
					ReactScene,
					reconstructionProps(recorder, 'revision-one', 'reconstructed-before', 'before'),
				),
			);
		});
		prepareRaycast(store.getState());
		dispatchPointer(canvas, 'pointermove', 50, 50, 9);
		dispatchPointer(canvas, 'pointerdown', 50, 50, 9);
		const afterCapture = normalizeEventState(store.getState());

		await reactThreeAct(async () => {
			store = root.render(
				React.createElement(
					ReactScene,
					reconstructionProps(recorder, 'revision-two', 'reconstructed-after', 'after'),
				),
			);
		});
		prepareRaycast(store.getState());
		const afterReconstruction = normalizeEventState(store.getState());

		dispatchPointer(canvas, 'pointermove', 99, 99, 9);
		const afterCapturedMove = normalizeEventState(store.getState());
		dispatchPointer(canvas, 'pointerup', 99, 99, 9);
		const afterRelease = normalizeEventState(store.getState());
		dispatchPointer(canvas, 'pointermove', 99, 99, 9);
		const afterExit = normalizeEventState(store.getState());

		return {
			log: recorder.result.reconstruction,
			afterCapture,
			afterReconstruction,
			afterCapturedMove,
			afterRelease,
			afterExit,
		};
	} finally {
		await reactThreeAct(async () => root.unmount());
	}
}

describe('R3F 9.6.1 event oracle', () => {
	it('matches hit payloads, propagation, hover transitions, and misses', async () => {
		const [octane, react] = await Promise.all([runOctaneScenario(), runReactScenario()]);

		expect(octane).toEqual(react);
		expect(octane.hits.map((event) => event.label)).toEqual([
			'down:front',
			'down:parent',
			'down:rear',
			'down:parent',
			'click:front',
			'click:parent',
			'click:rear',
			'click:parent',
		]);
		expect(octane.hits[0]).toMatchObject({
			object: 'front',
			eventObject: 'front',
			intersections: ['front', 'parent', 'rear', 'parent'],
			point: [0, 0, 1.5],
			pointer: [0, 0],
			delta: 0,
		});
		expect(octane.hits[2]).toMatchObject({
			object: 'rear',
			eventObject: 'rear',
			point: [0, 0, 0.5],
		});
		expect(octane.hits.slice(4).every((event) => event.delta === 1)).toBe(true);
		expect(octane.hits[4].pointer).toEqual([0.02, 0]);

		expect(octane.propagation.map((event) => event.label)).toEqual(['context:front']);
		expect(octane.hover.map((event) => event.label)).toEqual([
			'over:front',
			'enter:front',
			'move:front',
			'over:parent',
			'enter:parent',
			'move:parent',
			'over:rear',
			'enter:rear',
			'move:rear',
			'move:parent',
			'move:front',
			'move:parent',
			'move:rear',
			'move:parent',
			'out:front',
			'leave:front',
			'out:parent',
			'leave:parent',
			'out:rear',
			'leave:rear',
		]);
		expect(octane.misses.map((event) => event.label)).toEqual([
			'miss:parent',
			'miss:front',
			'miss:rear',
			'miss:root',
		]);
		expect(octane.misses.every((event) => event.offset[0] === 99 && event.offset[1] === 99)).toBe(
			true,
		);
	});

	it('matches captured event state across reconstruction, release, and exit', async () => {
		const [octane, react] = await Promise.all([
			runOctaneReconstruction(),
			runReactReconstruction(),
		]);

		expect(octane).toEqual(react);
		expect(octane.log.map((event) => event.label)).toEqual([
			'over:before',
			'enter:before',
			'move:before',
			'down:before',
			'move:after',
			'up:after',
			'out:after',
			'leave:after',
		]);
		expect(octane.afterCapture).toEqual({
			interaction: ['capture-target', 'reconstructed-before'],
			initialHits: ['capture-target'],
			hovered: [{ object: 'capture-target', eventObject: 'capture-target' }],
			captured: [
				{
					pointerId: 9,
					keys: ['capture-target'],
					intersections: [{ object: 'capture-target', eventObject: 'capture-target' }],
				},
			],
		});
		expect(octane.afterReconstruction).toEqual({
			...octane.afterCapture,
			interaction: ['capture-target', 'reconstructed-after'],
		});
		expect(octane.afterCapturedMove).toEqual(octane.afterReconstruction);
		expect(octane.afterRelease).toEqual({
			...octane.afterReconstruction,
			captured: [],
		});
		expect(octane.afterExit).toEqual({
			...octane.afterRelease,
			hovered: [],
		});
	});
});
