import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import type { Renderer, RootState } from '../src/core/index.js';
import { mount, type MountResult } from '../../octane/tests/_helpers.js';
import {
	CanvasApp,
	CanvasErrorApp,
	ContextCanvasApp,
	EmptyCanvasApp,
} from './_fixtures/canvas-app.tsrx';

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

	it('does not expose scene children until an asynchronous renderer settles', async () => {
		const { renderer } = rendererHarness();
		let settle!: (renderer: Renderer) => void;
		const pending = new Promise<Renderer>((resolve) => {
			settle = resolve;
		});
		const factory = vi.fn(() => pending);
		const objectRef = { current: null as { name: string } | null };
		const onCreated = vi.fn<(state: RootState) => void>();
		mounted = mount(CanvasApp, {
			gl: factory,
			canvasRef: null,
			objectRef,
			onCreated,
			label: 'async',
			name: 'async-scene',
			background: 'transparent',
		});

		ControlledResizeObserver.instances[0].emit({ width: 320, height: 200 });
		await flushCanvasWork();
		expect(factory).toHaveBeenCalledTimes(1);
		expect(onCreated).not.toHaveBeenCalled();
		expect(objectRef.current).toBeNull();

		settle(renderer);
		await flushCanvasWork();
		expect(onCreated).toHaveBeenCalledTimes(1);
		expect(objectRef.current?.name).toBe('async-scene');
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

	it('routes unsupported pointer configuration through the owning DOM boundary', async () => {
		const { factory } = rendererHarness();
		mounted = mount(CanvasErrorApp, {
			gl: factory,
			onPointerMissed: () => {},
		});

		ControlledResizeObserver.instances[0].emit({ width: 300, height: 150 });
		await flushCanvasWork();

		expect(mounted.find('.canvas-error').textContent).toMatch(
			/Pointer event configuration.*Milestone 4/,
		);
		expect(factory).not.toHaveBeenCalled();
		expect(ControlledResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1);
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
