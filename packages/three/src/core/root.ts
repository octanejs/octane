/**
 * Three root configuration and lifecycle.
 *
 * Component execution remains in Octane's universal runtime. This controller
 * owns only renderer construction, R3F-shaped root state, the Three host
 * container, and the configuration barrier before a scene may render.
 */
import * as THREE from 'three';
import {
	defineUniversalComponent,
	universalComponent,
	universalContext,
	useLayoutEffect,
	type RendererRegion,
	type UniversalComponent,
	type UniversalRoot,
} from 'octane/universal';
import { applyThreeProps } from './props.js';
import {
	createThreeContainer,
	createThreeDriver,
	type ThreeHostContainer,
	type ThreeHostEnvironment,
} from './driver.js';
import type { EventManager } from './events.js';
import { advance, invalidate, registerRootStore, unregisterRootStore } from './loop.js';
import {
	RootStoreContext,
	associateRootObject,
	createRootStore,
	dissociateRootObject,
	destroyRootStore,
	type Camera,
	type Dpr,
	type Frameloop,
	type Performance,
	type Renderer,
	type RootState,
	type RootStore,
	type Size,
	type XRManager,
} from './store.js';
import { createUniversalRoot } from 'octane/universal';

export interface CanvasLike {
	width?: number;
	height?: number;
	parentElement?: {
		getBoundingClientRect(): Pick<DOMRect, 'width' | 'height' | 'top' | 'left'>;
	} | null;
}

export type DefaultGLProps<TCanvas extends CanvasLike = CanvasLike> = Omit<
	THREE.WebGLRendererParameters,
	'canvas'
> & {
	canvas: TCanvas;
};

export type GLProps<TCanvas extends CanvasLike = CanvasLike> =
	| Renderer
	| ((defaults: DefaultGLProps<TCanvas>) => Renderer | Promise<Renderer>)
	| (Partial<THREE.WebGLRendererParameters> & Record<string, unknown>);

export type CameraProps =
	| Camera
	| (Partial<THREE.PerspectiveCamera & THREE.OrthographicCamera> & { manual?: boolean });

export interface RenderProps<TCanvas extends CanvasLike = CanvasLike> {
	gl?: GLProps<TCanvas>;
	size?: Partial<Size> & Pick<Size, 'width' | 'height'>;
	shadows?:
		| boolean
		| 'basic'
		| 'percentage'
		| 'soft'
		| 'variance'
		| Partial<NonNullable<Renderer['shadowMap']>>;
	legacy?: boolean;
	linear?: boolean;
	flat?: boolean;
	orthographic?: boolean;
	frameloop?: Frameloop;
	performance?: Partial<Omit<Performance, 'regress'>>;
	dpr?: Dpr;
	raycaster?: Partial<THREE.Raycaster> & { params?: Partial<THREE.Raycaster['params']> };
	scene?: THREE.Scene | Partial<THREE.Scene>;
	camera?: CameraProps;
	/** Event manager installed while the current manager has no native handler table. */
	events?: (store: RootStore) => EventManager<any>;
	onCreated?: (state: RootState) => void;
	/** Response for pointer clicks that miss every target. */
	onPointerMissed?: (event: MouseEvent) => void;
}

export interface ThreeRoot<TCanvas extends CanvasLike = CanvasLike> {
	readonly store: RootStore;
	configure(config?: RenderProps<TCanvas>): Promise<ThreeRoot<TCanvas>>;
	render<P>(component: UniversalComponent<P>, props: P): RootStore;
	unmount(): void;
}

interface PendingRender {
	readonly component: UniversalComponent<any>;
	readonly props: any;
}

interface RootProviderProps {
	readonly store: RootStore;
	readonly onCreated?: (state: RootState) => void;
	readonly eventTarget?: unknown;
	readonly component?: UniversalComponent<any>;
	readonly componentProps?: any;
	readonly region?: RendererRegion<any>;
}

interface ThreeRootInternals<TCanvas extends CanvasLike> {
	readonly canvas: TCanvas;
	readonly store: RootStore;
	readonly controller: ThreeRoot<TCanvas>;
	container: ThreeHostContainer | null;
	hostRoot: UniversalRoot | null;
	rendererPromise: Promise<Renderer> | null;
	configurationQueue: Promise<void>;
	pendingConfigurations: number;
	lastPendingConfig: RenderProps<TCanvas> | null;
	lastPendingPromise: Promise<ThreeRoot<TCanvas>> | null;
	eventsManagedByBoundary: boolean;
	configured: boolean;
	configurationReady: boolean;
	disposed: boolean;
	generation: number;
	pendingRender: PendingRender | null;
	lastConfiguredCamera?: CameraProps;
	onCreated?: (state: RootState) => void;
	contextLifecycleInitialized: boolean;
	contextLifecycleCleanup: (() => void) | null;
	xrInitialized: boolean;
	xrManager: XRManager | null;
}

