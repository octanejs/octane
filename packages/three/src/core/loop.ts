import type { RenderCallback, RootState, RootStore, Subscription } from './store.js';

export type GlobalRenderCallback = (timestamp: number) => void;
export type GlobalEffectType = 'before' | 'after' | 'tail';

interface GlobalSubscription {
	callback: GlobalRenderCallback;
}

interface FrameRenderer {
	render?: (scene: RootState['scene'], camera: RootState['camera']) => void;
	xr?: { isPresenting?: boolean };
}

const roots = new Set<RootStore>();
const globalEffects = new Set<GlobalSubscription>();
const globalAfterEffects = new Set<GlobalSubscription>();
const globalTailEffects = new Set<GlobalSubscription>();

let running = false;
let useFrameInProgress = false;

function subscribeGlobal(
	callback: GlobalRenderCallback,
	subscriptions: Set<GlobalSubscription>,
): () => void {
	const subscription = { callback };
	subscriptions.add(subscription);
	return () => {
		subscriptions.delete(subscription);
	};
}

function runGlobalSubscriptions(subscriptions: Set<GlobalSubscription>, timestamp: number): void {
	for (const subscription of subscriptions) {
		subscription.callback(timestamp);
	}
}

function getRenderer(state: RootState): FrameRenderer | undefined {
	const compatibleState = state as RootState & {
		gl?: FrameRenderer;
		renderer?: FrameRenderer;
	};
	return compatibleState.gl ?? compatibleState.renderer;
}

function requestFrame(callback: FrameRequestCallback): number | null {
	if (typeof globalThis.requestAnimationFrame !== 'function') return null;
	return globalThis.requestAnimationFrame(callback);
}

function cancelFrame(frame: number): void {
	if (typeof globalThis.cancelAnimationFrame === 'function') {
		globalThis.cancelAnimationFrame(frame);
	}
}

function update(timestamp: number, state: RootState, frame?: XRFrame): number {
	let delta = state.clock.getDelta();

	if (state.frameloop === 'never') {
		delta = timestamp - state.clock.elapsedTime;
		state.clock.oldTime = state.clock.elapsedTime;
		state.clock.elapsedTime = timestamp;
	}

	const subscribers = state.internal.subscribers;
	for (let index = 0; index < subscribers.length; index++) {
		const subscription: Subscription = subscribers[index];
		const callback: RenderCallback = subscription.ref.current;
		callback(subscription.store.getState(), delta, frame);
	}

	const renderer = getRenderer(state);
	if (state.internal.priority === 0 && renderer?.render) {
		renderer.render(state.scene, state.camera);
	}

	state.internal.frames = Math.max(0, state.internal.frames - 1);
	return state.frameloop === 'always' ? 1 : state.internal.frames;
}

/**
 * Registers a configured root with the shared frame scheduler.
 *
 * This is an integration hook for the root implementation, not a public
 * application API. Registering the same store more than once is idempotent.
 */
export function registerRootStore(store: RootStore): () => void {
	roots.add(store);
	return () => unregisterRootStore(store);
}

/** Removes a root from the shared frame scheduler. */
export function unregisterRootStore(store: RootStore): void {
	roots.delete(store);
}

/** Adds a callback that runs before active roots render each frame. */
export function addEffect(callback: GlobalRenderCallback): () => void {
	return subscribeGlobal(callback, globalEffects);
}

/** Adds a callback that runs after active roots render each frame. */
export function addAfterEffect(callback: GlobalRenderCallback): () => void {
	return subscribeGlobal(callback, globalAfterEffects);
}

/** Adds a callback that runs when the shared frame loop becomes idle. */
export function addTail(callback: GlobalRenderCallback): () => void {
	return subscribeGlobal(callback, globalTailEffects);
}

/** Runs one phase of the registered global frame callbacks. */
export function flushGlobalEffects(type: GlobalEffectType, timestamp: number): void {
	switch (type) {
		case 'before':
			runGlobalSubscriptions(globalEffects, timestamp);
			break;
		case 'after':
			runGlobalSubscriptions(globalAfterEffects, timestamp);
			break;
		case 'tail':
			runGlobalSubscriptions(globalTailEffects, timestamp);
			break;
	}
}

/** Runs one scheduled frame for every active registered root. */
export function loop(timestamp: number): void {
	const nextFrame = requestFrame(loop);
	running = nextFrame !== null;
	let repeat = 0;

	flushGlobalEffects('before', timestamp);

	useFrameInProgress = true;
	try {
		for (const store of roots) {
			const state = store.getState();
			const renderer = getRenderer(state);
			if (
				state.internal.active &&
				(state.frameloop === 'always' || state.internal.frames > 0) &&
				!renderer?.xr?.isPresenting
			) {
				repeat += update(timestamp, state);
			}
		}
	} finally {
		useFrameInProgress = false;
	}

	flushGlobalEffects('after', timestamp);

	if (repeat === 0) {
		flushGlobalEffects('tail', timestamp);
		running = false;
		if (nextFrame !== null) cancelFrame(nextFrame);
	}
}

/**
 * Requests a render from one root, or every registered root when state is
 * omitted. Demand-mode requests coalesce into one shared animation frame.
 */
export function invalidate(state?: RootState, frames = 1): void {
	if (state === undefined) {
		for (const store of roots) invalidate(store.getState(), frames);
		return;
	}

	const renderer = getRenderer(state);
	if (renderer?.xr?.isPresenting || !state.internal.active || state.frameloop === 'never') {
		return;
	}

	if (frames > 1) {
		state.internal.frames = Math.min(60, state.internal.frames + frames);
	} else {
		state.internal.frames = useFrameInProgress ? 2 : 1;
	}

	if (!running) {
		const frame = requestFrame(loop);
		running = frame !== null;
	}
}

/**
 * Advances one root, or every registered root, without scheduling a RAF.
 * This is the deterministic rendering path for `frameloop="never"`.
 */
export function advance(
	timestamp: number,
	runGlobalEffects = true,
	state?: RootState,
	frame?: XRFrame,
): void {
	if (runGlobalEffects) flushGlobalEffects('before', timestamp);

	if (state === undefined) {
		for (const store of roots) update(timestamp, store.getState());
	} else {
		update(timestamp, state, frame);
	}

	if (runGlobalEffects) flushGlobalEffects('after', timestamp);
}
