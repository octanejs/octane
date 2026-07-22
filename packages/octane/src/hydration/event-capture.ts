import {
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_INTERACTION_EVENTS_ATTR,
} from './interaction-config.js';
import { HYDRATE_STREAM_TOKEN_ATTR, isRendererStreamBoundaryTemplate } from '../stream-protocol.js';

const HYDRATE_MARKER_SELECTOR = '[data-octane-hydrate-id]';
const HYDRATE_WHEN_ATTR = 'data-octane-hydrate-when';

// DOM constructors are realm-specific. Capture can be installed for an iframe
// document, so use the platform nodeType contract instead of the ambient
// window's `instanceof Node` / `instanceof Element` identities.
function isHydrationNode(target: EventTarget | null): target is Node {
	return target !== null && typeof (target as Node).nodeType === 'number';
}

function isHydrationElement(target: EventTarget | null): target is Element {
	return isHydrationNode(target) && target.nodeType === 1;
}

export const HYDRATE_SUPPORTED_INTERACTION_EVENTS = [
	'auxclick',
	'click',
	'contextmenu',
	'dblclick',
	'focusin',
	'keydown',
	'keyup',
	'mousedown',
	'mouseenter',
	'mouseover',
	'mouseup',
	'pointerdown',
	'pointerenter',
	'pointerover',
	'pointerup',
] as const;

export interface HydrationReplayIntent {
	event: Event;
	path: number[];
}

export type HydrationIntentBoundaryStatus = 'hydrated' | 'never' | 'dormant' | 'handles';

export type HydrationIntentBoundary = (
	eventType: string,
	intent?: HydrationReplayIntent,
) => HydrationIntentBoundaryStatus;

const HYDRATE_BOUNDARIES = /* @__PURE__ */ new WeakMap<Element, HydrationIntentBoundary>();
const HYDRATE_PENDING_INTENTS = /* @__PURE__ */ new WeakMap<Element, HydrationReplayIntent[]>();
const HYDRATE_DELEGATED_DYNAMIC_MARKERS = /* @__PURE__ */ new WeakSet<Element>();
const HYDRATE_HANDLED_INTENT_EVENTS = /* @__PURE__ */ new WeakSet<Event>();
const HYDRATE_INTENT_DOCUMENTS = /* @__PURE__ */ new WeakSet<Document>();

/**
 * @internal Resolve an event target to an element-only path beneath a marker.
 * Renderer stream sentinels are omitted so the address survives their reveal.
 */
export function hydrationEventPathWithin(
	root: Element,
	target: EventTarget | null,
): number[] | null {
	if (!isHydrationNode(target)) return null;
	const streamToken = root.getAttribute(HYDRATE_STREAM_TOKEN_ATTR);
	const path: number[] = [];
	let node: Element | null = isHydrationElement(target) ? target : target.parentElement;
	while (node !== root) {
		const parent: Element | null = node?.parentElement ?? null;
		if (parent === null) return null;
		let index = 0;
		let sibling = parent.firstElementChild;
		while (sibling !== null && sibling !== node) {
			if (!isRendererStreamBoundaryTemplate(sibling, streamToken)) index++;
			sibling = sibling.nextElementSibling;
		}
		if (sibling === null) return null;
		path.push(index);
		node = parent;
	}
	path.reverse();
	return path;
}

function markerStatus(marker: Element, eventType: string): HydrationIntentBoundaryStatus {
	const boundary = HYDRATE_BOUNDARIES.get(marker);
	if (boundary !== undefined) return boundary(eventType);

	const when = marker.getAttribute(HYDRATE_WHEN_ATTR);
	if (when === null) return 'hydrated';
	if (when === 'never') return 'never';
	if (when === 'dynamic') return eventType === 'click' ? 'handles' : 'dormant';
	if (when !== 'interaction') return 'dormant';
	const custom = marker.getAttribute(HYDRATE_INTERACTION_EVENTS_ATTR);
	const events: ReadonlyArray<string> =
		custom === null ? HYDRATE_DEFAULT_INTERACTION_EVENTS : custom.split(/\s+/).filter(Boolean);
	return events.includes(eventType) ? 'handles' : 'dormant';
}

/**
 * Capture an interaction before `hydrateRoot` creates the deferred boundary's
 * runtime slot. The listener intentionally depends only on server marker
 * attributes and the small queue in this module, so an early bootstrap does not
 * retain the full client runtime.
 */