interface RootRecord<TCanvas extends CanvasLike = CanvasLike> {
	readonly store: RootStore;
	readonly root: ThreeRoot<TCanvas>;
}

const roots = new Map<CanvasLike, RootRecord<any>>();

const ROOT_PROVIDER_LIFETIME = Symbol('octane.three.root-provider.lifetime');
const disposedRenderers = new WeakSet<object>();
const rootInternals = new WeakMap<ThreeRoot<any>, ThreeRootInternals<any>>();
const DEFAULT_CONFIGURATION = Object.freeze({}) as RenderProps<any>;

const RootProvider = defineUniversalComponent<RootProviderProps>('three', (props) => {
	useLayoutEffect(
		() => {
			const state = props.store.getState();
			state.internal.active = true;
			props.onCreated?.(state);
			const events = props.store.getState().events;
			if (props.eventTarget !== undefined && !events.connected) {
				events.connect?.(props.eventTarget);
			}
			state.invalidate();
			return () => {
				state.internal.active = false;
				state.internal.frames = 0;
			};
		},
		[],
		ROOT_PROVIDER_LIFETIME,
	);
	return universalContext(RootStoreContext, props.store, () => {
		if (props.region !== undefined) {
			return universalComponent(
				'three',
				props.region.component as UniversalComponent<any>,
				props.region.props,
			);
		}
		if (props.component === undefined) {
			return null;
		}
		return universalComponent('three', props.component, props.componentProps);
	});
});

function isRenderer(value: unknown): value is Renderer {
	return typeof (value as Renderer | null)?.render === 'function';
}

function disposeRenderer(renderer: Renderer | null | undefined): void {
	if (renderer == null || typeof renderer !== 'object' || disposedRenderers.has(renderer)) return;
	disposedRenderers.add(renderer);
	try {
		renderer.renderLists?.dispose?.();
	} catch {
		// Renderer cleanup is best effort, matching Three/R3F teardown.
	}
	try {
		renderer.forceContextLoss?.();
	} catch {
		// Renderer cleanup is best effort, matching Three/R3F teardown.
	}
	try {
		renderer.dispose?.();
	} catch {
		// Renderer cleanup is best effort, matching Three/R3F teardown.
	}
}

interface ContextLifecycleTarget {
	addEventListener(type: string, listener: (event: Event) => void): void;
	removeEventListener(type: string, listener: (event: Event) => void): void;
}

function isContextLifecycleTarget(value: unknown): value is ContextLifecycleTarget {
	const target = value as Partial<ContextLifecycleTarget> | null;
	return (
		target !== null &&
		typeof target === 'object' &&
		typeof target.addEventListener === 'function' &&
		typeof target.removeEventListener === 'function'
	);
}

function initializeContextLifecycle(internals: ThreeRootInternals<any>, renderer: Renderer): void {
	if (internals.contextLifecycleInitialized) return;
	const target = isContextLifecycleTarget(renderer.domElement)
		? renderer.domElement
		: isContextLifecycleTarget(internals.canvas)
			? internals.canvas
			: null;
	if (target === null) {
		internals.contextLifecycleInitialized = true;
		return;
	}

	const handleContextLoss = (event: Event) => {
		event.preventDefault();
	};
	const handleContextRestore = () => {
		if (!internals.disposed) internals.store.getState().invalidate();
	};
	target.addEventListener('webglcontextlost', handleContextLoss);
	try {
		target.addEventListener('webglcontextrestored', handleContextRestore);
	} catch (error) {
		target.removeEventListener('webglcontextlost', handleContextLoss);
		throw error;
	}
	internals.contextLifecycleCleanup = () => {
		try {
			target.removeEventListener('webglcontextlost', handleContextLoss);
		} finally {
			target.removeEventListener('webglcontextrestored', handleContextRestore);
		}
	};
	internals.contextLifecycleInitialized = true;
}

