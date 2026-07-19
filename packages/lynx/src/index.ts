/** Availability metadata for the private, source/test Milestone 3 root. */
export const lynxRootAvailability = {
	available: true,
	implementedMilestone: 3,
	status: 'private-milestone-0-native-gates-blocked',
} as const;

export type LynxRootAvailability = typeof lynxRootAvailability;

export { createLynxRoot, root } from './root.js';
export type { CreateLynxRootOptions, LynxRoot } from './root.js';
export type { LynxPublicHandle } from './core/client-driver.js';
export { LynxNodesRefError } from './core/nodes-ref.js';
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
