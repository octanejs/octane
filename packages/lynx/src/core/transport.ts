import {
	UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
	type UniversalAsyncCommitTransport,
	type UniversalAsyncPreparedHostBatch,
	type UniversalHostBatch,
	type UniversalRoot,
	type UniversalTransportAcknowledgement,
	type UniversalEventPriority,
	type UniversalTransportEventDelivery,
	type UniversalTransportIdentity,
	type UniversalSerializableValue,
} from 'octane/universal/native';
import { LYNX_PROFILE, lynxWireProfile, profileOutboundMessage } from './profiling.js';
import {
	decodeLynxTransportValue,
	encodeLynxTransportValue,
	type LynxStructuredValue,
} from './transport-codec.js';
import {
	applyLynxHostAttachments,
	invalidateLynxClientContainer,
	isLynxClientEventTarget,
	prepareLynxCompactHandleDeltas,
	prepareLynxHandleDeltas,
	setLynxClientCapabilities,
	type LynxClientContainer,
} from './client-driver.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_COMPACT_ACKNOWLEDGEMENT,
	LYNX_LAZY_PUBLIC_INSTANCES,
	LYNX_TEARDOWN_RUN_READY_REQUEST_BASE,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_READY_ANNOUNCEMENT_REQUEST,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	countLynxCompactAcknowledgementHosts,
	sameLynxTransportIdentity,
	selfCheckLynxBackgroundOutboundMessage,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxBackgroundInboundMessage,
	type LynxBackgroundFunctionWireDescriptor,
	type LynxCallBackgroundMessage,
	type LynxCallMainErrorMessage,
	type LynxCallMainResultMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeAcknowledgement,
	type LynxDisposeRetryMessage,
	type LynxHostAttachmentMessage,
	type LynxHostFaultMessage,
	type LynxMainReadyReply,
	type LynxMainReadyRequest,
	type LynxMainThreadCapabilities,
	type LynxMainThreadWorkletWireDescriptor,
	type LynxTransportCommitMessage,
	type LynxTransportAcknowledgement,
} from './protocol.js';
import type { LynxBackgroundNativeEventDelivery } from './native-event-receiver.js';
import {
	isLynxMainThreadWorkletDescriptor,
	isolateLynxWorkletValue,
	type LynxWorkletValue,
} from './worklets.js';

export interface LynxBackgroundTransportOptions {
	readonly onDiagnostic?: (error: Error) => void;
	/** Page-lifetime tombstone checked after receiver attachment and before readiness. */
	readonly isPageDestroyed?: () => boolean;
	/** Transactionally bind renderer-local worklet handles at the complete-batch boundary. */
	readonly prepareWorkletBatch?: (batch: UniversalHostBatch) => UniversalHostBatch;
	/** Release or publish background execution lifetimes at the host acceptance boundary. */
	readonly onWorkletBatchAccepted?: (batch: UniversalHostBatch) => void;
	readonly onWorkletBatchRejected?: (batch: UniversalHostBatch) => void;
	readonly executeBackgroundFunction?: (
		fn: LynxBackgroundFunctionWireDescriptor,
		args: readonly UniversalSerializableValue[],
	) => unknown;
}

export interface LynxThreadCall<Result = UniversalSerializableValue> {
	readonly promise: Promise<Result>;
	cancel(reason?: unknown): void;
}

export interface LynxBackgroundTransport extends UniversalAsyncCommitTransport<LynxClientContainer> {
	readonly mode: 'async';
	readonly ready: Promise<void>;
	bindRoot(root: Pick<UniversalRoot, 'dispatchTransportEvent'>): void;
	/** Deliver one native propagation path received on the background thread. */
	dispatchNativeEventBatch(deliveries: readonly LynxBackgroundNativeEventDelivery[]): void;
	/** Bind logical background cleanup to the native page lifetime broadcast. */
	bindPageDestroy(handler: () => void | Promise<void>): void;
	acceptedIdentity(): UniversalTransportIdentity | null;
	/**
	 * Root this transport serves, known from its first commit — before any
	 * acknowledgement, and therefore before main can install a native token.
	 */
	ownedRoot(): number | null;
	/** Cancel commits that have not crossed the readiness/send boundary. */
	cancelPendingBeforeReady(reason?: unknown): Promise<boolean>;
	/** Internal facade state used to classify teardown without probing the host. */
	preparationCount(): number;
	closedReason(): Error | null;
	enableLogicalTeardown(): void;
	dispose(): Promise<void>;
	callMain(
		worklet: LynxMainThreadWorkletWireDescriptor,
		args: readonly UniversalSerializableValue[],
	): LynxThreadCall;
	close(reason?: unknown): void;
	diagnostics(): readonly Error[];
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly settled: boolean;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolvePromise!: (value: T) => void;
	let rejectPromise!: (error: unknown) => void;
	let settled = false;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		get settled() {
			return settled;
		},
		resolve(value) {
			if (settled) return;
			settled = true;
			resolvePromise(value);
		},
		reject(error) {
			if (settled) return;
			settled = true;
			rejectPromise(error);
		},
	};
}

interface PreparedTokenState {
	status: 'prepared' | 'applying' | 'settled' | 'aborted';
	entry: PendingCommit | null;
}

interface PendingCommit {
	readonly identity: UniversalTransportIdentity;
	readonly batch: UniversalHostBatch;
	readonly acknowledge: (message: UniversalTransportAcknowledgement) => void;
	readonly deferred: Deferred<void>;
	readonly token: PreparedTokenState;
	state: 'waiting-ready' | 'sent' | 'acknowledged';
	compactRequested: boolean;
	incrementalCompactRequested: boolean;
	compactHostCount: number | null;
	abortRequested: boolean;
	deferredResponse: CommitSettlement | null;
}

type CommitSettlement = Extract<
	LynxBackgroundInboundMessage,
	{ readonly type: 'complete' | 'reject' | 'fault' }
>;

interface PendingMainThreadCall {
	readonly call: number;
	readonly worklet: LynxMainThreadWorkletWireDescriptor;
	readonly args: readonly UniversalSerializableValue[];
	readonly deferred: Deferred<UniversalSerializableValue>;
	identity: UniversalTransportIdentity | null;
	state: 'queued' | 'sent';
}

interface RunningBackgroundCall {
	readonly identity: UniversalTransportIdentity;
	cancelled: boolean;
}

let NEXT_READY_REQUEST = 1;
const READINESS_SIGNAL_DELAY_MS = 16;
const MAX_DISPOSE_ATTEMPTS = 3;
const MAX_QUEUED_THREAD_CALLS = 128;

function isRootIndependentDataMessage(value: unknown): boolean {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	try {
		const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
		return (
			descriptor !== undefined &&
			Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
			(descriptor.value === 'page-data' || descriptor.value === 'global-props')
		);
	} catch {
		return false;
	}
}

function errorFrom(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	return new Error(value === undefined ? fallback : String(value));
}

function remoteError(error: { readonly name: string; readonly message: string }): Error {
	const result = new Error(error.message);
	result.name = error.name;
	return result;
}

function frozenIdentity(identity: UniversalTransportIdentity): UniversalTransportIdentity {
	return Object.freeze({
		protocol: identity.protocol,
		renderer: identity.renderer,
		root: identity.root,
		version: identity.version,
	});
}

function isLogicalTeardownBatch(batch: UniversalHostBatch): boolean {
	if (batch.commands.length === 0) return false;
	for (const command of batch.commands) {
		if (command.op === 'remove' || command.op === 'destroy') continue;
		if (
			(command.op === 'event' || command.op === 'lifecycle' || command.op === 'local-callback') &&
			command.listener === null
		) {
			continue;
		}
		return false;
	}
	return true;
}

