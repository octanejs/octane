/**
 * Deterministic, WebGL-free scene harness for `@octanejs/three` components.
 *
 * The harness deliberately drives the same configured root and frame loop as
 * an application. It only replaces the rendering object with a small recorder,
 * so host commits, hooks, global effects, and `useFrame` subscriptions retain
 * their production behavior.
 */
import type * as THREE from 'three';
import type { UniversalComponent } from 'octane/universal';
import {
	dispatchThreeEvent,
	getThreeEventListener,
	getThreeEventStore,
	runThreeEventScope,
} from './core/driver.js';
import { createRoot, type CanvasLike, type ThreeRoot } from './core/root.js';
import type { Renderer, RootStore } from './core/store.js';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

export interface CreateThreeTestRendererOptions {
	/** Logical canvas width. Defaults to 1280. */
	readonly width?: number;
	/** Logical canvas height. Defaults to 800. */
	readonly height?: number;
}

/** Renderer recorder injected into a deterministic Three test root. */
export interface TestingRenderer extends Renderer {
	/** Number of frames delivered through the root's real render loop. */
	readonly frameCount: number;
	/** Last scene submitted for rendering, or `null` before the first frame. */
	readonly lastScene: THREE.Scene | null;
	/** Last camera submitted for rendering, or `null` before the first frame. */
	readonly lastCamera: THREE.Camera | null;
	/** Whether root teardown disposed the recorder. */
	readonly disposed: boolean;
}

/** Additional values copied onto a directly-fired testing event. */
export interface MockEventData {
	[key: string]: unknown;
}

/** R3F test-renderer-compatible event payload produced by {@link fireEvent}. */
export interface MockSyntheticEvent extends MockEventData {
	camera: THREE.Camera;
	stopPropagation(): void;
	target: object;
	currentTarget: object;
	sourceEvent: MockEventData;
}

export type FireEvent = (object: object, name: string, data?: MockEventData) => Promise<unknown>;

export interface ThreeTestRenderer {
	readonly canvas: CanvasLike;
	readonly scene: THREE.Scene;
	readonly store: RootStore;
	readonly root: ThreeRoot<CanvasLike>;
	readonly renderer: TestingRenderer;
	update<P>(component: UniversalComponent<P>, props: P): RootStore;
	/** Directly invokes an event handler on a managed Three object. */
	fireEvent: FireEvent;
	/**
	 * Advances the configured `frameloop="never"` root by explicit deltas.
	 * A short delta array repeats its final value for the remaining frames.
	 */
	advanceFrames(frames: number, delta?: number | readonly number[]): void;
	unmount(): void;
}

class FrameRecorder implements TestingRenderer {
	readonly domElement: CanvasLike;
	readonly renderLists = { dispose() {} };
	#frameCount = 0;
	#lastScene: THREE.Scene | null = null;
	#lastCamera: THREE.Camera | null = null;
	#disposed = false;

	constructor(canvas: CanvasLike) {
		this.domElement = canvas;
	}

	get frameCount(): number {
		return this.#frameCount;
	}

	get lastScene(): THREE.Scene | null {
		return this.#lastScene;
	}

	get lastCamera(): THREE.Camera | null {
		return this.#lastCamera;
	}

	get disposed(): boolean {
		return this.#disposed;
	}

	render(scene: THREE.Scene, camera: THREE.Camera): void {
		this.#frameCount++;
		this.#lastScene = scene;
		this.#lastCamera = camera;
	}

	setPixelRatio(_dpr: number): void {}

	setSize(_width: number, _height: number, _updateStyle?: boolean): void {}

	forceContextLoss(): void {}

	dispose(): void {
		this.#disposed = true;
	}
}

function createCanvas(width: number, height: number): CanvasLike {
	if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		return canvas;
	}
	return { width, height, parentElement: null };
}

