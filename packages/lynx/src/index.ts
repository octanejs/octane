/** Availability metadata for the private, source-level Milestone 2 root. */
export const lynxRootAvailability = {
	available: true,
	implementedMilestone: 2,
	status: 'private-milestone-0-native-gates-blocked',
} as const;

export type LynxRootAvailability = typeof lynxRootAvailability;

export { createLynxRoot, root } from './root.js';
export type { CreateLynxRootOptions, LynxRoot } from './root.js';
export type { LynxPublicHandle } from './core/client-driver.js';

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
	LynxRef,
	LynxRefCallback,
	LynxRefObject,
} from './intrinsics.js';
