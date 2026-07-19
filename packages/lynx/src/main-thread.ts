import type {
	UniversalHostBatch,
	UniversalEventPriority,
	UniversalSerializableValue,
	UniversalTransportError,
	UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	createLynxHostContainer,
	createLynxHostDriver,
	disposeLynxHostContainer,
	prepareLynxHostBatch,
	resolveLynxHostNativeEvent,
	type LynxHostContainer,
	type LynxHostDriver,
	type LynxHostHandle,
	type LynxPreparedHostBatch,
} from './core/host-driver.js';
import {
	snapshotLynxNativeEventPayload,
	type LynxNativeEventPayloadSnapshot,
	type LynxNativeEventToken,
} from './core/native-events.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_READY_ANNOUNCEMENT_REQUEST,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeAcknowledgement,
	type LynxDisposeMessage,
	type LynxMainReadyReply,
	type LynxMainReadyRequest,
	type LynxPublicHandleDelta,
	type LynxTransportAcknowledgement,
	type LynxTerminalDisposeMessage,
} from './core/protocol.js';
import { createLynxElementPAPI, type LynxElementPAPI, type LynxElementRef } from './core/papi.js';

interface LynxMainThreadGlobals {
	readonly lynx?: {
		getJSContext?(): LynxContextProxy;
	};
}

export interface InstallLynxMainThreadOptions {
	/** Main-thread global object containing the public Element PAPI. */
	readonly target?: object;
	readonly context?: LynxContextProxy;
	readonly componentId?: string;
	readonly cssId?: number;
	readonly onDiagnostic?: (error: Error) => void;
}

export interface LynxMainThreadController {
	activeIdentity(): UniversalTransportIdentity | null;
	diagnostics(): readonly Error[];
	/** Source/test bridge for one public `__AddEvent` callback token. */
	dispatchNativeEvent(token: LynxNativeEventToken | string, payload: unknown): void;
	/** Preserve one native propagation path as a single Octane event scope. */
	dispatchNativeEventBatch(deliveries: readonly LynxNativeEventDelivery[]): void;
	close(): void;
}

export interface LynxNativeEventDelivery {
	readonly token: LynxNativeEventToken | string;
	readonly payload: unknown;
}

interface LynxQueuedNativeEventDelivery {
	readonly token: LynxNativeEventToken | string;
	readonly payload: LynxNativeEventPayloadSnapshot;
}

interface ActiveLynxMainRoot<Node extends LynxElementRef> {
	readonly root: number;
	readonly container: LynxHostContainer<Node>;
	acceptedVersion: number;
}

type LynxCommitMessage = Extract<
	ReturnType<typeof validateLynxBackgroundOutboundMessage>,
	{ type: 'commit' }
>;

const MAX_ABORT_TOMBSTONES = 128;
const MAX_DISPOSED_ROOT_TOMBSTONES = 128;
const MAX_CLOSE_CLEANUP_ATTEMPTS = 3;

function normalizedError(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	return new Error(value === undefined ? fallback : String(value));
}

function wireError(value: unknown, fallback: string): UniversalTransportError {
	const error = normalizedError(value, fallback);
	return Object.freeze({
		name: error.name.length === 0 ? 'Error' : error.name,
		message: error.message,
	});
}

function positiveSafeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) > 0;
}

function recoverIdentity(value: unknown): UniversalTransportIdentity | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const message = value as Record<string, unknown>;
	if (
		message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION ||
		message.renderer !== LYNX_TRANSPORT_RENDERER ||
		!positiveSafeInteger(message.root) ||
		!positiveSafeInteger(message.version)
	) {
		return null;
	}
	return {
		protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
		renderer: LYNX_TRANSPORT_RENDERER,
		root: message.root,
		version: message.version,
	};
}

function resolveContext(
	target: LynxMainThreadGlobals,
	explicit?: LynxContextProxy,
): LynxContextProxy {
	if (explicit !== undefined) return explicit;
	const getJSContext = target.lynx?.getJSContext;
	if (typeof getJSContext !== 'function') {
		throw new Error('Octane Lynx requires the public main-thread lynx.getJSContext() API.');
	}
	return getJSContext.call(target.lynx);
}

