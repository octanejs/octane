import { HYDRATE_INPUT_ATTR } from '../hydration-protocol.js';
import { clearHostTimeout, setHostTimeout } from '../host-task.js';
import { readHydrationControlEditRevision } from './control-capture.js';

interface ControlRange {
	readonly start: Comment;
	readonly end: Comment;
}

type ControlEdit = [control: Element, revision: number];

interface PendingReset {
	readonly event: Event;
	readonly edits: ControlEdit[];
}

interface ResetCapture {
	readonly ranges: Set<ControlRange>;
	readonly pending: PendingReset[];
	timer: unknown;
}

const RESET_CAPTURES = /* @__PURE__ */ new WeakMap<Document, ResetCapture>();
const RETIRED_EDITS = /* @__PURE__ */ new WeakMap<Element, number>();
const INFERRED_SELECT_EDITS = /* @__PURE__ */ new WeakSet<Element>();

export function rememberStreamedSelectEdit(select: HTMLSelectElement): void {
	INFERRED_SELECT_EDITS.add(select);
}

export function hasStreamedControlEdit(control: Element, revision: number): boolean {
	return revision > (RETIRED_EDITS.get(control) ?? 0) || INFERRED_SELECT_EDITS.has(control);
}

export function retireStreamedControlEdit(control: Element, revision: number): void {
	INFERRED_SELECT_EDITS.delete(control);
	if (revision > (RETIRED_EDITS.get(control) ?? 0)) RETIRED_EDITS.set(control, revision);
}

function settleControlResets(capture: ResetCapture): void {
	const pending = capture.pending;
	let unsettled = 0;
	for (const reset of pending) {
		const { event, edits } = reset;
		// Later listeners can still cancel a reset observed during capture.
		if (event.eventPhase !== 0) pending[unsettled++] = reset;
		else if (!event.defaultPrevented) {
			for (const [control, revision] of edits) retireStreamedControlEdit(control, revision);
		}
	}
	pending.length = unsettled;
}

export function settleStreamedControlResets(document: Document): void {
	const capture = RESET_CAPTURES.get(document);
	if (capture !== undefined && capture.pending.length !== 0) settleControlResets(capture);
}

function isInControlRange(control: Element, ranges: Set<ControlRange>): boolean {
	for (const { start, end } of ranges) {
		if (start.parentNode !== end.parentNode) continue;
		const position = start.compareDocumentPosition(control);
		if (
			(position & start.DOCUMENT_POSITION_DISCONNECTED) === 0 &&
			(position & start.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
			(end.compareDocumentPosition(control) & end.DOCUMENT_POSITION_PRECEDING) !== 0
		) {
			return true;
		}
	}
	return false;
}

function captureControlReset(event: Event): void {
	if (!event.isTrusted || event.defaultPrevented) return;
	const document = event.currentTarget as Document;
	const capture = RESET_CAPTURES.get(document)!;
	const prototype = document.defaultView?.HTMLFormElement.prototype ?? HTMLFormElement.prototype;
	// A named field can shadow the form's elements property.
	const controls: HTMLFormControlsCollection = Object.getOwnPropertyDescriptor(
		prototype,
		'elements',
	)!.get!.call(event.target);
	let edits: ControlEdit[] | undefined;
	for (const control of controls) {
		if (!control.hasAttribute(HYDRATE_INPUT_ATTR)) continue;
		const revision = readHydrationControlEditRevision(control);
		if (!hasStreamedControlEdit(control, revision) || !isInControlRange(control, capture.ranges))
			continue;
		(edits ??= []).push([control, revision]);
	}
	if (edits === undefined) return;
	settleControlResets(capture);
	capture.pending.push({ event, edits });
	if (capture.timer === undefined) {
		// Native dispatch can run microtasks before all its listeners have finished.
		capture.timer = setHostTimeout(() => {
			capture.timer = undefined;
			settleControlResets(capture);
		}, 0);
	}
}

export function trackStreamedControlResets(start: Comment, end: Comment): () => void {
	const document = start.ownerDocument!;
	let capture = RESET_CAPTURES.get(document);
	if (capture === undefined) {
		capture = { ranges: new Set(), pending: [], timer: undefined };
		RESET_CAPTURES.set(document, capture);
		document.addEventListener('reset', captureControlReset, true);
	}
	let range: ControlRange | undefined = { start, end };
	capture.ranges.add(range);
	return () => {
		if (range === undefined) return;
		capture.ranges.delete(range);
		range = undefined;
		if (capture.ranges.size !== 0) return;
		settleControlResets(capture);
		capture.pending.length = 0;
		clearHostTimeout(capture.timer);
		RESET_CAPTURES.delete(document);
		document.removeEventListener('reset', captureControlReset, true);
	};
}
