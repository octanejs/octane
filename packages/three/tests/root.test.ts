import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	createRoot,
	getRootState,
	unmountComponentAtNode,
	type DefaultGLProps,
	type Events,
	type Renderer,
	type RootState,
	type ThreeRoot,
} from '@octanejs/three';
import { RootScene } from './_fixtures/root-scene.three.tsrx';

interface RendererHarness extends Renderer {
	render: ReturnType<typeof vi.fn>;
	setPixelRatio: ReturnType<typeof vi.fn>;
	setSize: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
	forceContextLoss: ReturnType<typeof vi.fn>;
	renderLists: { dispose: ReturnType<typeof vi.fn> };
}

function createRenderer(canvas: unknown): RendererHarness {
	return {
		domElement: canvas,
		render: vi.fn(),
		setPixelRatio: vi.fn(),
		setSize: vi.fn(),
		dispose: vi.fn(),
		forceContextLoss: vi.fn(),
		renderLists: { dispose: vi.fn() },
		shadowMap: { enabled: false, type: THREE.PCFShadowMap },
		outputColorSpace: THREE.LinearSRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
	};
}

function createEventHandlers(): Events {
	const handle: EventListener = () => {};
	return {
		onClick: handle,
		onContextMenu: handle,
		onDoubleClick: handle,
		onWheel: handle,
		onPointerDown: handle,
		onPointerUp: handle,
		onPointerLeave: handle,
		onPointerMove: handle,
		onPointerCancel: handle,
		onLostPointerCapture: handle,
	};
}

const mountedRoots: ThreeRoot<any>[] = [];