function publicHandleUpsert(handle: LynxHostHandle): LynxPublicHandleDelta {
	return Object.freeze({
		op: 'upsert',
		id: handle.id,
		type: handle.type,
		generation: handle.generation,
		snapshot: handle as unknown as UniversalSerializableValue,
	});
}

function acknowledgementHandles<Node extends LynxElementRef>(
	driver: LynxHostDriver<Node>,
	container: LynxHostContainer<Node>,
	prepared: LynxPreparedHostBatch,
	batch: UniversalHostBatch,
): readonly LynxPublicHandleDelta[] {
	const handles = new Map<number, LynxPublicHandleDelta>();
	for (const delta of prepared.handleDelta) {
		if (delta.op === 'destroy') {
			handles.set(
				delta.id,
				Object.freeze({
					op: 'remove',
					id: delta.id,
					generation: delta.generation,
				}),
			);
		} else {
			handles.set(delta.handle.id, publicHandleUpsert(delta.handle));
		}
	}
	for (const command of batch.commands) {
		if (command.op !== 'update' || handles.has(command.id)) continue;
		const handle = driver.getPublicInstance(container, command.id);
		if (handle !== null) handles.set(command.id, publicHandleUpsert(handle));
	}
	return Object.freeze([...handles.values()]);
}

/**
 * Install the main-thread receiver that owns one root-scoped Element PAPI host.
 * Importing this module is inert; framework bootstrap calls this function on
 * the Lynx main thread before the background entry renders.
 */
