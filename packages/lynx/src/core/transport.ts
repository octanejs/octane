import {
	UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
	type UniversalAsyncCommitTransport,
	type UniversalAsyncPreparedHostBatch,
	type UniversalHostBatch,
	type UniversalRoot,
	type UniversalTransportAcknowledgement,
	type UniversalTransportCommitMessage,
	type UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	invalidateLynxClientContainer,
	prepareLynxHandleDeltas,
	type LynxClientContainer,
} from './client-driver.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_READY_ANNOUNCEMENT_REQUEST,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	sameLynxTransportIdentity,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeAcknowledgement,
	type LynxDisposeRetryMessage,
	type LynxMainReadyReply,
	type LynxMainReadyRequest,
	type LynxTransportAcknowledgement,
} from './protocol.js';

export interface LynxBackgroundTransportOptions {
	readonly onDiagnostic?: (error: Error) => void;
}

export interface LynxBackgroundTransport extends UniversalAsyncCommitTransport<LynxClientContainer> {
	readonly mode: 'async';
	readonly ready: Promise<void>;
	bindRoot(root: Pick<UniversalRoot, 'dispatchTransportEvent'>): void;
	acceptedIdentity(): UniversalTransportIdentity | null;
	/** Cancel commits that have not crossed the readiness/send boundary. */
	cancelPendingBeforeReady(reason?: unknown): Promise<boolean>;
	/** Internal facade state used to classify teardown without probing the host. */
	preparationCount(): number;
	closedReason(): Error | null;
	enableLogicalTeardown(): void;
	dispose(): Promise<void>;
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
	abortRequested: boolean;
	deferredResponse: CommitSettlement | null;
}

type CommitSettlement = Extract<
	LynxBackgroundInboundMessage,
	{ readonly type: 'complete' | 'reject' | 'fault' }
>;

