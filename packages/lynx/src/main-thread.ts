import type {
	UniversalComponent,
	UniversalHostBatch,
	UniversalEventPriority,
	UniversalSerializableValue,
	UniversalTransportError,
	UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	captureLynxFirstTree,
	createLynxHostContainer,
	createLynxHostDriver,
	disposeLynxFirstTree,
	disposeLynxHostContainer,
	getLynxHostPublicState,
	getLynxHostEventListener,
	isLynxHostAttached,
	prepareLynxHostBatch,
	resolveLynxHostNativeEvent,
	type LynxHostContainer,
	type LynxHostDriver,
	type LynxHostPublicState,
	type LynxHostAttachmentDelta,
	type LynxHostHandle,
	type LynxPreparedHostBatch,
} from './core/host-driver.js';
import {
	releaseLynxFirstTree,
	resolveLynxFirstTreeEvent,
	type LynxFirstTree,
	type LynxFirstTreeEventSnapshot,
	type LynxFirstTreeSnapshot,
} from './core/first-screen.js';
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
	sameLynxTransportIdentity,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxBackgroundInboundMessage,
	type LynxBackgroundFunctionWireDescriptor,
	type LynxAdoptionReadyMessage,
	type LynxCallMainMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeAcknowledgement,
	type LynxDisposeMessage,
	type LynxHostAttachmentMessage,
	type LynxHostFaultMessage,
	type LynxMainCallPublicationMessage,
	type LynxMainReadyReply,
	type LynxMainReadyRequest,
	type LynxPublicHandleDelta,
	type LynxTransportAcknowledgement,
	type LynxTerminalDisposeMessage,
} from './core/protocol.js';
import { createLynxElementPAPI, type LynxElementPAPI, type LynxElementRef } from './core/papi.js';
import {
	createLynxMainThreadWorkletRegistry,
	installLynxMainThreadWorkletRegistry,
	installMainThreadCallBridge,
	isLynxBackgroundFunctionDescriptor,
	isolateLynxWorkletValue,
	type LynxMainThreadWorkletRegistry,
	type LynxWorkletValue,
} from './core/worklets.js';
import { installLynxFirstScreenHost } from './first-screen.js';
import { renderLynxFirstScreen, type LynxFirstScreenRenderResult } from './main-renderer.js';

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
	/** Enable the synchronous, one-shot main-thread first-screen renderer. */
	readonly firstScreen?: boolean;
	/**
	 * `manual` waits for `markFirstScreenSyncReady()` after authored synchronous
	 * initialization. `automatic` releases background work after `root.render()`.
	 */
	readonly firstScreenSync?: 'automatic' | 'manual';
	readonly onDiagnostic?: (error: Error) => void;
	readonly executeMainThreadWorklet?: (
		worklet: import('./core/protocol.js').LynxMainThreadWorkletWireDescriptor,
		args: readonly UniversalSerializableValue[],
	) => unknown;
}

export interface LynxMainThreadCall<Result = UniversalSerializableValue> {
	readonly promise: Promise<Result>;
	cancel(reason?: unknown): void;
}

export interface LynxMainThreadController {
	activeIdentity(): UniversalTransportIdentity | null;
	diagnostics(): readonly Error[];
	/** Source/test bridge for one public `__AddEvent` callback token. */
	dispatchNativeEvent(token: LynxNativeEventToken | string, payload: unknown): void;
	/** Preserve one native propagation path as a single Octane event scope. */
	dispatchNativeEventBatch(deliveries: readonly LynxNativeEventDelivery[]): void;
	/** Clone-safe snapshot retained while background adoption is pending. */
	firstScreenSnapshot(): LynxFirstTreeSnapshot | null;
	/** Release a receiver configured with manual first-screen synchronization. */
	markFirstScreenSyncReady(): void;
	callBackground(
		fn: LynxBackgroundFunctionWireDescriptor,
		args: readonly UniversalSerializableValue[],
	): LynxMainThreadCall;
	close(): void;
}

export interface LynxNativeEventDelivery {
	readonly token: LynxNativeEventToken | string;
	readonly payload: unknown;
}

interface LynxQueuedNativeEventDelivery {
	readonly token: LynxNativeEventToken | string;
	readonly payload: LynxNativeEventPayloadSnapshot;
	readonly firstTreeTarget?: Omit<LynxFirstTreeEventSnapshot, 'listener'>;
}

interface ActiveLynxMainRoot<Node extends LynxElementRef> {
	readonly root: number;
	readonly container: LynxHostContainer<Node>;
	acceptedVersion: number;
	lastMainCall: number;
	lastMainCallPublication: number;
	faulted: boolean;
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly settled: boolean;
	resolve(value: T): void;
	reject(error: unknown): void;
}

interface PendingBackgroundCall {
	readonly call: number;
	readonly fn: LynxBackgroundFunctionWireDescriptor;
	readonly args: readonly UniversalSerializableValue[];
	readonly deferred: Deferred<UniversalSerializableValue>;
	identity: UniversalTransportIdentity | null;
	state: 'queued' | 'sent';
}

interface RunningMainCall {
	readonly identity: UniversalTransportIdentity;
	release(): void;
	cancelled: boolean;
}

type LynxCommitMessage = Extract<
	ReturnType<typeof validateLynxBackgroundOutboundMessage>,
	{ type: 'commit' }
>;

const MAX_ABORT_TOMBSTONES = 128;
const MAX_DISPOSED_ROOT_TOMBSTONES = 128;
const MAX_CLOSE_CLEANUP_ATTEMPTS = 3;
const MAX_FIRST_SCREEN_EVENT_DELIVERIES = 128;
const MAX_QUEUED_THREAD_CALLS = 128;
const FIRST_SCREEN_ROOT_ID = 1;

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

