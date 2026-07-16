import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { events as createPointerEvents } from '../src/index.js';
import type { EventManager, Renderer, RootState } from '../src/core/index.js';
import { mount, type MountResult } from '../../octane/tests/_helpers.js';
import { CanvasApp, ContextCanvasApp, EmptyCanvasApp } from './_fixtures/canvas-app.tsrx';

class ControlledResizeObserver implements ResizeObserver {
	static instances: ControlledResizeObserver[] = [];

	readonly disconnect = vi.fn();
	readonly unobserve = vi.fn();
	readonly observe = vi.fn((target: Element) => {
		this.target = target as HTMLElement;
	});
	#callback: ResizeObserverCallback;
	target: HTMLElement | null = null;

	constructor(callback: ResizeObserverCallback) {
		this.#callback = callback;
		ControlledResizeObserver.instances.push(this);
	}

	emit(size: { width: number; height: number; top?: number; left?: number }): void {
		if (this.target === null) throw new Error('ResizeObserver has no observed target.');
		const rect = {
			x: size.left ?? 0,
			y: size.top ?? 0,
			width: size.width,
			height: size.height,
			top: size.top ?? 0,
			left: size.left ?? 0,
			right: (size.left ?? 0) + size.width,
			bottom: (size.top ?? 0) + size.height,
			toJSON() {
				return this;
			},
		} as DOMRectReadOnly;
		this.target.getBoundingClientRect = () => rect as DOMRect;
		this.#callback(
			[
				{
					target: this.target,
					contentRect: rect,
					borderBoxSize: [],
					contentBoxSize: [],
					devicePixelContentBoxSize: [],
				},
			] as unknown as ResizeObserverEntry[],
			this,
		);
	}
}

function rendererHarness() {
	const renderer = {
		render: vi.fn(),
		setPixelRatio: vi.fn(),
		setSize: vi.fn(),
		dispose: vi.fn(),
		forceContextLoss: vi.fn(),
		renderLists: { dispose: vi.fn() },
		shadowMap: { enabled: false, type: 1 },
	} as unknown as Renderer;
	const factory = vi.fn(({ canvas }: { canvas: HTMLCanvasElement }) => {
		renderer.domElement = canvas;
		return renderer;
	});
	return { renderer, factory };
}

async function flushCanvasWork(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
	flushSync(() => {});
	for (let index = 0; index < 4; index++) await Promise.resolve();
}

function dispatchCoordinates(
	target: HTMLElement,
	values: { offsetX: number; offsetY: number; clientX: number; clientY: number },
): void {
	const event = new MouseEvent('pointermove', {
		bubbles: true,
		clientX: values.clientX,
		clientY: values.clientY,
	});
	Object.defineProperties(event, {
		offsetX: { configurable: true, value: values.offsetX },
		offsetY: { configurable: true, value: values.offsetY },
		pointerId: { configurable: true, value: 1 },
	});
	target.dispatchEvent(event);
}