export function installLynxMainThread<Node extends LynxElementRef = LynxElementRef>(
	options: InstallLynxMainThreadOptions = {},
): LynxMainThreadController {
	const rawTarget = options.target ?? globalThis;
	if (rawTarget === null || typeof rawTarget !== 'object') {
		throw new TypeError('Octane Lynx main-thread target must be a global object.');
	}
	const target = rawTarget as LynxMainThreadGlobals;
	const context = resolveContext(target, options.context);
	if (
		context === null ||
		typeof context !== 'object' ||
		typeof context.dispatchEvent !== 'function' ||
		typeof context.addEventListener !== 'function' ||
		typeof context.removeEventListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx main-thread receiver requires ContextProxy dispatchEvent/addEventListener/removeEventListener.',
		);
	}
	const papi: LynxElementPAPI<Node> = createLynxElementPAPI<Node>(rawTarget);
	const componentId = options.componentId ?? '0';
	if (typeof componentId !== 'string' || componentId.length === 0) {
		throw new TypeError('Octane Lynx main-thread componentId must be a non-empty string.');
	}
	const cssId = options.cssId ?? 0;
	if (!Number.isSafeInteger(cssId)) {
		throw new TypeError('Octane Lynx main-thread cssId must be a safe integer.');
	}
	// A Lynx entry owns one native page. Individual Octane roots are disposed and
	// replaced within that page rather than manufacturing pages during commits.
	const page = papi.createPage(componentId, cssId);
	const driver = createLynxHostDriver<Node>();
	const reported: Error[] = [];
	const disposedRoots = new Map<number, number>();
	const aborted = new Set<string>();
	let active: ActiveLynxMainRoot<Node> | null = null;
	let closed = false;
	let commitInProgress = false;
	const queuedCommits: LynxCommitMessage[] = [];
	const queuedNativeEvents: Array<readonly LynxQueuedNativeEventDelivery[]> = [];

	const report = (value: unknown, fallback = 'Octane Lynx main-thread receiver failed.') => {
		const error = normalizedError(value, fallback);
		reported.push(error);
		try {
			options.onDiagnostic?.(error);
		} catch (diagnosticError) {
			reported.push(
				normalizedError(diagnosticError, 'Octane Lynx main-thread diagnostic callback failed.'),
			);
		}
		return error;
	};

	const dispatch = (message: LynxBackgroundInboundMessage): void => {
		const validated = validateLynxBackgroundInboundMessage(message);
		context.dispatchEvent({ type: LYNX_MAIN_TO_BACKGROUND_EVENT, data: validated });
	};

	const snapshotNativeEventBatch = (
		deliveries: readonly LynxNativeEventDelivery[],
	): readonly LynxQueuedNativeEventDelivery[] => {
		if (!Array.isArray(deliveries)) {
			throw new TypeError('Octane Lynx native event deliveries must be an array.');
		}
		return Object.freeze(
			deliveries.map((delivery, index) => {
				if (delivery === null || typeof delivery !== 'object' || Array.isArray(delivery)) {
					throw new TypeError(`Octane Lynx native event delivery ${index} must be an object.`);
				}
				if (typeof delivery.token !== 'string') {
					throw new TypeError(`Octane Lynx native event delivery ${index} token must be a string.`);
				}
				return Object.freeze({
					token: delivery.token,
					payload: snapshotLynxNativeEventPayload(delivery.payload),
				});
			}),
		);
	};

	const deliverNativeEventBatch = (deliveries: readonly LynxQueuedNativeEventDelivery[]): void => {
		if (deliveries.length === 0) return;
		if (active === null || active.acceptedVersion <= 0) {
			throw new Error('Octane Lynx received a native event without an accepted root.');
		}
		let priority: UniversalEventPriority | null = null;
		const transported = deliveries.map((delivery) => {
			const resolved = resolveLynxHostNativeEvent(active!.container, delivery.token);
			if (resolved === null) {
				throw new Error('Octane Lynx received a stale, hidden, removed, or foreign native event.');
			}
			if (priority === null) priority = resolved.priority;
			else if (priority !== resolved.priority) {
				throw new Error('Octane Lynx native event batch mixes listener priorities.');
			}
			return Object.freeze({ listener: resolved.listener, payload: delivery.payload });
		});
		dispatch({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: active.root,
			version: active.acceptedVersion,
			type: 'event',
			priority: priority!,
			deliveries: Object.freeze(transported),
		});
	};

	const submitNativeEventBatch = (deliveries: readonly LynxNativeEventDelivery[]): void => {
		if (closed) {
			report(new Error('Octane Lynx received a native event after the main receiver closed.'));
			return;
		}
		let snapshot: readonly LynxQueuedNativeEventDelivery[];
		try {
			snapshot = snapshotNativeEventBatch(deliveries);
		} catch (error) {
			report(error, 'Octane Lynx could not snapshot a native event.');
			return;
		}
		if (commitInProgress) {
			queuedNativeEvents.push(snapshot);
			return;
		}
		try {
			deliverNativeEventBatch(snapshot);
		} catch (error) {
			report(error, 'Octane Lynx could not dispatch a native event.');
		}
	};

	const drainNativeEvents = (): void => {
		while (queuedNativeEvents.length !== 0) {
			for (const deliveries of queuedNativeEvents.splice(0)) {
				try {
					deliverNativeEventBatch(deliveries);
				} catch (error) {
					report(error, 'Octane Lynx could not dispatch an acknowledgement-gated native event.');
				}
			}
		}
	};

	const reject = (identity: UniversalTransportIdentity, error: unknown): void => {
		queuedNativeEvents.length = 0;
		try {
			dispatch({
				...identity,
				type: 'reject',
				error: wireError(error, 'Octane Lynx rejected a host batch.'),
			});
		} catch (dispatchError) {
			throw report(dispatchError, 'Octane Lynx could not dispatch a host rejection.');
		} finally {
			// ContextProxy listeners run synchronously in the public test model.
			// Never retain a native event submitted reentrantly from settlement.
			queuedNativeEvents.length = 0;
		}
	};

	const disposeRecord = (record: ActiveLynxMainRoot<Node>) => {
		const cleanup = disposeLynxHostContainer(record.container);
		for (const error of cleanup.errors) report(error, 'Octane Lynx host cleanup failed.');
		return cleanup;
	};

	const rememberDisposed = (root: number, version: number): void => {
		disposedRoots.set(root, version);
		if (disposedRoots.size > MAX_DISPOSED_ROOT_TOMBSTONES) {
			const oldest = disposedRoots.keys().next().value;
			if (oldest !== undefined) disposedRoots.delete(oldest);
		}
	};

	const abortKey = (identity: UniversalTransportIdentity) => `${identity.root}:${identity.version}`;

	const handleReady = (message: LynxMainReadyRequest): void => {
		const reply: LynxMainReadyReply = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'main-ready',
			request: message.request,
		};
		try {
			dispatch(reply);
		} catch (error) {
			throw report(error, 'Octane Lynx could not dispatch the main-ready reply.');
		}
	};

	const handleAbort = (identity: UniversalTransportIdentity): void => {
		if (disposedRoots.has(identity.root)) {
			report(new Error(`Octane Lynx received an abort for disposed root ${identity.root}.`));
			return;
		}
		if (
			active !== null &&
			(active.root !== identity.root || identity.version <= active.acceptedVersion)
		) {
			report(new Error('Octane Lynx received a stale or foreign abort.'));
			return;
		}
		aborted.add(abortKey(identity));
		if (aborted.size > MAX_ABORT_TOMBSTONES) {
			const oldest = aborted.values().next().value;
			if (oldest !== undefined) aborted.delete(oldest);
		}
	};

	const handleCommitExclusive = (
		message: LynxCommitMessage,
		identity: UniversalTransportIdentity,
	): void => {
		if (disposedRoots.has(message.root)) {
			reject(identity, new Error(`Octane Lynx root ${message.root} was already disposed.`));
			return;
		}
		if (aborted.delete(abortKey(identity))) {
			reject(identity, new Error(`Octane Lynx batch ${message.version} was aborted before apply.`));
			return;
		}
		if (active !== null && active.root !== message.root) {
			reject(identity, new Error('Octane Lynx commit belongs to a foreign active root.'));
			return;
		}
		if (active !== null && message.version <= active.acceptedVersion) {
			reject(
				identity,
				new Error(
					`Octane Lynx rejected stale batch ${message.version}; accepted version is ${active.acceptedVersion}.`,
				),
			);
			return;
		}

		let record = active;
		const provisional = record === null;
		if (record === null) {
			try {
				record = {
					root: message.root,
					container: createLynxHostContainer(papi, {
						root: message.root,
						page,
					}),
					acceptedVersion: 0,
				};
			} catch (error) {
				reject(identity, error);
				return;
			}
		}

		let prepared: LynxPreparedHostBatch;
		try {
			prepared = prepareLynxHostBatch(record.container, message.batch);
		} catch (error) {
			if (provisional) disposeRecord(record);
			reject(identity, error);
			return;
		}

		if (provisional) active = record;
		let applyFailed = false;
		let applyError: unknown;
		try {
			prepared.apply();
		} catch (error) {
			applyFailed = true;
			applyError = error;
		}
		if (!prepared.mutationStarted) {
			prepared.abort();
			if (provisional) {
				disposeRecord(record);
				active = null;
			}
			reject(identity, applyError);
			return;
		}

		record.acceptedVersion = message.version;
		const handles = acknowledgementHandles(driver, record.container, prepared, message.batch);
		const acknowledgement: LynxTransportAcknowledgement = {
			...identity,
			type: 'ack',
			handles,
		};
		try {
			dispatch(acknowledgement);
		} catch (error) {
			queuedNativeEvents.length = 0;
			const cleanup = disposeRecord(record);
			if (!cleanup.complete) {
				report(
					new Error(
						`Octane Lynx could not fully clean up root ${record.root} after acknowledgement dispatch failed.`,
					),
				);
			} else {
				rememberDisposed(record.root, record.acceptedVersion);
				active = null;
			}
			throw report(error, 'Octane Lynx could not dispatch an accepted batch acknowledgement.');
		}

		if (!applyFailed) {
			drainNativeEvents();
			try {
				dispatch({ ...identity, type: 'complete' });
				drainNativeEvents();
			} catch (error) {
				throw report(error, 'Octane Lynx could not dispatch accepted batch completion.');
			}
			return;
		}

		queuedNativeEvents.length = 0;
		try {
			dispatch({
				...identity,
				type: 'fault',
				error: wireError(applyError, 'Octane Lynx Element PAPI application failed.'),
			});
		} catch (error) {
			throw report(error, 'Octane Lynx could not dispatch an accepted host fault.');
		} finally {
			queuedNativeEvents.length = 0;
		}
	};

	const handleCommit = (message: LynxCommitMessage): void => {
		if (commitInProgress) {
			queuedCommits.push(message);
			return;
		}
		commitInProgress = true;
		try {
			let next: LynxCommitMessage | undefined = message;
			do {
				handleCommitExclusive(next, {
					protocol: next.protocol,
					renderer: next.renderer,
					root: next.root,
					version: next.version,
				});
				next = queuedCommits.shift();
			} while (next !== undefined);
		} catch (error) {
			// A response delivery failure terminally tears down the background
			// transport. Do not replay commits it dispatched reentrantly before
			// observing that failure during some unrelated future request.
			queuedCommits.length = 0;
			queuedNativeEvents.length = 0;
			throw error;
		} finally {
			commitInProgress = false;
		}
	};

	const handleDispose = (message: LynxDisposeMessage | LynxTerminalDisposeMessage): void => {
		queuedNativeEvents.length = 0;
		const terminal = message.type === 'terminal-dispose';
		const acknowledge = () => {
			const acknowledgement: LynxDisposeAcknowledgement = {
				...message,
				type: 'dispose-ack',
			};
			try {
				dispatch(acknowledgement);
			} catch (error) {
				throw report(error, 'Octane Lynx could not dispatch dispose acknowledgement.');
			}
		};
		if (disposedRoots.get(message.root) === message.version) {
			acknowledge();
			return;
		}
		if (terminal && active === null) {
			rememberDisposed(message.root, message.version);
			acknowledge();
			return;
		}
		if (
			active === null ||
			active.root !== message.root ||
			(terminal
				? active.acceptedVersion > message.version
				: active.acceptedVersion !== message.version)
		) {
			report(new Error('Octane Lynx received a stale or foreign dispose request.'));
			return;
		}
		const record = active;
		const cleanup = disposeRecord(record);
		if (!cleanup.complete) {
			const unresolvedError = report(
				new Error(
					`Octane Lynx withheld dispose acknowledgement for root ${record.root}; ${cleanup.remainingRoots} native root(s) remain attached.`,
				),
			);
			try {
				dispatch({
					...message,
					type: 'dispose-retry',
					error: wireError(
						cleanup.errors[0] ?? unresolvedError,
						'Octane Lynx native cleanup is incomplete.',
					),
				});
			} catch (error) {
				throw report(error, 'Octane Lynx could not dispatch a dispose retry request.');
			}
			return;
		}
		rememberDisposed(record.root, terminal ? message.version : record.acceptedVersion);
		active = null;
		acknowledge();
	};

	function receive(event: LynxContextProxyEvent): void {
		if (closed) return;
		let message: ReturnType<typeof validateLynxBackgroundOutboundMessage>;
		try {
			message = validateLynxBackgroundOutboundMessage(event.data);
		} catch (error) {
			const normalized = report(error, 'Octane Lynx received a malformed outbound message.');
			const identity = recoverIdentity(event.data);
			if (
				identity !== null &&
				event.data !== null &&
				typeof event.data === 'object' &&
				(event.data as { type?: unknown }).type === 'commit'
			) {
				reject(identity, normalized);
			}
			return;
		}
		if (message.type === 'main-ready-request') {
			handleReady(message);
		} else if (message.type === 'abort') {
			handleAbort(message);
		} else if (message.type === 'dispose' || message.type === 'terminal-dispose') {
			handleDispose(message);
		} else {
			handleCommit(message);
		}
	}

	context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
	try {
		dispatch({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'main-ready',
			request: LYNX_READY_ANNOUNCEMENT_REQUEST,
		});
	} catch (error) {
		closed = true;
		context.removeEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
		if (active !== null) {
			disposeRecord(active);
			active = null;
		}
		throw report(error, 'Octane Lynx could not announce main-thread readiness.');
	}

	const controller: LynxMainThreadController = {
		activeIdentity() {
			if (active === null) return null;
			return Object.freeze({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: active.root,
				version: active.acceptedVersion,
			});
		},
		diagnostics() {
			return Object.freeze([...reported]);
		},
		dispatchNativeEvent(token, payload) {
			submitNativeEventBatch([{ token, payload }]);
		},
		dispatchNativeEventBatch(deliveries) {
			submitNativeEventBatch(deliveries);
		},
		close() {
			queuedNativeEvents.length = 0;
			if (!closed) {
				closed = true;
				try {
					context.removeEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
				} catch (error) {
					report(error, 'Octane Lynx could not remove its main-thread listener.');
				}
			}
			if (active !== null) {
				const record = active;
				let complete = false;
				for (let attempt = 0; attempt < MAX_CLOSE_CLEANUP_ATTEMPTS; attempt++) {
					if (disposeRecord(record).complete) {
						complete = true;
						break;
					}
				}
				if (complete) {
					rememberDisposed(record.root, record.acceptedVersion);
					active = null;
				}
			}
		},
	};
	return Object.freeze(controller);
}
