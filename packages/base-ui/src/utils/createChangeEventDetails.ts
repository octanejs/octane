// Ported from .base-ui/packages/react/src/internals/createBaseUIEventDetails.ts +
// reason-parts.ts. `createChangeEventDetails(reason, event, trigger)` builds the details
// object Base UI passes to `onXChange` callbacks — a cancelable, propagation-controllable
// wrapper around the originating event. octane dispatches NATIVE events (no synthetic
// `.nativeEvent`), so callers pass the native event directly.
//
// REASONS: only the reason strings the current components use are listed; more are added
// as components land (they are just string constants).
export const REASONS = {
	none: 'none',
	triggerPress: 'trigger-press',
	itemPress: 'item-press',
	keyboard: 'keyboard',
	pointer: 'pointer',
} as const;

export type BaseUIEventReason = (typeof REASONS)[keyof typeof REASONS];

export interface BaseUIChangeEventDetails<Reason extends string = string> {
	reason: Reason;
	event: Event;
	cancel: () => void;
	allowPropagation: () => void;
	readonly isCanceled: boolean;
	readonly isPropagationAllowed: boolean;
	trigger: Element | undefined;
	[key: string]: any;
}

export function createChangeEventDetails<Reason extends string = string>(
	reason: Reason,
	event?: Event,
	trigger?: HTMLElement,
	customProperties?: Record<string, any>,
): BaseUIChangeEventDetails<Reason> {
	let canceled = false;
	let allowPropagation = false;
	const details: BaseUIChangeEventDetails<Reason> = {
		reason,
		event: event ?? new Event('base-ui'),
		cancel() {
			canceled = true;
		},
		allowPropagation() {
			allowPropagation = true;
		},
		get isCanceled() {
			return canceled;
		},
		get isPropagationAllowed() {
			return allowPropagation;
		},
		trigger,
		...customProperties,
	};
	return details;
}