function createXRManager(internals: ThreeRootInternals<any>, renderer: Renderer): XRManager {
	let connected = false;
	let frameCallback: ((timestamp: number, frame?: XRFrame) => void) | null = null;

	const handleSessionChange = () => {
		if (!connected || internals.disposed) return;
		const xr = renderer.xr;
		if (xr === undefined) return;
		const presenting = xr.isPresenting === true;
		xr.enabled = presenting;
		if (presenting) {
			if (frameCallback === null) {
				let currentFrame!: (timestamp: number, frame?: XRFrame) => void;
				currentFrame = (timestamp, frame) => {
					if (!connected || internals.disposed || frameCallback !== currentFrame) {
						return;
					}
					const state = internals.store.getState();
					if (state.frameloop !== 'never') advance(timestamp, true, state, frame);
				};
				frameCallback = currentFrame;
			}
			xr.setAnimationLoop?.(frameCallback);
		} else {
			frameCallback = null;
			xr.setAnimationLoop?.(null);
			internals.store.getState().invalidate();
		}
	};

	return {
		connect() {
			if (connected || internals.disposed) return;
			const xr = renderer.xr;
			if (
				xr === undefined ||
				typeof xr.addEventListener !== 'function' ||
				typeof xr.removeEventListener !== 'function'
			) {
				return;
			}
			xr.addEventListener('sessionstart', handleSessionChange);
			try {
				xr.addEventListener('sessionend', handleSessionChange);
			} catch (error) {
				xr.removeEventListener('sessionstart', handleSessionChange);
				throw error;
			}
			connected = true;
		},
		disconnect() {
			const xr = renderer.xr;
			const wasConnected = connected;
			connected = false;
			frameCallback = null;
			if (xr === undefined) return;
			try {
				if (wasConnected && typeof xr.removeEventListener === 'function') {
					xr.removeEventListener('sessionstart', handleSessionChange);
				}
			} finally {
				try {
					if (wasConnected && typeof xr.removeEventListener === 'function') {
						xr.removeEventListener('sessionend', handleSessionChange);
					}
				} finally {
					try {
						xr.setAnimationLoop?.(null);
					} finally {
						xr.enabled = false;
					}
				}
			}
		},
	};
}

function initializeXR(internals: ThreeRootInternals<any>, renderer: Renderer): void {
	if (internals.xrInitialized) return;
	const xr = createXRManager(internals, renderer);
	xr.connect();
	try {
		internals.store.setState({ xr });
	} catch (error) {
		xr.disconnect();
		throw error;
	}
	internals.xrManager = xr;
	internals.xrInitialized = true;
}

function computeInitialSize(canvas: CanvasLike, size?: RenderProps<any>['size']): Size {
	if (size !== undefined) {
		return { width: size.width, height: size.height, top: size.top ?? 0, left: size.left ?? 0 };
	}
	if (canvas.parentElement != null) {
		const bounds = canvas.parentElement.getBoundingClientRect();
		return {
			width: bounds.width,
			height: bounds.height,
			top: bounds.top,
			left: bounds.left,
		};
	}
	return {
		width: canvas.width ?? 0,
		height: canvas.height ?? 0,
		top: 0,
		left: 0,
	};
}

function sameSize(left: Size, right: Size): boolean {
	return (
		left.width === right.width &&
		left.height === right.height &&
		left.top === right.top &&
		left.left === right.left
	);
}

function applyRaycasterOptions(
	raycaster: THREE.Raycaster,
	options: RenderProps<any>['raycaster'],
): void {
	if (options === undefined) return;
	const { params, ...ordinary } = options;
	applyThreeProps(raycaster, ordinary as Record<string, unknown>);
	if (params !== undefined) {
		raycaster.params = {
			...raycaster.params,
			...params,
			Mesh: { ...raycaster.params.Mesh, ...params.Mesh },
			Line: { ...raycaster.params.Line, ...params.Line },
			LOD: { ...raycaster.params.LOD, ...params.LOD },
			Points: { ...raycaster.params.Points, ...params.Points },
			Sprite: { ...raycaster.params.Sprite, ...params.Sprite },
		};
	}
}

function createCamera(orthographic: boolean, options?: CameraProps): Camera {
	if ((options as THREE.Camera | undefined)?.isCamera === true) return options as Camera;
	const camera = (
		orthographic
			? new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000)
			: new THREE.PerspectiveCamera(75, 0, 0.1, 1000)
	) as Camera;
	camera.position.z = 5;
	if (options !== undefined) {
		applyThreeProps(camera, options as Record<string, unknown>);
		if (
			camera.manual !== true &&
			('aspect' in options ||
				'left' in options ||
				'right' in options ||
				'bottom' in options ||
				'top' in options)
		) {
			camera.manual = true;
			camera.updateProjectionMatrix();
		}
	}
	if (options == null || !('rotation' in options)) camera.lookAt(0, 0, 0);
	return camera;
}