function handleEarlyHydrationIntent(event: Event): void {
	const target = event.target;
	if (!isHydrationElement(target)) return;

	const markers: Element[] = [];
	let marker: Element | null = target.closest(HYDRATE_MARKER_SELECTOR);
	let matches = false;
	while (marker !== null) {
		markers.push(marker);
		matches ||= markerStatus(marker, event.type) === 'handles';
		marker = marker.parentElement?.closest(HYDRATE_MARKER_SELECTOR) ?? null;
	}
	if (!matches || markers.length === 0) return;

	// Parent-first: activate the outermost dormant marker. Replaying the event
	// after that boundary mounts lets a nested marker observe the same intent.
	markers.reverse();
	let candidate: Element | null = null;
	let candidateBoundary: HydrationIntentBoundary | undefined;
	for (let i = 0; i < markers.length; i++) {
		const current = markers[i];
		const status = markerStatus(current, event.type);
		if (status === 'hydrated') continue;
		if (status === 'never') return;
		candidate = current;
		candidateBoundary = HYDRATE_BOUNDARIES.get(current);
		break;
	}
	if (candidate === null) return;

	// Preserve conservative intent only until a dynamic child's concrete
	// strategy has been registered by the runtime.
	for (let i = 0; i < markers.length; i++) {
		const current = markers[i];
		if (
			current !== candidate &&
			candidate.contains(current) &&
			current.getAttribute(HYDRATE_WHEN_ATTR) === 'dynamic' &&
			!HYDRATE_BOUNDARIES.has(current)
		) {
			HYDRATE_DELEGATED_DYNAMIC_MARKERS.add(current);
		}
	}

	const path = hydrationEventPathWithin(candidate, event.target);
	if (path === null) return;
	const intent = { event, path };
	HYDRATE_HANDLED_INTENT_EVENTS.add(event);
	if (event.bubbles) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	if (candidateBoundary !== undefined) {
		candidateBoundary(event.type, intent);
	} else {
		const pending = HYDRATE_PENDING_INTENTS.get(candidate) ?? [];
		pending.push(intent);
		HYDRATE_PENDING_INTENTS.set(candidate, pending);
	}
}

/**
 * Install document-level capture for deferred-hydration interaction intent.
 * Calling this function more than once for the same document is a no-op.
 *
 * Applications that can receive input before `hydrateRoot()` should call this
 * from their lightweight client bootstrap. Mounting the first `<Hydrate>`
 * boundary also invokes it as a synchronous fallback.
 */
export function initializeHydrationEventCapture(ownerDocument?: Document): void {
	const targetDocument = ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
	if (targetDocument === undefined || HYDRATE_INTENT_DOCUMENTS.has(targetDocument)) return;
	HYDRATE_INTENT_DOCUMENTS.add(targetDocument);
	for (let i = 0; i < HYDRATE_SUPPORTED_INTERACTION_EVENTS.length; i++) {
		targetDocument.addEventListener(
			HYDRATE_SUPPORTED_INTERACTION_EVENTS[i],
			handleEarlyHydrationIntent,
			true,
		);
	}
}

/** @internal Runtime bridge for a mounted deferred-hydration boundary. */
export function registerHydrationIntentBoundary(
	marker: Element,
	boundary: HydrationIntentBoundary,
): void {
	HYDRATE_BOUNDARIES.set(marker, boundary);
}

/** @internal Runtime bridge for a removed deferred-hydration boundary. */
export function unregisterHydrationIntentBoundary(
	marker: Element,
	boundary: HydrationIntentBoundary,
): void {
	if (HYDRATE_BOUNDARIES.get(marker) === boundary) HYDRATE_BOUNDARIES.delete(marker);
}

/** @internal Consume intent captured before the runtime boundary was registered. */
export function takePendingHydrationIntents(marker: Element): HydrationReplayIntent[] | undefined {
	const intents = HYDRATE_PENDING_INTENTS.get(marker);
	HYDRATE_PENDING_INTENTS.delete(marker);
	return intents;
}

/** @internal Consume conservative nested-dynamic intent recorded before registration. */
export function takeDelegatedDynamicHydrationIntent(marker: Element): boolean {
	return HYDRATE_DELEGATED_DYNAMIC_MARKERS.delete(marker);
}

/** @internal Avoid duplicate handling by the boundary-local capture listener. */
export function wasEarlyHydrationIntentHandled(event: Event): boolean {
	return HYDRATE_HANDLED_INTENT_EVENTS.has(event);
}

/** @internal Preserve nested dynamic intent discovered by a mounted parent. */
export function markDelegatedDynamicHydrationIntent(marker: Element): void {
	HYDRATE_DELEGATED_DYNAMIC_MARKERS.add(marker);
}
