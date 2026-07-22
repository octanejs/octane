import type { UniversalComponent } from 'octane/universal/native';
import type { LynxFirstScreenRenderResult } from './main-renderer.js';

/** Main-thread root contract installed by the generated receiver entry. */
export interface LynxFirstScreenHost {
	render<Props>(component: UniversalComponent<Props>, props: Props): LynxFirstScreenRenderResult;
	markSyncReady(): void;
	unmount(): void;
}

let installedHost: LynxFirstScreenHost | null = null;

/** @internal Connect the application facade to its entry-owned PAPI receiver. */
export function installLynxFirstScreenHost(host: LynxFirstScreenHost): () => void {
	if (installedHost !== null) {
		throw new Error('A Lynx first-screen host is already installed for this entry.');
	}
	installedHost = host;
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		if (installedHost === host) installedHost = null;
	};
}

function requireHost(): LynxFirstScreenHost {
	if (installedHost === null) {
		throw new Error(
			'Lynx first-screen root rendered before the generated main-thread receiver was installed.',
		);
	}
	return installedHost;
}

export interface LynxFirstScreenRoot {
	readonly renderer: 'lynx';
	readonly ready: Promise<void>;
	render<Props>(component: UniversalComponent<Props>, props?: Props): LynxFirstScreenRenderResult;
	flushTransport(): Promise<void>;
	unmount(): Promise<void>;
}

const ready = Promise.resolve();

/** Synchronous main-thread facade selected only for the generated first-screen graph. */
export const root: LynxFirstScreenRoot = Object.freeze({
	renderer: 'lynx' as const,
	ready,
	render<Props>(component: UniversalComponent<Props>, props?: Props) {
		if (typeof component !== 'function') {
			throw new TypeError('Lynx first-screen root.render() requires a component function.');
		}
		return requireHost().render(component, props === undefined ? ({} as Props) : props);
	},
	flushTransport() {
		return ready;
	},
	unmount() {
		if (installedHost !== null) installedHost.unmount();
		return ready;
	},
});

/** Main specialization for the background root factory's first, one-shot root. */
export function createLynxRoot(): LynxFirstScreenRoot {
	return root;
}

/** Release a receiver configured for manual first-screen synchronization. */
export function markFirstScreenSyncReady(): void {
	requireHost().markSyncReady();
}

export const lynxRootAvailability = {
	available: true,
	implementedMilestone: 7,
	status: 'private-milestone-0-native-gates-blocked',
} as const;

// Rspeedy's main graph aliases the exact package root to this facade, so keep
// root-level authoring helpers addressable even when their values are accepted
// only by the background renderer.
export { createLynxNativeResource } from './resource.js';
export type { LynxNativeResource } from './resource.js';
export { LynxNodesRefError } from './core/nodes-ref.js';
export { useMainThreadRef } from './main-renderer.js';
export {
	runOnBackground,
	runOnMainThread,
	LynxCrossThreadCallCancelledError,
} from './core/worklets.js';
export type {
	LynxBackgroundFunctionDescriptor,
	LynxCancelablePromise,
	LynxMainThreadRefCell,
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
	LynxWorkletValue,
} from './core/worklets.js';

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
	LynxRef,
	LynxRefCallback,
	LynxRefObject,
} from './intrinsics.js';