function configureShadows(renderer: Renderer, shadows: RenderProps<any>['shadows']): void {
	const shadowMap = renderer.shadowMap;
	if (shadowMap === undefined) return;
	const oldEnabled = shadowMap.enabled;
	const oldType = shadowMap.type;
	shadowMap.enabled = Boolean(shadows);
	if (typeof shadows === 'boolean') {
		if (shadows) shadowMap.type = THREE.PCFSoftShadowMap;
	} else if (typeof shadows === 'string') {
		const types = {
			basic: THREE.BasicShadowMap,
			percentage: THREE.PCFShadowMap,
			soft: THREE.PCFSoftShadowMap,
			variance: THREE.VSMShadowMap,
		};
		shadowMap.type = types[shadows] ?? THREE.PCFSoftShadowMap;
	} else if (shadows != null) {
		Object.assign(shadowMap, shadows);
	}
	if (oldEnabled !== shadowMap.enabled || oldType !== shadowMap.type) shadowMap.needsUpdate = true;
}

function ensureHostRoot(internals: ThreeRootInternals<any>): void {
	if (internals.hostRoot !== null) return;
	const state = internals.store.getState();
	let hostRoot: UniversalRoot | null = null;
	const environment: ThreeHostEnvironment = {
		store: internals.store,
		invalidate: () => internals.store.getState().invalidate(),
		eventScope(priority, run) {
			const root = hostRoot;
			if (root === null) {
				throw new Error('@octanejs/three: Event dispatch started before the host root existed.');
			}
			return root.eventScope(priority, run);
		},
		dispatchEvent(listener, payload) {
			if (hostRoot === null) {
				throw new Error('@octanejs/three: Event dispatch started before the host root existed.');
			}
			return hostRoot.dispatchEvent(listener, payload);
		},
		get linear() {
			return internals.store.getState().linear;
		},
	};
	const container = createThreeContainer({ scene: state.scene, environment });
	hostRoot = createUniversalRoot(container, createThreeDriver());
	internals.container = container;
	internals.hostRoot = hostRoot;
}

async function ensureRenderer<TCanvas extends CanvasLike>(
	internals: ThreeRootInternals<TCanvas>,
	glConfig: GLProps<TCanvas> | undefined,
	generation: number,
): Promise<Renderer | null> {
	const state = internals.store.getState();
	if (state.gl != null) return state.gl;
	if (internals.rendererPromise === null) {
		const defaults = {
			canvas: internals.canvas,
			powerPreference: 'high-performance',
			antialias: true,
			alpha: true,
		} as DefaultGLProps<TCanvas>;
		internals.rendererPromise = Promise.resolve(
			typeof glConfig === 'function' ? glConfig(defaults) : glConfig,
		).then((custom) => {
			if (isRenderer(custom)) return custom;
			return new THREE.WebGLRenderer({
				...defaults,
				...(glConfig as Partial<THREE.WebGLRendererParameters> | undefined),
			} as THREE.WebGLRendererParameters) as unknown as Renderer;
		});
	}
	const pendingRenderer = internals.rendererPromise;
	let renderer: Renderer;
	try {
		renderer = await pendingRenderer;
	} catch (error) {
		// A rejected async factory must not poison the root permanently. Keep the
		// identity guard so a late rejection can never clear a newer attempt.
		if (internals.rendererPromise === pendingRenderer) internals.rendererPromise = null;
		throw error;
	}
	if (internals.disposed || internals.generation !== generation) {
		disposeRenderer(renderer);
		return null;
	}
	if (internals.store.getState().gl == null) {
		internals.store.setState({ gl: renderer, renderer });
	}
	return renderer;
}

