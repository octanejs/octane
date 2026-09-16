import { HYDRATE_INDEPENDENT_ATTR, HYDRATE_INPUT_ATTR } from '../hydration-markers.js';
import {
	EARLY_HYDRATION_INTENTS_KEY,
	HYDRATE_INTERACTION_EVENTS_ATTR,
} from './interaction-config.js';
import {
	claimEarlyHydrationControlCapture,
	clearEarlyHydrationControlRevision,
	publishHydrationControlSignalValues,
	readEarlyHydrationControlRevision,
} from '../signals/early-values.js';

const HYDRATE_MARKER_SELECTOR = '[data-octane-hydrate-id]';
const HYDRATE_CONTROL_DOCUMENTS = /* @__PURE__ */ new WeakSet<Document>();

/** @internal Shared inline mailbox record; its activation queue has one owner. */
export type EarlyHydrationIntent = readonly [
	Event,
	Element,
	Element,
	string,
	string | null,
	string | null,
	Element?,
	string?,
];

/** @internal Captured control state and activation require the same DOM authority. */
export function isEarlyHydrationIntentCurrent(
	[event, target, boundary, id, when, events]: EarlyHydrationIntent,
	ownerDocument: Document,
): boolean {
	return (
		event.target === target &&
		target.isConnected &&
		boundary.isConnected &&
		target.ownerDocument === ownerDocument &&
		boundary.ownerDocument === ownerDocument &&
		target.closest(`[${HYDRATE_INDEPENDENT_ATTR}]`) === boundary &&
		boundary.getAttribute('data-octane-hydrate-id') === id &&
		boundary.getAttribute('data-octane-hydrate-when') === when &&
		boundary.getAttribute(HYDRATE_INTERACTION_EVENTS_ATTR) === events
	);
}

// Controls in an iframe belong to that document's realm, not the ambient one.
function isHydrationElement(target: EventTarget | null): target is Element {
	return target !== null && (target as Node).nodeType === 1;
}

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
	initializeHydrationControlCapture(control.ownerDocument);
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
	// Claim control capture before checking, including pre-module control state.
	initializeHydrationControlCapture(control.ownerDocument);
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
 * @internal Own only native control state. Island activation remains optional:
 * leave its mailbox intact so a later full bootstrap can claim every intent.
 */
export function initializeHydrationControlCapture(ownerDocument?: Document): void {
	const targetDocument = ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
	if (targetDocument === undefined || HYDRATE_CONTROL_DOCUMENTS.has(targetDocument)) return;
	HYDRATE_CONTROL_DOCUMENTS.add(targetDocument);
	const mailbox = (
		targetDocument as Document & {
			[EARLY_HYDRATION_INTENTS_KEY]?: {
				readonly q: readonly EarlyHydrationIntent[];
				readonly stop?: (() => void) | null;
			};
		}
	)[EARLY_HYDRATION_INTENTS_KEY];
	// Optional inline island capture stops propagation at the document. Capture
	// controls before it, without replacing its listeners or consuming its queue.
	const target =
		typeof mailbox?.stop === 'function'
			? (targetDocument.defaultView ?? targetDocument)
			: targetDocument;
	const record =
		target === targetDocument
			? recordHydrationControlEvent
			: (event: Event): void => {
					if ((event.target as Node | null)?.ownerDocument === targetDocument)
						recordHydrationControlEvent(event);
				};
	for (const event of [
		'input',
		'compositionstart',
		'compositionupdate',
		'compositionend',
		'focusin',
		'focusout',
	]) {
		target.addEventListener(event, record, true);
	}
	targetDocument.addEventListener('selectionchange', recordHydrationSelection, true);
	claimEarlyHydrationControlCapture(targetDocument);
	// Recover pre-module composition and unbranded edits, but never publish an
	// input again when the inline signal writer already imported its revision.
	for (const intent of mailbox?.q ?? []) {
		const [event] = intent;
		const control = hydrationControl(event.target);
		if (control === null || !isEarlyHydrationIntentCurrent(intent, targetDocument)) continue;
		if (event.type === 'input' && readEarlyHydrationControlRevision(control) > 0) continue;
		recordHydrationControlEvent(event);
	}
}
