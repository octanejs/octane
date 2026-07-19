/**
 * Testing is metadata-only during Milestone 1. Real helpers over
 * `@lynx-js/testing-environment` are deferred to the Milestone 5 production
 * path; this module intentionally exports no mock renderer or fake root.
 */
export const lynxTestingAvailability = {
	available: false,
	plannedMilestone: 5,
	requires: '@lynx-js/testing-environment',
} as const;

export type LynxTestingAvailability = typeof lynxTestingAvailability;
