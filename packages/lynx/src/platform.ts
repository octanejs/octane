/** Runtime names used by the future Rspeedy main/background specialization. */
export type LynxRuntime = 'background' | 'main-thread';

/** Platforms in the migration evidence matrix; this is not a support claim. */
export type LynxPlatform = 'android' | 'ios' | 'web';

/**
 * Platform APIs remain metadata-only in the Milestone 2 source renderer. Init
 * data, global props, lifecycle, Native Modules, and page controls are deferred
 * to Milestone 4.
 */
export const lynxPlatformAvailability = {
	available: false,
	plannedMilestone: 4,
	technicalPreviewMilestone: 5,
} as const;

export type LynxPlatformAvailability = typeof lynxPlatformAvailability;