function assertFrameCount(frames: number): void {
	if (!Number.isSafeInteger(frames) || frames < 0) {
		throw new RangeError('@octanejs/three/testing: frames must be a non-negative integer.');
	}
}

function deltaForFrame(delta: number | readonly number[], index: number): number {
	const value = typeof delta === 'number' ? delta : (delta[index] ?? delta.at(-1) ?? 1);
	if (!Number.isFinite(value)) {
		throw new RangeError('@octanejs/three/testing: frame deltas must be finite numbers.');
	}
	return value;
}

function toEventHandlerName(name: string): string {
	return name.startsWith('on') ? name : `on${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function warnMissingEventHandler(name: string): void {
	console.warn(
		`Handler for ${name} was not found. You must pass event names in camelCase or name of the handler https://github.com/pmndrs/react-three-fiber/blob/master/packages/test-renderer/markdown/rttr.md#create-fireevent`,
	);
}

async function dispatchTestingEvent(
	object: object,
	name: string,
	data: MockEventData = {},
): Promise<unknown> {
	const handlerName = toEventHandlerName(name);
	const listener = getThreeEventListener(object, handlerName);
	const store = getThreeEventStore(object);
	if (listener === undefined || store === undefined) {
		warnMissingEventHandler(name);
		return undefined;
	}

	const event = {
		camera: store.getState().camera,
		stopPropagation() {},
		target: object,
		currentTarget: object,
		sourceEvent: data,
		...data,
	} as MockSyntheticEvent;

	const result = runThreeEventScope(store, listener.priority, () =>
		dispatchThreeEvent(store, listener.id, event),
	);
	const resolved = await result;
	// Continuous scopes schedule their commit in a microtask. Let that commit and
	// any passive work it queues settle before the caller observes the scene.
	await Promise.resolve();
	return resolved;
}

/**
 * Directly invoke the latest committed event listener for a managed Three object.
 * Both `pointerDown` and `onPointerDown` naming forms are accepted.
 */
export const fireEvent: FireEvent = dispatchTestingEvent;

/** Creates a configured, deterministic Three root without requesting WebGL. */
export async function createThreeTestRenderer<P>(
	component: UniversalComponent<P>,
	props: P,
	options: CreateThreeTestRendererOptions = {},
): Promise<ThreeTestRenderer> {
	const width = options.width ?? DEFAULT_WIDTH;
	const height = options.height ?? DEFAULT_HEIGHT;
	const canvas = createCanvas(width, height);
	const renderer = new FrameRecorder(canvas);
	const root: ThreeRoot<CanvasLike> = createRoot(canvas);
	let unmounted = false;

	try {
		await root.configure({
			gl: renderer,
			size: { width, height, top: 0, left: 0 },
			dpr: 1,
			frameloop: 'never',
		});
		root.render(component, props);
	} catch (error) {
		root.unmount();
		throw error;
	}

	const store = root.store;
	const scene = store.getState().scene;
	const assertMounted = () => {
		if (unmounted) {
			throw new Error('@octanejs/three/testing: The test root has already been unmounted.');
		}
	};

	return {
		canvas,
		scene,
		store,
		root,
		renderer,
		update<NextProps>(nextComponent: UniversalComponent<NextProps>, nextProps: NextProps) {
			assertMounted();
			return root.render(nextComponent, nextProps);
		},
		fireEvent(object, name, data) {
			assertMounted();
			return dispatchTestingEvent(object, name, data);
		},
		advanceFrames(frames, delta = 1) {
			assertMounted();
			assertFrameCount(frames);
			const state = store.getState();
			for (let index = 0; index < frames; index++) {
				state.advance(state.clock.elapsedTime + deltaForFrame(delta, index));
			}
		},
		unmount() {
			if (unmounted) return;
			unmounted = true;
			root.unmount();
		},
	};
}

/** R3F test-renderer-compatible short name for the component-plus-props API. */
export const create = createThreeTestRenderer;

export default { create, fireEvent };
