import { hasOwnSymbolFields } from './core/own-symbols.js';
import { hasCrossRealmPlainPrototype } from './core/plain-object.js';
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
	LYNX_CAPABILITY_READY_REQUEST_BASE,
	LYNX_COMPACT_ACKNOWLEDGEMENT,
	LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
	LYNX_LAZY_PUBLIC_INSTANCES,
	LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE,
	LYNX_TEMPLATE_RUN_READY_REQUEST_BASE,
	LYNX_TEARDOWN_RUN_READY_REQUEST_BASE,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_READY_ANNOUNCEMENT_REQUEST,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	countLynxCompactAcknowledgementHosts,
	sameLynxTransportIdentity,
	selfCheckLynxBackgroundInboundMessage,
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
	type LynxGlobalPropsMessage,
	type LynxHostAttachmentMessage,
	type LynxHostFaultMessage,
	type LynxMainCallPublicationMessage,
	type LynxMainThreadCapabilities,
	type LynxMainReadyReply,
	type LynxMainReadyRequest,
	type LynxPageDataMessage,
	type LynxPublicHandleDelta,
	type LynxTransportAcknowledgement,
	type LynxTerminalDisposeMessage,
} from './core/protocol.js';
import {
	compactLynxLifecycleMessages,
	snapshotLynxLifecycleData,
	type LynxLifecycleDataRecord,
} from './core/lifecycle-data.js';
import { createLynxElementPAPI, type LynxElementPAPI, type LynxElementRef } from './core/papi.js';
import { LYNX_PROFILE, lynxWireProfile } from './core/profiling.js';
import {
	decodeLynxTransportValue,
	encodeLynxTransportValue,
	localizeLynxHostValue,
	type LynxStructuredValue,
} from './core/transport-codec.js';
import {
	createReplaceableLynxMainThreadWorkletRegistry,
	createUnavailableLynxMainThreadWorkletRegistry,
	subscribeLynxMainThreadWorkletFeature,
	type LynxMainThreadWorkletFeature,
} from './core/main-thread-worklet-feature.js';
import type { LynxMainThreadWorkletRegistry, LynxWorkletValue } from './core/worklets.js';
import { installLynxFirstScreenHost } from './core/first-screen-host.js';
import { renderLynxFirstScreen, type LynxFirstScreenRenderResult } from './main-renderer.js';

interface LynxMainThreadGlobals {
	readonly lynx?: {
		getEngine?(): LynxContextProxy;
		getJSContext?(): LynxContextProxy;
		getNative?(): LynxContextProxy;
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
	/**
	 * `engine` defers the one-shot first-screen render until the engine's
	 * `__RenderPage` lifecycle arrives. Native decodes the template's PageConfig
	 * onto the ElementManager only after main-thread script evaluation
	 * (`TemplateAssembler::DidVMExecute`), so elements created during evaluation
	 * see config-dependent defaults — `defaultOverflowVisible` above all — as
	 * unset and paint clipped. `immediate` keeps the evaluation-time render used
	 * by source and JavaScript-host tests.
	 */
	readonly firstScreenRender?: 'immediate' | 'engine';
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
	/** Irreversibly close this native page lifetime and notify the background runtime. */
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
	capabilities?: LynxMainThreadCapabilities;
	postFirstTreeUpgrade?: true;
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
const MAX_READY_REQUEST_TOMBSTONES = 128;
const MAX_CLOSE_CLEANUP_ATTEMPTS = 3;
const MAX_FIRST_SCREEN_EVENT_DELIVERIES = 128;
const MAX_QUEUED_THREAD_CALLS = 128;
const MAX_QUEUED_LIFECYCLE_MESSAGES = 128;
const FIRST_SCREEN_ROOT_ID = 1;
const LYNX_DESTROY_LIFETIME_EVENT = '__DestroyLifetime';
const LYNX_RENDER_PAGE_EVENT = '__RenderPage';
const LYNX_UPDATE_PAGE_EVENT = '__UpdatePage';
const LYNX_UPDATE_GLOBAL_PROPS_EVENT = '__UpdateGlobalProps';

type LynxLifecycleMessage = LynxPageDataMessage | LynxGlobalPropsMessage;

function lifecycleRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`Octane Lynx ${label} must be a plain object.`);
	}
	if (!hasCrossRealmPlainPrototype(value)) {
		throw new TypeError(`Octane Lynx ${label} must be a plain object.`);
	}
	if (hasOwnSymbolFields(value)) {
		throw new TypeError(`Octane Lynx ${label} contains symbol fields.`);
	}
	return value as Record<string, unknown>;
}

function lifecycleTuple(
	event: LynxContextProxyEvent,
	expectedType: string,
	length: number,
): readonly unknown[] {
	if (event.type !== expectedType) {
		throw new TypeError(
			`Octane Lynx engine lifecycle expected ${JSON.stringify(expectedType)}, received ${JSON.stringify(event.type)}.`,
		);
	}
	// The engine sent this, not Octane's transport, so it is the one inbound
	// payload nothing has encoded. Materialize it before anything reflects on
	// it: every read below is written for ordinary local data, and a
	// host-backed reference answers some of those reads and throws on others.
	const data = localizeLynxHostValue(event.data);
	if (!Array.isArray(data) || data.length !== length) {
		throw new TypeError(`Octane Lynx ${expectedType} data must be an exact ${length}-item tuple.`);
	}
	// Materialization is also normalization: JSON output is always a dense
	// ordinary array with exactly its index properties as plain enumerable data
	// fields and no symbols, so the structural checks the pre-encoding version
	// of this function ran here can never fire again. A hole in the raw tuple
	// arrives as null and is judged by each caller's per-element validation.
	return data;
}

function lifecycleBooleanOption(
	options: Record<string, unknown>,
	name: string,
	label: string,
): boolean {
	const descriptor = Object.getOwnPropertyDescriptor(options, name);
	if (descriptor === undefined) return false;
	if (
		!descriptor.enumerable ||
		!Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
		typeof descriptor.value !== 'boolean'
	) {
		throw new TypeError(`Octane Lynx ${label}.${name} must be a boolean data property.`);
	}
	return descriptor.value;
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

function resolveNativeLifecycleContext(target: LynxMainThreadGlobals): LynxContextProxy | null {
	const getNative = target.lynx?.getNative;
	if (getNative === undefined) return null;
	if (typeof getNative !== 'function') {
		throw new TypeError('Octane Lynx main-thread lynx.getNative must be a function when provided.');
	}
	const context = getNative.call(target.lynx);
	if (
		context === null ||
		typeof context !== 'object' ||
		typeof context.addEventListener !== 'function' ||
		typeof context.removeEventListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx native lifecycle requires ContextProxy addEventListener/removeEventListener.',
		);
	}
	return context;
}

