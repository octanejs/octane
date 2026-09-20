import {
	decodeStreamedRendererFrame,
	isStreamedRendererFrame,
	sameStreamFrameIdentity,
	type StreamedRegionPlacementFrame,
	type StreamedRendererFrame,
	type StreamedSignalResultFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import type { HistoricalFrameLease, StreamedRegionRegistration } from './stream-receiver.js';

export interface StreamedResultConsumer {
	/** False defers this validated frame; reattaching the same consumer retries its bounded mailbox. */
	accept(frame: StreamedSignalResultFrame): void | false;
	/** True transfers this bounded completed mailbox to consumer-owned retention, without publishing it. */
	retainCompleted?(frames: StreamedSignalResultFrame[]): boolean;
	fail(error: StreamedReceiverError): void;
}

export interface StreamedResultReceiverOptions {
	readonly buildId: string;
	readonly documentId: string;
	readonly ownerKey: string;
	readonly maxPendingFrames?: number;
	readonly maxPendingBytes?: number;
	/** Maximum inactivity before the first result frame or between accepted result frames. */
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

export interface StreamedSelectionState {
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

export interface StreamedResultReceiver {
	registerSelection(identity: StreamFrameIdentity, contentRevision?: number): void;
	attachResult(identity: StreamFrameIdentity, consumer: StreamedResultConsumer): () => void;
	receive(frame: unknown): Promise<StreamedFrameDisposition>;
	receiveJson(json: string): Promise<StreamedFrameDisposition>;
	/** Fail only the exact current selection; false means stale or already failed. */
	failSelection(identity: StreamFrameIdentity, error: StreamedReceiverError): boolean;
	dispose(): void;
}

/**
 * Accept streamed results without HTML placement. Valid unregistered placement
 * frames still advance their sequence and return stale, as on the full receiver.
 */
export function createStreamedResultReceiver(
	options: StreamedResultReceiverOptions,
): StreamedResultReceiver {
	return createStreamedResultReceiverState(options).receiver;
}

/**
 * Internal static seam: the full receiver supplies DOM placement while both
 * variants retain the same selection, result, failure and cleanup authority.
 */
export function createStreamedResultReceiverState(
	options: StreamedResultReceiverOptions,
	commitPlacement?: (
		state: StreamedSelectionState,
		frame: StreamedRegionPlacementFrame,
		isCurrent: (state: StreamedSelectionState, identity: StreamFrameIdentity) => boolean,
	) => Promise<StreamedFrameDisposition>,
): {
	receiver: StreamedResultReceiver;
	current: (identity: StreamFrameIdentity) => StreamedSelectionState | undefined;
} {
	const maxFrames = counter(options.maxPendingFrames, DEFAULT_PENDING_FRAMES);
	const maxBytes = counter(options.maxPendingBytes, DEFAULT_PENDING_BYTES);
	const timeoutMs = counter(options.pendingTimeoutMs, DEFAULT_PENDING_TIMEOUT);
	const selections = new Map<string, StreamedSelectionState>();
	let disposed = false;

	const report = (error: StreamedReceiverError, state?: StreamedSelectionState): void => {
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
	const current = (identity: StreamFrameIdentity): StreamedSelectionState | undefined => {
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
	const isCurrent = (state: StreamedSelectionState, identity: StreamFrameIdentity): boolean =>
		!disposed && state.failure === undefined && current(identity) === state;
	const renewResultTimeout = (state: StreamedSelectionState): void => {
		if (state.result.timer !== undefined) clearTimeout(state.result.timer);
		state.result.timer = setTimeout(() => {
			report(new StreamedReceiverError('timeout', 'Streamed result timed out.'), state);
		}, timeoutMs);
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
		const state: StreamedSelectionState = {
			identity,
			result: { sequence: 0, opened: false, values: 0, terminal: false, frames: [], bytes: 0 },
			placementSequence: 0,
			contentRevision,
		};
		selections.set(key, state);
		// Bound inactivity even if the open frame is lost or arrives before
		// modules. Only accepted result frames renew the transport's deadline.
		renewResultTimeout(state);
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
		state: StreamedSelectionState,
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
		} else if (!result.terminal && isCurrent(state, frame.identity)) renewResultTimeout(state);
		if (frame.kind === 'complete') retainCompletedResult(result);
		return 'accepted';
	};
	const receivePlacement = async (
		state: StreamedSelectionState,
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

		return commitPlacement?.(state, frame, isCurrent) ?? 'stale';
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
	const receiver: StreamedResultReceiver = {
		registerSelection,
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
	return { receiver, current };
}
