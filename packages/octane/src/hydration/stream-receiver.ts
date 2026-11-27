import { formatClientError } from '../error-codes.client.generated.js';
import { FRAMEWORK_POLICY } from '../trusted-types.js';
import { HYDRATE_INPUT_ATTR } from '../hydration-protocol.js';
import { rendererRangeClose } from '../stream-protocol.js';
import {
	sameStreamFrameIdentity,
	type StreamedRegionPlacementFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import {
	initializeHydrationControlCapture,
	snapshotHydrationControl,
	type HydrationControlSnapshot,
} from './control-capture.js';
import {
	hasStreamedControlEdit,
	rememberStreamedSelectEdit,
	retireStreamedControlEdit,
	settleStreamedControlResets,
	trackStreamedControlResets,
} from './stream-control-edits.js';
import type { ScopeSeed } from '../signals/types.js';
import {
	createStreamedResultReceiverState,
	StreamedReceiverError,
	type StreamedFrameDisposition,
	type StreamedResultReceiver,
	type StreamedResultReceiverOptions as StreamedRegionReceiverOptions,
	type StreamedSelectionState,
} from './stream-result-receiver.js';
export {
	StreamedReceiverError,
	type StreamedFrameDisposition,
	type StreamedResultReceiverOptions as StreamedRegionReceiverOptions,
	type StreamedResultConsumer,
} from './stream-result-receiver.js';

export interface HistoricalFrameLease {
	release(): void;
}

export interface StreamedRegionRegistration {
	readonly identity: StreamFrameIdentity;
	readonly start: Comment;
	readonly end: Comment;
	readonly contentRevision: number;
	/** Re-read immediately before commit; active renderer ownership forbids HTML placement. */
	readonly isActive: () => boolean;
	/** Resolve compiler-proven styles. Completion means every identity is ready to paint. */
	readonly loadStyles: (styles: readonly string[]) => void | Promise<void>;
	/** Acquire the exact historical values that produced this candidate range. */
	readonly adoptHistoricalFrame: (frame: ScopeSeed) => HistoricalFrameLease;
	/** Renderer-specific stable-ID delta application; generic DOM morph/append is forbidden. */
	readonly applyDelta?: (frame: StreamedRegionPlacementFrame) => void;
}

interface PreservedControl {
	element: Element;
	snapshot: HydrationControlSnapshot;
	edited: boolean;
}

function rangeNodes(start: Comment, end: Comment): Node[] {
	if (start.parentNode === null || start.parentNode !== end.parentNode) {
		throw new StreamedReceiverError('placement', formatClientError(240));
	}
	const nodes: Node[] = [];
	for (let node = start.nextSibling; node !== null && node !== end; node = node.nextSibling) {
		nodes.push(node);
	}
	if (end.previousSibling !== start && nodes.length === 0) {
		throw new StreamedReceiverError('placement', formatClientError(241));
	}
	return nodes;
}

function keyedControls(nodes: readonly Node[]): Map<string, Element> {
	const controls = new Map<string, Element>();
	const visit = (element: Element): void => {
		const key = element.getAttribute(HYDRATE_INPUT_ATTR);
		if (key !== null) {
			if (controls.has(key)) {
				throw new StreamedReceiverError('placement', formatClientError(242, key));
			}
			controls.set(key, element);
		}
		for (const child of element.children) visit(child);
	};
	for (const node of nodes) if (node.nodeType === 1) visit(node as Element);
	return controls;
}

function compatibleControl(current: Element, incoming: Element): boolean {
	return (
		current.localName === incoming.localName &&
		current.namespaceURI === incoming.namespaceURI &&
		(current.localName !== 'input' ||
			(current as HTMLInputElement).type === (incoming as HTMLInputElement).type)
	);
}

type SelectedOccurrences = Map<string, { selected: boolean[]; next: number }>;

function hasNonDefaultSelection(select: HTMLSelectElement): boolean {
	const options = select.options;
	if (select.multiple) {
		for (const option of options) if (option.selected !== option.defaultSelected) return true;
		return false;
	}
	const selected = select.selectedIndex;
	for (let index = options.length - 1; index >= 0; index--) {
		if (options[index].defaultSelected) return selected !== index;
	}
	// A single-row select without an explicit default chooses its first enabled option.
	if (select.size <= 1) {
		for (let index = 0; index < options.length; index++) {
			if (!options[index].matches(':disabled')) return selected !== index;
		}
	}
	return selected !== -1;
}

function readSelectEdits(
	select: HTMLSelectElement,
	snapshot: HydrationControlSnapshot,
): SelectedOccurrences {
	const values = snapshot.selectedValues ?? (select.selectedIndex === -1 ? [] : [snapshot.value]);
	const occurrences: SelectedOccurrences = new Map();
	for (const value of values) {
		if (!occurrences.has(value)) occurrences.set(value, { selected: [], next: 0 });
	}
	for (const option of select.options) {
		occurrences.get(option.value)?.selected.push(option.selected);
	}
	return occurrences;
}

function replaceSelectOptions(
	current: HTMLSelectElement,
	incoming: HTMLSelectElement,
	edits: SelectedOccurrences | undefined,
): boolean {
	let selectedIndex = incoming.selectedIndex;
	const contents = current.ownerDocument.createRange();
	contents.selectNodeContents(incoming);
	current.replaceChildren(contents.extractContents());

	const multiple = current.multiple;
	let discardedSelection = false;
	if (edits !== undefined) {
		const options = current.options;
		const retained: number[] = [];
		for (let index = 0; index < options.length; index++) {
			const match = edits.get(options[index].value);
			if (match === undefined || !match.selected[match.next++]) continue;
			retained.push(index);
			if (!multiple) break;
		}
		if (retained.length !== 0 || edits.size === 0) {
			selectedIndex = retained[0] ?? -1;
			if (multiple) {
				let next = 0;
				for (let index = 0; index < options.length; index++) {
					const option = options[index];
					const selected = retained[next] === index;
					if (selected) next++;
					if (option.selected !== selected) option.selected = selected;
				}
			}
		} else discardedSelection = true;
	}
	// Moving options out can make the source select choose a new default.
	if (!multiple && current.selectedIndex !== selectedIndex) {
		current.selectedIndex = selectedIndex;
	}
	return discardedSelection;
}

function updateControlPresentation(
	current: Element,
	incoming: Element,
	preserved: PreservedControl | undefined,
): boolean {
	const tag = current.localName;
	if (
		current.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
		(tag !== 'input' && tag !== 'textarea' && tag !== 'select')
	)
		return false;
	const attributes = current.attributes;
	const selectEdits =
		tag === 'select' && preserved?.edited
			? readSelectEdits(current as HTMLSelectElement, preserved.snapshot)
			: undefined;
	const range =
		tag === 'input' && (current as HTMLInputElement).type === 'range'
			? (current as HTMLInputElement)
			: null;
	const nextRange = incoming as HTMLInputElement;
	const refreshRange =
		range !== null &&
		(range.min !== nextRange.min ||
			range.max !== nextRange.max ||
			range.step !== nextRange.step ||
			range.defaultValue !== nextRange.defaultValue);
	// A dirty value can be valid both before and after this frame. Rounding
	// against a mixture of the two sets of constraints can still move it.
	if (refreshRange) range.step = 'any';
	for (let index = attributes.length - 1; index >= 0; index--) {
		const attr = attributes[index];
		if (refreshRange && attr.namespaceURI === null && attr.name === 'step') continue;
		if (!incoming.hasAttributeNS(attr.namespaceURI, attr.localName)) {
			current.removeAttributeNode(attr);
		}
	}
	for (const attr of incoming.attributes) {
		if (refreshRange && attr.namespaceURI === null && attr.name === 'step') continue;
		const existing = current.getAttributeNodeNS(attr.namespaceURI, attr.localName);
		if (existing === null || existing.name !== attr.name || existing.value !== attr.value) {
			current.setAttributeNodeNS(attr.cloneNode() as Attr);
		}
	}
	if (refreshRange) {
		const step = incoming.getAttribute('step');
		if (step === null) range.removeAttribute('step');
		else range.step = step;
		// Let the browser re-evaluate the pristine value against the final constraints.
		const value = incoming.getAttribute('value');
		range.defaultValue = value ?? '';
		if (value === null) range.removeAttribute('value');
	} else if (tag === 'textarea') {
		const value = (incoming as HTMLTextAreaElement).defaultValue;
		if ((current as HTMLTextAreaElement).defaultValue !== value) {
			(current as HTMLTextAreaElement).defaultValue = value;
		}
	} else if (tag === 'select') {
		return replaceSelectOptions(
			current as HTMLSelectElement,
			incoming as HTMLSelectElement,
			selectEdits,
		);
	}
	return false;
}

function hasEditedRadioSelection(input: HTMLInputElement, template: HTMLTemplateElement): boolean {
	if (input.type !== 'radio') return false;
	if (!input.defaultChecked) return true;
	// The inert document copies the dirty flag without upgrading customized inputs.
	const probe = template.content.ownerDocument!.importNode(input, false);
	probe.defaultChecked = false;
	return probe.checked;
}

function restoreControl(control: PreservedControl): void {
	const { element, snapshot, edited } = control;
	if (edited && element.localName === 'input') {
		const input = element as HTMLInputElement;
		if (
			input.type === 'radio' &&
			snapshot.checked !== undefined &&
			input.checked !== snapshot.checked
		) {
			input.checked = snapshot.checked;
		}
	}
	if (!snapshot.focused || !element.isConnected) return;
	try {
		(element as HTMLElement).focus({ preventScroll: true });
	} catch {
		return;
	}
	if (snapshot.composing || snapshot.selectionStart === null || snapshot.selectionEnd === null)
		return;
	try {
		(element as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
			snapshot.selectionStart,
			snapshot.selectionEnd,
			snapshot.selectionDirection ?? undefined,
		);
	} catch {
		// Non-text controls preserve focus/value without a selection API.
	}
}

/**
 * Commit one complete renderer-owned range. Incoming outer hydration markers
 * are structural proof and remain owned by the registered range.
 */
function placeFullRegion(registration: StreamedRegionRegistration, html: string): void {
	const { start, end } = registration;
	const oldNodes = rangeNodes(start, end);
	const oldControls = keyedControls(oldNodes);
	const ownerDocument = start.ownerDocument!;
	const template = ownerDocument.createElement('template');
	settleStreamedControlResets(ownerDocument);
	const snapshots = new Map<string, PreservedControl>();
	for (const [key, element] of oldControls) {
		const snapshot = snapshotHydrationControl(element);
		if (snapshot === null) continue;
		let edited =
			hasStreamedControlEdit(element, snapshot.editRevision) ||
			(snapshot.checked === true &&
				element.localName === 'input' &&
				hasEditedRadioSelection(element as HTMLInputElement, template));
		if (
			!edited &&
			element.localName === 'select' &&
			element.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
			hasNonDefaultSelection(element as HTMLSelectElement)
		) {
			// A later frame can make the live selection its reset default.
			rememberStreamedSelectEdit(element as HTMLSelectElement);
			edited = true;
		}
		snapshots.set(key, { element, snapshot, edited });
	}

	// This sink receives only a protocol-validated renderer artifact.
	template.innerHTML = FRAMEWORK_POLICY ? FRAMEWORK_POLICY.createHTML(html) : html;
	const incomingOpen = template.content.firstChild;
	const incomingClose = rendererRangeClose(incomingOpen);
	if (
		incomingOpen === null ||
		incomingClose === null ||
		incomingClose !== template.content.lastChild
	) {
		throw new StreamedReceiverError('placement', formatClientError(243));
	}
	const incomingNodes: Node[] = [];
	for (let node = incomingOpen.nextSibling; node !== incomingClose; node = node!.nextSibling) {
		incomingNodes.push(node!);
	}
	const incomingControls = keyedControls(incomingNodes);
	for (const [key, preserved] of snapshots) {
		const replacement = incomingControls.get(key);
		if (
			(preserved.edited || preserved.snapshot.focused || preserved.snapshot.composing) &&
			(replacement === undefined || !compatibleControl(preserved.element, replacement))
		) {
			throw new StreamedReceiverError('placement', formatClientError(244, key));
		}
	}

	const parent = end.parentNode!;
	const contents = ownerDocument.adoptNode(template.content);
	contents.removeChild(incomingOpen);
	contents.removeChild(incomingClose);
	let discardedEdits: PreservedControl[] | undefined;
	for (const [key, replacement] of incomingControls) {
		const current = oldControls.get(key);
		if (current === undefined || !compatibleControl(current, replacement)) continue;
		// A checked placeholder or an intermediate radio name must not affect a
		// live group. Install the retained control with its final attributes.
		current.remove();
		const preserved = snapshots.get(key);
		if (updateControlPresentation(current, replacement, preserved) && preserved !== undefined) {
			(discardedEdits ??= []).push(preserved);
		}
		replacement.replaceWith(current);
	}
	for (const node of oldNodes) {
		if (node.parentNode === parent) parent.removeChild(node);
	}
	parent.insertBefore(contents, end);
	// The fallback owns the selection only once its range is installed.
	if (discardedEdits !== undefined) {
		for (const { element, snapshot } of discardedEdits) {
			retireStreamedControlEdit(element, snapshot.editRevision);
		}
	}
	for (const preserved of snapshots.values()) restoreControl(preserved);
}

export interface StreamedRegionReceiver extends StreamedResultReceiver {
	registerRegion(registration: StreamedRegionRegistration): () => void;
}

async function commitPlacement(
	state: StreamedSelectionState,
	frame: StreamedRegionPlacementFrame,
	isCurrent: (state: StreamedSelectionState, identity: StreamFrameIdentity) => boolean,
): Promise<StreamedFrameDisposition> {
	const region = state.region;
	const registration = region?.registration;
	if (
		!isCurrent(state, frame.identity) ||
		registration === undefined ||
		registration.isActive() ||
		!sameStreamFrameIdentity(state.identity, frame.identity) ||
		frame.contentRevision <= state.contentRevision ||
		(frame.mode === 'delta' && frame.baseRevision !== state.contentRevision)
	) {
		return 'stale';
	}
	try {
		await registration.loadStyles(frame.styles);
	} catch {
		throw new StreamedReceiverError('styles', formatClientError(245));
	}
	if (
		!isCurrent(state, frame.identity) ||
		state.region !== region ||
		registration.isActive() ||
		!sameStreamFrameIdentity(state.identity, frame.identity) ||
		frame.contentRevision <= state.contentRevision ||
		(frame.mode === 'delta' && frame.baseRevision !== state.contentRevision)
	) {
		return 'stale';
	}
	// Composition can begin while styles load. Keep this receive pending so
	// its transport continues to own cancellation, deadline and byte budget.
	for (const element of keyedControls(rangeNodes(registration.start, registration.end)).values()) {
		if (!snapshotHydrationControl(element)?.composing) continue;
		state.pendingPlacement?.cancel();
		return new Promise<StreamedFrameDisposition>((resolve, reject) => {
			const cleanup = () => {
				element.removeEventListener('compositionend', resume);
				if (state.pendingPlacement === pending) state.pendingPlacement = undefined;
			};
			const pending = {
				cancel() {
					cleanup();
					resolve('stale');
				},
			};
			const resume = () => {
				cleanup();
				// The sequence is already accepted; only retry the guarded commit.
				void commitPlacement(state, frame, isCurrent).then(resolve, reject);
			};
			state.pendingPlacement = pending;
			element.addEventListener('compositionend', resume, { once: true });
		});
	}
	let lease: HistoricalFrameLease;
	try {
		lease = registration.adoptHistoricalFrame(frame.historicalFrame);
	} catch {
		throw new StreamedReceiverError('historical-frame', formatClientError(246));
	}
	try {
		if (frame.mode === 'delta') {
			if (registration.applyDelta === undefined) {
				throw new StreamedReceiverError('placement', formatClientError(247));
			}
			registration.applyDelta(frame);
		} else {
			placeFullRegion(registration, frame.html);
		}
	} catch (error) {
		lease.release();
		throw error;
	}
	state.historical?.release();
	state.historical = lease;
	state.contentRevision = frame.contentRevision;
	return 'accepted';
}

/** Accept streamed results and place registered renderer-owned HTML ranges. */
export function createStreamedRegionReceiver(
	options: StreamedRegionReceiverOptions,
): StreamedRegionReceiver {
	const { receiver, current } = createStreamedResultReceiverState(options, commitPlacement);
	const registerRegion = (registration: StreamedRegionRegistration): (() => void) => {
		const state = current(registration.identity);
		if (state === undefined || state.failure !== undefined) {
			throw new StreamedReceiverError('identity', formatClientError(248));
		}
		if (registration.start.parentNode !== registration.end.parentNode) {
			throw new StreamedReceiverError('placement', formatClientError(249));
		}
		if (!Number.isSafeInteger(registration.contentRevision) || registration.contentRevision < 0) {
			throw new StreamedReceiverError('identity', formatClientError(250));
		}
		const { start, end } = registration;
		initializeHydrationControlCapture(start.ownerDocument!);
		const stopResetCapture = trackStreamedControlResets(start, end);
		const unregister = () => {
			if (state.region?.unregister !== unregister) return;
			state.region = undefined;
			state.pendingPlacement?.cancel();
			stopResetCapture();
		};
		state.region?.unregister();
		state.region = { registration, unregister };
		state.contentRevision = registration.contentRevision;
		return unregister;
	};
	return { ...receiver, registerRegion };
}