function resolveEngineLifecycleContext(target: LynxMainThreadGlobals): LynxContextProxy | null {
	const getEngine = target.lynx?.getEngine;
	if (getEngine === undefined) return null;
	if (typeof getEngine !== 'function') {
		throw new TypeError('Octane Lynx main-thread lynx.getEngine must be a function when provided.');
	}
	const context = getEngine.call(target.lynx);
	if (
		context === null ||
		typeof context !== 'object' ||
		typeof context.addEventListener !== 'function' ||
		typeof context.removeEventListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx engine lifecycle requires ContextProxy addEventListener/removeEventListener.',
		);
	}
	return context;
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
	const handles: LynxPublicHandleDelta[] = [];
	let publishedIds: Set<number> | null = null;
	const alreadyPublished = (id: number): boolean => {
		if (publishedIds === null) {
			publishedIds = new Set();
			for (const handle of handles) {
				if ('id' in handle) publishedIds.add(handle.id);
			}
		}
		return publishedIds.has(id);
	};
	for (const delta of prepared.handleDelta) {
		if (delta.op === 'destroy-run') {
			handles.push(
				Object.freeze({
					op: 'remove-run',
					firstId: delta.firstId,
					hostCount: delta.hostCount,
					generation: delta.generation,
				}),
			);
		} else if (delta.op === 'destroy') {
			handles.push(Object.freeze({ op: 'remove', id: delta.id, generation: delta.generation }));
		} else {
			handles.push(
				publicHandleUpsert(delta.handle, getLynxHostPublicState(container, delta.handle.id)),
			);
		}
	}
	for (const command of batch.commands) {
		if (command.op !== 'update' || alreadyPublished(command.id)) continue;
		const handle = driver.getPublicInstance(container, command.id);
		if (handle !== null) {
			handles.push(publicHandleUpsert(handle, getLynxHostPublicState(container, command.id)));
			publishedIds!.add(command.id);
		}
	}
	for (const delta of prepared.listAncestryDelta) {
		if (alreadyPublished(delta.id)) continue;
		handles.push(
			Object.freeze({
				op: 'list-ancestry',
				id: delta.id,
				generation: delta.generation,
				listDescendant: delta.listDescendant,
			}),
		);
		publishedIds!.add(delta.id);
	}
	return Object.freeze(handles);
}

