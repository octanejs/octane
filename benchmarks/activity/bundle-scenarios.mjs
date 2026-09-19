// Requests are relative to the Activity benchmark directory. Each entry uses
// its own public output contract in bundle-size/verify-reachability.mjs.
export const bundleScenarios = [
	['root-static-specialized', '../bundle-size/fixtures/minimal/root-static-specialized.ts'],
	['root-static', '../bundle-size/fixtures/minimal/root-static.tsrx'],
	['hooks-state', '../bundle-size/fixtures/minimal/hooks-state.tsrx'],
	['component-owned-effects', '../bundle-size/fixtures/minimal/component-owned-effects.ts'],
	['root-descriptor', './root-descriptor.ts'],
];