function publicHandleUpsert(
	handle: LynxHostHandle,
	state: LynxHostPublicState,
): LynxPublicHandleDelta {
	return Object.freeze({
		op: 'upsert',
		id: handle.id,
		type: handle.type,
		generation: handle.generation,
		attached: state.attached,
		listDescendant: state.listDescendant,
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
			handles.set(
				delta.handle.id,
				publicHandleUpsert(delta.handle, getLynxHostPublicState(container, delta.handle.id)),
			);
		}
	}
	for (const command of batch.commands) {
		if (command.op !== 'update' || handles.has(command.id)) continue;
		const handle = driver.getPublicInstance(container, command.id);
		if (handle !== null) {
			handles.set(
				command.id,
				publicHandleUpsert(handle, getLynxHostPublicState(container, command.id)),
			);
		}
	}
	for (const delta of prepared.listAncestryDelta) {
		if (handles.has(delta.id)) continue;
		handles.set(
			delta.id,
			Object.freeze({
				op: 'list-ancestry',
				id: delta.id,
				generation: delta.generation,
				listDescendant: delta.listDescendant,
			}),
		);
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
	if (options.firstScreen !== undefined && typeof options.firstScreen !== 'boolean') {
		throw new TypeError('Octane Lynx firstScreen must be a boolean when provided.');
	}
	if (
		options.firstScreenSync !== undefined &&
		options.firstScreenSync !== 'automatic' &&
		options.firstScreenSync !== 'manual'
	) {
		throw new TypeError('Octane Lynx firstScreenSync must be automatic or manual.');
	}
	if (options.firstScreen !== true && options.firstScreenSync !== undefined) {
		throw new TypeError('Octane Lynx firstScreenSync requires firstScreen: true.');
	}
	const firstScreenEnabled = options.firstScreen === true;
	const firstScreenSync = options.firstScreenSync ?? 'automatic';
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
	let firstScreenState: 'open' | 'painted' | 'skipped' | 'failed' | 'cleanup-pending' =
		firstScreenEnabled ? 'open' : 'skipped';
	let firstScreenSyncReady = !firstScreenEnabled;
	let firstTree: LynxFirstTree<Node> | null = null;
	let failedFirstScreenSource: LynxHostContainer<Node> | null = null;
	let awaitingAdoption: UniversalTransportIdentity | null = null;
	let readyAnnouncementSent = false;
	let firstTreeSnapshotSent = false;
	let uninstallFirstScreenHost: (() => void) | null = null;
	const queuedCommits: LynxCommitMessage[] = [];
	const queuedNativeEvents: Array<readonly LynxQueuedNativeEventDelivery[]> = [];
	const queuedReadyRequests = new Set<number>();
	const queuedHostAttachments: Array<{
		readonly version: number;
		readonly deltas: readonly LynxHostAttachmentDelta[];
	}> = [];
	const pendingBackgroundCalls = new Map<number, PendingBackgroundCall>();
	const runningMainCalls = new Map<number, RunningMainCall>();
	let backgroundCallsOpen = false;
	let nextThreadCall = 1;
	let uninstallWorkletRegistry: (() => void) | null = null;
	let uninstallCallBridge: (() => void) | null = null;
	let restoreRunWorklet: (() => void) | null = null;
	let worklets: LynxMainThreadWorkletRegistry;
	let mainCallPublication: UniversalTransportIdentity | null = null;

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

	const currentIdentity = (): UniversalTransportIdentity | null =>
		active === null
			? null
			: Object.freeze({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root: active.root,
					version: active.acceptedVersion,
				});

	const sendBackgroundCall = (entry: PendingBackgroundCall): void => {
		const identity = currentIdentity();
		if (
			!backgroundCallsOpen ||
			identity === null ||
			active?.faulted === true ||
			entry.state !== 'queued'
		) {
			return;
		}
		entry.identity = identity;
		entry.state = 'sent';
		try {
			dispatch({
				...identity,
				type: 'call-background',
				call: entry.call,
				fn: entry.fn,
				args: entry.args,
			});
		} catch (error) {
			if (pendingBackgroundCalls.get(entry.call) !== entry) return;
			pendingBackgroundCalls.delete(entry.call);
			entry.deferred.reject(report(error, 'Octane Lynx could not deliver a background call.'));
		}
	};

	const drainBackgroundCalls = (): void => {
		if (!backgroundCallsOpen || closed) return;
		for (const entry of [...pendingBackgroundCalls.values()]) {
			if (entry.state === 'queued') sendBackgroundCall(entry);
		}
	};

	const openBackgroundCalls = (): void => {
		if (closed || active === null || active.faulted) return;
		backgroundCallsOpen = true;
		drainBackgroundCalls();
	};

	const settleBackgroundCall = (
		message: Extract<
			ReturnType<typeof validateLynxBackgroundOutboundMessage>,
			{ type: 'call-background-result' | 'call-background-error' }
		>,
	): void => {
		const entry = pendingBackgroundCalls.get(message.call);
		if (entry === undefined) {
			report(
				new Error(
					`Octane Lynx received a late or duplicate background call result ${message.call}.`,
				),
			);
			return;
		}
		if (entry.identity === null || !sameLynxTransportIdentity(entry.identity, message)) {
			report(
				new Error(
					`Octane Lynx received a stale or foreign background call result ${message.call}.`,
				),
			);
			return;
		}
		pendingBackgroundCalls.delete(message.call);
		if (message.type === 'call-background-result') {
			try {
				entry.deferred.resolve(
					isolateLynxWorkletValue(
						message.value as LynxWorkletValue,
						'background call result',
					) as UniversalSerializableValue,
				);
			} catch (error) {
				entry.deferred.reject(report(error, 'Octane Lynx received an invalid background result.'));
			}
		} else {
			const error = new Error(message.error.message);
			error.name = message.error.name;
			entry.deferred.reject(error);
		}
	};

	const dispatchMainCallError = (message: LynxCallMainMessage, value: unknown): void => {
		try {
			dispatch({
				protocol: message.protocol,
				renderer: message.renderer,
				root: message.root,
				version: message.version,
				type: 'call-main-error',
				call: message.call,
				error: wireError(value, 'Octane Lynx main-thread worklet failed.'),
			});
		} catch (error) {
			report(error, 'Octane Lynx could not deliver a main-thread call error.');
		}
	};

	const handleMainCall = (message: LynxCallMainMessage): void => {
		if (
			active === null ||
			message.root !== active.root ||
			message.version > active.acceptedVersion ||
			awaitingAdoption !== null
		) {
			report(
				new Error(`Octane Lynx received a stale or foreign main-thread call ${message.call}.`),
			);
			dispatchMainCallError(message, new Error('Octane Lynx main-thread call is stale.'));
			return;
		}
		// Call IDs are allocated monotonically and ContextProxy preserves sender
		// order. Keep the high-water mark on the active root so a settled or
		// cancelled request cannot be replayed, without retaining one tombstone per
		// call for the lifetime of the page.
		if (message.call <= active.lastMainCall) {
			report(new Error(`Octane Lynx received duplicate main-thread call ${message.call}.`));
			return;
		}
		active.lastMainCall = message.call;
		if (active.faulted) {
			report(
				new Error(`Octane Lynx rejected main-thread call ${message.call} for a faulted root.`),
			);
			dispatchMainCallError(message, new Error('Octane Lynx main-thread root is faulted.'));
			return;
		}
		const running: RunningMainCall = {
			identity: Object.freeze({
				protocol: message.protocol,
				renderer: message.renderer,
				root: message.root,
				version: message.version,
			}),
			release() {},
			cancelled: false,
		};
		runningMainCalls.set(message.call, running);
		let result: unknown;
		try {
			if (options.executeMainThreadWorklet === undefined) {
				const activeWorklet = worklets.activate(
					message.worklet as import('./core/worklets.js').LynxMainThreadWorkletDescriptor,
				);
				let retained = true;
				running.release = () => {
					if (!retained) return;
					retained = false;
					worklets.release(activeWorklet);
				};
				result = worklets.runWorklet(activeWorklet, message.args);
			} else {
				result = options.executeMainThreadWorklet(message.worklet, message.args);
			}
		} catch (error) {
			runningMainCalls.delete(message.call);
			running.release();
			dispatchMainCallError(message, error);
			return;
		}
		void Promise.resolve(result).then(
			(value) => {
				if (runningMainCalls.get(message.call) !== running || running.cancelled || closed) {
					return;
				}
				runningMainCalls.delete(message.call);
				running.release();
				try {
					const isolated = isolateLynxWorkletValue(
						value as LynxWorkletValue,
						'main-thread call result',
					);
					dispatch({
						...running.identity,
						type: 'call-main-result',
						call: message.call,
						value: isolated as UniversalSerializableValue,
					});
				} catch (error) {
					dispatchMainCallError(message, error);
				}
			},
			(error) => {
				if (runningMainCalls.get(message.call) !== running || running.cancelled || closed) {
					return;
				}
				runningMainCalls.delete(message.call);
				running.release();
				dispatchMainCallError(message, error);
			},
		);
	};

	const handleCancelMainCall = (
		message: Extract<
			ReturnType<typeof validateLynxBackgroundOutboundMessage>,
			{ type: 'cancel-main' }
		>,
	): void => {
		const running = runningMainCalls.get(message.call);
		if (running === undefined) {
			report(
				new Error(
					`Octane Lynx received a late or duplicate main-thread cancellation ${message.call}.`,
				),
			);
			return;
		}
		if (!sameLynxTransportIdentity(running.identity, message)) {
			report(
				new Error(
					`Octane Lynx received a stale or foreign main-thread cancellation ${message.call}.`,
				),
			);
			return;
		}
		runningMainCalls.delete(message.call);
		running.cancelled = true;
		running.release();
	};

	const resetThreadCalls = (reason: unknown): void => {
		const error = normalizedError(reason, 'Octane Lynx thread calls were disposed.');
		backgroundCallsOpen = false;
		for (const entry of [...pendingBackgroundCalls.values()]) {
			pendingBackgroundCalls.delete(entry.call);
			if (entry.state === 'sent' && entry.identity !== null && !closed) {
				try {
					dispatch({ ...entry.identity, type: 'cancel-background', call: entry.call });
				} catch (cancelError) {
					report(cancelError, 'Octane Lynx could not cancel a closing background call.');
				}
			}
			entry.deferred.reject(error);
		}
		for (const running of runningMainCalls.values()) {
			running.cancelled = true;
			running.release();
		}
		runningMainCalls.clear();
	};

	const callBackground = (
		fn: LynxBackgroundFunctionWireDescriptor,
		args: readonly UniversalSerializableValue[],
	): LynxMainThreadCall => {
		if (closed) {
			const deferred = createDeferred<UniversalSerializableValue>();
			deferred.reject(new Error('Octane Lynx main-thread receiver is closed.'));
			return Object.freeze({ promise: deferred.promise, cancel() {} });
		}
		if (active?.faulted === true) {
			const deferred = createDeferred<UniversalSerializableValue>();
			deferred.reject(new Error('Octane Lynx main-thread root is faulted.'));
			return Object.freeze({ promise: deferred.promise, cancel() {} });
		}
		if (pendingBackgroundCalls.size >= MAX_QUEUED_THREAD_CALLS) {
			const deferred = createDeferred<UniversalSerializableValue>();
			deferred.reject(
				new Error(
					`Octane Lynx background call queue is limited to ${MAX_QUEUED_THREAD_CALLS} entries.`,
				),
			);
			return Object.freeze({ promise: deferred.promise, cancel() {} });
		}
		if (nextThreadCall > Number.MAX_SAFE_INTEGER) {
			const deferred = createDeferred<UniversalSerializableValue>();
			deferred.reject(new Error('Octane Lynx background call identity space is exhausted.'));
			return Object.freeze({ promise: deferred.promise, cancel() {} });
		}
		const isolatedFn = isolateLynxWorkletValue(
			fn as LynxWorkletValue,
			'background function call target',
		);
		if (!isLynxBackgroundFunctionDescriptor(isolatedFn)) {
			throw new TypeError('Octane Lynx background function call target is invalid.');
		}
		const isolatedArgs = isolateLynxWorkletValue(
			args as unknown as LynxWorkletValue[],
			'background function call arguments',
		);
		const entry: PendingBackgroundCall = {
			call: nextThreadCall++,
			fn: isolatedFn as LynxBackgroundFunctionWireDescriptor,
			args: isolatedArgs as readonly UniversalSerializableValue[],
			deferred: createDeferred<UniversalSerializableValue>(),
			identity: null,
			state: 'queued',
		};
		pendingBackgroundCalls.set(entry.call, entry);
		if (backgroundCallsOpen) sendBackgroundCall(entry);
		return Object.freeze({
			promise: entry.deferred.promise,
			cancel(reason?: unknown) {
				if (pendingBackgroundCalls.get(entry.call) !== entry) return;
				pendingBackgroundCalls.delete(entry.call);
				if (entry.state === 'sent' && entry.identity !== null && !closed) {
					try {
						dispatch({ ...entry.identity, type: 'cancel-background', call: entry.call });
					} catch (error) {
						report(error, 'Octane Lynx could not deliver a background cancellation.');
					}
				}
				const cancellation = normalizedError(reason, 'Octane Lynx background call was cancelled.');
				if (reason === undefined) cancellation.name = 'AbortError';
				entry.deferred.reject(cancellation);
			},
		});
	};

	worklets = createLynxMainThreadWorkletRegistry({
		callBackground(fn, args) {
			return callBackground(
				fn as LynxBackgroundFunctionWireDescriptor,
				args as readonly UniversalSerializableValue[],
			).promise;
		},
	});
	const runWorkletTarget = rawTarget as Record<string, unknown>;
	const previousRunWorklet = runWorkletTarget.runWorklet;
	const installedRunWorklet = (
		descriptor: import('./core/worklets.js').LynxMainThreadWorkletDescriptor,
		args?: readonly unknown[],
	) => worklets.runWorklet(descriptor, args);
	restoreRunWorklet = () => {
		if (runWorkletTarget.runWorklet !== installedRunWorklet) return;
		if (previousRunWorklet === undefined) delete runWorkletTarget.runWorklet;
		else runWorkletTarget.runWorklet = previousRunWorklet;
	};
	try {
		uninstallWorkletRegistry = installLynxMainThreadWorkletRegistry(worklets);
		uninstallCallBridge = installMainThreadCallBridge({
			callBackground<Result>(
				fn: import('./core/worklets.js').LynxBackgroundFunctionDescriptor,
				args: readonly import('./core/worklets.js').LynxWorkletValue[],
			) {
				const call = callBackground(
					fn as LynxBackgroundFunctionWireDescriptor,
					args as readonly UniversalSerializableValue[],
				);
				return {
					promise: call.promise as Promise<Result>,
					cancel: call.cancel,
				};
			},
		});
		runWorkletTarget.runWorklet = installedRunWorklet;
	} catch (error) {
		restoreRunWorklet?.();
		restoreRunWorklet = null;
		uninstallCallBridge?.();
		uninstallCallBridge = null;
		uninstallWorkletRegistry?.();
		uninstallWorkletRegistry = null;
		worklets.close();
		throw error;
	}

	const finishMainCallPublication = (): void => {
		if (mainCallPublication === null) return;
		mainCallPublication = null;
		try {
			worklets.finishRefOwnerPublication();
		} catch (error) {
			report(error, 'Octane Lynx could not finish main-thread ref owner publication.');
		}
	};

	const canAnnounceReady = () =>
		!firstScreenEnabled ||
		(firstScreenState !== 'open' && firstScreenState !== 'cleanup-pending' && firstScreenSyncReady);

	const dispatchReady = (request: number): void => {
		// Request 0 is an unsolicited availability hint and can be emitted before a
		// background listener exists. Put the clone-safe tree on the first correlated
		// reply so the O(tree) clone happens once and always has a receiver.
		const snapshot =
			request === LYNX_READY_ANNOUNCEMENT_REQUEST || firstTreeSnapshotSent || firstTree === null
				? null
				: firstTree.snapshot;
		const reply: LynxMainReadyReply = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'main-ready',
			request,
			...(snapshot == null ? null : { firstTree: snapshot }),
		};
		dispatch(reply);
		if (snapshot !== null) firstTreeSnapshotSent = true;
	};

	const announceReady = (): void => {
		if (!canAnnounceReady()) return;
		try {
			if (!readyAnnouncementSent && queuedReadyRequests.size === 0) {
				// A queued request already proves the background listener is present, so
				// answer it directly instead of cloning the first-tree snapshot into both
				// an unsolicited announcement and the correlated reply.
				dispatchReady(LYNX_READY_ANNOUNCEMENT_REQUEST);
				readyAnnouncementSent = true;
			}
			for (const request of [...queuedReadyRequests]) {
				dispatchReady(request);
				queuedReadyRequests.delete(request);
				readyAnnouncementSent = true;
			}
		} catch (error) {
			throw report(error, 'Octane Lynx could not dispatch the main-ready reply.');
		}
	};

	const releaseFirstTree = (): void => {
		if (firstTree === null) return;
		try {
			releaseLynxFirstTree(firstTree);
		} catch (error) {
			report(error, 'Octane Lynx could not release its first-screen journal.');
			return;
		}
		firstTree = null;
	};

	const disposeAvailableFirstTree = (): boolean => {
		if (firstTree === null) return true;
		const cleanup = disposeLynxFirstTree(firstTree);
		for (const error of cleanup.errors) {
			report(error, 'Octane Lynx first-screen cleanup failed.');
		}
		if (cleanup.complete) releaseFirstTree();
		return cleanup.complete && firstTree === null;
	};

	const disposeFailedFirstScreenSource = (): boolean => {
		if (failedFirstScreenSource === null) return true;
		const cleanup = disposeLynxHostContainer(failedFirstScreenSource);
		for (const error of cleanup.errors) {
			report(error, 'Octane Lynx failed first-screen cleanup retry.');
		}
		if (cleanup.complete) failedFirstScreenSource = null;
		return cleanup.complete;
	};

	const retryFirstScreenCleanup = (): boolean => {
		for (let attempt = 0; attempt < MAX_CLOSE_CLEANUP_ATTEMPTS; attempt++) {
			const treeComplete = disposeAvailableFirstTree();
			const sourceComplete = disposeFailedFirstScreenSource();
			if (treeComplete && sourceComplete) return true;
		}
		return false;
	};

	const forceCloseWorkletRuntime = (): void => {
		restoreRunWorklet?.();
		restoreRunWorklet = null;
		uninstallCallBridge?.();
		uninstallCallBridge = null;
		uninstallWorkletRegistry?.();
		uninstallWorkletRegistry = null;
		worklets.close();
	};

	const closeWorkletRuntime = (): boolean => {
		if (active !== null || firstTree !== null || failedFirstScreenSource !== null) return false;
		forceCloseWorkletRuntime();
		return true;
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
				const resolved =
					firstTree === null ? null : resolveLynxFirstTreeEvent(firstTree, delivery.token);
				return Object.freeze({
					token: delivery.token,
					payload: snapshotLynxNativeEventPayload(delivery.payload),
					...(resolved === null
						? null
						: {
								firstTreeTarget: Object.freeze({
									host: resolved.host,
									generation: resolved.generation,
									type: resolved.type,
									priority: resolved.priority,
								}),
							}),
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
			const firstTarget = delivery.firstTreeTarget;
			const resolved =
				firstTarget === undefined
					? resolveLynxHostNativeEvent(active!.container, delivery.token)
					: (() => {
							const handle = driver.getPublicInstance(active!.container, firstTarget.host);
							if (
								handle === null ||
								handle.generation !== firstTarget.generation ||
								!isLynxHostAttached(active!.container, firstTarget.host)
							) {
								return null;
							}
							const listener = getLynxHostEventListener(
								active!.container,
								firstTarget.host,
								firstTarget.type,
							);
							if (listener === null || listener.priority !== firstTarget.priority) return null;
							return Object.freeze({ listener: listener.id, priority: listener.priority });
						})();
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
			const queuedCount = queuedNativeEvents.reduce((count, queued) => count + queued.length, 0);
			if (
				(firstTree !== null || awaitingAdoption !== null) &&
				queuedCount + snapshot.length > MAX_FIRST_SCREEN_EVENT_DELIVERIES
			) {
				report(
					new Error(
						`Octane Lynx dropped a first-screen event batch after ${MAX_FIRST_SCREEN_EVENT_DELIVERIES} buffered deliveries.`,
					),
				);
				return;
			}
			queuedNativeEvents.push(snapshot);
			return;
		}
		if (firstTree !== null || awaitingAdoption !== null) {
			const queuedCount = queuedNativeEvents.reduce((count, queued) => count + queued.length, 0);
			if (queuedCount + snapshot.length > MAX_FIRST_SCREEN_EVENT_DELIVERIES) {
				report(
					new Error(
						`Octane Lynx dropped a first-screen event batch after ${MAX_FIRST_SCREEN_EVENT_DELIVERIES} buffered deliveries.`,
					),
				);
				return;
			}
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

	const deliverHostAttachments = (
		version: number,
		deltas: readonly LynxHostAttachmentDelta[],
	): void => {
		if (deltas.length === 0) return;
		if (active === null || active.acceptedVersion !== version) {
			throw new Error('Octane Lynx received a stale or foreign list attachment batch.');
		}
		const changes = deltas.filter((delta) => {
			const handle = driver.getPublicInstance(active!.container, delta.id);
			return handle !== null && handle.generation === delta.generation;
		});
		if (changes.length === 0) return;
		const message: LynxHostAttachmentMessage = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: active.root,
			version,
			type: 'host-attachment',
			changes: Object.freeze(
				changes.map((delta) =>
					Object.freeze({
						id: delta.id,
						generation: delta.generation,
						attached: delta.attached,
					}),
				),
			),
		};
		dispatch(message);
	};

	const submitHostAttachments = (
		version: number,
		deltas: readonly LynxHostAttachmentDelta[],
	): void => {
		if (closed) return;
		if (commitInProgress) {
			queuedHostAttachments.push({ version, deltas });
			return;
		}
		try {
			deliverHostAttachments(version, deltas);
		} catch (error) {
			failAcceptedRoot(version, error);
		}
	};

	const drainHostAttachments = (): boolean => {
		const record = active;
		for (const queued of queuedHostAttachments.splice(0)) {
			try {
				deliverHostAttachments(queued.version, queued.deltas);
			} catch (error) {
				failAcceptedRoot(queued.version, error);
				return false;
			}
			if (active !== record) return false;
		}
		return true;
	};

	const reject = (identity: UniversalTransportIdentity, error: unknown): void => {
		const queuedNativeEventCount = queuedNativeEvents.length;
		const queuedAttachmentCount = queuedHostAttachments.length;
		try {
			dispatch({
				...identity,
				type: 'reject',
				error: wireError(error, 'Octane Lynx rejected a host batch.'),
			});
		} catch (dispatchError) {
			throw report(dispatchError, 'Octane Lynx could not dispatch a host rejection.');
		} finally {
			// Preserve already-buffered events for the accepted/adopting root while
			// discarding only callbacks fired reentrantly by this rejection.
			queuedNativeEvents.length = queuedNativeEventCount;
			queuedHostAttachments.length = queuedAttachmentCount;
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

	const finalizeDisposedRoot = (record: ActiveLynxMainRoot<Node>, version: number): void => {
		if (active !== record) return;
		finishMainCallPublication();
		worklets.releaseOwners();
		rememberDisposed(record.root, version);
		active = null;
	};

	const failAcceptedResponse = (
		record: ActiveLynxMainRoot<Node>,
		value: unknown,
		fallback: string,
		response: string,
	): Error => {
		const error = report(value, fallback);
		if (active !== record) return error;
		record.faulted = true;
		queuedNativeEvents.length = 0;
		queuedHostAttachments.length = 0;
		awaitingAdoption = null;
		resetThreadCalls(error);
		finishMainCallPublication();
		const cleanup = disposeRecord(record);
		const firstScreenComplete = cleanup.complete && retryFirstScreenCleanup();
		if (cleanup.complete && firstScreenComplete) {
			finalizeDisposedRoot(record, record.acceptedVersion);
		} else {
			report(
				new Error(
					`Octane Lynx could not fully clean up root ${record.root} and its first-screen state after ${response} dispatch failed.`,
				),
			);
		}
		return error;
	};

	const failAcceptedRoot = (version: number, value: unknown): void => {
		const error = report(value, 'Octane Lynx accepted host callback failed.');
		const record = active;
		if (record === null || record.acceptedVersion !== version || record.faulted) {
			report(new Error('Octane Lynx received a stale or foreign accepted host callback fault.'));
			return;
		}
		record.faulted = true;
		queuedNativeEvents.length = 0;
		queuedHostAttachments.length = 0;
		awaitingAdoption = null;
		resetThreadCalls(error);
		finishMainCallPublication();
		const message: LynxHostFaultMessage = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: record.root,
			version,
			type: 'host-fault',
			error: wireError(error, 'Octane Lynx accepted host callback failed.'),
		};
		try {
			dispatch(message);
		} catch (dispatchError) {
			report(dispatchError, 'Octane Lynx could not dispatch an accepted host callback fault.');
		}
		// ContextProxy delivery can be asynchronous. Do not leave a known-faulted
		// native tree live while waiting for background to request terminal dispose.
		if (active === record) {
			const cleanup = disposeRecord(record);
			if (cleanup.complete && retryFirstScreenCleanup()) {
				finalizeDisposedRoot(record, record.acceptedVersion);
			}
		}
	};

	const handleMainCallPublication = (message: LynxMainCallPublicationMessage): void => {
		const exactActive =
			active !== null && message.root === active.root && message.version === active.acceptedVersion;
		const failExactPhase = (detail: string): void => {
			const error = new Error(
				`Octane Lynx received ${detail} for the active main-call publication.`,
			);
			if (active === null || !exactActive || active.faulted) {
				report(error);
				if (exactActive) finishMainCallPublication();
				return;
			}
			failAcceptedRoot(active.acceptedVersion, error);
		};

		if (message.phase === 'open') {
			if (!exactActive) {
				report(new Error('Octane Lynx received a stale or foreign main-call publication open.'));
				return;
			}
			if (mainCallPublication !== null || message.version <= active!.lastMainCallPublication) {
				failExactPhase(mainCallPublication === null ? 'a replayed open' : 'a nested open');
				return;
			}
			try {
				worklets.beginRefOwnerPublication();
				mainCallPublication = Object.freeze({
					protocol: message.protocol,
					renderer: message.renderer,
					root: message.root,
					version: message.version,
				});
				active!.lastMainCallPublication = message.version;
			} catch (error) {
				failAcceptedRoot(active!.acceptedVersion, error);
			}
			return;
		}
		if (mainCallPublication === null) {
			if (exactActive) failExactPhase('a close without an open');
			else
				report(new Error('Octane Lynx received a stale or foreign main-call publication close.'));
			return;
		}
		if (!sameLynxTransportIdentity(mainCallPublication, message)) {
			if (exactActive) failExactPhase('a mismatched close');
			else
				report(new Error('Octane Lynx received a stale or foreign main-call publication close.'));
			return;
		}
		finishMainCallPublication();
	};

	const abortKey = (identity: UniversalTransportIdentity) => `${identity.root}:${identity.version}`;

	const handleReady = (message: LynxMainReadyRequest): void => {
		queuedReadyRequests.add(message.request);
		if (firstScreenState === 'cleanup-pending' && retryFirstScreenCleanup()) {
			firstScreenState = 'failed';
		}
		if (canAnnounceReady()) announceReady();
	};

	const renderFirstScreen = <Props>(
		component: UniversalComponent<Props>,
		props: Props,
	): LynxFirstScreenRenderResult => {
		if (closed) throw new Error('Octane Lynx first-screen root rendered after receiver close.');
		if (firstScreenState !== 'open') {
			throw new Error(
				'Octane Lynx first-screen root is one-shot and its render window has closed.',
			);
		}
		let source: LynxHostContainer<Node> | null = null;
		try {
			const result = renderLynxFirstScreen(component, props);
			source = createLynxHostContainer(papi, {
				root: FIRST_SCREEN_ROOT_ID,
				page,
				worklets,
			});
			const prepared = prepareLynxHostBatch(source, result.batch);
			prepared.apply();
			if (!prepared.mutationStarted) {
				throw new Error('Octane Lynx first-screen host batch did not cross its apply boundary.');
			}
			firstTree = captureLynxFirstTree(source);
			firstScreenState = 'painted';
			if (firstScreenSync === 'automatic') firstScreenSyncReady = true;
			announceReady();
			return result;
		} catch (error) {
			firstScreenState = 'cleanup-pending';
			firstScreenSyncReady = true;
			if (firstTree === null && source !== null) {
				// Retain the only native ownership journal before cleanup. A throwing
				// remove/flush must remain retryable rather than leaking an unreachable
				// first tree and allowing the background root to duplicate it.
				failedFirstScreenSource = source;
			}
			if (retryFirstScreenCleanup()) {
				firstScreenState = 'failed';
			} else {
				report(
					new Error(
						'Octane Lynx withheld background readiness because failed first-screen cleanup remains incomplete.',
					),
				);
			}
			announceReady();
			throw report(error, 'Octane Lynx could not render its synchronous first screen.');
		}
	};

	const markFirstScreenSyncReady = (): void => {
		if (!firstScreenEnabled) {
			throw new Error('Octane Lynx first-screen synchronization is not enabled.');
		}
		if (closed) throw new Error('Octane Lynx first-screen synchronization ran after close.');
		if (firstScreenSyncReady) return;
		firstScreenSyncReady = true;
		if (firstScreenState === 'open') firstScreenState = 'skipped';
		announceReady();
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
		if (mainCallPublication !== null) {
			const publication = mainCallPublication;
			failAcceptedRoot(
				publication.version,
				new Error('Octane Lynx commit arrived before main-call publication closed.'),
			);
			reject(
				identity,
				new Error('Octane Lynx commit arrived before main-call publication closed.'),
			);
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
						worklets,
						onAttachments: submitHostAttachments,
						onCallbackFault: failAcceptedRoot,
					}),
					acceptedVersion: 0,
					lastMainCall: 0,
					lastMainCallPublication: 0,
					faulted: false,
				};
			} catch (error) {
				reject(identity, error);
				return;
			}
		}

		let prepared: LynxPreparedHostBatch;
		// The opaque journal remains live after transfer only so first-screen event
		// tokens can be resolved until background confirms listener ownership. It
		// must never be offered to an already-populated background container again.
		const candidateFirstTree = provisional ? firstTree : null;
		try {
			prepared = prepareLynxHostBatch(
				record.container,
				message.batch,
				candidateFirstTree === null
					? undefined
					: {
							firstTree: candidateFirstTree,
							onMismatch(error) {
								report(error, 'Octane Lynx repaired a first-screen mismatch.');
							},
						},
			);
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
		if (applyFailed) {
			record.faulted = true;
			// ACK delivery may synchronously publish effects that issue thread calls.
			// Close both directions before dispatching it so those calls cannot run
			// against a host whose accepted native application already failed.
			resetThreadCalls(applyError);
		}
		if (!applyFailed && prepared.firstTreeAction === 'adopt') {
			awaitingAdoption = Object.freeze({ ...identity });
		} else if (candidateFirstTree !== null) {
			queuedNativeEvents.length = 0;
			if (prepared.firstTreeAction === 'repair' || applyFailed) {
				disposeAvailableFirstTree();
			}
		}
		const handles = acknowledgementHandles(driver, record.container, prepared, message.batch);
		const acknowledgement: LynxTransportAcknowledgement = {
			...identity,
			type: 'ack',
			handles,
			...(prepared.firstTreeAction === 'none'
				? null
				: {
						adoption: prepared.firstTreeAction === 'adopt' ? 'adopted' : 'repaired',
					}),
		};
		try {
			dispatch(acknowledgement);
		} catch (error) {
			// ContextProxy may deliver the acknowledgement (and reentrant calls) before
			// reporting a dispatch failure. Release those activations before owner state.
			throw failAcceptedResponse(
				record,
				error,
				'Octane Lynx could not dispatch an accepted batch acknowledgement.',
				'acknowledgement',
			);
		}

		if (!applyFailed) {
			if (!drainHostAttachments()) return;
			if (awaitingAdoption === null) drainNativeEvents();
			try {
				dispatch({ ...identity, type: 'complete' });
				if (awaitingAdoption === null) drainNativeEvents();
				if (awaitingAdoption === null) openBackgroundCalls();
			} catch (error) {
				throw failAcceptedResponse(
					record,
					error,
					'Octane Lynx could not dispatch accepted batch completion.',
					'completion',
				);
			}
			return;
		}

		queuedNativeEvents.length = 0;
		queuedHostAttachments.length = 0;
		awaitingAdoption = null;
		if (firstTree !== null) disposeAvailableFirstTree();
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
			queuedHostAttachments.length = 0;
			throw error;
		} finally {
			commitInProgress = false;
		}
	};

	const handleAdoptionReady = (message: LynxAdoptionReadyMessage): void => {
		if (
			awaitingAdoption === null ||
			active === null ||
			message.root !== awaitingAdoption.root ||
			message.version !== awaitingAdoption.version ||
			message.root !== active.root ||
			message.version > active.acceptedVersion ||
			active.faulted
		) {
			report(new Error('Octane Lynx received a stale or foreign adoption-ready message.'));
			return;
		}
		try {
			drainNativeEvents();
		} finally {
			awaitingAdoption = null;
			releaseFirstTree();
		}
		openBackgroundCalls();
	};

	const handleDispose = (message: LynxDisposeMessage | LynxTerminalDisposeMessage): void => {
		const terminal = message.type === 'terminal-dispose';
		const resetDisposedState = (): void => {
			queuedNativeEvents.length = 0;
			queuedHostAttachments.length = 0;
			awaitingAdoption = null;
			resetThreadCalls(new Error(`Octane Lynx root ${message.root} was disposed.`));
			finishMainCallPublication();
		};
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
		const requestRetry = (error: Error) => {
			try {
				dispatch({
					...message,
					type: 'dispose-retry',
					error: wireError(error, 'Octane Lynx native cleanup is incomplete.'),
				});
			} catch (dispatchError) {
				throw report(dispatchError, 'Octane Lynx could not dispatch a dispose retry request.');
			}
		};
		if (disposedRoots.get(message.root) === message.version) {
			acknowledge();
			return;
		}
		if (terminal && active === null) {
			resetDisposedState();
			if (!retryFirstScreenCleanup()) {
				requestRetry(
					report(
						new Error(
							`Octane Lynx withheld dispose acknowledgement for root ${message.root}; first-screen cleanup remains incomplete.`,
						),
					),
				);
				return;
			}
			worklets.releaseOwners();
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
		resetDisposedState();
		const record = active;
		const cleanup = disposeRecord(record);
		if (!cleanup.complete) {
			const unresolvedError = report(
				new Error(
					`Octane Lynx withheld dispose acknowledgement for root ${record.root}; ${cleanup.remainingRoots} native root(s) remain attached.`,
				),
			);
			requestRetry(cleanup.errors[0] ?? unresolvedError);
			return;
		}
		if (!retryFirstScreenCleanup()) {
			requestRetry(
				report(
					new Error(
						`Octane Lynx withheld dispose acknowledgement for root ${record.root}; first-screen cleanup remains incomplete.`,
					),
				),
			);
			return;
		}
		finalizeDisposedRoot(record, terminal ? message.version : record.acceptedVersion);
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
			const raw =
				event.data !== null && typeof event.data === 'object'
					? (event.data as Record<string, unknown>)
					: null;
			if (
				identity !== null &&
				raw !== null &&
				(raw.type === 'call-background-result' || raw.type === 'call-background-error') &&
				Number.isSafeInteger(raw.call) &&
				(raw.call as number) > 0
			) {
				const entry = pendingBackgroundCalls.get(raw.call as number);
				if (
					entry !== undefined &&
					entry.identity !== null &&
					sameLynxTransportIdentity(entry.identity, identity)
				) {
					pendingBackgroundCalls.delete(entry.call);
					entry.deferred.reject(normalized);
					return;
				}
			}
			if (
				identity !== null &&
				raw !== null &&
				raw.type === 'call-main' &&
				Number.isSafeInteger(raw.call) &&
				(raw.call as number) > 0 &&
				active !== null &&
				active.root === identity.root &&
				identity.version <= active.acceptedVersion
			) {
				try {
					dispatch({
						...identity,
						type: 'call-main-error',
						call: raw.call as number,
						error: wireError(normalized, 'Octane Lynx received a malformed main-thread call.'),
					});
				} catch (dispatchError) {
					report(dispatchError, 'Octane Lynx could not reject a malformed main-thread call.');
				}
				return;
			}
			if (identity !== null && raw?.type === 'commit') {
				reject(identity, normalized);
			}
			return;
		}
		if (message.type === 'main-ready-request') {
			handleReady(message);
		} else if (message.type === 'adoption-ready') {
			handleAdoptionReady(message);
		} else if (message.type === 'main-call-publication') {
			handleMainCallPublication(message);
		} else if (message.type === 'call-main') {
			handleMainCall(message);
		} else if (message.type === 'cancel-main') {
			handleCancelMainCall(message);
		} else if (
			message.type === 'call-background-result' ||
			message.type === 'call-background-error'
		) {
			settleBackgroundCall(message);
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
		if (firstScreenEnabled) {
			uninstallFirstScreenHost = installLynxFirstScreenHost({
				render: renderFirstScreen,
				markSyncReady: markFirstScreenSyncReady,
				unmount() {
					queuedNativeEvents.length = 0;
					awaitingAdoption = null;
					// Unmount closes the authored synchronous window immediately. Cleanup
					// can still gate readiness until a retry succeeds.
					firstScreenSyncReady = true;
					if (!retryFirstScreenCleanup()) {
						firstScreenState = 'cleanup-pending';
						report(
							new Error(
								'Octane Lynx withheld background readiness because first-screen unmount cleanup remains incomplete.',
							),
						);
						return;
					}
					if (
						firstScreenState === 'open' ||
						firstScreenState === 'painted' ||
						firstScreenState === 'cleanup-pending'
					) {
						firstScreenState = 'skipped';
					}
					announceReady();
				},
			});
		}
		announceReady();
	} catch (error) {
		closed = true;
		context.removeEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
		uninstallFirstScreenHost?.();
		uninstallFirstScreenHost = null;
		if (active !== null) {
			disposeRecord(active);
			active = null;
		}
		if (firstTree !== null) disposeAvailableFirstTree();
		forceCloseWorkletRuntime();
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
		firstScreenSnapshot() {
			return firstTree?.snapshot ?? null;
		},
		markFirstScreenSyncReady,
		callBackground,
		close() {
			resetThreadCalls(new Error('Octane Lynx main-thread receiver was closed.'));
			finishMainCallPublication();
			queuedNativeEvents.length = 0;
			queuedHostAttachments.length = 0;
			queuedReadyRequests.clear();
			awaitingAdoption = null;
			uninstallFirstScreenHost?.();
			uninstallFirstScreenHost = null;
			if (!closed) {
				closed = true;
				try {
					context.removeEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
				} catch (error) {
					report(error, 'Octane Lynx could not remove its main-thread listener.');
				}
			}
			let activeCleanupComplete = active === null;
			let closingRecord: ActiveLynxMainRoot<Node> | null = null;
			if (active !== null) {
				const record = active;
				closingRecord = record;
				for (let attempt = 0; attempt < MAX_CLOSE_CLEANUP_ATTEMPTS; attempt++) {
					if (disposeRecord(record).complete) {
						activeCleanupComplete = true;
						break;
					}
				}
			}
			const firstScreenCleanupComplete = retryFirstScreenCleanup();
			if (closingRecord !== null && activeCleanupComplete && firstScreenCleanupComplete) {
				finalizeDisposedRoot(closingRecord, closingRecord.acceptedVersion);
			}
			if (!firstScreenCleanupComplete) {
				report(
					new Error(
						'Octane Lynx retained incomplete first-screen cleanup for a later close retry.',
					),
				);
			}
			closeWorkletRuntime();
		},
	};
	return Object.freeze(controller);
}

export {
	runOnBackground,
	runOnMainThread,
	LynxCrossThreadCallCancelledError,
} from './core/worklets.js';
export type {
	LynxBackgroundFunctionDescriptor,
	LynxCancelablePromise,
	LynxMainThreadWorkletDescriptor,
} from './core/worklets.js';
