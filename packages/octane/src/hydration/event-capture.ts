import {
	EARLY_HYDRATION_INTENTS_KEY,
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_INTERACTION_EVENTS_ATTR,
	HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_SELECTION_ATTR,
	HYDRATE_SUPPORTED_INTERACTION_EVENTS,
} from './interaction-config.js';
import { HYDRATE_INDEPENDENT_ATTR, HYDRATE_INPUT_ATTR } from '../hydration-markers.js';
import {
	claimEarlyHydrationControlCapture,
	clearEarlyHydrationControlRevision,
	publishHydrationControlSignalValues,
	readEarlyHydrationControlRevision,
} from '../signals/early-values.js';
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

export { HYDRATE_SUPPORTED_INTERACTION_EVENTS } from './interaction-config.js';

/**
 * @internal Keep trusted focusing, touch activation, editing, and IME work on
 * the original event. Replaying an untrusted clone cannot restore those native
 * default actions; discrete activation events still need navigation guarded.
 */
export function shouldPreventHydrationInteractionDefault(event: Event): boolean {
	return event.cancelable && !HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS.includes(event.type);
}

interface EarlyHydrationIntentMailbox {
	version: 1;
	q: Array<
		readonly [Event, Element, Element, string, string | null, string | null, Element?, string?]
	>;
	stop?: () => void;
	claimed?: boolean;
	overflow?: boolean;
}

export interface HydrationReplayIntent {
	event: Event;
	path: number[];
	/** Captured author opt-in; never inferred again from a later DOM version. */
	selection?: HydrationSelectionIntent;
}

interface HydrationSelectionIntent {
	control: Element;
	boundary: Element;
	group: string;
	sequence: number;
}

let independentIntentSequences: WeakMap<Document, number> | undefined;

function advanceIndependentIntentSequence(ownerDocument: Document): number {
	const sequence = (independentIntentSequences?.get(ownerDocument) ?? 0) + 1;
	(independentIntentSequences ??= new WeakMap()).set(ownerDocument, sequence);
	return sequence;
}

function captureHydrationSelectionIntent(
	event: Event,
	target: Element,
	boundary: Element,
	sequence: number,
): HydrationSelectionIntent | undefined {
	const click = event as MouseEvent;
	if (
		event.type !== 'click' ||
		click.button !== 0 ||
		click.altKey ||
		click.ctrlKey ||
		click.metaKey ||
		click.shiftKey
	)
		return;
	const control = target.closest(`button[${HYDRATE_SELECTION_ATTR}]`);
	if (
		control === null ||
		(control as HTMLButtonElement).type !== 'button' ||
		control.closest(`[${HYDRATE_INDEPENDENT_ATTR}]`) !== boundary
	)
		return;
	const group = control.getAttribute(HYDRATE_SELECTION_ATTR);
	if (!group) return;
	return { control, boundary, group, sequence };
}

/** @internal A changed selection control cannot authorize an old click. */
export function isHydrationSelectionIntentCurrent(intent: HydrationReplayIntent): boolean {
	const selection = intent.selection;
	if (selection === undefined) return true;
	const { control, boundary, group } = selection;
	return (
		isHydrationElement(intent.event.target) &&
		intent.event.target.isConnected &&
		control.isConnected &&
		boundary.isConnected &&
		control.contains(intent.event.target) &&
		(control as HTMLButtonElement).type === 'button' &&
		control.getAttribute(HYDRATE_SELECTION_ATTR) === group &&
		intent.event.target.closest(`[${HYDRATE_INDEPENDENT_ATTR}]`) === boundary
	);
}

