import type { Lynx } from '../platform.js';
import {
	applyLynxBackgroundLifecycleData,
	compactLynxLifecycleMessages,
} from './lifecycle-data.js';
import {
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	validateLynxBackgroundInboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDataLifecycleMessage,
} from './protocol.js';

const MAX_QUEUED_LIFECYCLE_MESSAGES = 128;

interface DiagnosticSubscriber {
	readonly callback: (error: Error) => void;
}

interface BackgroundLifecycleState {
	readonly runtime: Lynx;
	readonly context: LynxContextProxy;
	readonly receive: (event: LynxContextProxyEvent) => void;
	readonly diagnostics: Set<DiagnosticSubscriber>;
	readonly queue: LynxDataLifecycleMessage[];
	active: boolean;
	committed: boolean;
	destroyed: boolean;
	draining: boolean;
	overflowReported: boolean;
}

export interface LynxBackgroundLifecycleInstallation {
	/** Retain this receiver for the native page lifetime. */
	commit(): void;
	/** Undo this root's pending registration after construction failure. */
	rollback(): void;
	/** Release this root's diagnostic subscription without detaching the page receiver. */
	release(): void;
	/** Whether the native page ended before the root transport could attach. */
	isPageDestroyed(): boolean;
}

const backgroundLifecycleStates = new WeakMap<object, BackgroundLifecycleState>();

function normalizedError(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	return new Error(value === undefined ? fallback : String(value));
}

function report(state: BackgroundLifecycleState, value: unknown, fallback: string): void {
	const error = normalizedError(value, fallback);
	if (state.diagnostics.size !== 0) {
		for (const subscriber of [...state.diagnostics]) {
			try {
				subscriber.callback(error);
			} catch {
				// Diagnostics are observational and cannot own page delivery.
			}
		}
		return;
	}
	try {
		state.runtime.reportError(error);
	} catch {
		// The public fallback is also observational.
	}
}

function lifecycleMessageType(
	value: unknown,
): 'page-data' | 'global-props' | 'page-destroy' | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
		if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
			return null;
		}
		return descriptor.value === 'page-data' ||
			descriptor.value === 'global-props' ||
			descriptor.value === 'page-destroy'
			? descriptor.value
			: null;
	} catch {
		return null;
	}
}

function detach(state: BackgroundLifecycleState, destroyed = false): void {
	if (destroyed) state.destroyed = true;
	if (!state.active) {
		if (!state.destroyed && backgroundLifecycleStates.get(state.runtime) === state) {
			backgroundLifecycleStates.delete(state.runtime);
		}
		return;
	}
	state.active = false;
	state.queue.length = 0;
	if (!state.destroyed && backgroundLifecycleStates.get(state.runtime) === state) {
		backgroundLifecycleStates.delete(state.runtime);
	}
	try {
		state.context.removeEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, state.receive);
	} catch (error) {
		report(state, error, 'Octane Lynx could not detach the background lifecycle receiver.');
	} finally {
		state.diagnostics.clear();
	}
}

function drain(state: BackgroundLifecycleState): void {
	if (!state.active || state.draining) return;
	state.draining = true;
	try {
		while (state.active && state.queue.length !== 0) {
			const message = state.queue.shift()!;
			try {
				applyLynxBackgroundLifecycleData(state.runtime, message);
			} catch (error) {
				report(state, error, 'Octane Lynx could not apply background lifecycle data.');
			}
		}
	} finally {
		state.draining = false;
		if (state.queue.length === 0) state.overflowReported = false;
	}
}

function enqueue(state: BackgroundLifecycleState, message: LynxDataLifecycleMessage): void {
	if (!state.active) return;
	if (state.queue.length >= MAX_QUEUED_LIFECYCLE_MESSAGES) {
		const compacted = compactLynxLifecycleMessages([...state.queue, message]);
		state.queue.length = 0;
		state.queue.push(...compacted);
		if (!state.overflowReported) {
			state.overflowReported = true;
			report(
				state,
				new Error(
					`Octane Lynx background lifecycle exceeded ${MAX_QUEUED_LIFECYCLE_MESSAGES} queued messages and was compacted to current state.`,
				),
				'Octane Lynx background lifecycle queue overflowed.',
			);
		}
		return;
	}
	state.queue.push(message);
	drain(state);
}