describe('Canvas', () => {
	let mounted: MountResult | null;

	beforeEach(() => {
		mounted = null;
		ControlledResizeObserver.instances = [];
		vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
	});

	afterEach(() => {
		mounted?.unmount();
		vi.unstubAllGlobals();
	});

	it('waits for positive layout, then mounts and resizes one retained Three scene', async () => {
		const { renderer, factory } = rendererHarness();
		const canvasRef = { current: null as HTMLCanvasElement | null };
		const objectRef = { current: null as { name: string } | null };
		const onCreated = vi.fn<(state: RootState) => void>();
		mounted = mount(CanvasApp, {
			gl: factory,
			canvasRef,
			objectRef,
			onCreated,
			label: 'preview',
			name: 'retained-scene',
			background: 'rgb(1, 2, 3)',
		});

		const shell = mounted.find('.canvas-shell') as HTMLDivElement;
		const canvas = mounted.find('canvas') as HTMLCanvasElement;
		expect(shell.dataset.label).toBe('preview');
		expect(shell.style.position).toBe('absolute');
		expect(shell.style.width).toBe('100%');
		expect(shell.style.backgroundColor).toBe('rgb(1, 2, 3)');
		expect(canvas.style.display).toBe('block');
		expect(canvas.textContent).toBe('WebGL unavailable');
		expect(canvasRef.current).toBe(canvas);
		expect(factory).not.toHaveBeenCalled();
		expect(onCreated).not.toHaveBeenCalled();

		const observer = ControlledResizeObserver.instances[0];
		expect(observer).toBeDefined();
		observer.emit({ width: 640, height: 360, top: 12, left: 24 });
		await flushCanvasWork();

		expect(factory).toHaveBeenCalledTimes(1);
		expect(onCreated).toHaveBeenCalledTimes(1);
		const state = onCreated.mock.calls[0][0];
		expect(state.size).toEqual({ width: 640, height: 360, top: 12, left: 24 });
		expect(objectRef.current?.name).toBe('retained-scene');
		const sceneObject = objectRef.current;
		expect(renderer.setSize).toHaveBeenCalledWith(640, 360, true);

		observer.emit({ width: 800, height: 450, top: 16, left: 32 });
		await flushCanvasWork();

		expect(factory).toHaveBeenCalledTimes(1);
		expect(onCreated).toHaveBeenCalledTimes(1);
		expect(state.get().size).toEqual({ width: 800, height: 450, top: 16, left: 32 });
		expect(objectRef.current).toBe(sceneObject);
		expect(renderer.setSize).toHaveBeenLastCalledWith(800, 450, true);

		mounted.unmount();
		mounted = null;
		expect(canvasRef.current).toBeNull();
		expect(observer.disconnect).toHaveBeenCalledTimes(1);
		expect(renderer.renderLists?.dispose).toHaveBeenCalledTimes(1);
		expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
		expect(renderer.dispose).toHaveBeenCalledTimes(1);
	});

	it('keeps scene child updates independent from asynchronous renderer configuration', async () => {
		const { renderer } = rendererHarness();
		let settle!: (renderer: Renderer) => void;
		const pending = new Promise<Renderer>((resolve) => {
			settle = resolve;
		});
		const factory = vi.fn(() => pending);
		const objectRef = { current: null as { name: string } | null };
		const onCreated = vi.fn<(state: RootState) => void>();
		const raycaster = { near: 1 };
		const props = {
			gl: factory,
			canvasRef: null,
			objectRef,
			onCreated,
			label: 'async',
			background: 'transparent',
			raycaster,
		};
		mounted = mount(CanvasApp, { ...props, name: 'async-scene' });

		ControlledResizeObserver.instances[0].emit({ width: 320, height: 200 });
		await flushCanvasWork();
		expect(factory).toHaveBeenCalledTimes(1);
		expect(onCreated).not.toHaveBeenCalled();
		expect(objectRef.current).toBeNull();

		mounted.update(CanvasApp, { ...props, name: 'latest-before-ready' });
		expect(objectRef.current).toBeNull();

		settle(renderer);
		await flushCanvasWork();
		expect(onCreated).toHaveBeenCalledTimes(1);
		expect(objectRef.current?.name).toBe('latest-before-ready');

		const state = onCreated.mock.calls[0][0];
		const sceneObject = objectRef.current;
		state.raycaster.near = 42;

		mounted.update(CanvasApp, { ...props, name: 'latest-after-ready' });
		expect(objectRef.current).toBe(sceneObject);
		expect(objectRef.current?.name).toBe('latest-after-ready');

		await flushCanvasWork();
		expect(state.raycaster.near).toBe(42);
	});

	it('activates an empty Canvas and calls onCreated with an empty scene', async () => {
		const { factory } = rendererHarness();
		const onCreated = vi.fn<(state: RootState) => void>();
		mounted = mount(EmptyCanvasApp, { gl: factory, onCreated });

		ControlledResizeObserver.instances[0].emit({ width: 240, height: 160 });
		await flushCanvasWork();

		expect(onCreated).toHaveBeenCalledTimes(1);
		expect(onCreated.mock.calls[0][0].scene.children).toEqual([]);
	});

	it('connects one event manager and rebinds external sources and coordinate prefixes', async () => {
		const { factory } = rendererHarness();
		const firstSource = document.createElement('section');
		const secondSource = document.createElement('section');
		const thirdSource = document.createElement('section');
		const onCreated = vi.fn<(state: RootState) => void>();
		const eventFactory = vi.fn((store) => {
			const manager = createPointerEvents(store);
			return { ...manager, customField: 'retained' } as EventManager<HTMLElement>;
		});
		const props = {
			gl: factory,
			canvasRef: null,
			objectRef: { current: null },
			onCreated,
			onPointerMissed: () => {},
			events: eventFactory,
			label: 'events',
			background: 'transparent',
			raycaster: undefined,
			name: 'event-scene',
		};
		mounted = mount(CanvasApp, {
			...props,
			eventSource: firstSource,
			eventPrefix: 'client',
		});

		ControlledResizeObserver.instances[0].emit({ width: 100, height: 100 });
		await flushCanvasWork();
		const state = onCreated.mock.calls[0][0];
		expect(eventFactory).toHaveBeenCalledOnce();
		expect(eventFactory).toHaveBeenCalledWith(
			expect.objectContaining({ getState: expect.any(Function) }),
		);
		expect(state.get().events.connected).toBe(firstSource);
		expect(
			(state.get().events as EventManager<HTMLElement> & { customField: string }).customField,
		).toBe('retained');
		expect((mounted.find('.canvas-shell') as HTMLDivElement).style.pointerEvents).toBe('none');

		dispatchCoordinates(firstSource, { offsetX: 10, offsetY: 90, clientX: 75, clientY: 25 });
		expect([state.pointer.x, state.pointer.y]).toEqual([0.5, 0.5]);

		mounted.update(CanvasApp, {
			...props,
			eventSource: secondSource,
			eventPrefix: 'offset',
		});
		await flushCanvasWork();
		expect(eventFactory).toHaveBeenCalledOnce();
		expect(factory).toHaveBeenCalledOnce();
		expect(onCreated).toHaveBeenCalledOnce();
		expect(state.get().events.connected).toBe(secondSource);

		dispatchCoordinates(firstSource, { offsetX: 50, offsetY: 50, clientX: 50, clientY: 50 });
		expect([state.pointer.x, state.pointer.y]).toEqual([0.5, 0.5]);
		dispatchCoordinates(secondSource, { offsetX: 25, offsetY: 75, clientX: 90, clientY: 10 });
		expect([state.pointer.x, state.pointer.y]).toEqual([-0.5, -0.5]);

		const userCompute = vi.fn();
		state.setEvents({ compute: userCompute });
		mounted.update(CanvasApp, {
			...props,
			eventSource: thirdSource,
			eventPrefix: 'offset',
		});
		await flushCanvasWork();
		expect(state.get().events.compute).toBe(userCompute);
		mounted.update(CanvasApp, {
			...props,
			eventSource: thirdSource,
			eventPrefix: undefined,
		});
		await flushCanvasWork();
		expect(state.get().events.compute).toBe(userCompute);

		mounted.unmount();
		mounted = null;
		expect(state.get().events.connected).toBeUndefined();
	});

	it('keeps an onCreated event connection until the configured source changes', async () => {
		const { factory } = rendererHarness();
		const configuredSource = document.createElement('section');
		const userSource = document.createElement('section');
		const nextSource = document.createElement('section');
		const finalSource = document.createElement('section');
		const sourceRef = { current: nextSource };
		const userCompute = vi.fn();
		const onCreated = vi.fn((state: RootState) => {
			state.events.connect?.(userSource);
			state.setEvents({ compute: userCompute });
		});
		const props = {
			gl: factory,
			canvasRef: null,
			objectRef: { current: null },
			onCreated,
			onPointerMissed: () => {},
			events: createPointerEvents,
			label: 'on-created-events',
			background: 'transparent',
			raycaster: undefined,
			name: 'on-created-event-scene',
		};
		mounted = mount(CanvasApp, {
			...props,
			eventSource: configuredSource,
			eventPrefix: undefined,
		});

		ControlledResizeObserver.instances[0].emit({ width: 100, height: 100 });
		await flushCanvasWork();
		const state = onCreated.mock.calls[0][0];
		expect(state.get().events.connected).toBe(userSource);
		expect(state.get().events.compute).toBe(userCompute);

		mounted.update(CanvasApp, {
			...props,
			eventSource: configuredSource,
			eventPrefix: 'client',
		});
		await flushCanvasWork();
		expect(state.get().events.connected).toBe(userSource);
		expect(state.get().events.compute).not.toBe(userCompute);

		mounted.update(CanvasApp, {
			...props,
			eventSource: configuredSource,
			eventPrefix: undefined,
		});
		await flushCanvasWork();
		expect(state.get().events.compute).toBe(userCompute);

		mounted.update(CanvasApp, {
			...props,
			eventSource: sourceRef,
			eventPrefix: undefined,
		});
		await flushCanvasWork();
		expect(state.get().events.connected).toBe(nextSource);

		sourceRef.current = finalSource;
		mounted.update(CanvasApp, {
			...props,
			eventSource: sourceRef,
			eventPrefix: 'screen',
		});
		await flushCanvasWork();
		expect(state.get().events.connected).toBe(finalSource);
	});

	it('bridges ordinary Octane context from the DOM owner into Three children', async () => {
		const { factory } = rendererHarness();
		const objectRef = { current: null as { name: string } | null };
		mounted = mount(ContextCanvasApp, {
			gl: factory,
			objectRef,
			theme: 'renderer-bridge',
		});

		ControlledResizeObserver.instances[0].emit({ width: 320, height: 180 });
		await flushCanvasWork();

		expect(objectRef.current?.name).toBe('renderer-bridge');
	});
});
