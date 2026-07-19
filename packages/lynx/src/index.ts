/**
 * Availability metadata for the private Milestone 1 package scaffold.
 *
 * There is deliberately no `root` export yet. Publishing a throwing or inert
 * root would make an unavailable native runtime look implemented.
 */
export const lynxRootAvailability = {
	available: false,
	plannedMilestone: 2,
	status: 'blocked-on-public-lynx-hooks',
} as const;

export type LynxRootAvailability = typeof lynxRootAvailability;

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
} from './intrinsics.js';
