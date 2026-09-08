// OCTANE DIVERGENCE[capability-detection][ordinary:base-ui-utils-capabilities]: this compatibility helper describes
// the upstream feature level available to the binding, not Octane's version.
// Octane supports modern refs, inert, useId, and native external-store subscriptions.
export function isReactVersionAtLeast(version: 17 | 18 | 19): boolean {
	return version <= 19;
}
