import { HYDRATE_INPUT_ATTR } from '../hydration-markers.js';
import { rendererRangeClose } from '../stream-protocol.js';
import {
	sameStreamFrameIdentity,
	type StreamedRegionPlacementFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import { snapshotHydrationControl, type HydrationControlSnapshot } from './control-capture.js';
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
}

function rangeNodes(start: Comment, end: Comment): Node[] {
	if (start.parentNode === null || start.parentNode !== end.parentNode) {
		throw new StreamedReceiverError('placement', 'The streamed region range is detached.');
	}
	const nodes: Node[] = [];
	for (let node = start.nextSibling; node !== null && node !== end; node = node.nextSibling) {
		nodes.push(node);
	}
	if (end.previousSibling !== start && nodes.length === 0) {
		throw new StreamedReceiverError('placement', 'The streamed region range is malformed.');
	}
	return nodes;
}

function keyedControls(nodes: readonly Node[]): Map<string, Element> {
	const controls = new Map<string, Element>();
	const visit = (element: Element): void => {
		const key = element.getAttribute(HYDRATE_INPUT_ATTR);
		if (key !== null) {
			if (controls.has(key)) {
				throw new StreamedReceiverError('placement', `Duplicate streamed control key "${key}".`);
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

function restoreControl(control: PreservedControl): void {
	const { element, snapshot } = control;
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
 * are structural proof and remain owned by the registered range. Existing
 * keyed controls move directly between connected parents, preserving identity.
 */
function placeFullRegion(registration: StreamedRegionRegistration, html: string): void {
	const { start, end } = registration;
	const oldNodes = rangeNodes(start, end);
	const oldControls = keyedControls(oldNodes);
	const snapshots = new Map<string, PreservedControl>();
	for (const [key, element] of oldControls) {
		const snapshot = snapshotHydrationControl(element);
		if (snapshot !== null) snapshots.set(key, { element, snapshot });
	}

	const template = start.ownerDocument!.createElement('template');
	// This sink receives only a protocol-validated renderer artifact. Trusted
	// Types policy creation/enforcement is intentionally outside this PR.
	template.innerHTML = html;
	const incomingOpen = template.content.firstChild;
	const incomingClose = rendererRangeClose(incomingOpen);
	if (
		incomingOpen === null ||
		incomingClose === null ||
		incomingClose !== template.content.lastChild
	) {
		throw new StreamedReceiverError(
			'placement',
			'A full streamed region must be one balanced range.',
		);
	}
	const incomingNodes: Node[] = [];
	for (let node = incomingOpen.nextSibling; node !== incomingClose; node = node!.nextSibling) {
		incomingNodes.push(node!);
	}
	const incomingControls = keyedControls(incomingNodes);
	for (const [key, preserved] of snapshots) {
		const replacement = incomingControls.get(key);
		if (
			(preserved.snapshot.editRevision > 0 ||
				preserved.snapshot.focused ||
				preserved.snapshot.composing) &&
			(replacement === undefined || !compatibleControl(preserved.element, replacement))
		) {
			throw new StreamedReceiverError(
				'placement',
				`Streamed HTML cannot preserve live control "${key}".`,
			);
		}
	}

	const parent = end.parentNode!;
	for (const node of incomingNodes) parent.insertBefore(node, end);
	const preservedElements = new Set<Element>();
	for (const [key, replacement] of incomingControls) {
		const current = oldControls.get(key);
		if (current === undefined || !compatibleControl(current, replacement)) continue;
		replacement.parentNode!.replaceChild(current, replacement);
		preservedElements.add(current);
	}
	for (const node of oldNodes) {
		if (node.nodeType === 1 && preservedElements.has(node as Element)) continue;
		node.parentNode?.removeChild(node);
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
	const registration = state.region;
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
		throw new StreamedReceiverError('styles', 'Required streamed region styles are unavailable.');
	}
	if (
		!isCurrent(state, frame.identity) ||
		state.region !== registration ||
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
		throw new StreamedReceiverError('historical-frame', 'Historical read-frame adoption failed.');
	}
	try {
		if (frame.mode === 'delta') {
			if (registration.applyDelta === undefined) {
				throw new StreamedReceiverError(
					'placement',
					'This region does not support renderer deltas.',
				);
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
		if (state === undefined) {
			throw new StreamedReceiverError('identity', 'Register the exact current selection first.');
		}
		if (registration.start.parentNode !== registration.end.parentNode) {
			throw new StreamedReceiverError(
				'placement',
				'The streamed region markers do not share a parent.',
			);
		}
		if (!Number.isSafeInteger(registration.contentRevision) || registration.contentRevision < 0) {
			throw new StreamedReceiverError(
				'identity',
				'Streamed region content revisions must be nonnegative safe integers.',
			);
		}
		state.region = registration;
		state.contentRevision = registration.contentRevision;
		return () => {
			if (state.region === registration) state.region = undefined;
		};
	};
	return { ...receiver, registerRegion };
}