async function applyConfiguration<TCanvas extends CanvasLike>(
	internals: ThreeRootInternals<TCanvas>,
	props: RenderProps<TCanvas>,
	generation: number,
): Promise<void> {
	if (internals.disposed || internals.generation !== generation) return;
	const {
		gl: glConfig,
		size: configuredSize,
		scene: sceneOptions,
		events: eventFactory,
		onPointerMissed,
		onCreated,
		shadows = false,
		linear = false,
		flat = false,
		legacy = false,
		orthographic = false,
		frameloop = 'always',
		dpr = [1, 2],
		performance,
		raycaster: raycasterOptions,
		camera: cameraOptions,
	} = props;
	const renderer = await ensureRenderer(internals, glConfig, generation);
	if (renderer === null || internals.disposed || internals.generation !== generation) return;
	initializeContextLifecycle(internals, renderer);
	initializeXR(internals, renderer);

	let state = internals.store.getState();
	if (state.raycaster == null) internals.store.setState({ raycaster: new THREE.Raycaster() });
	state = internals.store.getState();
	applyRaycasterOptions(state.raycaster, raycasterOptions);

	if (
		state.camera == null ||
		(state.camera === internals.lastConfiguredCamera &&
			cameraOptions !== internals.lastConfiguredCamera)
	) {
		internals.lastConfiguredCamera = cameraOptions;
		const camera = createCamera(orthographic, cameraOptions);
		state.raycaster.camera = camera;
		internals.store.setState({ camera });
	}
	state = internals.store.getState();
	if (state.scene == null) {
		const scene =
			(sceneOptions as THREE.Scene | undefined)?.isScene === true
				? (sceneOptions as THREE.Scene)
				: new THREE.Scene();
		if (sceneOptions !== undefined && scene !== sceneOptions) {
			applyThreeProps(scene, sceneOptions as Record<string, unknown>);
		}
		internals.store.setState({ scene });
	}
	associateRootObject(internals.store.getState().scene, internals.store);
	ensureHostRoot(internals);
	state = internals.store.getState();
	if (eventFactory !== undefined && state.events.handlers === undefined) {
		const previousEvents = state.events;
		const previousTarget = previousEvents.connected;
		const manager = eventFactory(internals.store);
		if (previousTarget) previousEvents.disconnect?.();
		internals.store.setState({ events: manager });
		state = internals.store.getState();
		if (previousTarget && !state.events.connected) {
			state.events.connect?.(previousTarget);
			state = internals.store.getState();
		}
	}
	if (state.onPointerMissed !== onPointerMissed) {
		internals.store.setState({ onPointerMissed });
		state = internals.store.getState();
	}
	if (state.internal.active && !internals.eventsManagedByBoundary && !state.events.connected) {
		state.events.connect?.(internals.canvas);
	}

	const size = computeInitialSize(internals.canvas, configuredSize);
	if (!sameSize(size, state.size)) state.setSize(size.width, size.height, size.top, size.left);
	state = internals.store.getState();
	state.setDpr(dpr);
	state = internals.store.getState();
	if (state.frameloop !== frameloop) state.setFrameloop(frameloop);
	if (performance !== undefined) {
		internals.store.setState((current) => ({
			performance: { ...current.performance, ...performance },
		}));
	}

	configureShadows(renderer, shadows);
	THREE.ColorManagement.enabled = !legacy;
	if (!internals.configured) {
		renderer.outputColorSpace = linear ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
		renderer.toneMapping = flat ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
	}
	state = internals.store.getState();
	if (state.legacy !== legacy || state.linear !== linear || state.flat !== flat) {
		internals.store.setState({ legacy, linear, flat });
	}
	if (glConfig != null && typeof glConfig !== 'function' && !isRenderer(glConfig)) {
		applyThreeProps(renderer, glConfig as Record<string, unknown>);
	}
	internals.onCreated = onCreated;
	internals.configured = true;
}

function performRender(internals: ThreeRootInternals<any>, pending: PendingRender): void {
	if (internals.disposed || !internals.configured || internals.hostRoot === null) return;
	internals.pendingRender = null;
	internals.hostRoot.render(RootProvider, {
		store: internals.store,
		onCreated: internals.onCreated,
		eventTarget: internals.canvas,
		component: pending.component,
		componentProps: pending.props,
	});
}

function reportAsyncError(error: unknown): void {
	queueMicrotask(() => {
		throw error;
	});
}

