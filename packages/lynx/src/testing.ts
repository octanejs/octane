/**
 * Public access to Lynx's pure-JavaScript source testing environment.
 *
 * This facade does not execute a native Lynx runtime or prove behavior on a
 * device. It exposes the pinned host emulation used by Octane's source tests.
 */
export {
	GlobalEventEmitter,
	LynxTestingEnv,
	initElementTree,
	installLynxTestingEnv,
	uninstallLynxTestingEnv,
} from '@lynx-js/testing-environment';

export type {
	ElementTree,
	ElementTreeGlobals,
	FilterUnderscoreKeys,
	LynxElement,
	LynxEnv,
	LynxGlobalThis,
	PickUnderscoreKeys,
} from '@lynx-js/testing-environment';

export const lynxTestingAvailability = {
	available: true,
	plannedMilestone: 5,
	implementedMilestone: 5,
	requires: '@lynx-js/testing-environment',
	sourceTests: true,
	execution: 'javascript-host-emulation',
	nativeExecution: false,
	deviceExecution: false,
} as const;

export type LynxTestingAvailability = typeof lynxTestingAvailability;