/** @internal Replace only the immediately preceding captured selection. */
export function appendHydrationReplayIntent(
	queue: HydrationReplayIntent[],
	intent: HydrationReplayIntent,
): void {
	const selection = intent.selection;
	const previous = queue[queue.length - 1];
	if (
		selection !== undefined &&
		previous?.selection !== undefined &&
		selection.sequence === previous.selection.sequence + 1 &&
		selection.boundary === previous.selection.boundary &&
		selection.group === previous.selection.group &&
		isHydrationSelectionIntentCurrent(previous)
	) {
		queue[queue.length - 1] = intent;
	} else {
		queue.push(intent);
	}
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
let independentHydrationDocuments: WeakSet<Document> | undefined;

export interface HydrationControlSnapshot {
	/** Advances for every captured input, including a clear-to-empty-string edit. */
	readonly editRevision: number;
	/** Advances independently when the platform reports a selection change. */
	readonly selectionRevision: number;
	/** Advances for edits, selection, focus, and composition changes. */
	readonly revision: number;
	readonly value: string;
	readonly checked?: boolean;
	readonly selectedValues?: readonly string[];
	readonly selectionStart: number | null;
	readonly selectionEnd: number | null;
	readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
	readonly focused: boolean;
	readonly composing: boolean;
}

/** Opaque revision token captured before an asynchronous local restoration read. */
export interface HydrationControlCandidate {
	readonly control: Element;
	readonly bindingId: string | null;
	readonly boundaryId: string | null;
	readonly snapshot: HydrationControlSnapshot;
}

export interface HydrationControlCandidateValue {
	readonly value?: string;
	readonly checked?: boolean;
	readonly selectedValues?: readonly string[];
}

interface HydrationControlRecord {
	editRevision: number;
	selectionRevision: number;
	revision: number;
	composing: boolean;
}

const HYDRATE_CONTROL_RECORDS = /* @__PURE__ */ new WeakMap<Element, HydrationControlRecord>();

function hydrationControl(target: EventTarget | null): Element | null {
	if (!isHydrationElement(target)) return null;
	const tag = target.localName;
	return tag === 'input' ||
		tag === 'textarea' ||
		tag === 'select' ||
		(target as HTMLElement).isContentEditable
		? target
		: null;
}

function hydrationControlRecord(control: Element): HydrationControlRecord {
	let record = HYDRATE_CONTROL_RECORDS.get(control);
	if (record === undefined) {
		const revision = readEarlyHydrationControlRevision(control);
		record = { editRevision: revision, selectionRevision: 0, revision, composing: false };
		HYDRATE_CONTROL_RECORDS.set(control, record);
	}
	return record;
}

function recordHydrationControlEvent(event: Event): void {
	const control = hydrationControl(event.target);
	if (control === null) return;
	const record = hydrationControlRecord(control);
	switch (event.type) {
		case 'input':
			record.editRevision++;
			record.revision++;
			publishHydrationControlSignalValues(control, record.revision);
			break;
		case 'compositionstart':
			record.composing = true;
			record.revision++;
			break;
		case 'compositionupdate':
			record.revision++;
			break;
		case 'compositionend':
			record.composing = false;
			record.revision++;
			break;
		case 'focusin':
		case 'focusout':
			record.revision++;
	}
}

function recordHydrationSelection(event: Event): void {
	const ownerDocument = event.currentTarget as Document;
	const control = hydrationControl(ownerDocument.activeElement);
	if (control === null) return;
	const record = hydrationControlRecord(control);
	record.selectionRevision++;
	record.revision++;
}

/**
 * @internal Snapshot the live platform state used by an island's atomic input
 * handoff. The current DOM is authoritative; the counters only decide whether
 * the state changed while ownership was being transferred.
 */
export function snapshotHydrationControl(control: Element): HydrationControlSnapshot | null {
	if (hydrationControl(control) === null) return null;
	const record = HYDRATE_CONTROL_RECORDS.get(control);
	const earlyRevision = record === undefined ? readEarlyHydrationControlRevision(control) : 0;
	const input = control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	let value: string;
	let checked: boolean | undefined;
	let selectedValues: string[] | undefined;
	let selectionStart: number | null = null;
	let selectionEnd: number | null = null;
	let selectionDirection: 'forward' | 'backward' | 'none' | null = null;
	if (control.localName === 'select') {
		const select = input as HTMLSelectElement;
		value = select.value;
		if (select.multiple)
			selectedValues = Array.from(select.selectedOptions, (option) => option.value);
	} else if ((control as HTMLElement).isContentEditable) {
		value = control.textContent ?? '';
	} else {
		value = input.value;
		if (control.localName === 'input') checked = (input as HTMLInputElement).checked;
		try {
			selectionStart = (input as HTMLInputElement | HTMLTextAreaElement).selectionStart;
			selectionEnd = (input as HTMLInputElement | HTMLTextAreaElement).selectionEnd;
			selectionDirection = (input as HTMLInputElement | HTMLTextAreaElement).selectionDirection;
		} catch {
			// Some input types throw for selection access. Their value/checked state
			// still participates in the same handoff.
		}
	}
	return {
		editRevision: record?.editRevision ?? earlyRevision,
		selectionRevision: record?.selectionRevision ?? 0,
		revision: record?.revision ?? earlyRevision,
		value,
		...(checked === undefined ? {} : { checked }),
		...(selectedValues === undefined ? {} : { selectedValues }),
		selectionStart,
		selectionEnd,
		selectionDirection,
		focused: control.ownerDocument.activeElement === control,
		composing: record?.composing ?? false,
	};
}

/**
 * Capture the exact DOM/edit authority an async storage read is allowed to replace.
 * A focus, selection, composition, input (including clear), node replacement, or
 * boundary rebinding before apply makes the candidate stale.
 */
export function captureHydrationControlCandidate(
	control: Element,
): HydrationControlCandidate | null {
	const snapshot = snapshotHydrationControl(control);
	if (snapshot === null) return null;
	initializeHydrationEventCapture(control.ownerDocument);
	return {
		control,
		bindingId: control.getAttribute(HYDRATE_INPUT_ATTR),
		boundaryId:
			control.closest(HYDRATE_MARKER_SELECTOR)?.getAttribute('data-octane-hydrate-id') ?? null,
		snapshot,
	};
}

function sameHydrationControlValue(
	left: HydrationControlSnapshot,
	right: HydrationControlSnapshot,
): boolean {
	if (left.value !== right.value || left.checked !== right.checked) return false;
	const a = left.selectedValues;
	const b = right.selectedValues;
	if (a === undefined || b === undefined) return a === b;
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
	return true;
}

/** Apply one local candidate only while the captured DOM revision still owns the value. */
export function applyHydrationControlCandidate(
	candidate: HydrationControlCandidate,
	value: HydrationControlCandidateValue,
): boolean {
	const control = candidate.control;
	if (
		!control.isConnected ||
		control.getAttribute(HYDRATE_INPUT_ATTR) !== candidate.bindingId ||
		(control.closest(HYDRATE_MARKER_SELECTOR)?.getAttribute('data-octane-hydrate-id') ?? null) !==
			candidate.boundaryId
	) {
		return false;
	}
	const current = snapshotHydrationControl(control);
	if (
		current === null ||
		current.revision !== candidate.snapshot.revision ||
		current.editRevision !== candidate.snapshot.editRevision ||
		current.composing ||
		!sameHydrationControlValue(current, candidate.snapshot)
	) {
		return false;
	}
	if (control.localName === 'select') {
		const select = control as HTMLSelectElement;
		if (select.multiple && value.selectedValues !== undefined) {
			const selected = new Set(value.selectedValues);
			for (const option of select.options) option.selected = selected.has(option.value);
		} else if (value.value !== undefined) {
			select.value = value.value;
		} else {
			return false;
		}
	} else if ((control as HTMLElement).isContentEditable) {
		if (value.value === undefined) return false;
		control.textContent = value.value;
	} else {
		const input = control as HTMLInputElement | HTMLTextAreaElement;
		if (value.value !== undefined) input.value = value.value;
		else if (control.localName !== 'input' || value.checked === undefined) return false;
		if (control.localName === 'input' && value.checked !== undefined) {
			(input as HTMLInputElement).checked = value.checked;
		}
	}
	if (
		current.focused &&
		current.selectionStart !== null &&
		current.selectionEnd !== null &&
		control.localName !== 'select' &&
		!(control as HTMLElement).isContentEditable
	) {
		try {
			(control as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
				current.selectionStart,
				current.selectionEnd,
				current.selectionDirection ?? undefined,
			);
		} catch {
			// Unsupported input selection does not invalidate its value restoration.
		}
	}
	const record = hydrationControlRecord(control);
	record.editRevision++;
	record.revision++;
	publishHydrationControlSignalValues(control, record.revision);
	return true;
}

/** @internal Retire only the exact early state an activating owner adopted. */
export function consumeHydrationControl(control: Element, revision: number): boolean {
	// Direct hydrateRoot consumers need the same handoff as generated bootstraps.
	// Claim capture before checking, since queued intent can advance the revision.
	initializeHydrationEventCapture(control.ownerDocument);
	const record = hydrationControlRecord(control);
	if (record.revision !== revision) return false;
	// Keep the revision clock and active composition across ownership transfer;
	// resetting the clock could authorize a stale asynchronous restore candidate.
	record.editRevision = 0;
	record.selectionRevision = 0;
	clearEarlyHydrationControlRevision(control);
	return true;
}

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
	return hydrationMarkerInteractionStatus(marker, eventType);
}