export function createRoot<TCanvas extends CanvasLike>(canvas: TCanvas): ThreeRoot<TCanvas> {
	const previous = roots.get(canvas) as RootRecord<TCanvas> | undefined;
	if (previous !== undefined) {
		console.warn('@octanejs/three: createRoot should only be called once for a canvas.');
		return previous.root;
	}
	const store = createRootStore(invalidate, advance);
	let internals!: ThreeRootInternals<TCanvas>;
	const controller: ThreeRoot<TCanvas> = {
		store,
		configure(config = DEFAULT_CONFIGURATION): Promise<ThreeRoot<TCanvas>> {
			if (internals.disposed) {
				return Promise.reject(new Error('@octanejs/three: Cannot configure an unmounted root.'));
			}
			if (
				internals.pendingConfigurations > 0 &&
				internals.lastPendingConfig === config &&
				internals.lastPendingPromise !== null
			) {
				return internals.lastPendingPromise;
			}
			const generation = internals.generation;
			internals.configurationReady = false;
			internals.pendingConfigurations++;
			const work = internals.configurationQueue.then(() =>
				applyConfiguration(internals, config, generation),
			);
			internals.configurationQueue = work.catch(() => {});
			let succeeded = false;
			const result = work
				.then(() => {
					succeeded = true;
				})
				.finally(() => {
					internals.pendingConfigurations--;
					if (internals.lastPendingConfig === config) {
						internals.lastPendingConfig = null;
						internals.lastPendingPromise = null;
					}
					if (internals.pendingConfigurations === 0) {
						internals.configurationReady = succeeded;
						if (succeeded && internals.pendingRender !== null && !internals.disposed) {
							performRender(internals, internals.pendingRender);
						}
					}
				}) as Promise<void>;
			const publicResult = result.then(() => controller);
			internals.lastPendingConfig = config;
			internals.lastPendingPromise = publicResult;
			return publicResult;
		},
		render<P>(component: UniversalComponent<P>, props: P): RootStore {
			if (internals.disposed) {
				throw new Error('@octanejs/three: Cannot render an unmounted root.');
			}
			const pending: PendingRender = { component, props };
			internals.pendingRender = pending;
			if (internals.configurationReady && internals.pendingConfigurations === 0) {
				performRender(internals, pending);
			} else if (internals.pendingConfigurations === 0) {
				void controller.configure().catch(reportAsyncError);
			}
			return store;
		},
		unmount(): void {
			if (internals.disposed) return;
			internals.disposed = true;
			internals.generation++;
			internals.pendingRender = null;
			const state = store.getState();
			if (state.scene != null) dissociateRootObject(state.scene, store);
			state.internal.active = false;
			state.internal.frames = 0;
			unregisterRootStore(store);
			try {
				state.events.disconnect?.();
			} finally {
				try {
					internals.hostRoot?.unmount();
				} finally {
					try {
						internals.container?.flushDisposals();
					} finally {
						try {
							internals.contextLifecycleCleanup?.();
						} finally {
							internals.contextLifecycleCleanup = null;
							try {
								internals.xrManager?.disconnect();
							} finally {
								internals.xrManager = null;
								disposeRenderer(state.gl);
								destroyRootStore(store);
								roots.delete(canvas);
								rootInternals.delete(controller);
							}
						}
					}
				}
			}
		},
	};
	internals = {
		canvas,
		store,
		controller,
		container: null,
		hostRoot: null,
		rendererPromise: null,
		configurationQueue: Promise.resolve(),
		pendingConfigurations: 0,
		lastPendingConfig: null,
		lastPendingPromise: null,
		eventsManagedByBoundary: false,
		configured: false,
		configurationReady: false,
		disposed: false,
		generation: 0,
		pendingRender: null,
		lastConfiguredCamera: undefined,
		contextLifecycleInitialized: false,
		contextLifecycleCleanup: null,
		xrInitialized: false,
		xrManager: null,
	};
	rootInternals.set(controller, internals);
	roots.set(canvas, { store, root: controller });
	registerRootStore(store);
	return controller;
}

export function unmountComponentAtNode<TCanvas extends CanvasLike>(
	canvas: TCanvas,
	callback?: (canvas: TCanvas) => void,
): void {
	const record = roots.get(canvas);
	if (record === undefined) return;
	record.root.unmount();
	callback?.(canvas);
}

export interface ThreeBoundaryMount {
	readonly root: UniversalRoot;
	readonly component: typeof RootProvider;
	readonly props: RootProviderProps;
}

/** Internal Canvas adapter that retains DOM boundary error/context ownership. */
export function createThreeBoundaryMount(
	root: ThreeRoot,
	region?: RendererRegion,
): ThreeBoundaryMount {
	const internals = rootInternals.get(root);
	if (internals === undefined || internals.disposed) {
		throw new Error('@octanejs/three: Cannot mount a boundary for an unmounted root.');
	}
	if (!internals.configurationReady || internals.hostRoot === null) {
		throw new Error('@octanejs/three: Canvas children cannot mount before configure() settles.');
	}
	internals.eventsManagedByBoundary = true;
	return {
		root: internals.hostRoot,
		component: RootProvider,
		props: {
			store: internals.store,
			onCreated: internals.onCreated,
			region,
		},
	};
}