export function createLynxBackgroundTransport(
	context: LynxContextProxy,
	container: LynxClientContainer,
	options: LynxBackgroundTransportOptions = {},
): LynxBackgroundTransport {
	if (UNIVERSAL_TRANSPORT_PROTOCOL_VERSION !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
		throw new Error('Octane Lynx transport protocol does not match the universal runtime.');
	}
	if (
		context === null ||
		typeof context !== 'object' ||
		typeof context.dispatchEvent !== 'function' ||
		typeof context.addEventListener !== 'function' ||
		typeof context.removeEventListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx background transport requires ContextProxy dispatchEvent/addEventListener/removeEventListener.',
		);
	}
	if (container.renderer !== LYNX_TRANSPORT_RENDERER) {
		throw new Error('Octane Lynx background transport received a foreign client container.');
	}

	const reported: Error[] = [];
	const pending = new Map<number, PendingCommit>();
	const pendingMainCalls = new Map<number, PendingMainThreadCall>();
	const runningBackgroundCalls = new Map<number, RunningBackgroundCall>();
	const readyRequest = LYNX_TEARDOWN_RUN_READY_REQUEST_BASE + NEXT_READY_REQUEST++;
	if (!Number.isSafeInteger(readyRequest)) {
		throw new Error('Octane Lynx capability-ready request identities are exhausted.');
	}
	const readinessRequest: LynxMainReadyRequest = Object.freeze({
		protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
		renderer: LYNX_TRANSPORT_RENDERER,
		type: 'main-ready-request',
		request: readyRequest,
	});
	const readyDeferred = createDeferred<void>();
	// A transport can be synchronously closed before a root observes `ready`.
	void readyDeferred.promise.catch(() => {});
	let accepted: UniversalTransportIdentity | null = null;
	let boundRoot: Pick<UniversalRoot, 'dispatchTransportEvent'> | null = null;
	let closedError: Error | null = null;
	let transportRoot: number | null = null;
	let readyReceived = false;
	let compactAcknowledgements = false;
	let lazyPublicInstances = false;
	let postFirstTreeLazyPublicInstances = false;
	let deferredFirstTreeCapabilities: LynxMainThreadCapabilities | undefined;
	let readinessSignal: ReturnType<typeof setTimeout> | null = null;
	let disposeDeferred: Deferred<void> | null = null;
	let disposeIdentity: UniversalTransportIdentity | null = null;
	let disposeAttempts = 0;
	let disposeRetryQueued = false;
	let dispatchingCommit: PendingCommit | null = null;
	let terminalDisposeIdentity: UniversalTransportIdentity | null = null;
	let terminalDisposeAttempts = 0;
	let terminalDisposeRetryQueued = false;
	let receiverAttached = false;
	let publishingAcknowledgement = false;
	let drainingMainThreadCalls = false;
	let mainThreadCallsNeedDrain = false;
	let preparationCount = 0;
	let logicalTeardownEnabled = false;
	let nextThreadCall = 1;
	let lastBackgroundCall = 0;
	let pageDestroyReceived = false;
	let pageDestroyHandler: (() => void | Promise<void>) | null = null;
	let pageDestroyHandlerInvoked = false;
	const finalizedWorkletBatches = new WeakSet<object>();

	const report = (error: unknown, fallback = 'Octane Lynx transport protocol error.') => {
		const normalized = errorFrom(error, fallback);
		reported.push(normalized);
		try {
			options.onDiagnostic?.(normalized);
		} catch (diagnosticError) {
			reported.push(errorFrom(diagnosticError, 'Octane Lynx diagnostic callback failed.'));
		}
		return normalized;
	};

	const finalizeWorkletBatch = (batch: UniversalHostBatch, acceptedByHost: boolean): void => {
		if (finalizedWorkletBatches.has(batch)) return;
		finalizedWorkletBatches.add(batch);
		try {
			(acceptedByHost ? options.onWorkletBatchAccepted : options.onWorkletBatchRejected)?.(batch);
		} catch (error) {
			report(error, 'Octane Lynx could not finalize background worklet lifetimes.');
		}
	};
	const reportEncodingDiagnostic = (error: Error): void => {
		report(error);
	};

	const dispatch = (message: Parameters<typeof validateLynxBackgroundOutboundMessage>[0]) => {
		if (closedError !== null) throw closedError;
		if (LYNX_PROFILE) {
			const profile = lynxWireProfile();
			const startedSelfCheck = performance.now();
			const validated = selfCheckLynxBackgroundOutboundMessage(message);
			const startedEncode = performance.now();
			const encoded = encodeLynxTransportValue(validated, reportEncodingDiagnostic);
			const startedDispatch = performance.now();
			context.dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: encoded });
			profile.dispatchMs += performance.now() - startedDispatch;
			profile.encodeMs += startedDispatch - startedEncode;
			profile.selfcheckMs += startedEncode - startedSelfCheck;
			profileOutboundMessage(profile, message, encoded);
			return;
		}
		const validated = selfCheckLynxBackgroundOutboundMessage(message);
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: encodeLynxTransportValue(validated, reportEncodingDiagnostic),
		});
	};

	const wireError = (value: unknown, fallback: string) => {
		const error = errorFrom(value, fallback);
		return Object.freeze({
			name: error.name.length === 0 ? 'Error' : error.name,
			message: error.message,
		});
	};

	const callIdentityMatches = (
		identity: UniversalTransportIdentity | null,
		message: UniversalTransportIdentity,
	): boolean => identity !== null && sameLynxTransportIdentity(identity, message);

	const sendMainThreadCall = (entry: PendingMainThreadCall): void => {
		if (accepted === null || entry.state !== 'queued') return;
		entry.identity = frozenIdentity(accepted);
		entry.state = 'sent';
		try {
			dispatch({
				...entry.identity,
				type: 'call-main',
				call: entry.call,
				worklet: entry.worklet,
				args: entry.args,
			});
		} catch (error) {
			// ContextProxy delivery may settle synchronously before dispatchEvent throws.
			// First settlement wins; never overwrite that result with the delivery error.
			if (pendingMainCalls.get(entry.call) !== entry) return;
			pendingMainCalls.delete(entry.call);
			entry.deferred.reject(report(error, 'Octane Lynx could not deliver a main-thread call.'));
		}
	};

	const drainMainThreadCalls = (): void => {
		if (
			accepted === null ||
			closedError !== null ||
			publishingAcknowledgement ||
			drainingMainThreadCalls ||
			!mainThreadCallsNeedDrain
		) {
			return;
		}
		drainingMainThreadCalls = true;
		try {
			// Map iterators preserve insertion order and include entries appended while
			// dispatch synchronously re-enters the background thread. Keeping one drain
			// active therefore prevents a newer call from overtaking queued lower IDs.
			for (const entry of pendingMainCalls.values()) {
				if (entry.state === 'queued') sendMainThreadCall(entry);
			}
			mainThreadCallsNeedDrain = false;
		} finally {
			drainingMainThreadCalls = false;
		}
	};

	const settleMainThreadCall = (
		message: LynxCallMainResultMessage | LynxCallMainErrorMessage,
	): void => {
		const entry = pendingMainCalls.get(message.call);
		if (entry === undefined) {
			report(
				new Error(
					`Octane Lynx received a late or duplicate main-thread call result ${message.call}.`,
				),
			);
			return;
		}
		if (!callIdentityMatches(entry.identity, message)) {
			report(
				new Error(
					`Octane Lynx received a stale or foreign main-thread call result ${message.call}.`,
				),
			);
			return;
		}
		pendingMainCalls.delete(message.call);
		if (message.type === 'call-main-result') {
			try {
				entry.deferred.resolve(
					isolateLynxWorkletValue(
						message.value as LynxWorkletValue,
						'main-thread call result',
					) as UniversalSerializableValue,
				);
			} catch (error) {
				entry.deferred.reject(report(error, 'Octane Lynx received an invalid main-thread result.'));
			}
		} else entry.deferred.reject(remoteError(message.error));
	};

	const dispatchBackgroundCallError = (
		message: LynxCallBackgroundMessage,
		error: unknown,
	): void => {
		try {
			dispatch({
				...frozenIdentity(message),
				type: 'call-background-error',
				call: message.call,
				error: wireError(error, 'Octane Lynx background function failed.'),
			});
		} catch (dispatchError) {
			report(dispatchError, 'Octane Lynx could not deliver a background call error.');
		}
	};

	const handleBackgroundCall = (message: LynxCallBackgroundMessage): void => {
		if (
			accepted === null ||
			message.root !== accepted.root ||
			message.version > accepted.version ||
			transportRoot !== message.root
		) {
			report(new Error(`Octane Lynx received a stale or foreign background call ${message.call}.`));
			dispatchBackgroundCallError(message, new Error('Octane Lynx background call is stale.'));
			return;
		}
		// The main side allocates call IDs monotonically and ContextProxy preserves
		// sender order. A scalar high-water mark rejects in-flight and settled
		// replays while keeping transport memory bounded for long-lived roots.
		if (message.call <= lastBackgroundCall) {
			report(new Error(`Octane Lynx received duplicate background call ${message.call}.`));
			return;
		}
		lastBackgroundCall = message.call;
		const running: RunningBackgroundCall = {
			identity: frozenIdentity(message),
			cancelled: false,
		};
		runningBackgroundCalls.set(message.call, running);
		let result: unknown;
		try {
			if (options.executeBackgroundFunction === undefined) {
				throw new Error('Octane Lynx has no background function registry installed.');
			}
			result = options.executeBackgroundFunction(message.fn, message.args);
		} catch (error) {
			runningBackgroundCalls.delete(message.call);
			dispatchBackgroundCallError(message, error);
			return;
		}
		void Promise.resolve(result).then(
			(value) => {
				if (
					runningBackgroundCalls.get(message.call) !== running ||
					running.cancelled ||
					closedError !== null
				) {
					return;
				}
				runningBackgroundCalls.delete(message.call);
				try {
					const isolated = isolateLynxWorkletValue(
						value as LynxWorkletValue,
						'background call result',
					);
					dispatch({
						...running.identity,
						type: 'call-background-result',
						call: message.call,
						value: isolated as UniversalSerializableValue,
					});
				} catch (error) {
					dispatchBackgroundCallError(message, error);
				}
			},
			(error) => {
				if (
					runningBackgroundCalls.get(message.call) !== running ||
					running.cancelled ||
					closedError !== null
				) {
					return;
				}
				runningBackgroundCalls.delete(message.call);
				dispatchBackgroundCallError(message, error);
			},
		);
	};

	const closeEntry = (entry: PendingCommit, error: unknown) => {
		if (pending.get(entry.identity.version) !== entry) return;
		pending.delete(entry.identity.version);
		if (entry.state !== 'acknowledged') finalizeWorkletBatch(entry.batch, false);
		entry.token.entry = null;
		entry.token.status = 'settled';
		entry.deferred.reject(error);
	};

	const completeEntry = (entry: PendingCommit) => {
		if (pending.get(entry.identity.version) !== entry) return;
		pending.delete(entry.identity.version);
		entry.token.entry = null;
		entry.token.status = 'settled';
		entry.deferred.resolve(undefined);
	};

	const entryFor = (message: UniversalTransportIdentity, label: string): PendingCommit | null => {
		const entry = pending.get(message.version);
		if (entry === undefined) {
			report(
				new Error(`Octane Lynx transport received late or duplicate ${label} ${message.version}.`),
			);
			return null;
		}
		if (!sameLynxTransportIdentity(entry.identity, message)) {
			report(
				new Error(`Octane Lynx transport received stale or foreign ${label} ${message.version}.`),
			);
			return null;
		}
		return entry;
	};

	const detachReceiver = (): void => {
		if (!receiverAttached) return;
		receiverAttached = false;
		try {
			context.removeEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
		} catch (removeError) {
			report(removeError, 'Octane Lynx failed to remove its transport listener.');
		}
	};

	const closeThreadCalls = (error: Error, notifyMain = true): void => {
		for (const entry of [...pendingMainCalls.values()]) {
			pendingMainCalls.delete(entry.call);
			if (notifyMain && entry.state === 'sent' && entry.identity !== null) {
				try {
					dispatch({ ...entry.identity, type: 'cancel-main', call: entry.call });
				} catch (cancelError) {
					report(cancelError, 'Octane Lynx could not cancel a closing main-thread call.');
				}
			}
			entry.deferred.reject(error);
		}
		for (const running of runningBackgroundCalls.values()) running.cancelled = true;
		runningBackgroundCalls.clear();
	};

	const stopReadinessSignal = (): void => {
		if (readinessSignal === null) return;
		clearTimeout(readinessSignal);
		readinessSignal = null;
	};

	const closeClientState = (
		error: Error,
		preserveDisposeResolution: boolean,
		notifyMain = true,
	): boolean => {
		if (closedError !== null) return false;
		stopReadinessSignal();
		closeThreadCalls(error, notifyMain);
		// Nothing will acknowledge a held native event once the transport closes.
		dropDeferredNativeEvents();
		closedError = error;
		readyDeferred.reject(error);
		for (const entry of [...pending.values()]) closeEntry(entry, error);
		if (!preserveDisposeResolution) disposeDeferred?.reject(error);
		try {
			invalidateLynxClientContainer(container);
		} catch (invalidationError) {
			report(invalidationError, 'Octane Lynx failed to invalidate its public handles.');
		}
		return true;
	};

	const closeInternal = (error: Error, preserveDisposeResolution: boolean) => {
		if (!closeClientState(error, preserveDisposeResolution)) return;
		detachReceiver();
	};

	const sendReadinessSignal = (): void => {
		readinessSignal = null;
		if (closedError !== null || readyReceived || readyDeferred.settled) {
			return;
		}
		try {
			dispatch(readinessRequest);
		} catch (error) {
			closeInternal(report(error, 'Octane Lynx failed to signal main readiness.'), false);
			return;
		}
		if (closedError === null && !readyReceived && !readyDeferred.settled) {
			readinessSignal = setTimeout(sendReadinessSignal, READINESS_SIGNAL_DELAY_MS);
		}
	};

	const startReadinessSignal = (): void => {
		if (
			closedError !== null ||
			readyReceived ||
			readyDeferred.settled ||
			readinessSignal !== null
		) {
			return;
		}
		sendReadinessSignal();
	};

	const queuePageDestroyHandler = (): void => {
		if (!pageDestroyReceived || pageDestroyHandler === null || pageDestroyHandlerInvoked) return;
		pageDestroyHandlerInvoked = true;
		const handler = pageDestroyHandler;
		// Let a synchronously rejected commit unwind before universal teardown stages
		// its logical remove batch. This keeps a destroy fired during PAPI work from
		// racing the transaction that was active when the lifetime ended.
		void Promise.resolve()
			.then(() => handler())
			.catch((error) => {
				report(error, 'Octane Lynx background page-destroy cleanup failed.');
			});
	};

	const handlePageDestroy = (): void => {
		if (pageDestroyReceived) return;
		pageDestroyReceived = true;
		terminalDisposeIdentity = null;
		terminalDisposeRetryQueued = false;
		logicalTeardownEnabled = true;
		closeClientState(new Error('Octane Lynx native page lifetime was destroyed.'), false, false);
		detachReceiver();
		queuePageDestroyHandler();
	};

	const finishTerminalDispose = (): void => {
		terminalDisposeIdentity = null;
		terminalDisposeRetryQueued = false;
		detachReceiver();
	};

	function queueTerminalDisposeRetry(error: Error): void {
		if (terminalDisposeIdentity === null) return;
		if (terminalDisposeAttempts >= MAX_DISPOSE_ATTEMPTS) {
			report(error, 'Octane Lynx terminal cleanup exhausted its retry budget.');
			finishTerminalDispose();
			return;
		}
		if (terminalDisposeRetryQueued) return;
		terminalDisposeRetryQueued = true;
		void Promise.resolve().then(() => {
			terminalDisposeRetryQueued = false;
			sendTerminalDisposeRequest();
		});
	}

	function sendTerminalDisposeRequest(): void {
		const identity = terminalDisposeIdentity;
		if (identity === null) return;
		terminalDisposeAttempts++;
		try {
			const message = validateLynxBackgroundOutboundMessage({
				...identity,
				type: 'terminal-dispose',
			});
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: encodeLynxTransportValue(message, reportEncodingDiagnostic),
			});
		} catch (disposeError) {
			queueTerminalDisposeRetry(
				report(
					disposeError,
					`Octane Lynx terminal cleanup attempt ${terminalDisposeAttempts} could not be delivered.`,
				),
			);
		}
	}

	const terminalCloseAfterHostAcceptance = (
		identity: UniversalTransportIdentity,
		error: Error,
	): void => {
		if (closedError !== null) return;
		const terminalIdentity = frozenIdentity(identity);
		terminalDisposeIdentity = terminalIdentity;
		terminalDisposeAttempts = 0;
		terminalDisposeRetryQueued = false;
		// Reject logical work and invalidate handles immediately, while retaining
		// only the inbound listener needed for asynchronous cleanup ACK/retry.
		closeClientState(error, false);
		sendTerminalDisposeRequest();
	};

	const publishAcknowledgementMainCalls = (message: LynxTransportAcknowledgement): boolean => {
		let hasQueuedCall = false;
		if (mainThreadCallsNeedDrain) {
			for (const entry of pendingMainCalls.values()) {
				if (entry.state !== 'queued') continue;
				hasQueuedCall = true;
				break;
			}
		}
		if (!hasQueuedCall) {
			mainThreadCallsNeedDrain = false;
			publishingAcknowledgement = false;
			return true;
		}

		let phase: 'open' | 'calls' | 'close' = 'open';
		try {
			// Keep acknowledgement publication closed to direct sends until main has
			// opened the matching ref-owner lifetime window. ContextProxy sender order
			// then places every queued call before the close marker, even when the two
			// runtimes take a microtask checkpoint between individual messages.
			dispatch({ ...frozenIdentity(message), type: 'main-call-publication', phase: 'open' });
			phase = 'calls';
			publishingAcknowledgement = false;
			drainMainThreadCalls();
			phase = 'close';
			dispatch({ ...frozenIdentity(message), type: 'main-call-publication', phase: 'close' });
			return true;
		} catch (error) {
			terminalCloseAfterHostAcceptance(
				message,
				report(error, `Octane Lynx could not publish acknowledgement-time main-thread ${phase}.`),
			);
			return false;
		} finally {
			publishingAcknowledgement = false;
		}
	};

	const handleReady = (message: LynxMainReadyReply) => {
		if (message.request === LYNX_READY_ANNOUNCEMENT_REQUEST) {
			if (readyReceived || readyDeferred.settled) return;
			// Request 0 is only an availability hint. Re-send this transport's
			// correlation ID so main can order queued page data before the reply.
			stopReadinessSignal();
			startReadinessSignal();
			return;
		}
		if (message.request !== readyRequest) {
			report(
				new Error(`Octane Lynx transport received foreign main-ready request ${message.request}.`),
			);
			return;
		}
		if (readyReceived || readyDeferred.settled) {
			return;
		}
		const adoptingFirstTree = message.firstTree !== undefined;
		const capabilities = adoptingFirstTree ? undefined : message.capabilities;
		// The first background batch must preserve main's exact first-screen IDs.
		// New peers can advertise future intrinsic programs on the same correlated
		// reply; older peers never advertised templateProgram alongside firstTree.
		deferredFirstTreeCapabilities =
			adoptingFirstTree && message.capabilities?.templateProgram === 1
				? message.capabilities
				: undefined;
		compactAcknowledgements = capabilities?.compactAck === 1;
		lazyPublicInstances = capabilities?.lazyPublicInstances === 1;
		setLynxClientCapabilities(container, capabilities);
		readyReceived = true;
		stopReadinessSignal();
		readyDeferred.resolve(undefined);
	};

	const handleAcknowledgement = (message: LynxTransportAcknowledgement) => {
		const entry = entryFor(message, 'acknowledgement');
		if (entry === null) return;
		if (entry.state !== 'sent') {
			report(
				new Error(
					`Octane Lynx transport received an acknowledgement while batch ${message.version} was ${entry.state}.`,
				),
			);
			return;
		}
		let handles;
		const previousAccepted = accepted;
		try {
			if (message.encoding === LYNX_COMPACT_ACKNOWLEDGEMENT) {
				if (
					!compactAcknowledgements ||
					!entry.compactRequested ||
					(previousAccepted !== null && !entry.incrementalCompactRequested)
				) {
					throw new Error('Octane Lynx received an unnegotiated compact acknowledgement.');
				}
				handles = prepareLynxCompactHandleDeltas(
					container,
					entry.batch,
					message.count,
					message,
					entry.compactHostCount ?? undefined,
					entry.incrementalCompactRequested,
				);
			} else {
				handles = prepareLynxHandleDeltas(container, entry.batch, message.handles, message);
			}
			// Applying handle deltas and acceptance callbacks can invoke user code.
			// Queue any resulting calls until all older pre-acceptance IDs can drain.
			publishingAcknowledgement = true;
			handles.apply();
			entry.state = 'acknowledged';
			accepted = frozenIdentity(message);
			finalizeWorkletBatch(entry.batch, true);
			entry.acknowledge(message);
		} catch (error) {
			publishingAcknowledgement = false;
			accepted = previousAccepted;
			handles?.rollback();
			const terminalError = report(
				error,
				`Octane Lynx could not accept acknowledgement ${message.version}.`,
			);
			// Main emits ACK only after crossing the physical mutation boundary. If
			// background validation fails here, neither side can safely continue.
			terminalCloseAfterHostAcceptance(message, terminalError);
			return;
		}
		if (message.adoption === 'adopted') {
			try {
				dispatch({ ...frozenIdentity(message), type: 'adoption-ready' });
			} catch (error) {
				publishingAcknowledgement = false;
				terminalCloseAfterHostAcceptance(
					message,
					report(error, `Octane Lynx could not confirm adoption ${message.version}.`),
				);
				return;
			}
		}
		if (
			(message.adoption === 'adopted' || message.adoption === 'repaired') &&
			deferredFirstTreeCapabilities !== undefined
		) {
			// Main releases the adopted journal synchronously while handling
			// adoption-ready; repaired journals are disposed before their ACK.
			// The first adopted batch remains legacy. A later safe run can reuse
			// compact-v1 only after this identity-correlated handoff completes.
			setLynxClientCapabilities(container, deferredFirstTreeCapabilities);
			compactAcknowledgements = deferredFirstTreeCapabilities.compactAck === 1;
			lazyPublicInstances = deferredFirstTreeCapabilities.lazyPublicInstances === 1;
			postFirstTreeLazyPublicInstances = deferredFirstTreeCapabilities.lazyPublicInstances === 1;
			deferredFirstTreeCapabilities = undefined;
		}
		publishAcknowledgementMainCalls(message);
		// The acknowledgement just published this batch's hosts, which is what a
		// tap racing main's apply was waiting for.
		flushDeferredNativeEvents();
	};

	const settleCommitResponse = (entry: PendingCommit, message: CommitSettlement): void => {
		if (message.type === 'complete') {
			completeEntry(entry);
			return;
		}
		if (message.type === 'reject') {
			closeEntry(entry, remoteError(message.error));
			return;
		}
		closeEntry(entry, remoteError(message.error));
	};

	const handleCommitResponse = (message: LynxBackgroundInboundMessage) => {
		if (message.type === 'ack') {
			handleAcknowledgement(message);
			return;
		}
		if (
			message.type === 'call-background' ||
			message.type === 'cancel-background' ||
			message.type === 'call-main-result' ||
			message.type === 'call-main-error' ||
			message.type === 'event' ||
			message.type === 'host-attachment' ||
			message.type === 'host-fault' ||
			message.type === 'dispose-ack' ||
			message.type === 'dispose-retry' ||
			message.type === 'main-ready' ||
			message.type === 'page-destroy' ||
			message.type === 'page-data' ||
			message.type === 'global-props'
		) {
			return;
		}
		const entry = entryFor(message, message.type);
		if (entry === null) return;
		if (message.type === 'complete') {
			if (entry.state !== 'acknowledged') {
				const error = report(
					new Error(
						`Octane Lynx transport completed batch ${message.version} before acknowledgement.`,
					),
				);
				terminalCloseAfterHostAcceptance(message, error);
				return;
			}
			if (dispatchingCommit === entry) entry.deferredResponse = message;
			else settleCommitResponse(entry, message);
			return;
		}
		if (message.type === 'reject') {
			if (entry.state === 'acknowledged') {
				const error = report(
					new Error(
						`Octane Lynx transport received pre-ACK rejection after batch ${message.version} was accepted.`,
					),
				);
				terminalCloseAfterHostAcceptance(message, error);
				return;
			}
			if (dispatchingCommit === entry) entry.deferredResponse = message;
			else settleCommitResponse(entry, message);
			return;
		}
		if (entry.state !== 'acknowledged') {
			const error = report(
				new Error(`Octane Lynx transport faulted batch ${message.version} before acknowledgement.`),
			);
			terminalCloseAfterHostAcceptance(message, error);
			return;
		}
		if (dispatchingCommit === entry) entry.deferredResponse = message;
		else settleCommitResponse(entry, message);
	};

	/**
	 * A native tap can land between main applying a commit and this thread
	 * accepting its acknowledgement.
	 *
	 * Main installs `__AddEvent` tokens while it applies a commit, so the element
	 * is tappable the moment that apply lands. The acknowledgement that teaches
	 * this thread the host's generation and attachment is still in flight, and a
	 * tap is an engine call rather than a ContextProxy message, so it can arrive
	 * first. Such a delivery is early, not stale: it names a host that genuinely
	 * exists on main. Hold it for the acknowledgement it is racing, then dispatch
	 * or diagnose it. `acknowledgements` is the grace it has left; one is exact,
	 * because main sends the acknowledgement immediately after the apply that
	 * installed the token.
	 */
	interface DeferredNativeEventBatch {
		readonly deliveries: readonly LynxBackgroundNativeEventDelivery[];
		readonly priority: UniversalEventPriority;
		acknowledgements: number;
	}

	const MAX_DEFERRED_NATIVE_EVENT_DELIVERIES = 64;
	let deferredNativeEvents: DeferredNativeEventBatch[] = [];

	const resolveNativeEventBatch = (
		batch: DeferredNativeEventBatch,
	): readonly UniversalTransportEventDelivery[] | null => {
		if (accepted === null) return null;
		const transported: UniversalTransportEventDelivery[] = [];
		for (const delivery of batch.deliveries) {
			const { identity } = delivery;
			// The background owns the listener table but main owns the physical
			// tree, so the generation and attachment recorded at acknowledgement
			// are what prove this token still names a live, mounted host.
			if (
				identity.root !== accepted.root ||
				!isLynxClientEventTarget(container, identity.root, identity.id, identity.generation)
			) {
				return null;
			}
			transported.push({ listener: identity.listener, payload: delivery.payload });
		}
		return Object.freeze(transported);
	};

	const dispatchNativeEventBatchNow = (
		batch: DeferredNativeEventBatch,
		transported: readonly UniversalTransportEventDelivery[],
	): void => {
		handleEvent({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: accepted!.root,
			version: accepted!.version,
			type: 'event',
			priority: batch.priority,
			deliveries: transported,
		});
	};

	const reportUnresolvedNativeEventBatch = (batch: DeferredNativeEventBatch): void => {
		const first = batch.deliveries[0]!.identity;
		report(
			new Error(
				`Octane Lynx received a stale native event for host ${first.id}:${first.generation}.`,
			),
		);
	};

	const deferNativeEventBatch = (batch: DeferredNativeEventBatch): void => {
		const transported = resolveNativeEventBatch(batch);
		if (transported !== null) {
			dispatchNativeEventBatchNow(batch, transported);
			return;
		}
		const queued = deferredNativeEvents.reduce((count, held) => count + held.deliveries.length, 0);
		if (queued + batch.deliveries.length > MAX_DEFERRED_NATIVE_EVENT_DELIVERIES) {
			report(
				new Error(
					`Octane Lynx dropped a native event batch after ${MAX_DEFERRED_NATIVE_EVENT_DELIVERIES} deliveries awaiting acknowledgement.`,
				),
			);
			return;
		}
		deferredNativeEvents.push(batch);
	};

	/** Retry deliveries held for an acknowledgement, once that acknowledgement lands. */
	const flushDeferredNativeEvents = (): void => {
		if (deferredNativeEvents.length === 0) return;
		const held = deferredNativeEvents;
		deferredNativeEvents = [];
		for (const batch of held) {
			const transported = resolveNativeEventBatch(batch);
			if (transported !== null) {
				dispatchNativeEventBatchNow(batch, transported);
				continue;
			}
			if (--batch.acknowledgements <= 0) {
				reportUnresolvedNativeEventBatch(batch);
				continue;
			}
			deferredNativeEvents.push(batch);
		}
	};

	/** Fail deliveries that can no longer be acknowledged by anything. */
	const dropDeferredNativeEvents = (): void => {
		if (deferredNativeEvents.length === 0) return;
		const held = deferredNativeEvents;
		deferredNativeEvents = [];
		for (const batch of held) reportUnresolvedNativeEventBatch(batch);
	};

	const handleEvent = (message: Extract<LynxBackgroundInboundMessage, { type: 'event' }>) => {
		if (accepted === null || !sameLynxTransportIdentity(accepted, message)) {
			report(
				new Error(`Octane Lynx transport received a stale or foreign event ${message.version}.`),
			);
			return;
		}
		if (boundRoot === null) {
			report(new Error('Octane Lynx transport received an event before the root was bound.'));
			return;
		}
		try {
			boundRoot.dispatchTransportEvent(message);
		} catch (error) {
			report(error, 'Octane Lynx transported event failed.');
		}
	};

	const handleHostAttachment = (message: LynxHostAttachmentMessage): void => {
		if (accepted === null || !sameLynxTransportIdentity(accepted, message)) {
			report(
				new Error(
					`Octane Lynx transport received a stale or foreign host attachment ${message.version}.`,
				),
			);
			return;
		}
		try {
			applyLynxHostAttachments(container, message.changes);
		} catch (error) {
			terminalCloseAfterHostAcceptance(
				message,
				report(error, 'Octane Lynx transported host attachment failed.'),
			);
		}
	};

	const handleHostFault = (message: LynxHostFaultMessage): void => {
		if (accepted === null || !sameLynxTransportIdentity(accepted, message)) {
			report(
				new Error(
					`Octane Lynx transport received a stale or foreign host fault ${message.version}.`,
				),
			);
			return;
		}
		terminalCloseAfterHostAcceptance(message, remoteError(message.error));
	};

	const handleCancelBackgroundCall = (
		message: Extract<LynxBackgroundInboundMessage, { type: 'cancel-background' }>,
	): void => {
		const running = runningBackgroundCalls.get(message.call);
		if (running === undefined) {
			report(
				new Error(
					`Octane Lynx received a late or duplicate background cancellation ${message.call}.`,
				),
			);
			return;
		}
		if (!sameLynxTransportIdentity(running.identity, message)) {
			report(
				new Error(
					`Octane Lynx received a stale or foreign background cancellation ${message.call}.`,
				),
			);
			return;
		}
		runningBackgroundCalls.delete(message.call);
		running.cancelled = true;
	};

	function queueDisposeRetry(error: Error): void {
		if (disposeDeferred === null || disposeDeferred.settled || closedError !== null) return;
		if (disposeAttempts >= MAX_DISPOSE_ATTEMPTS) {
			closeInternal(error, false);
			return;
		}
		if (disposeRetryQueued) return;
		disposeRetryQueued = true;
		void Promise.resolve().then(() => {
			disposeRetryQueued = false;
			sendDisposeRequest();
		});
	}

	function sendDisposeRequest(): void {
		const deferred = disposeDeferred;
		const identity = disposeIdentity;
		if (deferred === null || deferred.settled || identity === null || closedError !== null) {
			return;
		}
		disposeAttempts++;
		try {
			dispatch({ ...identity, type: 'dispose' });
		} catch (error) {
			queueDisposeRetry(
				report(error, `Octane Lynx dispose attempt ${disposeAttempts} could not be delivered.`),
			);
		}
	}

	const handleDisposeAcknowledgement = (message: LynxDisposeAcknowledgement) => {
		if (
			terminalDisposeIdentity !== null &&
			sameLynxTransportIdentity(terminalDisposeIdentity, message)
		) {
			finishTerminalDispose();
			return;
		}
		const deferred = disposeDeferred;
		if (
			deferred === null ||
			deferred.settled ||
			disposeIdentity === null ||
			!sameLynxTransportIdentity(disposeIdentity, message)
		) {
			report(
				new Error('Octane Lynx transport received a late or foreign dispose acknowledgement.'),
			);
			return;
		}
		deferred.resolve(undefined);
		closeInternal(new Error('Octane Lynx background transport was disposed.'), true);
	};

	const handleDisposeRetry = (message: LynxDisposeRetryMessage): void => {
		if (
			terminalDisposeIdentity !== null &&
			sameLynxTransportIdentity(terminalDisposeIdentity, message)
		) {
			queueTerminalDisposeRetry(
				report(
					remoteError(message.error),
					'Octane Lynx main thread requested terminal cleanup retry.',
				),
			);
			return;
		}
		if (
			disposeDeferred === null ||
			disposeDeferred.settled ||
			disposeIdentity === null ||
			!sameLynxTransportIdentity(disposeIdentity, message)
		) {
			report(new Error('Octane Lynx transport received a late or foreign dispose retry.'));
			return;
		}
		queueDisposeRetry(
			report(remoteError(message.error), 'Octane Lynx main thread requested a dispose retry.'),
		);
	};

	const rejectExpectedMalformed = (value: unknown, error: Error) => {
		if (value === null || typeof value !== 'object') return;
		const raw = value as Record<string, unknown>;
		if (
			(raw.type === 'call-main-result' || raw.type === 'call-main-error') &&
			Number.isSafeInteger(raw.call) &&
			(raw.call as number) > 0
		) {
			const entry = pendingMainCalls.get(raw.call as number);
			if (
				entry?.identity !== null &&
				entry?.identity !== undefined &&
				raw.protocol === entry.identity.protocol &&
				raw.renderer === entry.identity.renderer &&
				raw.root === entry.identity.root &&
				raw.version === entry.identity.version
			) {
				pendingMainCalls.delete(entry.call);
				entry.deferred.reject(error);
				return;
			}
		}
		if (
			raw.type === 'call-background' &&
			accepted !== null &&
			Number.isSafeInteger(raw.call) &&
			(raw.call as number) > 0 &&
			raw.protocol === accepted.protocol &&
			raw.renderer === accepted.renderer &&
			raw.root === accepted.root &&
			raw.root === transportRoot &&
			Number.isSafeInteger(raw.version) &&
			(raw.version as number) > 0 &&
			(raw.version as number) <= accepted.version
		) {
			try {
				dispatch({
					protocol: accepted.protocol,
					renderer: accepted.renderer,
					root: accepted.root,
					version: raw.version as number,
					type: 'call-background-error',
					call: raw.call as number,
					error: wireError(error, 'Octane Lynx received a malformed background call.'),
				});
			} catch (dispatchError) {
				closeInternal(
					report(dispatchError, 'Octane Lynx could not reject a malformed background call.'),
					false,
				);
			}
			return;
		}
		if (
			raw.type === 'main-ready' &&
			(raw.request === readyRequest || raw.request === LYNX_READY_ANNOUNCEMENT_REQUEST) &&
			!readyDeferred.settled
		) {
			closeInternal(error, false);
			return;
		}
		if (
			(raw.type === 'dispose-ack' || raw.type === 'dispose-retry') &&
			terminalDisposeIdentity !== null &&
			raw.protocol === terminalDisposeIdentity.protocol &&
			raw.renderer === terminalDisposeIdentity.renderer &&
			raw.root === terminalDisposeIdentity.root &&
			raw.version === terminalDisposeIdentity.version
		) {
			queueTerminalDisposeRetry(error);
			return;
		}
		if (
			(raw.type === 'dispose-ack' || raw.type === 'dispose-retry') &&
			disposeDeferred !== null &&
			!disposeDeferred.settled &&
			disposeIdentity !== null &&
			raw.protocol === disposeIdentity.protocol &&
			raw.renderer === disposeIdentity.renderer &&
			raw.root === disposeIdentity.root &&
			raw.version === disposeIdentity.version
		) {
			queueDisposeRetry(error);
			return;
		}
		if (
			(raw.type === 'host-fault' || raw.type === 'host-attachment') &&
			accepted !== null &&
			raw.protocol === accepted.protocol &&
			raw.renderer === accepted.renderer &&
			raw.root === accepted.root &&
			raw.version === accepted.version
		) {
			// These unsolicited messages are emitted only for an already-mutated
			// accepted root. A malformed exact identity is therefore fail-stop; a
			// stale or foreign identity remains diagnostic-only.
			terminalCloseAfterHostAcceptance(accepted, error);
			return;
		}
		if (!Number.isSafeInteger(raw.version)) return;
		const entry = pending.get(raw.version as number);
		if (
			entry !== undefined &&
			raw.protocol === entry.identity.protocol &&
			raw.renderer === entry.identity.renderer &&
			raw.root === entry.identity.root
		) {
			if (
				(entry.state === 'sent' &&
					(raw.type === 'ack' || raw.type === 'complete' || raw.type === 'fault')) ||
				(entry.state === 'acknowledged' &&
					(raw.type === 'ack' ||
						raw.type === 'complete' ||
						raw.type === 'fault' ||
						raw.type === 'reject'))
			) {
				// These responses are emitted only after main has already mutated.
				terminalCloseAfterHostAcceptance(entry.identity, error);
			} else {
				closeEntry(entry, error);
			}
		}
	};

	function receive(event: LynxContextProxyEvent): void {
		// Decode before anything reads the payload. `event.data` is whatever the
		// host handed across, and on device that can be a native-backed reference
		// that throws on `Reflect.ownKeys` and answers `Object(v) !== v`; every
		// read below is written for ordinary local data, so the materialization
		// has to happen first or not at all.
		let data: LynxStructuredValue;
		try {
			data = decodeLynxTransportValue(event.data);
		} catch (error) {
			if (closedError !== null && terminalDisposeIdentity === null) return;
			// Nothing in an undecodable payload is safe to reflect on, so unlike a
			// schema failure there is no identity to recover and no pending call to
			// reject against — it can only be reported and dropped.
			report(error, 'Octane Lynx received an inbound message it could not decode.');
			return;
		}
		if (isRootIndependentDataMessage(data)) return;
		if (closedError !== null && terminalDisposeIdentity === null) return;
		let message: LynxBackgroundInboundMessage;
		try {
			message = validateLynxBackgroundInboundMessage(data);
		} catch (error) {
			const normalized = report(error, 'Octane Lynx received a malformed inbound message.');
			rejectExpectedMalformed(data, normalized);
			return;
		}
		if (message.type === 'page-destroy') {
			handlePageDestroy();
			return;
		}
		if (closedError !== null) {
			if (message.type === 'dispose-ack') handleDisposeAcknowledgement(message);
			else if (message.type === 'dispose-retry') handleDisposeRetry(message);
			return;
		}
		if (message.type === 'page-data' || message.type === 'global-props') {
			// Root-independent data is owned by the page-lifetime background receiver.
			return;
		}
		if (message.type === 'main-ready') {
			handleReady(message);
			return;
		}
		if (message.type === 'call-main-result' || message.type === 'call-main-error') {
			settleMainThreadCall(message);
			return;
		}
		if (message.type === 'call-background') {
			handleBackgroundCall(message);
			return;
		}
		if (message.type === 'cancel-background') {
			handleCancelBackgroundCall(message);
			return;
		}
		if (message.type === 'event') {
			handleEvent(message);
			return;
		}
		if (message.type === 'host-attachment') {
			handleHostAttachment(message);
			return;
		}
		if (message.type === 'host-fault') {
			handleHostFault(message);
			return;
		}
		if (message.type === 'dispose-ack') {
			handleDisposeAcknowledgement(message);
			return;
		}
		if (message.type === 'dispose-retry') {
			handleDisposeRetry(message);
			return;
		}
		handleCommitResponse(message);
	}

	receiverAttached = true;
	try {
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
	} catch (error) {
		const registrationError = report(
			error,
			'Octane Lynx failed to install its background transport listener.',
		);
		closeInternal(registrationError, false);
		throw registrationError;
	}
	let pageDestroyedBeforeReady = false;
	try {
		pageDestroyedBeforeReady = options.isPageDestroyed?.() === true;
	} catch (error) {
		const tombstoneError = report(
			error,
			'Octane Lynx failed to read its native page-lifetime tombstone.',
		);
		closeInternal(tombstoneError, false);
		throw tombstoneError;
	}
	if (pageDestroyedBeforeReady) {
		handlePageDestroy();
	} else {
		startReadinessSignal();
	}

	const transport: LynxBackgroundTransport = {
		mode: 'async',
		ready: readyDeferred.promise,
		prepareBatch(target, batch, identity): UniversalAsyncPreparedHostBatch {
			if (target !== container) {
				throw new Error('Octane Lynx transport received a foreign client container.');
			}
			preparationCount++;
			if (closedError !== null) {
				if (!logicalTeardownEnabled || !isLogicalTeardownBatch(batch)) throw closedError;
				if (
					identity.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION ||
					identity.renderer !== LYNX_TRANSPORT_RENDERER ||
					identity.version !== batch.version ||
					!Number.isSafeInteger(identity.root) ||
					identity.root <= 0
				) {
					throw new Error('Octane Lynx logical teardown received a foreign identity.');
				}
				let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
				return Object.freeze({
					apply(acknowledge: (message: UniversalTransportAcknowledgement) => void) {
						if (status !== 'prepared') {
							return Promise.reject(
								new Error('Octane Lynx logical teardown apply() may only run once.'),
							);
						}
						status = 'applied';
						logicalTeardownEnabled = false;
						const previousAccepted = accepted;
						accepted = frozenIdentity(identity);
						try {
							acknowledge({ ...identity, type: 'ack' });
							return Promise.resolve();
						} catch (error) {
							accepted = previousAccepted;
							return Promise.reject(error);
						}
					},
					abort() {
						if (status === 'prepared') status = 'aborted';
					},
				});
			}
			const preparedBatch = options.prepareWorkletBatch?.(batch) ?? batch;
			const commit: LynxTransportCommitMessage = {
				...identity,
				type: 'commit',
				batch: preparedBatch,
			};
			try {
				selfCheckLynxBackgroundOutboundMessage(commit);
			} catch (error) {
				finalizeWorkletBatch(preparedBatch, false);
				throw error;
			}
			const token: PreparedTokenState = { status: 'prepared', entry: null };
			return {
				apply(acknowledge) {
					if (token.status !== 'prepared') {
						return Promise.reject(
							new Error('Octane Lynx prepared batch apply() may only run once.'),
						);
					}
					if (closedError !== null) {
						finalizeWorkletBatch(preparedBatch, false);
						return Promise.reject(closedError);
					}
					if (transportRoot === null) transportRoot = identity.root;
					else if (transportRoot !== identity.root) {
						finalizeWorkletBatch(preparedBatch, false);
						return Promise.reject(new Error('Octane Lynx transport cannot serve a foreign root.'));
					}
					if (pending.has(identity.version)) {
						finalizeWorkletBatch(preparedBatch, false);
						return Promise.reject(
							new Error(`Octane Lynx transport already has batch ${identity.version}.`),
						);
					}
					token.status = 'applying';
					const entry: PendingCommit = {
						identity: frozenIdentity(identity),
						batch: preparedBatch,
						acknowledge,
						deferred: createDeferred<void>(),
						token,
						state: 'waiting-ready',
						compactRequested: false,
						incrementalCompactRequested: false,
						compactHostCount: null,
						abortRequested: false,
						deferredResponse: null,
					};
					token.entry = entry;
					pending.set(identity.version, entry);
					void readyDeferred.promise.then(
						() => {
							if (pending.get(identity.version) !== entry) return;
							entry.state = 'sent';
							const count = compactAcknowledgements
								? countLynxCompactAcknowledgementHosts(preparedBatch)
								: null;
							const compact = count !== null;
							entry.compactRequested = compact;
							entry.compactHostCount = count;
							const incrementalRun =
								preparedBatch.commands.length === 1 ? preparedBatch.commands[0] : undefined;
							entry.incrementalCompactRequested =
								compact &&
								accepted !== null &&
								postFirstTreeLazyPublicInstances &&
								incrementalRun?.op === 'mount-template-run' &&
								Object.isFrozen(incrementalRun) &&
								Object.isFrozen(incrementalRun.program) &&
								Object.isFrozen(incrementalRun.values);
							const deferPublicInstances =
								compact &&
								lazyPublicInstances &&
								(accepted === null ||
									(postFirstTreeLazyPublicInstances &&
										preparedBatch.commands.every(
											(command) =>
												command.op === 'mount-template-range' ||
												command.op === 'mount-template-run',
										))) &&
								preparedBatch.commands.some(
									(command) =>
										command.op === 'mount-template-range' || command.op === 'mount-template-run',
								);
							const outboundCommit: LynxTransportCommitMessage = compact
								? {
										...commit,
										ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
										...(deferPublicInstances ? { instances: LYNX_LAZY_PUBLIC_INSTANCES } : null),
									}
								: commit;
							let dispatchError: Error | null = null;
							dispatchingCommit = entry;
							try {
								dispatch(outboundCommit);
							} catch (error) {
								dispatchError = report(
									error,
									`Octane Lynx could not deliver commit ${identity.version}.`,
								);
							} finally {
								dispatchingCommit = null;
							}
							if (dispatchError !== null) {
								terminalCloseAfterHostAcceptance(entry.identity, dispatchError);
								return;
							}
							const response = entry.deferredResponse;
							entry.deferredResponse = null;
							if (response !== null && pending.get(identity.version) === entry) {
								settleCommitResponse(entry, response);
							}
						},
						(error) => closeEntry(entry, error),
					);
					return entry.deferred.promise;
				},
				abort() {
					if (token.status === 'aborted' || token.status === 'settled') return;
					if (token.status === 'prepared') {
						token.status = 'aborted';
						finalizeWorkletBatch(preparedBatch, false);
						return;
					}
					const entry = token.entry;
					if (entry === null || entry.state === 'acknowledged') return;
					if (entry.state === 'waiting-ready') {
						token.status = 'aborted';
						closeEntry(
							entry,
							new Error(`Octane Lynx transport batch ${entry.identity.version} was aborted.`),
						);
						return;
					}
					if (entry.abortRequested) return;
					entry.abortRequested = true;
					try {
						dispatch({ ...entry.identity, type: 'abort' });
					} catch (error) {
						terminalCloseAfterHostAcceptance(
							entry.identity,
							report(error, 'Octane Lynx failed to send an abort.'),
						);
					}
				},
			};
		},
		bindRoot(root) {
			if (boundRoot !== null && boundRoot !== root) {
				throw new Error('Octane Lynx transport is already bound to another root.');
			}
			boundRoot = root;
		},
		bindPageDestroy(handler) {
			if (typeof handler !== 'function') {
				throw new TypeError('Octane Lynx page-destroy handler must be a function.');
			}
			if (pageDestroyHandler !== null && pageDestroyHandler !== handler) {
				throw new Error('Octane Lynx transport already has a page-destroy handler.');
			}
			pageDestroyHandler = handler;
			queuePageDestroyHandler();
		},
		acceptedIdentity() {
			return accepted;
		},
		ownedRoot() {
			return transportRoot;
		},
		dispatchNativeEventBatch(deliveries) {
			if (deliveries.length === 0) return;
			if (closedError !== null) {
				report(closedError, 'Octane Lynx received a native event after the transport closed.');
				return;
			}
			const priority = deliveries[0]!.identity.priority;
			for (const delivery of deliveries) {
				const { identity } = delivery;
				if (transportRoot !== null && identity.root !== transportRoot) {
					report(
						new Error(`Octane Lynx received a foreign native event for root ${identity.root}.`),
					);
					return;
				}
				if (identity.priority !== priority) {
					report(new Error('Octane Lynx native event batch mixes listener priorities.'));
					return;
				}
			}
			deferNativeEventBatch({ deliveries, priority, acknowledgements: 1 });
		},
		async cancelPendingBeforeReady(reason) {
			if (closedError !== null || accepted !== null || pending.size === 0) return false;
			const entries = [...pending.values()];
			if (entries.some((entry) => entry.state !== 'waiting-ready')) return false;
			const settlements = entries.map((entry) => entry.deferred.promise.then(undefined, () => {}));
			closeInternal(
				errorFrom(reason, 'Octane Lynx root was unmounted before main became ready.'),
				false,
			);
			await Promise.all(settlements);
			return true;
		},
		preparationCount() {
			return preparationCount;
		},
		closedReason() {
			return closedError;
		},
		enableLogicalTeardown() {
			logicalTeardownEnabled = true;
		},
		dispose() {
			if (disposeDeferred !== null) return disposeDeferred.promise;
			if (closedError !== null) return Promise.reject(closedError);
			if (accepted === null) {
				return Promise.reject(
					new Error('Octane Lynx transport cannot dispose before a batch is accepted.'),
				);
			}
			disposeIdentity = accepted;
			disposeDeferred = createDeferred<void>();
			const deferred = disposeDeferred;
			void readyDeferred.promise.then(
				() => {
					if (deferred.settled || disposeIdentity === null) return;
					sendDisposeRequest();
				},
				(error) => deferred.reject(error),
			);
			return deferred.promise;
		},
		callMain(worklet, args) {
			if (closedError !== null) {
				const deferred = createDeferred<UniversalSerializableValue>();
				deferred.reject(closedError);
				return Object.freeze({ promise: deferred.promise, cancel() {} });
			}
			if (pendingMainCalls.size >= MAX_QUEUED_THREAD_CALLS) {
				const deferred = createDeferred<UniversalSerializableValue>();
				deferred.reject(
					new Error(
						`Octane Lynx main-thread call queue is limited to ${MAX_QUEUED_THREAD_CALLS} entries.`,
					),
				);
				return Object.freeze({ promise: deferred.promise, cancel() {} });
			}
			if (nextThreadCall > Number.MAX_SAFE_INTEGER) {
				const deferred = createDeferred<UniversalSerializableValue>();
				deferred.reject(new Error('Octane Lynx main-thread call identity space is exhausted.'));
				return Object.freeze({ promise: deferred.promise, cancel() {} });
			}
			const isolatedWorklet = isolateLynxWorkletValue(
				worklet as LynxWorkletValue,
				'main-thread call target',
			);
			if (!isLynxMainThreadWorkletDescriptor(isolatedWorklet)) {
				throw new TypeError('Octane Lynx main-thread call target is invalid.');
			}
			const isolatedArgs = isolateLynxWorkletValue(
				args as unknown as LynxWorkletValue[],
				'main-thread call arguments',
			);
			const entry: PendingMainThreadCall = {
				call: nextThreadCall++,
				worklet: isolatedWorklet as LynxMainThreadWorkletWireDescriptor,
				args: isolatedArgs as readonly UniversalSerializableValue[],
				deferred: createDeferred<UniversalSerializableValue>(),
				identity: null,
				state: 'queued',
			};
			pendingMainCalls.set(entry.call, entry);
			if (accepted !== null && !publishingAcknowledgement && !drainingMainThreadCalls) {
				sendMainThreadCall(entry);
			} else {
				mainThreadCallsNeedDrain = true;
			}
			return Object.freeze({
				promise: entry.deferred.promise,
				cancel(reason?: unknown) {
					if (pendingMainCalls.get(entry.call) !== entry) return;
					pendingMainCalls.delete(entry.call);
					if (entry.state === 'sent' && entry.identity !== null && closedError === null) {
						try {
							dispatch({ ...entry.identity, type: 'cancel-main', call: entry.call });
						} catch (error) {
							report(error, 'Octane Lynx could not deliver a main-thread cancellation.');
						}
					}
					const cancellation = errorFrom(reason, 'Octane Lynx main-thread call was cancelled.');
					if (reason === undefined) cancellation.name = 'AbortError';
					entry.deferred.reject(cancellation);
				},
			});
		},
		close(reason) {
			closeInternal(errorFrom(reason, 'Octane Lynx background transport was closed.'), false);
		},
		diagnostics() {
			return Object.freeze([...reported]);
		},
	};
	return Object.freeze(transport);
}