function testRoot(canvas = document.createElement('canvas')): ThreeRoot<HTMLCanvasElement> {
	const root = createRoot(canvas);
	mountedRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of mountedRoots.splice(0)) root.unmount();
	THREE.ColorManagement.enabled = true;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('Three root configuration', () => {
	it('configures and tears down a structurally typed offscreen canvas', async () => {
		const canvas = { width: 256, height: 144 };
		const renderer = createRenderer(canvas);
		const root = createRoot(canvas);
		mountedRoots.push(root);
		await root.configure({ gl: renderer, dpr: 1, frameloop: 'never' });
		root.render(RootScene, { name: 'offscreen-root', groupRef: () => {} });

		expect(root.store.getState().size).toEqual({
			width: 256,
			height: 144,
			top: 0,
			left: 0,
		});
		expect(renderer.setSize).toHaveBeenLastCalledWith(256, 144, false);
		expect(root.store.getState().scene.children.map((child) => child.name)).toEqual([
			'offscreen-root',
		]);

		root.unmount();
		expect(renderer.renderLists.dispose).toHaveBeenCalledOnce();
		expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
		expect(renderer.dispose).toHaveBeenCalledOnce();
	});

	it('unmounts a registered canvas synchronously and notifies only that removal', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		await root.configure({
			gl: renderer,
			size: { width: 32, height: 32 },
			frameloop: 'never',
		});
		root.render(RootScene, { name: 'legacy-unmount', groupRef: () => {} });
		const callback = vi.fn();

		unmountComponentAtNode(canvas, callback);
		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith(canvas);
		expect(root.store.getState().scene.children).toEqual([]);
		expect(renderer.dispose).toHaveBeenCalledOnce();

		unmountComponentAtNode(canvas, callback);
		unmountComponentAtNode(document.createElement('canvas'), callback);
		expect(callback).toHaveBeenCalledOnce();
	});

	it('does not report a successful removal when teardown fails', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		let failDisconnect = false;
		const manager = {
			priority: 1,
			enabled: true,
			disconnect: vi.fn(() => {
				if (failDisconnect) throw new Error('event disconnect failed');
			}),
		};
		await root.configure({
			gl: renderer,
			size: { width: 32, height: 32 },
			frameloop: 'never',
			events: () => manager,
		});
		root.render(RootScene, { name: 'failing-unmount', groupRef: () => {} });
		const callback = vi.fn();
		failDisconnect = true;

		expect(() => unmountComponentAtNode(canvas, callback)).toThrow('event disconnect failed');
		expect(callback).not.toHaveBeenCalled();
		expect(root.store.getState().scene.children).toEqual([]);
		expect(renderer.dispose).toHaveBeenCalledOnce();

		unmountComponentAtNode(canvas, callback);
		expect(callback).not.toHaveBeenCalled();
	});

	it('configures public defaults and activates only after the scene commits', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		const created: Array<{ state: RootState; childNames: string[]; active: boolean }> = [];
		await root.configure({
			gl: renderer,
			size: { width: 200, height: 100, top: 4, left: 8 },
			dpr: 1,
			frameloop: 'never',
			onCreated(state) {
				created.push({
					state,
					childNames: state.scene.children.map((child) => child.name),
					active: state.internal.active,
				});
			},
		});

		let group: THREE.Group | null = null;
		const store = root.render(RootScene, {
			name: 'configured-root',
			groupRef: (value: THREE.Group | null) => (group = value),
		});
		const state = store.getState();

		expect(state.gl).toBe(renderer);
		expect(state.renderer).toBe(renderer);
		expect(state.scene).toBeInstanceOf(THREE.Scene);
		expect(getRootState(state.scene)).toBe(state);
		expect(state.camera).toBeInstanceOf(THREE.PerspectiveCamera);
		expect((state.camera as THREE.PerspectiveCamera).fov).toBe(75);
		expect(state.camera.position.z).toBe(5);
		expect(state.raycaster).toBeInstanceOf(THREE.Raycaster);
		expect(state.size).toEqual({ width: 200, height: 100, top: 4, left: 8 });
		expect(state.viewport).toMatchObject({ dpr: 1, initialDpr: 1, aspect: 2 });
		expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
		expect(renderer.setSize).toHaveBeenLastCalledWith(200, 100, true);
		expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
		expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
		expect(group).toBe(state.scene.children[0]);
		expect(created).toEqual([{ state, childNames: ['configured-root'], active: true }]);
		expect(renderer.render).not.toHaveBeenCalled();

		state.advance(1);
		expect(renderer.render).toHaveBeenCalledOnce();
		expect(renderer.render).toHaveBeenCalledWith(state.scene, state.camera);
		root.unmount();
		expect(getRootState(state.scene)).toBeUndefined();
	});

	it('preserves custom scene and camera identity while updating resize and DPR state', async () => {
		vi.stubGlobal('devicePixelRatio', 1.5);
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-9, 9, 7, -7, 0.1, 100);
		(camera as THREE.OrthographicCamera & { manual?: boolean }).manual = true;
		const root = testRoot(canvas);
		await root.configure({
			gl: renderer,
			scene,
			camera,
			orthographic: true,
			size: { width: 90, height: 60 },
			dpr: [1, 2],
			frameloop: 'never',
		});
		const state = root.store.getState();

		expect(state.scene).toBe(scene);
		expect(state.camera).toBe(camera);
		expect(state.viewport.dpr).toBe(1.5);
		expect(state.viewport.initialDpr).toBe(1.5);
		state.setSize(180, 120, 2, 3);
		state.setDpr(0.75);
		expect(state.scene).toBe(scene);
		expect(state.camera).toBe(camera);
		expect(camera.left).toBe(-9);
		expect(camera.right).toBe(9);
		expect(camera.top).toBe(7);
		expect(camera.bottom).toBe(-7);
		expect(root.store.getState().viewport).toMatchObject({
			dpr: 0.75,
			initialDpr: 1.5,
			aspect: 1.5,
		});
		expect(renderer.setSize).toHaveBeenLastCalledWith(180, 120, true);
		expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(0.75);
	});

	it('applies raycaster, shadows, color, and performance configuration', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		await root.configure({
			gl: renderer,
			size: { width: 64, height: 64 },
			frameloop: 'never',
			shadows: true,
			linear: true,
			flat: true,
			legacy: true,
			performance: { min: 0.25, debounce: 50 },
			raycaster: { near: 2, far: 40, params: { Points: { threshold: 3 } } },
		});
		const state = root.store.getState();

		expect(renderer.shadowMap).toMatchObject({
			enabled: true,
			type: THREE.PCFSoftShadowMap,
			needsUpdate: true,
		});
		expect(renderer.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
		expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
		expect(THREE.ColorManagement.enabled).toBe(false);
		expect(state).toMatchObject({ linear: true, flat: true, legacy: true });
		expect(state.raycaster.near).toBe(2);
		expect(state.raycaster.far).toBe(40);
		expect(state.raycaster.params.Points.threshold).toBe(3);
		expect(state.performance).toMatchObject({ min: 0.25, max: 1, current: 1, debounce: 50 });

		vi.useFakeTimers();
		state.performance.regress();
		expect(root.store.getState().performance.current).toBe(0.25);
		vi.advanceTimersByTime(50);
		expect(root.store.getState().performance.current).toBe(1);
	});

	it('deduplicates an asynchronous renderer factory and defers rendering until it settles', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		let settle!: (renderer: Renderer) => void;
		const pendingRenderer = new Promise<Renderer>((resolve) => (settle = resolve));
		const factory = vi.fn((_defaults: DefaultGLProps<HTMLCanvasElement>) => pendingRenderer);
		const root = testRoot(canvas);
		const config = {
			gl: factory,
			size: { width: 40, height: 30 },
			frameloop: 'never' as const,
		};
		const first = root.configure(config);
		const duplicate = root.configure(config);
		expect(duplicate).toBe(first);

		let group: THREE.Group | null = null;
		root.render(RootScene, {
			name: 'async-root',
			groupRef: (value: THREE.Group | null) => (group = value),
		});
		await Promise.resolve();
		expect(group).toBeNull();
		expect(factory).toHaveBeenCalledOnce();

		settle(renderer);
		await first;
		await Promise.resolve();
		expect(factory).toHaveBeenCalledOnce();
		expect(group).toBe(root.store.getState().scene.children[0]);
	});

	it('uses one renderer initialization across queued configuration updates', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const factory = vi.fn(async () => renderer);
		const root = testRoot(canvas);

		await Promise.all([
			root.configure({ gl: factory, size: { width: 20, height: 20 }, frameloop: 'never' }),
			root.configure({ gl: factory, size: { width: 80, height: 50 }, frameloop: 'demand' }),
		]);

		expect(factory).toHaveBeenCalledOnce();
		expect(root.store.getState().size).toEqual({ width: 80, height: 50, top: 0, left: 0 });
		expect(root.store.getState().frameloop).toBe('demand');
	});

	it('retries renderer initialization after an asynchronous factory rejection', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		const rejectedFactory = vi.fn(async () => {
			throw new Error('renderer unavailable');
		});

		await expect(
			root.configure({
				gl: rejectedFactory,
				size: { width: 20, height: 20 },
				frameloop: 'never',
			}),
		).rejects.toThrow('renderer unavailable');

		const retryFactory = vi.fn(async () => renderer);
		await root.configure({
			gl: retryFactory,
			size: { width: 20, height: 20 },
			frameloop: 'never',
		});

		expect(rejectedFactory).toHaveBeenCalledOnce();
		expect(retryFactory).toHaveBeenCalledOnce();
		expect(root.store.getState().gl).toBe(renderer);
	});

	it('replaces the last configured custom camera and updates the raycaster', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const first = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
		const second = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
		const root = testRoot(canvas);

		await root.configure({
			gl: renderer,
			camera: first,
			size: { width: 60, height: 40 },
			frameloop: 'never',
		});
		await root.configure({
			camera: second,
			size: { width: 60, height: 40 },
			frameloop: 'never',
		});

		const state = root.store.getState();
		expect(state.camera).toBe(second);
		expect(state.raycaster.camera).toBe(second);
	});

	it('does not drain pending scene work after event-manager construction rejects', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		const root = testRoot(canvas);
		await root.configure({
			gl: renderer,
			size: { width: 40, height: 30 },
			frameloop: 'never',
		});

		const rejected = root.configure({
			size: { width: 80, height: 60 },
			frameloop: 'never',
			events: () => {
				throw new Error('event manager unavailable');
			},
		});
		let group: THREE.Group | null = null;
		root.render(RootScene, {
			name: 'after-retry',
			groupRef: (value: THREE.Group | null) => (group = value),
		});

		await expect(rejected).rejects.toThrow('event manager unavailable');
		await Promise.resolve();
		expect(group).toBeNull();
		expect(root.store.getState().scene.children).toEqual([]);

		await root.configure({
			size: { width: 80, height: 60 },
			frameloop: 'never',
		});
		expect(group).toBe(root.store.getState().scene.children[0]);
		expect(group?.name).toBe('after-retry');
	});

	it('tears down a renderer that resolves after an unmount without mounting the scene', async () => {
		const canvas = document.createElement('canvas');
		const renderer = createRenderer(canvas);
		let settle!: (renderer: Renderer) => void;
		const pendingRenderer = new Promise<Renderer>((resolve) => (settle = resolve));
		const root = testRoot(canvas);
		const configuring = root.configure({
			gl: () => pendingRenderer,
			size: { width: 32, height: 32 },
			frameloop: 'never',
		});
		let group: THREE.Group | null = null;
		root.render(RootScene, {
			name: 'cancelled-root',
			groupRef: (value: THREE.Group | null) => (group = value),
		});
		await Promise.resolve();
		root.unmount();

		settle(renderer);
		await configuring;
		expect(group).toBeNull();
		expect(renderer.renderLists.dispose).toHaveBeenCalledOnce();
		expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
		expect(renderer.dispose).toHaveBeenCalledOnce();

		const replacement = testRoot(canvas);
		await replacement.configure({
			gl: createRenderer(canvas),
			size: { width: 8, height: 8 },
			frameloop: 'never',
		});
		expect(replacement.store.getState().scene).toBeInstanceOf(THREE.Scene);
	});

	it('preserves a handler-backed custom event manager, then disconnects it on unmount', async () => {
		const canvas = document.createElement('canvas');
		const root = testRoot(canvas);
		const manager = {
			priority: 3,
			enabled: true,
			connected: undefined as HTMLCanvasElement | undefined,
			handlers: createEventHandlers(),
			connect: vi.fn((target: HTMLCanvasElement) => {
				manager.connected = target;
			}),
			disconnect: vi.fn(() => {
				manager.connected = undefined;
			}),
		};
		const eventFactory = vi.fn(() => manager);
		await root.configure({
			gl: createRenderer(canvas),
			size: { width: 20, height: 20 },
			events: eventFactory,
		});
		root.render(RootScene, { name: 'events', groupRef: () => {} });
		expect(eventFactory).toHaveBeenCalledOnce();
		expect(manager.connect).toHaveBeenCalledWith(canvas);

		const replacementFactory = vi.fn(() => ({
			priority: 1,
			enabled: false,
			connected: undefined,
		}));
		await root.configure({
			size: { width: 20, height: 20 },
			events: replacementFactory,
		});
		expect(eventFactory).toHaveBeenCalledOnce();
		expect(replacementFactory).not.toHaveBeenCalled();
		expect(root.store.getState().events).toBe(manager);

		root.unmount();
		expect(manager.disconnect).toHaveBeenCalledOnce();
		await expect(root.configure()).rejects.toThrow('Cannot configure an unmounted root');
		expect(() => root.render(RootScene, { name: 'late', groupRef: () => {} })).toThrow(
			'Cannot render an unmounted root',
		);
	});

	it('replaces a connected handler-less manager and reconnects its target', async () => {
		const canvas = document.createElement('canvas');
		const external = document.createElement('section');
		const root = testRoot(canvas);
		const initial = {
			priority: 3,
			enabled: true,
			connected: undefined as HTMLElement | undefined,
			connect: vi.fn((target: HTMLElement) => {
				initial.connected = target;
			}),
			disconnect: vi.fn(() => {
				initial.connected = undefined;
			}),
		};
		const replacement = {
			priority: 1,
			enabled: true,
			connected: undefined as HTMLElement | undefined,
			handlers: createEventHandlers(),
			connect: vi.fn((target: HTMLElement) => {
				replacement.connected = target;
			}),
			disconnect: vi.fn(() => {
				replacement.connected = undefined;
			}),
		};
		const initialFactory = vi.fn(() => initial);
		const replacementFactory = vi.fn(() => replacement);

		await root.configure({
			gl: createRenderer(canvas),
			size: { width: 20, height: 20 },
			events: initialFactory,
			onCreated(state) {
				state.events.connect?.(external);
			},
		});
		root.render(RootScene, { name: 'handler-less-events', groupRef: () => {} });
		expect(initial.connect).toHaveBeenCalledOnce();
		expect(initial.connected).toBe(external);

		await root.configure({
			size: { width: 20, height: 20 },
			events: replacementFactory,
		});

		expect(initialFactory).toHaveBeenCalledOnce();
		expect(replacementFactory).toHaveBeenCalledOnce();
		expect(initial.disconnect).toHaveBeenCalledOnce();
		expect(replacement.connect).toHaveBeenCalledOnce();
		expect(replacement.connect).toHaveBeenCalledWith(external);
		expect(root.store.getState().events).toBe(replacement);

		root.unmount();
		expect(replacement.disconnect).toHaveBeenCalledOnce();
	});

	it('preserves an event target connected by onCreated', async () => {
		const canvas = document.createElement('canvas');
		const external = document.createElement('section');
		const root = testRoot(canvas);
		const manager = {
			priority: 1,
			enabled: true,
			connected: undefined as HTMLElement | undefined,
			connect: vi.fn((target: HTMLElement) => {
				manager.connected = target;
				root.store.getState().setEvents({ connected: target });
			}),
			disconnect: vi.fn(),
		};
		await root.configure({
			gl: createRenderer(canvas),
			size: { width: 20, height: 20 },
			events: () => manager,
			onCreated(state) {
				state.events.connect?.(external);
			},
		});

		root.render(RootScene, { name: 'external-events', groupRef: () => {} });

		expect(manager.connect).toHaveBeenCalledOnce();
		expect(manager.connect).toHaveBeenCalledWith(external);
		expect(root.store.getState().events.connected).toBe(external);
	});
});