function createInstallation(
	state: BackgroundLifecycleState,
	subscriber: DiagnosticSubscriber | null,
	created: boolean,
): LynxBackgroundLifecycleInstallation {
	let phase: 'pending' | 'committed' | 'released' = 'pending';
	const releaseSubscriber = (): void => {
		if (subscriber !== null) state.diagnostics.delete(subscriber);
	};
	return Object.freeze({
		commit() {
			if (phase !== 'pending') return;
			phase = 'committed';
			state.committed = true;
		},
		rollback() {
			if (phase !== 'pending') return;
			phase = 'released';
			releaseSubscriber();
			if (created && !state.committed && !state.destroyed) detach(state);
		},
		release() {
			if (phase === 'released') return;
			const wasPending = phase === 'pending';
			phase = 'released';
			releaseSubscriber();
			if (created && wasPending && !state.committed && !state.destroyed) detach(state);
		},
		isPageDestroyed() {
			return state.destroyed;
		},
	});
}

/**
 * Prepare the one background data receiver owned by the shared native page.
 * It intentionally outlives ordinary Octane roots and ends only at page destroy.
 */
export function prepareLynxBackgroundLifecycleReceiver(
	runtime: Lynx,
	context: LynxContextProxy,
	onDiagnostic?: (error: Error) => void,
): LynxBackgroundLifecycleInstallation {
	const subscriber = onDiagnostic === undefined ? null : { callback: onDiagnostic };
	const existing = backgroundLifecycleStates.get(runtime);
	if (existing?.destroyed) {
		return createInstallation(existing, null, false);
	}
	if (existing !== undefined && existing.active) {
		if (existing.context !== context) {
			throw new Error(
				'Octane Lynx background lifecycle is already installed for a different ContextProxy.',
			);
		}
		if (subscriber !== null) existing.diagnostics.add(subscriber);
		return createInstallation(existing, subscriber, false);
	}

	if (
		context === null ||
		typeof context !== 'object' ||
		typeof context.addEventListener !== 'function' ||
		typeof context.removeEventListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx background lifecycle requires ContextProxy addEventListener/removeEventListener.',
		);
	}

	let state!: BackgroundLifecycleState;
	const receive = (event: LynxContextProxyEvent): void => {
		if (!state.active || lifecycleMessageType(event.data) === null) return;
		let message;
		try {
			message = validateLynxBackgroundInboundMessage(event.data);
		} catch (error) {
			report(state, error, 'Octane Lynx received malformed background lifecycle data.');
			return;
		}
		if (message.type === 'page-destroy') {
			detach(state, true);
			return;
		}
		if (message.type === 'page-data' || message.type === 'global-props') {
			enqueue(state, message);
		}
	};
	state = {
		runtime,
		context,
		receive,
		diagnostics: new Set(subscriber === null ? [] : [subscriber]),
		queue: [],
		active: true,
		committed: false,
		destroyed: false,
		draining: false,
		overflowReported: false,
	};
	// Publish before registration: addEventListener may synchronously re-enter or
	// mutate its listener set before reporting a delivery failure.
	backgroundLifecycleStates.set(runtime, state);
	try {
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
	} catch (error) {
		state.active = false;
		state.queue.length = 0;
		if (!state.destroyed) backgroundLifecycleStates.delete(runtime);
		try {
			context.removeEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
		} catch (cleanupError) {
			report(
				state,
				cleanupError,
				'Octane Lynx could not roll back a failed background lifecycle registration.',
			);
		}
		state.diagnostics.clear();
		throw error;
	}
	return createInstallation(state, subscriber, true);
}
