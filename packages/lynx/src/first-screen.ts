import type { UniversalComponent } from 'octane/universal/native';
import type { LynxComponent } from './intrinsics.js';
import type { LynxFirstScreenRenderResult } from './main-renderer.js';
import {
	currentLynxFirstScreenHost,
	installLynxFirstScreenHost,
	requireLynxFirstScreenHost,
	type LynxFirstScreenHost,
} from './core/first-screen-host.js';

export { installLynxFirstScreenHost, type LynxFirstScreenHost };

export interface LynxFirstScreenRoot {
	readonly renderer: 'lynx';
	readonly ready: Promise<void>;
	/** Null when no synchronous first screen was painted; see {@link LynxFirstScreenHost.render}. */
	render<Props>(component: LynxComponent<Props>, props?: Props): LynxFirstScreenRenderResult | null;
	flushTransport(): Promise<void>;
	unmount(): Promise<void>;
}

const ready = Promise.resolve();

/** Synchronous main-thread facade selected only for the generated first-screen graph. */
export const root: LynxFirstScreenRoot = Object.freeze({
	renderer: 'lynx' as const,
	ready,
	render<Props>(component: LynxComponent<Props>, props?: Props) {
		if (typeof component !== 'function') {
			throw new TypeError('Lynx first-screen root.render() requires a component function.');
		}
		return requireLynxFirstScreenHost().render(
			component as UniversalComponent<Props>,
			props === undefined ? ({} as Props) : props,
		);
	},
	flushTransport() {
		return ready;
	},
	unmount() {
		currentLynxFirstScreenHost()?.unmount();
		return ready;
	},
});

/** Main specialization for the background root factory's first, one-shot root. */
export function createLynxRoot(): LynxFirstScreenRoot {
	return root;
}

/** Release a receiver configured for manual first-screen synchronization. */
export function markFirstScreenSyncReady(): void {
	requireLynxFirstScreenHost().markSyncReady();
}

export const lynxRootAvailability = {
	available: true,
	implementedMilestone: 8,
	status: 'private-milestone-0-native-gates-blocked',
} as const;

// Rspeedy's main graph aliases the exact package root to this facade, so keep
// root-level authoring helpers addressable even when their values are accepted
// only by the background renderer.
export { createLynxNativeResource } from './resource.js';
export type { LynxNativeResource } from './resource.js';
export { LynxNodesRefError } from './core/nodes-ref.js';
export {
	useMainThreadRef,
	runOnBackground,
	runOnMainThread,
	LynxCrossThreadCallCancelledError,
} from './main-worklets.js';
export type {
	LynxBackgroundFunctionDescriptor,
	LynxCancelablePromise,
	LynxMainThreadRefCell,
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
	LynxWorkletValue,
} from './main-worklets.js';
export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
	LynxRef,
	LynxRefCallback,
	LynxRefObject,
} from './intrinsics.js';