let NEXT_READY_REQUEST = 1;
const MAX_DISPOSE_ATTEMPTS = 3;

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
	const readyRequest = NEXT_READY_REQUEST++;
	const readyDeferred = createDeferred<void>();
	// A transport can be synchronously closed before a root observes `ready`.
	void readyDeferred.promise.catch(() => {});
	let accepted: UniversalTransportIdentity | null = null;
	let boundRoot: Pick<UniversalRoot, 'dispatchTransportEvent'> | null = null;
	let closedError: Error | null = null;
	let transportRoot: number | null = null;
	let readyReceived = false;
	let disposeDeferred: Deferred<void> | null = null;
	let disposeIdentity: UniversalTransportIdentity | null = null;
	let disposeAttempts = 0;
	let disposeRetryQueued = false;
	let dispatchingCommit: PendingCommit | null = null;
	let terminalDisposeIdentity: UniversalTransportIdentity | null = null;
	let terminalRetryError: Error | null = null;
	let preparationCount = 0;
	let logicalTeardownEnabled = false;

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

	const dispatch = (message: Parameters<typeof validateLynxBackgroundOutboundMessage>[0]) => {
		if (closedError !== null) throw closedError;
		const validated = validateLynxBackgroundOutboundMessage(message);
		context.dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: validated });
	};

	const closeEntry = (entry: PendingCommit, error: unknown) => {
		if (pending.get(entry.identity.version) !== entry) return;
		pending.delete(entry.identity.version);
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

	const closeInternal = (error: Error, preserveDisposeResolution: boolean) => {
		if (closedError !== null) return;
		closedError = error;
		try {
			context.removeEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
		} catch (removeError) {
			report(removeError, 'Octane Lynx failed to remove its transport listener.');
		}
		readyDeferred.reject(error);
		for (const entry of [...pending.values()]) closeEntry(entry, error);
		if (!preserveDisposeResolution) disposeDeferred?.reject(error);
		try {
			invalidateLynxClientContainer(container);
		} catch (invalidationError) {
			report(invalidationError, 'Octane Lynx failed to invalidate its public handles.');
		}
	};

	const terminalCloseAfterHostAcceptance = (
		identity: UniversalTransportIdentity,
		error: Error,
	): void => {
		if (closedError !== null) return;
		terminalDisposeIdentity = frozenIdentity(identity);
		for (let attempt = 1; attempt <= MAX_DISPOSE_ATTEMPTS; attempt++) {
			terminalRetryError = null;
			try {
				dispatch({ ...identity, type: 'terminal-dispose' });
			} catch (disposeError) {
				terminalRetryError = report(
					disposeError,
					`Octane Lynx terminal cleanup attempt ${attempt} could not be delivered.`,
				);
			}
			if (terminalDisposeIdentity === null || terminalRetryError === null) break;
		}
		closeInternal(error, false);
	};

	const handleReady = (message: LynxMainReadyReply) => {
		if (message.request !== LYNX_READY_ANNOUNCEMENT_REQUEST && message.request !== readyRequest) {
			report(
				new Error(`Octane Lynx transport received foreign main-ready request ${message.request}.`),
			);
			return;
		}
		if (readyReceived || readyDeferred.settled) {
			return;
		}
		readyReceived = true;
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
			handles = prepareLynxHandleDeltas(container, entry.batch, message.handles, message);
			handles.apply();
			entry.state = 'acknowledged';
			accepted = frozenIdentity(message);
			entry.acknowledge(message);
		} catch (error) {
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
			message.type === 'event' ||
			message.type === 'dispose-ack' ||
			message.type === 'dispose-retry' ||
			message.type === 'main-ready'
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
			terminalDisposeIdentity = null;
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
			terminalRetryError = remoteError(message.error);
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
			raw.type === 'main-ready' &&
			(raw.request === readyRequest || raw.request === LYNX_READY_ANNOUNCEMENT_REQUEST) &&
			!readyDeferred.settled
		) {
			closeInternal(error, false);
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
		if (closedError !== null) return;
		let message: LynxBackgroundInboundMessage;
		try {
			message = validateLynxBackgroundInboundMessage(event.data);
		} catch (error) {
			const normalized = report(error, 'Octane Lynx received a malformed inbound message.');
			rejectExpectedMalformed(event.data, normalized);
			return;
		}
		if (message.type === 'main-ready') {
			handleReady(message);
			return;
		}
		if (message.type === 'event') {
			handleEvent(message);
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

	context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, receive);
	const request: LynxMainReadyRequest = {
		protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
		renderer: LYNX_TRANSPORT_RENDERER,
		type: 'main-ready-request',
		request: readyRequest,
	};
	try {
		dispatch(request);
	} catch (error) {
		closeInternal(report(error, 'Octane Lynx failed to request main readiness.'), false);
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
			const commit: UniversalTransportCommitMessage = { ...identity, type: 'commit', batch };
			validateLynxBackgroundOutboundMessage(commit);
			const token: PreparedTokenState = { status: 'prepared', entry: null };
			return {
				apply(acknowledge) {
					if (token.status !== 'prepared') {
						return Promise.reject(
							new Error('Octane Lynx prepared batch apply() may only run once.'),
						);
					}
					if (closedError !== null) return Promise.reject(closedError);
					if (transportRoot === null) transportRoot = identity.root;
					else if (transportRoot !== identity.root) {
						return Promise.reject(new Error('Octane Lynx transport cannot serve a foreign root.'));
					}
					if (pending.has(identity.version)) {
						return Promise.reject(
							new Error(`Octane Lynx transport already has batch ${identity.version}.`),
						);
					}
					token.status = 'applying';
					const entry: PendingCommit = {
						identity: frozenIdentity(identity),
						batch,
						acknowledge,
						deferred: createDeferred<void>(),
						token,
						state: 'waiting-ready',
						abortRequested: false,
						deferredResponse: null,
					};
					token.entry = entry;
					pending.set(identity.version, entry);
					void readyDeferred.promise.then(
						() => {
							if (pending.get(identity.version) !== entry) return;
							entry.state = 'sent';
							let dispatchError: Error | null = null;
							dispatchingCommit = entry;
							try {
								dispatch(commit);
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
		acceptedIdentity() {
			return accepted;
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
		close(reason) {
			closeInternal(errorFrom(reason, 'Octane Lynx background transport was closed.'), false);
		},
		diagnostics() {
			return Object.freeze([...reported]);
		},
	};
	return Object.freeze(transport);
}