function freezeValidatedIntrinsicRun(
	run: Extract<UniversalHostBatch['commands'][number], { readonly op: 'mount-template-run' }>,
): void {
	// MessagePort structured-clones worker payloads and drops every frozen
	// descriptor. Restore immutability only after the complete receive-boundary
	// validator has rejected hostile prototypes, accessors, symbols, and scalars.
	// The program is a tiny shared shape; its flat values are frozen in place.
	const program = run.program;
	for (const node of program.nodes) {
		Object.freeze(node.props);
		if (node.bindings !== undefined) {
			for (const binding of node.bindings) Object.freeze(binding);
			Object.freeze(node.bindings);
		}
		Object.freeze(node);
	}
	Object.freeze(program.nodes);
	for (const event of program.events) Object.freeze(event);
	Object.freeze(program.events);
	Object.freeze(program);
	Object.freeze(run.values);
	Object.freeze(run);
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
	if (
		options.firstScreenRender !== undefined &&
		options.firstScreenRender !== 'immediate' &&
		options.firstScreenRender !== 'engine'
	) {
		throw new TypeError('Octane Lynx firstScreenRender must be immediate or engine.');
	}
	if (options.firstScreen !== true && options.firstScreenRender !== undefined) {
		throw new TypeError('Octane Lynx firstScreenRender requires firstScreen: true.');
	}
	const firstScreenEnabled = options.firstScreen === true;
	const firstScreenSync = options.firstScreenSync ?? 'automatic';
	const rawTarget = options.target ?? globalThis;
	if (rawTarget === null || typeof rawTarget !== 'object') {
		throw new TypeError('Octane Lynx main-thread target must be a global object.');
	}
	const target = rawTarget as LynxMainThreadGlobals;
	const context = resolveContext(target, options.context);
	const nativeLifecycleContext = resolveNativeLifecycleContext(target);
	const engineLifecycleContext = resolveEngineLifecycleContext(target);
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
	// The native main thread exposes SystemInfo only as `lynx.SystemInfo`, but
	// authored `'main thread'` functions read the documented bare global; expose
	// it exactly as ReactLynx's worklet environment setup does.
	const environmentTarget = target as { SystemInfo?: unknown; lynx?: { SystemInfo?: unknown } };
	if (environmentTarget.SystemInfo === undefined) {
		environmentTarget.SystemInfo = environmentTarget.lynx?.SystemInfo ?? {};
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
	let lifecycleClosed = false;
	let lifecycleDrainInProgress = false;
	let lifecycleOverflowReported = false;
	let commitInProgress = false;
	let firstScreenRenderInProgress = false;
	let closePending = false;
	let finalizeDeferredClose: (() => void) | null = null;
	type FirstScreenState =
		| 'open'
		| 'painted'
		| 'skipped'
		| 'failed'
		| 'cleanup-pending:skipped'
		| 'cleanup-pending:failed';
	let firstScreenState: FirstScreenState = firstScreenEnabled ? 'open' : 'skipped';
	let firstScreenSyncReady = !firstScreenEnabled;
	const firstScreenRenderMode = options.firstScreenRender ?? 'immediate';
	let pendingFirstScreenRender: (() => void) | null = null;
	let firstScreenRenderReleased = firstScreenRenderMode !== 'engine';
	let firstTree: LynxFirstTree<Node> | null = null;
	let failedFirstScreenSource: LynxHostContainer<Node> | null = null;
	let awaitingAdoption: UniversalTransportIdentity | null = null;
	let readyAnnouncementSent = false;
	let readyAnnouncementInProgress = false;
	let dispatchingReadyRequest: number | null = null;
	let correlatedReadySent = false;
	let negotiatedCapabilities: LynxMainThreadCapabilities | undefined;
	let deferredFirstTreeCapabilities: LynxMainThreadCapabilities | undefined;
	let firstTreeSnapshotSent = false;
	let uninstallFirstScreenHost: (() => void) | null = null;
	// Reentrant PAPI work can enqueue a large burst; consumed slots are tombstoned
	// so the drain stays linear without retaining every processed message.
	const queuedCommits: Array<LynxCommitMessage | undefined> = [];
	const queuedNativeEvents: Array<readonly LynxQueuedNativeEventDelivery[]> = [];
	const queuedLifecycleMessages: LynxLifecycleMessage[] = [];
	const queuedReadyRequests = new Set<number>();
	const completedReadyRequests = new Set<number>();
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
	let unsubscribeWorkletFeature: (() => void) | null = null;
	let restoreHostHooks: (() => void) | null = null;
	let workletFeature: LynxMainThreadWorkletFeature | null = null;
	let worklets: LynxMainThreadWorkletRegistry = createUnavailableLynxMainThreadWorkletRegistry();
	const hostWorklets = createReplaceableLynxMainThreadWorkletRegistry(worklets);
	let mainCallPublication: UniversalTransportIdentity | null = null;
	let nativeDestroyListenerRegistered = false;
	let nativeDestroyReceived = false;
	const registeredEngineLifecycleListeners = new Set<string>();

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
	const requireWorkletFeature = (): LynxMainThreadWorkletFeature => {
		if (workletFeature !== null) return workletFeature;
		throw new Error(
			'Octane Lynx received main-thread worklet traffic, but this bundle compiled no worklet feature.',
		);
	};
	// Replaced with the terminal page-lifetime path before any host listener is
	// registered. The bootstrap fallback only protects unexpected early reentry.
	let terminateLifecycleDelivery = (value: unknown, fallback: string): void => {
		lifecycleClosed = true;
		report(value, fallback);
	};
	const reportEncodingDiagnostic = (error: Error): void => {
		report(error);
	};

	const dispatch = (message: LynxBackgroundInboundMessage): void => {
		const validated = selfCheckLynxBackgroundInboundMessage(message);
		context.dispatchEvent({
			type: LYNX_MAIN_TO_BACKGROUND_EVENT,
			data: encodeLynxTransportValue(validated, reportEncodingDiagnostic),
		});
	};

	const dispatchLifecycleMessage = (message: LynxLifecycleMessage): void => {
		if (lifecycleClosed) return;
		if (!correlatedReadySent || lifecycleDrainInProgress) {
			if (queuedLifecycleMessages.length >= MAX_QUEUED_LIFECYCLE_MESSAGES) {
				const compacted = compactLynxLifecycleMessages([...queuedLifecycleMessages, message]);
				queuedLifecycleMessages.length = 0;
				queuedLifecycleMessages.push(...compacted);
				if (!lifecycleOverflowReported) {
					lifecycleOverflowReported = true;
					report(
						new Error(
							`Octane Lynx engine lifecycle queue exceeded ${MAX_QUEUED_LIFECYCLE_MESSAGES} entries and was compacted to current state.`,
						),
					);
				}
				return;
			}
			queuedLifecycleMessages.push(message);
			return;
		}
		try {
			dispatch(message);
		} catch (error) {
			terminateLifecycleDelivery(
				error,
				'Octane Lynx could not deliver an engine lifecycle update.',
			);
		}
	};

	const drainLifecycleMessages = (): void => {
		if (lifecycleClosed || lifecycleDrainInProgress) return;
		lifecycleDrainInProgress = true;
		try {
			while (!lifecycleClosed && queuedLifecycleMessages.length !== 0) {
				const message = queuedLifecycleMessages.shift()!;
				try {
					dispatch(message);
				} catch (error) {
					terminateLifecycleDelivery(
						error,
						'Octane Lynx could not deliver a queued engine lifecycle update.',
					);
				}
			}
		} finally {
			lifecycleDrainInProgress = false;
			if (queuedLifecycleMessages.length === 0) lifecycleOverflowReported = false;
		}
	};

	const onRenderPage = (event: LynxContextProxyEvent): void => {
		if (lifecycleClosed) return;
		try {
			const tuple = lifecycleTuple(event, LYNX_RENDER_PAGE_EVENT, 2);
			lifecycleRecord(tuple[1], '__RenderPage render options');
			const data: LynxLifecycleDataRecord = snapshotLynxLifecycleData(
				tuple[0],
				'__RenderPage data',
			);
			dispatchLifecycleMessage(
				Object.freeze({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'page-data',
					operation: 'replace',
					data,
				}),
			);
		} catch (error) {
			report(error, 'Octane Lynx received malformed __RenderPage data.');
		} finally {
			// The engine dispatches __RenderPage after script evaluation, once the
			// decoded PageConfig is installed; a deferred first screen renders here.
			releaseFirstScreenRender();
		}
	};

	const onUpdatePage = (event: LynxContextProxyEvent): void => {
		if (lifecycleClosed) return;
		try {
			const tuple = lifecycleTuple(event, LYNX_UPDATE_PAGE_EVENT, 2);
			const options = lifecycleRecord(tuple[1], '__UpdatePage options');
			const reloadTemplate = lifecycleBooleanOption(
				options,
				'reloadTemplate',
				'__UpdatePage options',
			);
			if (reloadTemplate) {
				report(
					new Error(
						'Octane Lynx does not support __UpdatePage reloadTemplate; reconstruct the page instead.',
					),
				);
				return;
			}
			const resetPageData = lifecycleBooleanOption(
				options,
				'resetPageData',
				'__UpdatePage options',
			);
			const data: LynxLifecycleDataRecord = snapshotLynxLifecycleData(
				tuple[0],
				'__UpdatePage data',
			);
			dispatchLifecycleMessage(
				Object.freeze({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'page-data',
					operation: resetPageData ? 'reset' : 'update',
					data,
				}),
			);
		} catch (error) {
			report(error, 'Octane Lynx received malformed __UpdatePage data.');
		}
	};

	const onUpdateGlobalProps = (event: LynxContextProxyEvent): void => {
		if (lifecycleClosed) return;
		try {
			const tuple = lifecycleTuple(event, LYNX_UPDATE_GLOBAL_PROPS_EVENT, 1);
			const patch: LynxLifecycleDataRecord = snapshotLynxLifecycleData(
				tuple[0],
				'__UpdateGlobalProps patch',
			);
			dispatchLifecycleMessage(
				Object.freeze({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'global-props',
					patch,
				}),
			);
		} catch (error) {
			report(error, 'Octane Lynx received malformed __UpdateGlobalProps data.');
		}
	};

	const engineLifecycleListeners = Object.freeze([
		Object.freeze([LYNX_RENDER_PAGE_EVENT, onRenderPage] as const),
		Object.freeze([LYNX_UPDATE_PAGE_EVENT, onUpdatePage] as const),
		Object.freeze([LYNX_UPDATE_GLOBAL_PROPS_EVENT, onUpdateGlobalProps] as const),
	]);

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
					requireWorkletFeature().isolateValue(
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
					const isolated = requireWorkletFeature().isolateValue(
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
		const feature = requireWorkletFeature();
		const isolatedFn = feature.isolateValue(
			fn as LynxWorkletValue,
			'background function call target',
		);
		if (!feature.isBackgroundFunction(isolatedFn)) {
			throw new TypeError('Octane Lynx background function call target is invalid.');
		}
		const isolatedArgs = feature.isolateValue(
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

	const installWorkletFeature = (feature: LynxMainThreadWorkletFeature): void => {
		if (workletFeature === feature) return;
		if (workletFeature !== null) {
			throw new Error('Octane Lynx main-thread receiver changed worklet features after install.');
		}
		const registry = feature.createRegistry({
			callBackground(fn, args) {
				return callBackground(
					fn as LynxBackgroundFunctionWireDescriptor,
					args as readonly UniversalSerializableValue[],
				).promise;
			},
		});
		let uninstallRegistry: (() => void) | null = null;
		let uninstallBridge: (() => void) | null = null;
		try {
			uninstallRegistry = feature.installRegistry(registry);
			uninstallBridge = feature.installCallBridge({
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
			workletFeature = feature;
			worklets = registry;
			hostWorklets.replace(registry);
			uninstallWorkletRegistry = uninstallRegistry;
			uninstallCallBridge = uninstallBridge;
		} catch (error) {
			uninstallBridge?.();
			uninstallRegistry?.();
			registry.close();
			throw error;
		}
	};
	const uninstallWorkletFeature = (): void => {
		uninstallCallBridge?.();
		uninstallCallBridge = null;
		uninstallWorkletRegistry?.();
		uninstallWorkletRegistry = null;
	};
	const hostGlobals = rawTarget as Record<string, unknown>;
	const previousRunWorklet = hostGlobals.runWorklet;
	// Captured before the wrapper is installed, because installing it creates an
	// own property either way. `papi` resolved the same entry earlier and holds it
	// bound, so Octane's own commit flushes deliberately bypass this wrapper —
	// they never run inside a host dispatch.
	const hostFlush = hostGlobals.__FlushElementTree as (...values: unknown[]) => void;
	const hostOwnsFlush = Object.prototype.hasOwnProperty.call(hostGlobals, '__FlushElementTree');

	// A host may dispatch a `'main thread'` event handler from inside its own
	// element-tree work rather than from a clean stack. Lynx for Web does: its
	// wasm element context holds a live borrow across `common_event_handler` ->
	// `runWorklet`, so the host's own `__FlushElementTree` — the documented way a
	// main-thread handler publishes its mutations — throws "recursive use of an
	// object detected which would lead to unsafe aliasing in rust" for the whole
	// life of the page, and the throw escapes through the host's frames as an
	// uncaught error once per event. Most of that host's element PAPIs take the
	// same borrow and would fail the same way; only the ones backed by free wasm
	// functions are unaffected.
	//
	// This wraps the flush alone, not because the others are safe, but because
	// the flush is the only one whose effect survives being moved past the end of
	// the dispatch — every other PAPI has a return value or an ordering the
	// handler depends on. The inline call is still attempted first, which leaves
	// every host that permits a re-entrant flush on exactly its previous timing;
	// only a host that rejects one latches into the deferred path. A deferred
	// request holds the latest arguments and publishes once per microtask
	// checkpoint, so a handler bound to a per-frame event does not queue one job
	// per event.
	let hostDispatchDepth = 0;
	let hostTakesInlineFlush = true;
	let deferredFlush: readonly unknown[] | null = null;

	const runHostFlush = (args: readonly unknown[]): void => {
		hostFlush.apply(hostGlobals, args as unknown[]);
	};

	const drainDeferredFlush = (): void => {
		const args = deferredFlush;
		if (args === null) return;
		deferredFlush = null;
		try {
			runHostFlush(args);
		} catch (error) {
			report(error, 'Octane Lynx could not flush the element tree after a main-thread event.');
		}
	};

	// Last request wins: a second flush inside one checkpoint replaces the first
	// rather than queueing behind it, so its `node`/`options` are what publish.
	const deferHostFlush = (args: readonly unknown[]): void => {
		const alreadyScheduled = deferredFlush !== null;
		deferredFlush = args;
		if (!alreadyScheduled) void Promise.resolve().then(drainDeferredFlush);
	};

	const installedFlush = (...args: unknown[]): void => {
		if (hostDispatchDepth === 0) {
			runHostFlush(args);
			return;
		}
		if (!hostTakesInlineFlush) {
			deferHostFlush(args);
			return;
		}
		try {
			runHostFlush(args);
		} catch {
			hostTakesInlineFlush = false;
			deferHostFlush(args);
		}
	};

	const installedRunWorklet = (
		descriptor: import('./core/worklets.js').LynxMainThreadWorkletDescriptor,
		args?: readonly unknown[],
	) => {
		if (workletFeature === null) {
			report(
				new Error(
					'Octane Lynx host dispatched a main-thread worklet, but this bundle compiled none.',
				),
			);
			return undefined;
		}
		hostDispatchDepth++;
		try {
			return worklets.runWorklet(descriptor, args);
		} finally {
			hostDispatchDepth--;
		}
	};
	restoreHostHooks = () => {
		// A flush still owed to a torn-down page has nothing left to publish.
		deferredFlush = null;
		if (hostGlobals.__FlushElementTree === installedFlush) {
			// Restoring by assignment would leave a permanent own-property shadow on a
			// target that only inherits the PAPI, which an explicit `target` may.
			if (hostOwnsFlush) hostGlobals.__FlushElementTree = hostFlush;
			else delete hostGlobals.__FlushElementTree;
		}
		if (hostGlobals.runWorklet !== installedRunWorklet) return;
		if (previousRunWorklet === undefined) delete hostGlobals.runWorklet;
		else hostGlobals.runWorklet = previousRunWorklet;
	};
	try {
		unsubscribeWorkletFeature = subscribeLynxMainThreadWorkletFeature(installWorkletFeature);
		hostGlobals.runWorklet = installedRunWorklet;
		hostGlobals.__FlushElementTree = installedFlush;
	} catch (error) {
		restoreHostHooks?.();
		restoreHostHooks = null;
		uninstallWorkletFeature();
		unsubscribeWorkletFeature?.();
		unsubscribeWorkletFeature = null;
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

	const isFirstScreenCleanupPending = () =>
		firstScreenState === 'cleanup-pending:skipped' || firstScreenState === 'cleanup-pending:failed';

	const canAnnounceReady = () =>
		!firstScreenEnabled ||
		(firstScreenState !== 'open' && !isFirstScreenCleanupPending() && firstScreenSyncReady);

	const dispatchReady = (request: number): boolean => {
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
			...(request < LYNX_CAPABILITY_READY_REQUEST_BASE
				? null
				: {
						capabilities: {
							compactAck: 1 as const,
							...(driver.capabilities?.templateMount === true
								? { templateMount: 1 as const }
								: null),
							...(driver.capabilities?.templateProgramMount === true
								? { templateProgram: 1 as const }
								: null),
							...(request >= LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE &&
							driver.capabilities?.templateProgramMount === true &&
							driver.capabilities?.lazyPublicInstances === true
								? { lazyPublicInstances: 1 as const }
								: null),
							...(request >= LYNX_TEMPLATE_RUN_READY_REQUEST_BASE &&
							driver.capabilities?.templateProgramMount === true &&
							driver.capabilities?.templateProgramRuns === true
								? { templateRuns: 1 as const }
								: null),
							...(request >= LYNX_TEARDOWN_RUN_READY_REQUEST_BASE &&
							driver.capabilities?.templateProgramMount === true &&
							driver.capabilities?.teardownRuns === true
								? { teardownRuns: 1 as const }
								: null),
						},
					}),
		};
		if (request !== LYNX_READY_ANNOUNCEMENT_REQUEST && !correlatedReadySent) {
			correlatedReadySent = true;
			drainLifecycleMessages();
		}
		if (lifecycleClosed) return false;
		dispatch(reply);
		if (request !== LYNX_READY_ANNOUNCEMENT_REQUEST) {
			// Delivery must succeed before an inbound commit can exercise any optional
			// wire behavior. Keep first-tree capabilities dormant until its exact
			// legacy adoption has completed and the main-thread journal is released.
			if (snapshot === null) {
				negotiatedCapabilities = reply.capabilities;
			} else {
				negotiatedCapabilities = undefined;
				deferredFirstTreeCapabilities =
					reply.capabilities?.templateProgram === 1 ? reply.capabilities : undefined;
			}
		}
		if (snapshot !== null) firstTreeSnapshotSent = true;
		return true;
	};

	const announceReady = (): void => {
		if (!canAnnounceReady() || readyAnnouncementInProgress) return;
		readyAnnouncementInProgress = true;
		try {
			if (!readyAnnouncementSent && queuedReadyRequests.size === 0) {
				// A queued request already proves the background listener is present, so
				// answer it directly instead of cloning the first-tree snapshot into both
				// an unsolicited announcement and the correlated reply.
				readyAnnouncementSent = dispatchReady(LYNX_READY_ANNOUNCEMENT_REQUEST);
			}
			while (!closed && !lifecycleClosed && queuedReadyRequests.size !== 0) {
				const request = queuedReadyRequests.values().next().value!;
				// ContextProxy delivery can synchronously reenter with the same request
				// while lifecycle data is still draining. The dispatching guard suppresses
				// that reentry; keep the request queued until the reply is accepted.
				dispatchingReadyRequest = request;
				let delivered = false;
				try {
					delivered = dispatchReady(request);
				} finally {
					dispatchingReadyRequest = null;
				}
				if (!delivered) break;
				queuedReadyRequests.delete(request);
				completedReadyRequests.add(request);
				if (completedReadyRequests.size > MAX_READY_REQUEST_TOMBSTONES) {
					completedReadyRequests.delete(completedReadyRequests.values().next().value!);
				}
				readyAnnouncementSent = true;
			}
		} catch (error) {
			const readyError = normalizedError(
				error,
				'Octane Lynx could not dispatch the main-ready reply.',
			);
			terminateLifecycleDelivery(
				readyError,
				'Octane Lynx could not dispatch the main-ready reply.',
			);
			throw readyError;
		} finally {
			readyAnnouncementInProgress = false;
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

	const activateFirstTreeCapabilities = (record: ActiveLynxMainRoot<Node>): void => {
		if (firstTree !== null || record.faulted || deferredFirstTreeCapabilities === undefined) {
			return;
		}
		record.capabilities = deferredFirstTreeCapabilities;
		record.postFirstTreeUpgrade = true;
		negotiatedCapabilities = deferredFirstTreeCapabilities;
		deferredFirstTreeCapabilities = undefined;
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
			if (treeComplete && sourceComplete) {
				// Ready, fault, dispose, and unmount retries all finish here; preserve
				// the outcome chosen when retirement began.
				if (firstScreenState === 'cleanup-pending:skipped') firstScreenState = 'skipped';
				else if (firstScreenState === 'cleanup-pending:failed') firstScreenState = 'failed';
				return true;
			}
		}
		return false;
	};

	/**
	 * Take a rendered first screen back out and release the background, whether it
	 * was declined as unadoptable or lost to a fault. Both outcomes retain the
	 * source first so a throwing remove/flush stays retryable rather than leaking
	 * an unreachable tree the background would then duplicate.
	 */
	const retireFirstScreen = (
		source: LynxHostContainer<Node> | null,
		settled: 'skipped' | 'failed',
		reason: string,
	): void => {
		firstScreenState = settled === 'skipped' ? 'cleanup-pending:skipped' : 'cleanup-pending:failed';
		firstScreenSyncReady = true;
		if (firstTree === null && source !== null) failedFirstScreenSource = source;
		if (!retryFirstScreenCleanup()) {
			report(
				new Error(
					`Octane Lynx withheld background readiness because ${reason} first-screen cleanup remains incomplete.`,
				),
			);
		}
		announceReady();
	};

	const forceCloseWorkletRuntime = (): void => {
		unsubscribeWorkletFeature?.();
		unsubscribeWorkletFeature = null;
		restoreHostHooks?.();
		restoreHostHooks = null;
		uninstallWorkletFeature();
		worklets.close();
		workletFeature = null;
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
		// A background ready request also proves script evaluation has finished;
		// hosts without the typed __RenderPage lifecycle release the deferred
		// first screen here.
		releaseFirstScreenRender();
		if (
			dispatchingReadyRequest === message.request ||
			completedReadyRequests.has(message.request)
		) {
			return;
		}
		queuedReadyRequests.add(message.request);
		if (isFirstScreenCleanupPending()) retryFirstScreenCleanup();
		if (canAnnounceReady()) announceReady();
	};

	const renderFirstScreenNow = <Props>(
		component: UniversalComponent<Props>,
		props: Props,
	): LynxFirstScreenRenderResult | null => {
		if (closed) throw new Error('Octane Lynx first-screen root rendered after receiver close.');
		if (firstScreenState !== 'open') {
			throw new Error(
				'Octane Lynx first-screen root is one-shot and its render window has closed.',
			);
		}
		firstScreenRenderInProgress = true;
		let source: LynxHostContainer<Node> | null = null;
		try {
			const result = renderLynxFirstScreen(component, props);
			source = createLynxHostContainer(papi, {
				root: FIRST_SCREEN_ROOT_ID,
				page,
				worklets: hostWorklets,
			});
			const prepared = prepareLynxHostBatch(source, result.batch);
			prepared.apply();
			if (!prepared.mutationStarted) {
				throw new Error('Octane Lynx first-screen host batch did not cross its apply boundary.');
			}
			const captured = captureLynxFirstTree(source);
			if (captured === null) {
				// The page rendered correctly but holds a composition the background
				// cannot adopt — today a native `<list>`, whose rows the platform
				// materializes through main-local callbacks. That is a property of the
				// page, not a broken host, so it settles as `skipped` rather than
				// `failed` and raises no error against an application that is entitled
				// to the element. `null` tells the caller its paint was declined.
				//
				// The batch is built before any of this is applied, so a `<list>` is in
				// principle knowable before the tree is created; declining that early
				// would avoid building and tearing down a first screen that is never
				// kept. That needs the prepared batch to publish what it stages.
				retireFirstScreen(source, 'skipped', 'unadoptable');
				return null;
			}
			firstTree = captured;
			firstScreenState = 'painted';
			if (firstScreenSync === 'automatic') firstScreenSyncReady = true;
			announceReady();
			return result;
		} catch (error) {
			retireFirstScreen(source, 'failed', 'failed');
			throw report(error, 'Octane Lynx could not render its synchronous first screen.');
		} finally {
			firstScreenRenderInProgress = false;
			if (closePending) finalizeDeferredClose?.();
		}
	};

	const renderFirstScreen = <Props>(
		component: UniversalComponent<Props>,
		props: Props,
	): LynxFirstScreenRenderResult | null => {
		if (firstScreenRenderReleased) return renderFirstScreenNow(component, props);
		if (closed) throw new Error('Octane Lynx first-screen root rendered after receiver close.');
		if (firstScreenState !== 'open' || pendingFirstScreenRender !== null) {
			throw new Error(
				'Octane Lynx first-screen root is one-shot and its render window has closed.',
			);
		}
		// Element creation must wait for the engine's post-evaluation lifecycle:
		// PageConfig reaches the ElementManager only after main-thread script
		// evaluation, and elements created earlier bake in unconfigured defaults.
		pendingFirstScreenRender = () => {
			renderFirstScreenNow(component, props);
		};
		return null;
	};

	const releaseFirstScreenRender = (): void => {
		if (firstScreenRenderReleased) return;
		firstScreenRenderReleased = true;
		const pending = pendingFirstScreenRender;
		pendingFirstScreenRender = null;
		if (closed) return;
		if (pending !== null && firstScreenState === 'open') {
			try {
				pending();
			} catch {
				// renderFirstScreenNow reported the failure and transitioned the
				// first-screen state; there is no authored caller left to rethrow to.
			}
			return;
		}
		// The entry finished evaluation without rendering a first screen; settle
		// the window exactly as an immediate-mode markFirstScreenSyncReady would.
		if (firstScreenState === 'open' && firstScreenSyncReady) {
			firstScreenState = 'skipped';
			announceReady();
		}
	};

	const markFirstScreenSyncReady = (): void => {
		if (!firstScreenEnabled) {
			throw new Error('Octane Lynx first-screen synchronization is not enabled.');
		}
		if (closed) throw new Error('Octane Lynx first-screen synchronization ran after close.');
		if (firstScreenSyncReady) return;
		firstScreenSyncReady = true;
		if (
			firstScreenState === 'open' &&
			firstScreenRenderReleased &&
			pendingFirstScreenRender === null
		) {
			firstScreenState = 'skipped';
		}
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
		const peerCapabilities = active === null ? negotiatedCapabilities : active.capabilities;
		const postFirstTreeLazyPublicInstances =
			message.instances === LYNX_LAZY_PUBLIC_INSTANCES && active !== null;
		const incrementalRun =
			message.batch.commands.length === 1 ? message.batch.commands[0] : undefined;
		if (
			message.instances === LYNX_LAZY_PUBLIC_INSTANCES &&
			(peerCapabilities?.lazyPublicInstances !== 1 ||
				(postFirstTreeLazyPublicInstances &&
					(active?.postFirstTreeUpgrade !== true ||
						message.batch.commands.length === 0 ||
						!message.batch.commands.every(
							(command) =>
								command.op === 'mount-template-range' || command.op === 'mount-template-run',
						))))
		) {
			reject(identity, new Error('Octane Lynx rejected unnegotiated lazy public instances.'));
			return;
		}
		if (peerCapabilities?.templateProgram !== 1 || peerCapabilities.templateRuns !== 1) {
			for (const command of message.batch.commands) {
				if (command.op === 'mount-template-range' && peerCapabilities?.templateProgram !== 1) {
					reject(
						identity,
						new Error('Octane Lynx rejected an unnegotiated intrinsic template program.'),
					);
					return;
				}
				if (command.op === 'mount-template-run' && peerCapabilities?.templateRuns !== 1) {
					reject(
						identity,
						new Error('Octane Lynx rejected an unnegotiated intrinsic template run.'),
					);
					return;
				}
			}
		}
		let postFirstTreeIncrementalCompact = false;
		if (
			postFirstTreeLazyPublicInstances &&
			active?.postFirstTreeUpgrade === true &&
			peerCapabilities?.compactAck === 1 &&
			peerCapabilities.templateProgram === 1 &&
			peerCapabilities.templateRuns === 1 &&
			message.ack === LYNX_COMPACT_ACKNOWLEDGEMENT &&
			incrementalRun?.op === 'mount-template-run'
		) {
			try {
				freezeValidatedIntrinsicRun(incrementalRun);
				postFirstTreeIncrementalCompact = true;
			} catch (error) {
				reject(identity, error);
				return;
			}
		}

		let record = active;
		const provisional = record === null;
		if (record === null) {
			try {
				record = {
					root: message.root,
					...(peerCapabilities === undefined ? null : { capabilities: peerCapabilities }),
					container: createLynxHostContainer(papi, {
						root: message.root,
						page,
						worklets: hostWorklets,
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
		const startedPrepare = LYNX_PROFILE ? performance.now() : 0;
		try {
			prepared = prepareLynxHostBatch(
				record.container,
				message.batch,
				candidateFirstTree === null
					? provisional && message.ack === LYNX_COMPACT_ACKNOWLEDGEMENT
						? message.instances === LYNX_LAZY_PUBLIC_INSTANCES
							? { compact: true, lazyPublicInstances: true }
							: { compact: true }
						: postFirstTreeIncrementalCompact
							? { compact: true, incrementalCompact: true, lazyPublicInstances: true }
							: postFirstTreeLazyPublicInstances
								? { lazyPublicInstances: true }
								: undefined
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
		if (LYNX_PROFILE) {
			const profile = lynxWireProfile();
			profile.prepareMs += performance.now() - startedPrepare;
			profile.commits += 1;
			profile.commands += message.batch.commands.length;
		}
		let applyFailed = false;
		let applyError: unknown;
		const startedApply = LYNX_PROFILE ? performance.now() : 0;
		try {
			prepared.apply();
		} catch (error) {
			applyFailed = true;
			applyError = error;
		}
		if (LYNX_PROFILE) lynxWireProfile().applyMs += performance.now() - startedApply;
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
			if (!applyFailed && prepared.firstTreeAction === 'repair') {
				activateFirstTreeCapabilities(record);
			}
		}
		const startedAck = LYNX_PROFILE ? performance.now() : 0;
		let compactCount: number | null =
			message.ack === LYNX_COMPACT_ACKNOWLEDGEMENT &&
			(provisional || postFirstTreeIncrementalCompact) &&
			!applyFailed &&
			prepared.firstTreeAction === 'none' &&
			prepared.listAncestryDelta.length === 0
				? provisional
					? (prepared.compactHostCount ?? countLynxCompactAcknowledgementHosts(message.batch))
					: (prepared.compactHostCount ?? null)
				: null;
		if (compactCount !== null && compactCount < LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS) {
			compactCount = null;
		}
		if (compactCount !== null && prepared.compactHostCount !== compactCount) {
			if (prepared.handleDelta.length !== compactCount) {
				compactCount = null;
			} else {
				for (let index = 0; index < prepared.handleDelta.length; index++) {
					const delta = prepared.handleDelta[index]!;
					if (delta.op !== 'create' || delta.handle.generation !== 1) {
						compactCount = null;
						break;
					}
				}
			}
		}
		const acknowledgement: LynxTransportAcknowledgement =
			compactCount === null
				? {
						...identity,
						type: 'ack',
						handles: acknowledgementHandles(driver, record.container, prepared, message.batch),
						...(prepared.firstTreeAction === 'none'
							? null
							: {
									adoption: prepared.firstTreeAction === 'adopt' ? 'adopted' : 'repaired',
								}),
					}
				: {
						...identity,
						type: 'ack',
						encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
						count: compactCount,
					};
		try {
			dispatch(acknowledgement);
			if (LYNX_PROFILE) lynxWireProfile().ackMs += performance.now() - startedAck;
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
		if (closePending) return;
		if (commitInProgress) {
			queuedCommits.push(message);
			return;
		}
		commitInProgress = true;
		try {
			let next: LynxCommitMessage | undefined = message;
			let queuedIndex = 0;
			do {
				handleCommitExclusive(next, {
					protocol: next.protocol,
					renderer: next.renderer,
					root: next.root,
					version: next.version,
				});
				if (closePending) {
					queuedCommits.length = 0;
					break;
				}
				if (queuedIndex === queuedCommits.length) {
					next = undefined;
				} else {
					next = queuedCommits[queuedIndex];
					queuedCommits[queuedIndex++] = undefined;
				}
			} while (next !== undefined);
			queuedCommits.length = 0;
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
			if (closePending) finalizeDeferredClose?.();
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
		activateFirstTreeCapabilities(active);
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
		// Decode before anything reads the payload. `event.data` is whatever the
		// host handed across, and on device that can be a native-backed reference
		// that throws on `Reflect.ownKeys` and answers `Object(v) !== v`; every
		// read below, including the recovery path, is written for ordinary local
		// data, so the materialization has to happen first or not at all.
		const startedDecode = LYNX_PROFILE ? performance.now() : 0;
		let data: LynxStructuredValue;
		try {
			data = decodeLynxTransportValue(event.data);
			if (LYNX_PROFILE) lynxWireProfile().decodeMs += performance.now() - startedDecode;
		} catch (error) {
			// Nothing in an undecodable payload is safe to reflect on, so unlike a
			// schema failure there is no identity to recover and no pending call to
			// settle against — it can only be reported and dropped.
			report(error, 'Octane Lynx received an outbound message it could not decode.');
			return;
		}
		let message: ReturnType<typeof validateLynxBackgroundOutboundMessage>;
		const startedValidate = LYNX_PROFILE ? performance.now() : 0;
		try {
			message = validateLynxBackgroundOutboundMessage(data);
			if (LYNX_PROFILE) lynxWireProfile().validateMs += performance.now() - startedValidate;
		} catch (error) {
			const normalized = report(error, 'Octane Lynx received a malformed outbound message.');
			const identity = recoverIdentity(data);
			const raw =
				data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null;
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

	const closeMainThread = (): void => {
		lifecycleClosed = true;
		queuedLifecycleMessages.length = 0;
		if (commitInProgress || firstScreenRenderInProgress) {
			closePending = true;
			queuedCommits.length = 0;
			return;
		}
		closePending = false;
		if (engineLifecycleContext !== null) {
			for (let index = engineLifecycleListeners.length - 1; index >= 0; index--) {
				const [type, listener] = engineLifecycleListeners[index]!;
				if (!registeredEngineLifecycleListeners.has(type)) continue;
				try {
					engineLifecycleContext.removeEventListener(type, listener);
					registeredEngineLifecycleListeners.delete(type);
				} catch (error) {
					report(error, `Octane Lynx could not remove its ${type} engine lifecycle listener.`);
				}
			}
		}
		if (nativeLifecycleContext !== null && nativeDestroyListenerRegistered) {
			nativeDestroyListenerRegistered = false;
			try {
				nativeLifecycleContext.removeEventListener(LYNX_DESTROY_LIFETIME_EVENT, onNativeDestroy);
			} catch (error) {
				nativeDestroyListenerRegistered = true;
				report(error, 'Octane Lynx could not remove its native lifetime listener.');
			}
		}
		resetThreadCalls(new Error('Octane Lynx main-thread receiver was closed.'));
		finishMainCallPublication();
		queuedCommits.length = 0;
		queuedNativeEvents.length = 0;
		queuedLifecycleMessages.length = 0;
		queuedHostAttachments.length = 0;
		queuedReadyRequests.clear();
		completedReadyRequests.clear();
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
				new Error('Octane Lynx retained incomplete first-screen cleanup for a later close retry.'),
			);
		}
		closeWorkletRuntime();
	};
	finalizeDeferredClose = closeMainThread;

	const notifyBackgroundPageDestroy = (): void => {
		if (!nativeDestroyReceived && !closed) {
			nativeDestroyReceived = true;
			try {
				dispatch({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'page-destroy',
				});
			} catch (error) {
				report(error, 'Octane Lynx could not notify the background page lifetime.');
			}
		}
	};
	const closePageController = (): void => {
		notifyBackgroundPageDestroy();
		closeMainThread();
	};
	const onNativeDestroy = (): void => {
		notifyBackgroundPageDestroy();
		try {
			closeMainThread();
		} catch (error) {
			// Native lifetime callbacks must not leak cleanup failures back into the
			// engine. Preserve the failure through the controller diagnostics instead.
			report(error, 'Octane Lynx native lifetime cleanup failed.');
		}
	};
	terminateLifecycleDelivery = (value: unknown, fallback: string): void => {
		if (lifecycleClosed) return;
		lifecycleClosed = true;
		// Notify and close before invoking user diagnostics so diagnostic reentry
		// cannot strand a background transport on stale lifecycle state.
		onNativeDestroy();
		report(value, fallback);
	};

	context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, receive);
	if (!closed && nativeLifecycleContext !== null) {
		// Set this before registration so a host that mutates and then throws still
		// gets a best-effort remove during receiver cleanup.
		nativeDestroyListenerRegistered = true;
		try {
			nativeLifecycleContext.addEventListener(LYNX_DESTROY_LIFETIME_EVENT, onNativeDestroy);
		} catch (error) {
			onNativeDestroy();
			throw report(error, 'Octane Lynx could not install its native lifetime listener.');
		}
	}
	if (!closed && engineLifecycleContext !== null) {
		try {
			for (const [type, listener] of engineLifecycleListeners) {
				if (closed || lifecycleClosed) break;
				// Mark before registration so a host that mutates and then throws is
				// included in the atomic rollback attempt below.
				registeredEngineLifecycleListeners.add(type);
				engineLifecycleContext.addEventListener(type, listener);
				if (closed || lifecycleClosed) {
					// A synchronous destroy/terminal delivery can remove the listener
					// while addEventListener is still on the stack. Remove once more after
					// it returns and never continue installing later event types.
					try {
						engineLifecycleContext.removeEventListener(type, listener);
						registeredEngineLifecycleListeners.delete(type);
					} catch (removeError) {
						report(
							removeError,
							`Octane Lynx could not roll back its ${type} engine lifecycle listener.`,
						);
					}
					break;
				}
			}
		} catch (error) {
			onNativeDestroy();
			throw report(error, 'Octane Lynx could not install its engine lifecycle listeners.');
		}
	}
	try {
		if (!closed && firstScreenEnabled) {
			uninstallFirstScreenHost = installLynxFirstScreenHost({
				render: renderFirstScreen,
				markSyncReady: markFirstScreenSyncReady,
				unmount() {
					pendingFirstScreenRender = null;
					firstScreenRenderReleased = true;
					queuedNativeEvents.length = 0;
					awaitingAdoption = null;
					// Unmount closes the authored synchronous window immediately. Cleanup
					// can still gate readiness until a retry succeeds.
					firstScreenSyncReady = true;
					if (!retryFirstScreenCleanup()) {
						if (!isFirstScreenCleanupPending()) {
							firstScreenState = 'cleanup-pending:skipped';
						}
						report(
							new Error(
								'Octane Lynx withheld background readiness because first-screen unmount cleanup remains incomplete.',
							),
						);
						return;
					}
					if (firstScreenState === 'open' || firstScreenState === 'painted') {
						firstScreenState = 'skipped';
					}
					announceReady();
				},
			});
		}
		if (!closed) announceReady();
	} catch (error) {
		onNativeDestroy();
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
		// Closing the public page controller is terminal for both runtimes. Route it
		// through the same one-shot notification as the native lifetime callback so
		// a background transport waiting for readiness cannot be stranded.
		close: closePageController,
	};
	return Object.freeze(controller);
}
