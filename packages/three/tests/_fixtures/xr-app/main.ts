import { createRoot, unmountComponentAtNode, type Frameloop, type Renderer } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

type XRAnimationLoop = (timestamp: number, frame?: XRFrame) => void;

interface XRProofSnapshot {
	enabled: boolean;
	frameTags: string[];
	forcedContextLossPrevented: boolean | null;
	listeners: { sessionend: number; sessionstart: number };
	loopInstalled: boolean;
	renders: number;
	disposals: number;
}

interface OffscreenLifecycleProof {
	callbackCanvasMatched: boolean;
	callbackCount: number;
	cleanup: { dispose: number; forceContextLoss: number; renderLists: number };
	sceneAfterUnmount: string[];
	sceneBeforeUnmount: string[];
	setSize: { height: number; updateStyle: boolean | undefined; width: number } | null;
	size: { height: number; left: number; top: number; width: number };
}

interface XRProof {
	frameTags: string[];
	forcedContextLossPrevented: boolean | null;
	renders: number;
	disposals: number;
	contextLost(): boolean;
	contextRestored(): void;
	endSession(): XRProofSnapshot;
	invokeStaleFrame(tag: string): XRProofSnapshot;
	offscreenLifecycle(): Promise<OffscreenLifecycleProof>;
	runFrame(tag: string): XRProofSnapshot;
	setFrameloop(frameloop: Frameloop): void;
	snapshot(): XRProofSnapshot;
	startSession(): XRProofSnapshot;
	unmount(): XRProofSnapshot;
}

const canvas = document.getElementById('three-root');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('XR fixture requires its canvas.');

const listeners = {
	sessionend: new Set<() => void>(),
	sessionstart: new Set<() => void>(),
};
let animationLoop: XRAnimationLoop | null = null;
let staleAnimationLoop: XRAnimationLoop | null = null;

const xr = {
	enabled: false,
	isPresenting: false,
	setAnimationLoop(callback: XRAnimationLoop | null) {
		animationLoop = callback;
		if (callback !== null) staleAnimationLoop = callback;
	},
	addEventListener(type: string, callback: () => void) {
		if (type === 'sessionstart' || type === 'sessionend') listeners[type].add(callback);
	},
	removeEventListener(type: string, callback: () => void) {
		if (type === 'sessionstart' || type === 'sessionend') listeners[type].delete(callback);
	},
};

const proof = {
	frameTags: [],
	forcedContextLossPrevented: null,
	renders: 0,
	disposals: 0,
} as XRProof;

const renderer: Renderer = {
	domElement: canvas,
	render() {
		proof.renders++;
	},
	dispose() {
		proof.disposals++;
	},
	forceContextLoss() {
		const event = new Event('webglcontextlost', { cancelable: true });
		canvas.dispatchEvent(event);
		proof.forcedContextLossPrevented = event.defaultPrevented;
	},
	renderLists: { dispose() {} },
	xr,
};
const root = createRoot(canvas);
const rootConfiguration = {
	gl: renderer,
	size: { width: 64, height: 64 },
	dpr: 1,
	frameloop: 'demand' as const,
};
await root.configure(rootConfiguration);
await root.configure(rootConfiguration);
root.render(Scene, {});

function snapshot(): XRProofSnapshot {
	return {
		enabled: xr.enabled,
		frameTags: [...proof.frameTags],
		forcedContextLossPrevented: proof.forcedContextLossPrevented,
		listeners: {
			sessionend: listeners.sessionend.size,
			sessionstart: listeners.sessionstart.size,
		},
		loopInstalled: animationLoop !== null,
		renders: proof.renders,
		disposals: proof.disposals,
	};
}

proof.contextLost = () => {
	const event = new Event('webglcontextlost', { cancelable: true });
	canvas.dispatchEvent(event);
	return event.defaultPrevented;
};
proof.contextRestored = () => {
	canvas.dispatchEvent(new Event('webglcontextrestored'));
};
proof.endSession = () => {
	xr.isPresenting = false;
	for (const listener of listeners.sessionend) listener();
	return snapshot();
};
proof.invokeStaleFrame = (tag) => {
	staleAnimationLoop?.(performance.now(), { tag } as unknown as XRFrame);
	return snapshot();
};
proof.offscreenLifecycle = async () => {
	const offscreenCanvas = new OffscreenCanvas(160, 90);
	const cleanup = { dispose: 0, forceContextLoss: 0, renderLists: 0 };
	let configuredSize: OffscreenLifecycleProof['setSize'] = null;
	const offscreenRenderer: Renderer = {
		domElement: offscreenCanvas,
		render() {},
		setPixelRatio() {},
		setSize(width, height, updateStyle) {
			configuredSize = { width, height, updateStyle };
		},
		dispose() {
			cleanup.dispose++;
		},
		forceContextLoss() {
			cleanup.forceContextLoss++;
		},
		renderLists: {
			dispose() {
				cleanup.renderLists++;
			},
		},
	};
	const offscreenRoot = createRoot(offscreenCanvas);
	await offscreenRoot.configure({ gl: offscreenRenderer, dpr: 1, frameloop: 'never' });
	offscreenRoot.render(Scene, {});
	const state = offscreenRoot.store.getState();
	const size = { ...state.size };
	const sceneBeforeUnmount = state.scene.children.map((child) => child.name);
	let callbackCount = 0;
	let callbackCanvasMatched = false;
	unmountComponentAtNode(offscreenCanvas, (unmountedCanvas) => {
		callbackCount++;
		callbackCanvasMatched = unmountedCanvas === offscreenCanvas;
	});

	return {
		callbackCanvasMatched,
		callbackCount,
		cleanup,
		sceneAfterUnmount: state.scene.children.map((child) => child.name),
		sceneBeforeUnmount,
		setSize: configuredSize,
		size,
	};
};
proof.runFrame = (tag) => {
	animationLoop?.(performance.now(), { tag } as unknown as XRFrame);
	return snapshot();
};
proof.setFrameloop = (frameloop) => root.store.getState().setFrameloop(frameloop);
proof.snapshot = snapshot;
proof.startSession = () => {
	xr.isPresenting = true;
	for (const listener of listeners.sessionstart) listener();
	return snapshot();
};
proof.unmount = () => {
	root.unmount();
	return snapshot();
};

(globalThis as typeof globalThis & { __octaneThreeXR?: XRProof }).__octaneThreeXR = proof;
