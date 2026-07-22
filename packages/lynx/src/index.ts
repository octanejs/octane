/** Availability metadata for the private, source/test Milestone 7 renderer. */
export const lynxRootAvailability = {
	available: true,
	implementedMilestone: 7,
	status: 'private-milestone-0-native-gates-blocked',
} as const;

export type LynxRootAvailability = typeof lynxRootAvailability;

export { createLynxRoot, root } from './root.js';
export type { CreateLynxRootOptions, LynxRoot } from './root.js';
export { useMainThreadRef } from './renderer.js';
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
export type { LynxPublicHandle } from './core/client-driver.js';
export { LynxNodesRefError } from './core/nodes-ref.js';
export { createLynxNativeResource } from './resource.js';
export type { LynxNativeResource } from './resource.js';
export type {
	LynxMeasureOptions,
	LynxMeasureResult,
	LynxNodesRef,
	LynxNodesRefErrorCode,
	LynxNodesRefFieldsOptions,
	LynxNodesRefFieldsResult,
	LynxNodesRefPathEntry,
	LynxNodesRefPathResult,
} from './core/nodes-ref.js';

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
	LynxRef,
	LynxRefCallback,
	LynxRefObject,
} from './intrinsics.js';
