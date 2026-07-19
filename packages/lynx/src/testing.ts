/**
 * The Milestone 2 implementation is exercised internally with
 * `@lynx-js/testing-environment`, but this public testing entry remains
 * metadata-only until the Milestone 5 production path. It intentionally
 * exports no mock renderer or fake root.
 */
export const lynxTestingAvailability = {
	available: false,
	plannedMilestone: 5,
	requires: '@lynx-js/testing-environment',
} as const;

export type LynxTestingAvailability = typeof lynxTestingAvailability;
