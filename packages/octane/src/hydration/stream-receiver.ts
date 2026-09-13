import { HYDRATE_INPUT_ATTR } from '../hydration-markers.js';
import { rendererRangeClose } from '../stream-protocol.js';
import {
	decodeStreamedRendererFrame,
	isStreamedRendererFrame,
	sameStreamFrameIdentity,
	type StreamedRegionPlacementFrame,
	type StreamedRendererFrame,
	type StreamedSignalResultFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import { snapshotHydrationControl, type HydrationControlSnapshot } from './event-capture.js';
import type { ScopeSeed } from '../signals/types.js';

export interface StreamedResultConsumer {
	/** False defers this validated frame; reattaching the same consumer retries its bounded mailbox. */
	accept(frame: StreamedSignalResultFrame): void | false;
	/** True transfers this bounded completed mailbox to consumer-owned retention, without publishing it. */
	retainCompleted?(frames: StreamedSignalResultFrame[]): boolean;
	fail(error: StreamedReceiverError): void;
}

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

export interface StreamedRegionReceiverOptions {
	readonly buildId: string;
	readonly documentId: string;
	readonly ownerKey: string;
	readonly maxPendingFrames?: number;
	readonly maxPendingBytes?: number;
	readonly pendingTimeoutMs?: number;
	readonly onError?: (error: StreamedReceiverError) => void;
}

export type StreamedFrameDisposition = 'accepted' | 'stale';

export class StreamedReceiverError extends Error {
	constructor(
		readonly code:
			| 'identity'
			| 'sequence'
			| 'protocol'
			| 'overflow'
			| 'timeout'
			| 'terminal'
			| 'styles'
			| 'historical-frame'
			| 'placement',
		message: string,
	) {
		super(message);
		this.name = 'StreamedReceiverError';
	}
}

interface ResultState {
	sequence: number;
	opened: boolean;
	resource?: 'promise' | 'stream';
	values: number;
	terminal: boolean;
	frames: StreamedSignalResultFrame[];
	bytes: number;
	consumer?: StreamedResultConsumer;
	timer?: ReturnType<typeof setTimeout>;
	failure?: StreamedReceiverError;
}

interface SelectionState {
	identity: StreamFrameIdentity;
	result: ResultState;
	placementSequence: number;
	contentRevision: number;
	region?: StreamedRegionRegistration;
	historical?: HistoricalFrameLease;
	pendingPlacement?: { cancel(): void };
	failure?: StreamedReceiverError;
}

function retainCompletedResult(result: ResultState): void {
	if (
		result.frames.at(-1)?.kind === 'complete' &&
		result.consumer?.retainCompleted?.(result.frames) === true
	) {
		// Transfer ownership, not a copy. Incomplete channels never cross this
		// boundary and still expire under the receiver's normal lifetime.
		result.frames = [];
		result.bytes = 0;
	}
}

interface PreservedControl {
	element: Element;
	snapshot: HydrationControlSnapshot;
}

const DEFAULT_PENDING_FRAMES = 64;
const DEFAULT_PENDING_BYTES = 1024 * 1024;
const DEFAULT_PENDING_TIMEOUT = 30_000;

function counter(value: number | undefined, fallback: number): number {
	const result = value ?? fallback;
	if (!Number.isSafeInteger(result) || result <= 0) {
		throw new RangeError('Stream receiver limits must be positive safe integers.');
	}
	return result;
}

function slotKey(identity: StreamFrameIdentity): string {
	return JSON.stringify([identity.instanceKey, identity.nodeKey]);
}

function frameBytes(frame: StreamedRendererFrame): number {
	return new TextEncoder().encode(JSON.stringify(frame)).byteLength;
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

export interface StreamedRegionReceiver {
	registerSelection(identity: StreamFrameIdentity, contentRevision?: number): void;
	registerRegion(registration: StreamedRegionRegistration): () => void;
	attachResult(identity: StreamFrameIdentity, consumer: StreamedResultConsumer): () => void;
	receive(frame: unknown): Promise<StreamedFrameDisposition>;
	receiveJson(json: string): Promise<StreamedFrameDisposition>;
	/** Fail only the exact current selection; false means stale or already failed. */
	failSelection(identity: StreamFrameIdentity, error: StreamedReceiverError): boolean;
	dispose(): void;
}

/** Create the tiny pre-module receiver used by initial and fetched streams. */
export function createStreamedRegionReceiver(
	options: StreamedRegionReceiverOptions,
): StreamedRegionReceiver {
	const maxFrames = counter(options.maxPendingFrames, DEFAULT_PENDING_FRAMES);
	const maxBytes = counter(options.maxPendingBytes, DEFAULT_PENDING_BYTES);
	const timeoutMs = counter(options.pendingTimeoutMs, DEFAULT_PENDING_TIMEOUT);
	const selections = new Map<string, SelectionState>();
	let disposed = false;

	const report = (error: StreamedReceiverError, state?: SelectionState): void => {
		if (state !== undefined) {
			if (state.failure !== undefined) return;
			state.failure = error;
			state.pendingPlacement?.cancel();
			// A completed result stays useful if a later HTML placement fails.
			// Pending results retain their failure even before their module joins.
			if (!state.result.terminal) {
				state.result.failure = error;
				try {
					state.result.consumer?.fail(error);
				} catch {
					// Consumer rejection callbacks cannot prevent receiver cleanup.
				}
				state.result.frames.length = 0;
				state.result.bytes = 0;
			}
			if (state.result.timer !== undefined) clearTimeout(state.result.timer);
			state.result.terminal = true;
		}
		options.onError?.(error);
	};
	const current = (identity: StreamFrameIdentity): SelectionState | undefined => {
		if (
			identity.buildId !== options.buildId ||
			identity.documentId !== options.documentId ||
			identity.ownerKey !== options.ownerKey
		) {
			return;
		}
		const state = selections.get(slotKey(identity));
		return state !== undefined && sameStreamFrameIdentity(state.identity, identity)
			? state
			: undefined;
	};
	const registerSelection = (identity: StreamFrameIdentity, contentRevision = 0): void => {
		if (
			!isStreamedRendererFrame({
				identity,
				sequence: 0,
				channel: 'result',
				kind: 'complete',
			})
		) {
			throw new StreamedReceiverError('identity', 'Invalid streamed selection identity.');
		}
		if (
			identity.buildId !== options.buildId ||
			identity.documentId !== options.documentId ||
			identity.ownerKey !== options.ownerKey ||
			!Number.isSafeInteger(contentRevision) ||
			contentRevision < 0
		) {
			throw new StreamedReceiverError('identity', 'Streamed selection has the wrong authority.');
		}
		const key = slotKey(identity);
		const previous = selections.get(key);
		if (previous !== undefined) {
			previous.pendingPlacement?.cancel();
			if (previous.result.timer !== undefined) clearTimeout(previous.result.timer);
			previous.historical?.release();
		}
		const state: SelectionState = {
			identity,
			result: { sequence: 0, opened: false, values: 0, terminal: false, frames: [], bytes: 0 },
			placementSequence: 0,
			contentRevision,
		};
		selections.set(key, state);
		// A selected result has a bounded lifetime even if its open frame was
		// lost, or arrived before modules. Attaching code does not end transport.
		state.result.timer = setTimeout(() => {
			report(new StreamedReceiverError('timeout', 'Streamed result timed out.'), state);
		}, timeoutMs);
	};
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
	const attachResult = (
		identity: StreamFrameIdentity,
		consumer: StreamedResultConsumer,
	): (() => void) => {
		const state = current(identity);
		if (state === undefined) {
			throw new StreamedReceiverError('identity', 'Cannot attach a result to a stale selection.');
		}
		if (state.result.consumer !== undefined && state.result.consumer !== consumer) {
			throw new StreamedReceiverError('identity', 'A streamed result already has a consumer.');
		}
		state.result.consumer = consumer;
		if (state.result.failure !== undefined) {
			consumer.fail(state.result.failure);
			return () => {
				if (state.result.consumer === consumer) state.result.consumer = undefined;
			};
		}
		let accepted = 0;
		try {
			for (const frame of state.result.frames) {
				if (consumer.accept(frame) === false) break;
				accepted++;
			}
		} finally {
			if (accepted === state.result.frames.length) state.result.bytes = 0;
			else {
				for (let index = 0; index < accepted; index++) {
					state.result.bytes -= frameBytes(state.result.frames[index]!);
				}
			}
			state.result.frames.splice(0, accepted);
		}
		retainCompletedResult(state.result);
		return () => {
			if (state.result.consumer === consumer) state.result.consumer = undefined;
		};
	};
	const receiveResult = (
		state: SelectionState,
		frame: StreamedSignalResultFrame,
	): StreamedFrameDisposition => {
		const result = state.result;
		if (result.terminal || frame.sequence !== result.sequence) {
			throw new StreamedReceiverError('sequence', 'Invalid or duplicate streamed result sequence.');
		}
		result.sequence++;
		if (!result.opened) {
			if (frame.kind !== 'open') {
				throw new StreamedReceiverError('terminal', 'A streamed result must begin with open.');
			}
			result.opened = true;
			result.resource = frame.resource;
		} else if (frame.kind === 'open') {
			throw new StreamedReceiverError('terminal', 'A streamed result cannot open twice.');
		} else if (frame.kind === 'value') {
			result.values++;
			if (result.resource === 'promise' && result.values > 1) {
				throw new StreamedReceiverError(
					'terminal',
					'A promise result emitted more than one value.',
				);
			}
		} else {
			if (frame.kind === 'complete' && result.resource === 'promise' && result.values !== 1) {
				throw new StreamedReceiverError(
					'terminal',
					'A promise result completed without one value.',
				);
			}
		}
		// A terminal is accepted only after the pre-code mailbox can retain it.
		// Otherwise the overflow must be delivered to a later attaching consumer,
		// not mistaken for a successfully completed result.
		if (
			result.consumer === undefined ||
			result.frames.length !== 0 ||
			result.consumer.accept(frame) === false
		) {
			const bytes = frameBytes(frame);
			if (result.frames.length + 1 > maxFrames || result.bytes + bytes > maxBytes) {
				throw new StreamedReceiverError('overflow', 'Streamed result mailbox exceeded its bound.');
			}
			result.frames.push(frame);
			result.bytes += bytes;
		}
		if (frame.kind === 'complete' || frame.kind === 'error') {
			result.terminal = true;
			if (result.timer !== undefined) clearTimeout(result.timer);
		}
		if (frame.kind === 'complete') retainCompletedResult(result);
		return 'accepted';
	};
	const receivePlacement = async (
		state: SelectionState,
		frame: StreamedRegionPlacementFrame,
	): Promise<StreamedFrameDisposition> => {
		if (frame.sequence !== state.placementSequence) {
			throw new StreamedReceiverError('sequence', 'Invalid or duplicate placement sequence.');
		}
		state.placementSequence++;
		const registration = state.region;
		if (registration === undefined || registration.isActive()) return 'stale';
		if (frame.contentRevision <= state.contentRevision) return 'stale';
		if (frame.mode === 'delta' && frame.baseRevision !== state.contentRevision) return 'stale';

		return commitPlacement(state, frame);
	};
	const commitPlacement = async (
		state: SelectionState,
		frame: StreamedRegionPlacementFrame,
	): Promise<StreamedFrameDisposition> => {
		const registration = state.region;
		if (
			disposed ||
			state.failure !== undefined ||
			current(frame.identity) !== state ||
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
			disposed ||
			state.failure !== undefined ||
			current(frame.identity) !== state ||
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
		for (const element of keyedControls(
			rangeNodes(registration.start, registration.end),
		).values()) {
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
					void commitPlacement(state, frame).then(resolve, reject);
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
	};
	const receive = async (value: unknown): Promise<StreamedFrameDisposition> => {
		if (disposed) return 'stale';
		if (!isStreamedRendererFrame(value)) {
			const error = new StreamedReceiverError('protocol', 'Malformed streamed renderer frame.');
			report(error);
			throw error;
		}
		const frame = value;
		const state = current(frame.identity);
		if (state === undefined || state.failure !== undefined) return 'stale';
		try {
			return frame.channel === 'result'
				? receiveResult(state, frame)
				: await receivePlacement(state, frame);
		} catch (error) {
			if (disposed || current(frame.identity) !== state) return 'stale';
			const receiverError =
				error instanceof StreamedReceiverError
					? error
					: new StreamedReceiverError('protocol', 'Streamed renderer frame failed.');
			report(receiverError, state);
			throw receiverError;
		}
	};
	return {
		registerSelection,
		registerRegion,
		attachResult,
		receive,
		receiveJson(json) {
			return receive(decodeStreamedRendererFrame(json));
		},
		failSelection(identity, error) {
			if (disposed) return false;
			const state = current(identity);
			if (state === undefined || state.failure !== undefined) return false;
			report(error, state);
			return true;
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const state of selections.values()) {
				try {
					report(new StreamedReceiverError('terminal', 'Streamed receiver was disposed.'), state);
				} catch {
					// A host error callback must not prevent remaining owners retiring.
				} finally {
					state.historical?.release();
				}
			}
			selections.clear();
		},
	};
}