/** @internal Interpret the SSR strategy without invoking a registered boundary. */
export function hydrationMarkerInteractionStatus(
	marker: Element,
	eventType: string,
): HydrationIntentBoundaryStatus {
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
function handleEarlyHydrationIntent(
	event: Event,
	capturedSelection?: HydrationSelectionIntent | null,
): void {
	recordHydrationControlEvent(event);
	const target = event.target;
	if (!isHydrationElement(target)) return;
	if (
		(event.type === 'pointerenter' || event.type === 'mouseenter') &&
		independentHydrationDocuments?.has(target.ownerDocument)
	) {
		const boundary = target.closest(HYDRATE_MARKER_SELECTOR);
		const pointer = event as MouseEvent;
		if (
			boundary !== null &&
			typeof pointer.clientX === 'number' &&
			typeof pointer.clientY === 'number'
		) {
			// Enter events target each ancestor separately, not just the hit element.
			// Entering a nested independent widget must not import its dormant parent.
			const hit = target.ownerDocument.elementFromPoint?.(pointer.clientX, pointer.clientY);
			const independent = hit?.closest(`[${HYDRATE_INDEPENDENT_ATTR}]`);
			if (independent && independent !== boundary && boundary.contains(independent)) {
				HYDRATE_HANDLED_INTENT_EVENTS.add(event);
				return;
			}
		}
	}

	const markers: Element[] = [];
	let marker: Element | null = target.closest(HYDRATE_MARKER_SELECTOR);
	let independent: Element | null = null;
	let matches = false;
	while (marker !== null) {
		markers.push(marker);
		matches ||= markerStatus(marker, event.type) === 'handles';
		if (marker.hasAttribute(HYDRATE_INDEPENDENT_ATTR)) {
			independent = marker;
			// Independent widgets own their intent even before their sidecar/code
			// arrives. Ancestor-local listeners must also leave live widgets alone.
			HYDRATE_HANDLED_INTENT_EVENTS.add(event);
			break;
		}
		marker = marker.parentElement?.closest(HYDRATE_MARKER_SELECTOR) ?? null;
	}
	if (independent !== null) {
		const link = target.closest('a[href],area[href]');
		if (link !== null && independent.contains(link)) return;
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
	const sequence =
		independent !== null && capturedSelection === undefined
			? advanceIndependentIntentSequence(target.ownerDocument)
			: 0;
	const selection =
		candidate === independent
			? capturedSelection === undefined
				? captureHydrationSelectionIntent(event, target, candidate, sequence)
				: capturedSelection
			: undefined;
	const intent: HydrationReplayIntent = selection ? { event, path, selection } : { event, path };
	HYDRATE_HANDLED_INTENT_EVENTS.add(event);
	if (event.bubbles) {
		if (shouldPreventHydrationInteractionDefault(event)) event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}

	if (candidateBoundary !== undefined) {
		candidateBoundary(event.type, intent);
	} else {
		const pending = HYDRATE_PENDING_INTENTS.get(candidate) ?? [];
		appendHydrationReplayIntent(pending, intent);
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
	const host = targetDocument as Document & {
		[EARLY_HYDRATION_INTENTS_KEY]?: EarlyHydrationIntentMailbox;
	};
	const mailbox = host[EARLY_HYDRATION_INTENTS_KEY];
	mailbox?.stop?.();
	const queued = mailbox?.q.splice(0);
	host[EARLY_HYDRATION_INTENTS_KEY] = { version: 1, q: [], claimed: true };
	if (mailbox?.overflow) {
		throw new RangeError('Early independent Hydrate intent queue overflow; reload the document.');
	}
	HYDRATE_INTENT_DOCUMENTS.add(targetDocument);
	for (let i = 0; i < HYDRATE_SUPPORTED_INTERACTION_EVENTS.length; i++) {
		targetDocument.addEventListener(
			HYDRATE_SUPPORTED_INTERACTION_EVENTS[i],
			handleEarlyHydrationIntent,
			true,
		);
	}
	targetDocument.addEventListener('focusout', recordHydrationControlEvent, true);
	targetDocument.addEventListener('selectionchange', recordHydrationSelection, true);
	claimEarlyHydrationControlCapture(targetDocument);
	if (queued !== undefined) {
		for (const [event, target, boundary, id, when, events, control, group] of queued) {
			// Even a stale queued command remains an adjacency barrier. The inline
			// mailbox already coalesced its selections before distributing queues.
			const sequence = advanceIndependentIntentSequence(targetDocument);
			if (
				event.target !== target ||
				!target.isConnected ||
				!boundary.isConnected ||
				target.ownerDocument !== targetDocument ||
				boundary.ownerDocument !== targetDocument ||
				target.closest(`[${HYDRATE_INDEPENDENT_ATTR}]`) !== boundary ||
				boundary.getAttribute('data-octane-hydrate-id') !== id ||
				boundary.getAttribute(HYDRATE_WHEN_ATTR) !== when ||
				boundary.getAttribute(HYDRATE_INTERACTION_EVENTS_ATTR) !== events
			)
				continue;
			const selection =
				control === undefined || group === undefined
					? null
					: { control, boundary, group, sequence };
			if (selection !== null && !isHydrationSelectionIntentCurrent({ event, path: [], selection }))
				continue;
			handleEarlyHydrationIntent(event, selection);
		}
	}
}

/** @internal Enable independent ownership without adding hit tests to ordinary hydration. */
export function initializeIndependentHydrationEventCapture(ownerDocument: Document): void {
	(independentHydrationDocuments ??= new WeakSet()).add(ownerDocument);
	initializeHydrationEventCapture(ownerDocument);
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
