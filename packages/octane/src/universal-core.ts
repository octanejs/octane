/**
 * Experimental host-neutral renderer core.
 *
 * This module deliberately does not generalise the DOM runtime. Compiled
 * universal components produce immutable host plans plus dynamic values. A
 * root materialises those plans into core-owned logical records, stages one
 * ordered host batch, and publishes topology/refs/effects only after the
 * driver accepts that batch.
 *
 * @experimental This subpath is an internal-first renderer proving surface and
 * may change in patch releases until real Three and transported renderers
 * validate the protocol.
 */
import { hasOwnProp } from './has-own.js';
import {
	__profileBeginRender,
	__profileComponentSource,
	__profileEndRender,
	__profileSchedule,
	__profileTrackComponent,
} from './profiling.js';
import { getRendererHostFlusher } from './renderer-bridge.js';
import { resolveLazyDefaultProps } from './shared-value-helpers.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

const UNIVERSAL_PLAN = Symbol.for('octane.universal.plan');
const UNIVERSAL_VALUE = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST = Symbol.for('octane.universal.list');
const UNIVERSAL_COMPONENT = Symbol.for('octane.universal.component');
const UNIVERSAL_COMPONENT_VALUE = Symbol.for('octane.universal.component-value');
const UNIVERSAL_HOST_COMPONENT = Symbol('octane.universal.host-component');
const UNIVERSAL_PROPS = Symbol.for('octane.universal.props');
const UNIVERSAL_CHILDREN = Symbol.for('octane.universal.children');
const UNIVERSAL_IF = Symbol.for('octane.universal.if');
const UNIVERSAL_SWITCH = Symbol.for('octane.universal.switch');
const UNIVERSAL_FOR = Symbol.for('octane.universal.for');
const UNIVERSAL_TRY = Symbol.for('octane.universal.try');
const UNIVERSAL_CONTEXT = Symbol.for('octane.universal.context');
const UNIVERSAL_ACTIVITY = Symbol.for('octane.universal.activity');
const UNIVERSAL_KEYED = Symbol.for('octane.universal.keyed');
const UNIVERSAL_PORTAL = Symbol.for('octane.universal.portal');
const UNIVERSAL_RENDERER_REGION = Symbol.for('octane.universal.renderer-region');
const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');
const LAZY_COMPONENT = Symbol.for('octane.lazy');
const UNIVERSAL_COMPONENT_REVISION = Symbol('octane.universal.component-revision');

const NO_CHILDREN = Symbol('octane.universal.no-children');
const NO_KEY = Symbol('octane.universal.no-key');
const NO_PENDING_PASSIVE_ERROR = Symbol('octane.universal.no-pending-passive-error');

let HAS_UNIVERSAL_HOST_COMPONENTS = false;

/** Structured-clone protocol version used by experimental transported roots. */
export const UNIVERSAL_TRANSPORT_PROTOCOL_VERSION = 1 as const;

export type UniversalKey = string | number | symbol | bigint;

/**
 * The host-neutral part of Octane context identity.
 *
 * DOM contexts and renderer-local contexts both satisfy this shape. The
 * universal runtime only observes the shared tag and default value; provider
 * lowering is owned by the compiler and does not require a DOM Scope.
 */
export interface UniversalContext<T> {
	readonly $$kind: symbol;
	readonly defaultValue: T;
	$$version: number;
}

export interface UniversalRendererMetadata {
	readonly id: string;
	readonly module?: string;
	readonly target: 'universal';
}

const UNIVERSAL_LAZY_METADATA: UniversalRendererMetadata = Object.freeze({
	id: '<lazy>',
	target: 'universal',
});

export interface UniversalBoundaryMetadata {
	readonly id: string;
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly childrenProp: string;
}

export interface UniversalHostPlan {
	readonly kind: 'host';
	readonly type: string;
	readonly props?: Readonly<Record<string, unknown>>;
	readonly bindings?: readonly (readonly [name: string, slot: number])[];
	/** Ordered host/component prop program produced by `universalProps`. */
	readonly propsSlot?: number;
	readonly children?: readonly UniversalPlanNode[];
}

export interface UniversalTextPlan {
	readonly kind: 'text';
	readonly value?: string;
	readonly slot?: number;
}

export interface UniversalSlotPlan {
	readonly kind: 'slot';
	readonly slot: number;
}

export interface UniversalRangePlan {
	readonly kind: 'range';
	readonly children: readonly UniversalPlanNode[];
}

/** A component node is optional compiler sugar; dynamic component descriptors are equivalent. */
export interface UniversalComponentPlan {
	readonly kind: 'component';
	readonly renderer: string;
	readonly component?: UniversalComponent<any>;
	readonly componentSlot?: number;
	readonly propsSlot?: number;
	readonly keySlot?: number;
	readonly children?: readonly UniversalPlanNode[];
}

export interface UniversalIfPlan {
	readonly kind: 'if';
	readonly conditionSlot: number;
	readonly then: UniversalPlanNode;
	readonly else?: UniversalPlanNode;
}

export interface UniversalSwitchPlan {
	readonly kind: 'switch';
	readonly valueSlot: number;
	readonly cases: readonly (readonly [unknown, UniversalPlanNode])[];
	readonly default?: UniversalPlanNode;
}

export type UniversalPlanNode =
	| UniversalHostPlan
	| UniversalTextPlan
	| UniversalSlotPlan
	| UniversalRangePlan
	| UniversalComponentPlan
	| UniversalIfPlan
	| UniversalSwitchPlan;

export interface UniversalPlan {
	readonly $$kind: typeof UNIVERSAL_PLAN;
	readonly renderer: string;
	readonly root: UniversalPlanNode;
}

export interface UniversalPlanValue {
	readonly $$kind: typeof UNIVERSAL_VALUE;
	readonly plan: UniversalPlan;
	readonly values: readonly unknown[];
	readonly key: UniversalKey | null;
}

export interface UniversalListValue {
	readonly $$kind: typeof UNIVERSAL_LIST;
	readonly values: readonly UniversalRenderable[];
	readonly empty?: UniversalRenderable;
}

export interface UniversalPortalValue {
	readonly $$kind: typeof UNIVERSAL_PORTAL;
	readonly children: UniversalRenderable;
	readonly target: unknown;
}

export type UniversalRenderable =
	| UniversalPlanValue
	| UniversalListValue
	| UniversalPortalValue
	| UniversalComponentValue
	| UniversalChildrenValue
	| UniversalIfValue
	| UniversalSwitchValue
	| UniversalForValue
	| UniversalTryValue
	| UniversalContextValue
	| UniversalActivityValue
	| UniversalKeyedValue
	| readonly UniversalRenderable[]
	| string
	| number
	| bigint
	| boolean
	| null
	| undefined;

export type UniversalComponent<P = any> = ((
	props: P,
	context: UniversalRenderContext,
) => UniversalRenderable) & {
	readonly [UNIVERSAL_COMPONENT]: UniversalRendererMetadata;
};

interface UniversalHostComponentMetadata<P = any> {
	readonly component: UniversalComponent<P>;
	readonly renderer: string;
	readonly plan: UniversalPlan;
	readonly specializations: Map<string, UniversalPlan>;
}

export type UniversalPropEntry =
	readonly ['set', name: string, value: unknown] | readonly ['spread', value: unknown];

export interface UniversalPropsValue {
	readonly $$kind: typeof UNIVERSAL_PROPS;
	readonly props: Readonly<Record<string, unknown>>;
	readonly key: unknown;
	readonly hasKey: boolean;
	readonly hasChildren: boolean;
}

export interface UniversalComponentValue {
	readonly $$kind: typeof UNIVERSAL_COMPONENT_VALUE;
	readonly renderer: string;
	readonly component: UniversalComponent<any>;
	readonly props: UniversalPropsValue | Readonly<Record<string, unknown>> | null;
	readonly key: unknown;
	readonly hasKey: boolean;
}

export interface UniversalChildrenValue {
	readonly $$kind: typeof UNIVERSAL_CHILDREN;
	readonly renderer: string;
	readonly render: () => UniversalRenderable;
}

export interface UniversalIfValue {
	readonly $$kind: typeof UNIVERSAL_IF;
	readonly condition: boolean;
	readonly then: () => UniversalRenderable;
	readonly else: (() => UniversalRenderable) | null;
}

export interface UniversalSwitchValue {
	readonly $$kind: typeof UNIVERSAL_SWITCH;
	readonly value: unknown;
	readonly cases: readonly (readonly [unknown, () => UniversalRenderable])[];
	readonly default: (() => UniversalRenderable) | null;
}

export interface UniversalForValue {
	readonly $$kind: typeof UNIVERSAL_FOR;
	readonly items: Iterable<unknown>;
	readonly key: (item: any, index: number) => UniversalKey;
	readonly render: (item: any, index: number) => UniversalRenderable;
	readonly empty: (() => UniversalRenderable) | null;
	readonly ownerless: boolean;
	readonly compact: boolean;
	readonly hostComponent?: UniversalComponent<any>;
	readonly leafPlan?: UniversalPlan;
	readonly leafSignature?: string;
	readonly template?: boolean;
	readonly componentScope?: boolean;
}

export interface UniversalTryValue {
	readonly $$kind: typeof UNIVERSAL_TRY;
	readonly body: () => UniversalRenderable;
	readonly pending: (() => UniversalRenderable) | null;
	readonly catch: ((error: unknown, reset: () => void) => UniversalRenderable) | null;
}

export interface UniversalContextValue {
	readonly $$kind: typeof UNIVERSAL_CONTEXT;
	readonly context: UniversalContext<any>;
	readonly value: unknown;
	readonly children: UniversalRenderable | (() => UniversalRenderable);
}

export interface UniversalActivityValue {
	readonly $$kind: typeof UNIVERSAL_ACTIVITY;
	readonly mode: 'visible' | 'hidden';
	readonly body: () => UniversalRenderable;
}

export interface UniversalKeyedValue {
	readonly $$kind: typeof UNIVERSAL_KEYED;
	readonly key: UniversalKey;
	readonly value: UniversalRenderable;
}

/**
 * Opaque payload handed through a component prop whose contents are owned by
 * another renderer. The compiler keeps `component` stable and places
 * render-time captures in `props`, so crossing a renderer boundary does not
 * reset the child root on every owner render.
 */
export interface RendererRegion<P = any> {
	readonly $$kind: typeof UNIVERSAL_RENDERER_REGION;
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly component: unknown;
	readonly props: P;
}

export interface UniversalRenderContext {
	readonly renderer: string;
	readContext<T>(context: UniversalContext<T>): T;
	insertionEffect(create: () => void | (() => void), deps?: readonly unknown[]): void;
	layoutEffect(create: () => void | (() => void), deps?: readonly unknown[]): void;
	effect(create: () => void | (() => void), deps?: readonly unknown[]): void;
}

export type UniversalTextPolicy = 'reject' | 'ignore' | 'host';

export interface UniversalHostCapabilities {
	/** How primitive text children are represented. Absence defaults to `reject`. */
	readonly text?: UniversalTextPolicy;
	/** Allows renderer-local callbacks whose function values never enter a host batch. */
	readonly localHostCallbacks?: boolean;
	/** Allows core-owned retained trees to change physical host visibility. */
	readonly visibility?: boolean;
	/**
	 * Opts into owner elision for compiler-proven leaves whose attributes are
	 * ordinary props rather than callback/event channels. Codec-free local roots
	 * may additionally compact these leaves.
	 */
	readonly compilerLeafProps?: boolean;
	/** Accepts immutable, shape-sharing commands for wholly fresh intrinsic host trees. */
	readonly templateMount?: boolean;
	/** Scalar static host props are encoded deterministically and may be shared within one root. */
	readonly stableStaticHostProps?: boolean;
	/** Allows fresh static template descendants to remain logically opaque until first replay. */
	readonly collapsedTemplateMount?: boolean;
	/** Accepts shared immutable intrinsic programs with contiguous host and listener IDs. */
	readonly templateProgramMount?: boolean;
	/** Defers renderer-owned public-instance metadata until explicitly requested by core. */
	readonly lazyPublicInstances?: boolean;
	/** Accepts consecutive contiguous instances of one immutable intrinsic host program. */
	readonly templateProgramRuns?: boolean;
	/** Accepts one destroy-run command per removed contiguous program-run range. */
	readonly teardownRuns?: boolean;
}

export interface UniversalResourceHandle {
	readonly $$kind: 'octane.universal.resource';
	readonly renderer: string;
	readonly root: number;
	readonly id: string | number;
}

/** Opaque, root-scoped placement parent for a renderer-owned portal target. */
export interface UniversalPortalTargetHandle {
	readonly $$kind: 'octane.universal.portal-target';
	readonly renderer: string;
	readonly root: number;
	readonly id: string | number;
}

export interface UniversalPortalTargetRegistration {
	readonly handle: UniversalPortalTargetHandle;
	release(): void;
}

export interface UniversalPortalTargetContext<Container = unknown> {
	readonly container: Container;
	readonly renderer: string;
	readonly target: unknown;
	readonly transported: boolean;
	createPortalTargetHandle(id: string | number): UniversalPortalTargetHandle;
}

export interface UniversalPortalCapability<Container = unknown> {
	prepareTarget(
		context: UniversalPortalTargetContext<Container>,
	): UniversalPortalTargetRegistration;
}

export type UniversalHostParent = number | null | UniversalPortalTargetHandle;

export type UniversalSerializableValue =
	| null
	| undefined
	| string
	| number
	| bigint
	| boolean
	| readonly UniversalSerializableValue[]
	| Readonly<{ [name: string]: UniversalSerializableValue }>;

export type UniversalHostPropEncoding =
	| { readonly kind: 'value'; readonly value: UniversalSerializableValue }
	| { readonly kind: 'resource'; readonly handle: UniversalResourceHandle }
	| { readonly kind: 'unsupported'; readonly reason?: string };

export interface UniversalHostPropCodecContext<Container = unknown> {
	readonly container: Container;
	readonly renderer: string;
	readonly hostType: string;
	readonly name: string;
	readonly value: unknown;
	createResourceHandle(id: string | number): UniversalResourceHandle;
}

export interface UniversalHostPropCodec<Container = unknown> {
	encode(context: UniversalHostPropCodecContext<Container>): UniversalHostPropEncoding;
}

export interface UniversalHostCallbackDefinition {
	readonly type: string;
}

export interface UniversalHostCallbackCapability {
	classify(name: string, value: unknown): UniversalHostCallbackDefinition | null;
}

export type UniversalHostUpdateKind = 'update' | 'recreate';

export interface UniversalHostUpdateCapability {
	classify(
		type: string,
		previous: Readonly<Record<string, unknown>>,
		next: Readonly<Record<string, unknown>>,
	): UniversalHostUpdateKind;
}

/**
 * Hosts whose physical instances are recycled independently from the logical
 * tree report attachment changes through this ordered, root-scoped batch.
 * The core validates current state through the registration before touching a
 * ref, so duplicate and stale notifications are harmless.
 */
export interface UniversalHostAttachmentBatch {
	/** Logical host IDs that became unavailable; refs detach parent-first. */
	readonly detached: readonly number[];
	/**
	 * Logical host IDs that became available; refs attach child-first. An ID
	 * present in both arrays represents physical replacement in one batch.
	 */
	readonly attached: readonly number[];
}

export interface UniversalHostAttachmentRegistration {
	/** Return the current physical state, including changes newer than a queued batch. */
	isAttached(id: number): boolean;
	/** Release this root's subscription. Called once when construction fails or the root unmounts. */
	unsubscribe(): void;
}

export interface UniversalHostAttachmentCapability<Container = unknown> {
	/** Install one root-scoped physical attachment subscription for `container`. */
	subscribe(
		container: Container,
		onChange: (batch: UniversalHostAttachmentBatch) => void,
	): UniversalHostAttachmentRegistration;
}

/** Immutable, renderer-neutral shape shared by repeated compiler-hoisted host trees. */
export interface UniversalHostTemplateShapeNode {
	readonly type: string;
	/** Earlier shape-node index, or -1 for the template's one physical root. */
	readonly parent: number;
}

/** A native event installed on one freshly mounted template host. */
export interface UniversalHostTemplateEvent {
	readonly type: string;
	readonly listener: UniversalEventListenerDescriptor;
}

/** Per-instance values paired by index with one immutable host-template shape. */
export interface UniversalHostTemplateNode {
	readonly id: number;
	readonly props: Readonly<Record<string, unknown>>;
	readonly events?: readonly UniversalHostTemplateEvent[];
}

/** One scalar instance value patched into a shared intrinsic host program. */
export interface UniversalHostTemplateProgramBinding {
	readonly name: string;
	readonly valueIndex: number;
}

/** Immutable, renderer-encoded static host information shared by repeated mounts. */
export interface UniversalHostTemplateProgramNode {
	readonly type: string;
	readonly parent: number;
	readonly props: Readonly<Record<string, unknown>>;
	readonly bindings?: readonly UniversalHostTemplateProgramBinding[];
}

/** A stable native listener site whose ID is derived from the instance range. */
export interface UniversalHostTemplateProgramEvent {
	readonly node: number;
	readonly type: string;
	readonly priority: UniversalEventPriority;
}

/** Immutable renderer-neutral program reused by fresh intrinsic host subtrees. */
export interface UniversalHostTemplateProgram {
	readonly nodes: readonly UniversalHostTemplateProgramNode[];
	readonly events: readonly UniversalHostTemplateProgramEvent[];
}

/** Encoded primitive that can be transported directly without object reconstruction. */
export type UniversalHostTemplateProgramValue =
	string | number | boolean | bigint | null | undefined;

function isUniversalHostTemplateProgramValue(
	value: unknown,
): value is UniversalHostTemplateProgramValue {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	);
}

export type UniversalHostCommand =
	| {
			readonly op: 'create';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'mount-template';
			readonly parent: UniversalHostParent;
			readonly before: number | null;
			readonly shape: readonly UniversalHostTemplateShapeNode[];
			readonly nodes: readonly UniversalHostTemplateNode[];
	  }
	| {
			readonly op: 'mount-template-range';
			readonly parent: UniversalHostParent;
			readonly before: number | null;
			readonly program: UniversalHostTemplateProgram;
			readonly firstId: number;
			readonly values: readonly UniversalHostTemplateProgramValue[];
			readonly firstListenerId: number | null;
	  }
	| {
			readonly op: 'mount-template-run';
			readonly parent: UniversalHostParent;
			readonly before: number | null;
			readonly program: UniversalHostTemplateProgram;
			readonly firstId: number;
			readonly firstListenerId: number | null;
			readonly count: number;
			readonly values: readonly UniversalHostTemplateProgramValue[];
	  }
	| {
			readonly op: 'update';
			readonly id: number;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'ensure-public-instance';
			readonly id: number;
	  }
	| {
			readonly op: 'recreate';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'insert' | 'move';
			readonly parent: UniversalHostParent;
			readonly id: number;
			readonly before: number | null;
	  }
	| {
			readonly op: 'event';
			readonly id: number;
			readonly type: string;
			readonly listener: UniversalEventListenerDescriptor | null;
	  }
	| {
			readonly op: 'lifecycle' | 'local-callback';
			readonly id: number;
			readonly type: string;
			readonly listener: UniversalListenerDescriptor | null;
	  }
	| {
			readonly op: 'visibility';
			readonly id: number;
			readonly state: 'hidden' | 'visible';
	  }
	| { readonly op: 'remove'; readonly parent: UniversalHostParent; readonly id: number }
	| { readonly op: 'destroy'; readonly id: number }
	| {
			/** Removes and destroys `count` contiguous collapsed program-run
			 * instances of `width` hosts each, starting at `firstId`, without
			 * shipping their per-host teardown commands. */
			readonly op: 'destroy-run';
			readonly parent: UniversalHostParent;
			readonly firstId: number;
			readonly count: number;
			readonly width: number;
	  };

export type UniversalEventPriority = 'discrete' | 'continuous' | 'default';

export interface UniversalListenerDescriptor {
	readonly id: number;
}

/** Serializable listener identity carried by a host batch. */
export interface UniversalEventListenerDescriptor extends UniversalListenerDescriptor {
	readonly priority: UniversalEventPriority;
}

export interface UniversalEventDefinition {
	readonly type: string;
	readonly priority?: UniversalEventPriority;
}

export interface UniversalEventCapability {
	/** Return null for ordinary callback/property names owned by the renderer. */
	classify(name: string): UniversalEventDefinition | null;
}

export interface UniversalHostBatch {
	readonly renderer: string;
	readonly version: number;
	readonly commands: readonly UniversalHostCommand[];
}

export interface UniversalTransportIdentity {
	readonly protocol: typeof UNIVERSAL_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: string;
	readonly root: number;
	readonly version: number;
}

export interface UniversalTransportCommitMessage extends UniversalTransportIdentity {
	readonly type: 'commit';
	readonly batch: UniversalHostBatch;
}

export interface UniversalTransportAbortMessage extends UniversalTransportIdentity {
	readonly type: 'abort';
}

export interface UniversalTransportAcknowledgement extends UniversalTransportIdentity {
	readonly type: 'ack';
}

export interface UniversalTransportCompleteMessage extends UniversalTransportIdentity {
	readonly type: 'complete';
}

export interface UniversalTransportError {
	readonly name: string;
	readonly message: string;
}

export interface UniversalTransportRejectMessage extends UniversalTransportIdentity {
	readonly type: 'reject';
	readonly error: UniversalTransportError;
}

export interface UniversalTransportFaultMessage extends UniversalTransportIdentity {
	readonly type: 'fault';
	readonly error: UniversalTransportError;
}

export interface UniversalTransportEventDelivery {
	readonly listener: number;
	readonly payload: unknown;
}

export interface UniversalTransportEventMessage extends UniversalTransportIdentity {
	readonly type: 'event';
	readonly priority: UniversalEventPriority;
	readonly deliveries: readonly UniversalTransportEventDelivery[];
}

export type UniversalTransportOutboundMessage =
	UniversalTransportCommitMessage | UniversalTransportAbortMessage;

export type UniversalTransportInboundMessage =
	| UniversalTransportAcknowledgement
	| UniversalTransportCompleteMessage
	| UniversalTransportRejectMessage
	| UniversalTransportFaultMessage
	| UniversalTransportEventMessage;

export interface UniversalHostCommitContext {
	/** Invoke a renderer-local callback after its owner table has been accepted. */
	invokeLocalCallback(listener: number, args: readonly unknown[]): unknown;
}

export interface UniversalPreparedHostBatch {
	/** Apply the already-validated physical host mutation. This marks the batch accepted. */
	apply(): void;
	/** Run renderer-local callbacks after logical owner/listener publication. */
	afterAccept?(): void;
	/** Release every unpublished resource staged by preparation exactly once. */
	abort(): void;
}

/**
 * A transported batch starts asynchronously. Calling `acknowledge` is the
 * irreversible host-acceptance point. Rejection before that call is a rejected
 * preparation; rejection afterwards is an accepted commit fault.
 */
export interface UniversalAsyncPreparedHostBatch {
	apply(acknowledge: (message: UniversalTransportAcknowledgement) => void): Promise<void>;
	/** Run adapter-local work after logical owner/listener publication. */
	afterAccept?(): void;
	abort(): void;
}

function isValidPreparedHostBatch(
	prepared: unknown,
): prepared is UniversalPreparedHostBatch | UniversalAsyncPreparedHostBatch {
	return (
		prepared !== null &&
		typeof prepared === 'object' &&
		typeof (prepared as UniversalPreparedHostBatch).apply === 'function' &&
		typeof (prepared as UniversalPreparedHostBatch).abort === 'function' &&
		((prepared as UniversalPreparedHostBatch).afterAccept === undefined ||
			typeof (prepared as UniversalPreparedHostBatch).afterAccept === 'function')
	);
}

function noopUniversalCommitTask(): void {}

export interface UniversalHostDriver<Container = unknown, PublicInstance = unknown> {
	readonly id: string;
	readonly capabilities?: UniversalHostCapabilities;
	readonly attachments?: UniversalHostAttachmentCapability<Container>;
	readonly events?: UniversalEventCapability;
	readonly lifecycles?: UniversalHostCallbackCapability;
	readonly localCallbacks?: UniversalHostCallbackCapability;
	readonly props?: UniversalHostPropCodec<Container>;
	readonly updates?: UniversalHostUpdateCapability;
	readonly portals?: UniversalPortalCapability<Container>;
	/** Validate and stage a batch without mutating the public host. */
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		context: UniversalHostCommitContext,
	): UniversalPreparedHostBatch;
	getPublicInstance(container: Container, id: number): PublicInstance | null;
}

export interface UniversalCommitTransport<Container = unknown> {
	readonly mode?: 'sync';
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		prepare: (batch: UniversalHostBatch) => UniversalPreparedHostBatch,
	): UniversalPreparedHostBatch;
}

export interface UniversalAsyncCommitTransport<Container = unknown> {
	readonly mode: 'async';
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		identity: UniversalTransportIdentity,
	): UniversalAsyncPreparedHostBatch;
}

export interface UniversalRootOptions<Container> {
	transport?: UniversalCommitTransport<Container> | UniversalAsyncCommitTransport<Container>;
	/**
	 * Host microtask scheduler. Required when the JS environment does not expose
	 * the standard global `queueMicrotask` (for example Lynx PrimJS).
	 */
	scheduleMicrotask?: (callback: () => void) => void;
	/**
	 * React 19 parity, reporting only: called after a `universalTry` catch arm
	 * claims an error from this root — a render-time throw its arm catches, or
	 * an effect/host-callback error routed to it between renders. Mirrors the
	 * DOM runtime's `createRoot` option: only the error is passed (no
	 * `errorInfo`/`componentStack` second argument).
	 */
	onCaughtError?: (error: unknown) => void;
	/**
	 * React 19 parity: called for an error no boundary claims. When provided it
	 * REPLACES the default report for this root's scheduler-owned work — a
	 * scheduled render error stops rethrowing out of the microtask flush (or,
	 * on a transported root, out of `flushTransport()`), and an unrouted
	 * effect/host-callback error stops rethrowing out of the commit or passive
	 * flush. Direct `prepare()`/`render()`/`commit()` calls still throw: the
	 * thrown attempt is that API's documented result channel. Recovery
	 * semantics are unchanged either way — the failed attempt is discarded and
	 * committed content is retained exactly as without the option.
	 */
	onUncaughtError?: (error: unknown) => void;
}

export interface UniversalTransaction {
	readonly status: 'prepared' | 'committed' | 'aborted';
	readonly batch: UniversalHostBatch;
	commit(): void;
	commitAsync(): Promise<void>;
	abort(): void;
}

export interface UniversalSuspendedAttempt {
	readonly status: 'suspended' | 'aborted';
	readonly thenable: PromiseLike<unknown>;
	abort(): void;
}

export type UniversalPreparedAttempt = UniversalTransaction | UniversalSuspendedAttempt;

export interface UniversalRoot<P = any> {
	readonly renderer: string;
	prepare(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	render(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	renderAsync(component: UniversalComponent<P>, props: P): Promise<UniversalPreparedAttempt>;
	eventScope<T>(priority: UniversalEventPriority, run: () => T): T;
	dispatchEvent(listener: number, payload: unknown): unknown;
	dispatchTransportEvent(message: UniversalTransportEventMessage): readonly unknown[];
	/** Wait for event/suspense work queued onto an asynchronous transport. */
	flushTransport(): Promise<void>;
	unmount(): void;
	unmountAsync(): Promise<void>;
}

interface BlueprintCompactLeafList {
	host: UniversalHostPlan | null;
	keys: UniversalKey[];
	values: (readonly unknown[])[];
	owner: UniversalOwnerRecord;
	owners: Array<UniversalOwnerRecord | undefined> | null;
	visibility: UniversalVisibility;
	props: Array<Record<string, unknown> | undefined>;
	propCount: number;
}

interface BlueprintCompactTemplateList {
	readonly plan: UniversalPlan;
	readonly compiled: CompiledCollapsedTemplateProgram;
	readonly program: PreparedCollapsedTemplateProgram;
	readonly keys: UniversalKey[];
	readonly values: (readonly UniversalHostTemplateProgramValue[])[];
	readonly captures: (readonly unknown[])[];
	readonly owner: UniversalOwnerRecord;
}

interface BlueprintRange {
	kind: 'range';
	key: UniversalKey | null;
	children: BlueprintNode[];
	owner?: UniversalOwnerRecord;
	compactLeafList?: BlueprintCompactLeafList;
	compactTemplateList?: BlueprintCompactTemplateList;
	// The committed range this marker stands for: the subtree neither re-rendered
	// nor re-drafted, so reconciliation must adopt the committed records as-is.
	retained?: LogicalRecord;
}

interface BlueprintHost {
	kind: 'host';
	key: UniversalKey | null;
	type: string;
	props: Record<string, unknown>;
	ref: unknown;
	owner: UniversalOwnerRecord;
	events: Map<string, BlueprintEvent>;
	lifecycles: Map<string, BlueprintHostCallback>;
	localCallbacks: Map<string, BlueprintHostCallback>;
	visibility: UniversalVisibility;
	children: BlueprintNode[];
	/** Hoisted source shape retained only for an optional initial host-template mount. */
	templatePlan?: UniversalHostPlan;
	/** Renderer-approved fresh descendants that have not allocated logical records. */
	collapsedTemplate?: BlueprintCollapsedTemplate;
}

interface BlueprintCollapsedTemplateNode {
	readonly props: Record<string, unknown>;
	readonly events?: readonly BlueprintEvent[];
}

interface BlueprintCollapsedTemplate {
	readonly program: CompiledCollapsedTemplateProgram;
	readonly nodes: readonly BlueprintCollapsedTemplateNode[] | null;
	readonly prepared?: PreparedCollapsedTemplateProgram;
	readonly values?: readonly UniversalHostTemplateProgramValue[];
	readonly captures?: readonly unknown[];
	readonly owner?: UniversalOwnerRecord;
	ids: number[] | null;
	firstId?: number;
}

interface BlueprintPortal {
	kind: 'portal';
	key: UniversalKey | null;
	target: unknown;
	registration: UniversalPortalTargetRegistration | null;
	children: BlueprintNode[];
}

interface BlueprintEvent {
	readonly prop: string;
	readonly type: string;
	readonly priority: UniversalEventPriority;
	readonly handler: (...args: any[]) => any;
	readonly owner: UniversalOwnerRecord;
}

interface BlueprintHostCallback {
	readonly prop: string;
	readonly type: string;
	readonly handler: (...args: any[]) => any;
	readonly owner: UniversalOwnerRecord;
}

type BlueprintNode = BlueprintRange | BlueprintHost | BlueprintPortal;

interface LogicalRecord {
	id: number;
	kind: 'range' | 'host' | 'portal';
	key: UniversalKey | null;
	type: string | null;
	props: Record<string, unknown>;
	ref: unknown;
	refCleanup: (() => void) | null;
	refAttached: boolean;
	owner: UniversalOwnerRecord | null;
	events: Map<string, CommittedEvent>;
	lifecycles: Map<string, CommittedHostCallback>;
	localCallbacks: Map<string, CommittedHostCallback>;
	visibility: UniversalVisibility;
	portalRegistration: UniversalPortalTargetRegistration | null;
	parent: LogicalRecord | null;
	children: LogicalRecord[];
	collapsedTemplate?: CommittedCollapsedTemplate;
}

interface CommittedCollapsedTemplateEvent {
	readonly index: number;
	readonly event: CommittedEvent;
}

interface CommittedCollapsedTemplate {
	readonly shape: readonly UniversalHostTemplateShapeNode[];
	readonly nodes:
		| readonly {
				readonly id?: number;
				readonly props: Readonly<Record<string, unknown>>;
		  }[]
		| null;
	readonly events: readonly CommittedCollapsedTemplateEvent[];
	readonly owner: UniversalOwnerRecord;
	readonly firstId?: number;
	readonly prepared?: PreparedCollapsedTemplateProgram;
	readonly values?: readonly UniversalHostTemplateProgramValue[];
}

interface CommittedEvent extends BlueprintEvent {
	readonly listener: number;
}

interface CommittedHostCallback extends BlueprintHostCallback {
	readonly listener: number;
}

const EMPTY_BLUEPRINT_EVENTS = new Map<string, BlueprintEvent>();
const EMPTY_BLUEPRINT_HOST_CALLBACKS = new Map<string, BlueprintHostCallback>();
const EMPTY_COMMITTED_EVENTS = new Map<string, CommittedEvent>();
const EMPTY_COMMITTED_HOST_CALLBACKS = new Map<string, CommittedHostCallback>();
const EMPTY_STATIC_HOST_PROPS: Record<string, unknown> = Object.freeze({});
const EMPTY_STATIC_PROP_NAMES: readonly string[] = Object.freeze([]);

interface DraftRecord {
	record: LogicalRecord;
	blueprint: BlueprintNode;
	children: DraftRecord[];
	isNew: boolean;
	hostUpdate: UniversalHostUpdateKind | null;
	// A retained subtree adopts its committed records wholesale: commit must not
	// rewrite the record's children, and placement reads them from the record.
	retained?: boolean;
}

type EffectPhase = 'insertion' | 'layout' | 'passive';
type UniversalVisibility = 'visible' | 'activity-hidden' | 'suspense-hidden';

interface StateHook<T = unknown> {
	kind: 'state';
	value: T;
	set: (value: T | ((previous: T) => T)) => void;
	get: () => T;
}

export interface LinkedStatePrevious<Source, Value> {
	source: Source;
	value: Value;
}

export interface LinkedStateOptions<Source, Value> {
	sourceEqual?: (previous: Source, next: Source) => boolean;
	valueEqual?: (previous: Value, next: Value) => boolean;
}

interface LinkedStateHook<Source = unknown, Value = unknown> {
	kind: 'state';
	linked: true;
	source: Source;
	generation: number;
	generationBase: Value;
	value: Value;
	valueEqual: (previous: Value, next: Value) => boolean;
	set: (value: Value | ((previous: Value) => Value)) => void;
	get?: () => Value;
}

interface ParkedUniversalLinkedDraft<Source = unknown, Value = unknown> {
	source: Source;
	value: Value;
	valueEqual: (previous: Value, next: Value) => boolean;
	generation: number;
	updated: boolean;
}

// Retained Suspense commits the old primary owner while discarding its speculative
// replacement owner. Preserve only linked-state source drafts here; ordinary
// state hooks never allocate, consult, or change this optional side table.
let PARKED_UNIVERSAL_LINKED_DRAFTS: WeakMap<object, ParkedUniversalLinkedDraft<any, any>> | null =
	null;

interface ReducerHook<S = unknown, A = unknown> {
	kind: 'reducer';
	value: S;
	reducer: (state: S, action: A) => S;
	dispatch: (action: A) => void;
	get: () => S;
}

interface MemoHook<T = unknown> {
	kind: 'memo';
	value: T;
	deps: readonly unknown[] | null;
}

interface ComponentMemoHook<P = any> {
	kind: 'component-memo';
	component: UniversalComponent<P>;
	revision: number;
	props: P;
	value: UniversalRenderable;
	contextReads: Map<UniversalContext<any>, unknown> | null;
}

interface RefHook<T = unknown> {
	kind: 'ref';
	current: T;
	value: { current: T };
}

interface IdHook {
	kind: 'id';
	value: string;
}

interface EffectEventHook {
	kind: 'effect-event';
	cell: EffectEventCell;
	next: (...args: any[]) => any;
	value: (...args: any[]) => any;
}

interface EffectEventCell {
	impl: (...args: any[]) => any;
	active: boolean;
}

interface EffectHook {
	kind: 'effect';
	owner: UniversalOwnerRecord;
	slot: unknown;
	phase: EffectPhase;
	create: () => void | (() => void);
	deps: readonly unknown[] | null;
	cleanup: (() => void) | null;
	mounted: boolean;
	previous: EffectHook | null;
}

type UniversalHook =
	| StateHook<any>
	| LinkedStateHook<any, any>
	| ReducerHook<any, any>
	| MemoHook
	| ComponentMemoHook
	| RefHook
	| IdHook
	| EffectHook
	| EffectEventHook;

interface UniversalOwnerRecord {
	readonly root: UniversalRootImpl<any, any>;
	readonly renderer: string;
	component: UniversalComponent<any> | null;
	componentProps: any;
	// The component revision this owner last rendered under. HMR swaps keep the
	// wrapper identity and bump only the revision, so a retained-subtree reuse
	// must compare it to know the committed output still reflects current code.
	componentRevision: number;
	parent: UniversalOwnerRecord | null;
	identityPath: readonly unknown[];
	key: unknown;
	id: number;
	rangeKey: symbol;
	hooks: Map<unknown, UniversalHook>;
	effectOrder: EffectHook[];
	children: UniversalOwnerRecord[];
	// The root's dirty epoch this owner (or a descendant) was last scheduled in.
	// Comparing against an attempt's consumed epoch answers "does this subtree
	// carry scheduled work?" in O(1); stale epochs expire without any clearing.
	dirtyEpoch: number;
	range: LogicalRecord | null;
	contextValues: Map<UniversalContext<any>, unknown> | null;
	updates: Map<unknown, UniversalHookUpdateQueue>;
	isBoundary: boolean;
	canHandleSuspense: boolean;
	boundaryError: unknown;
	hasBoundaryError: boolean;
	boundaryThenable: PromiseLike<unknown> | null;
	visibility: UniversalVisibility;
	mounted: boolean;
	disposed: boolean;
}

interface BoundaryOwner {
	readContext<T>(context: UniversalContext<T>): T;
	invalidate(): void;
}

interface RenderAttempt {
	root: UniversalRootImpl<any, any>;
	owner: DraftOwner;
	scope: UniversalOwnerRecord | null;
	owners: DraftOwner[];
	treeFeatures: number;
	replayEntries: readonly SuspendedMemoEntry[];
	retryThenables: Set<PromiseLike<unknown>>;
	nextUniversalId: number;
	implicitSlot: number;
	transitionBatches: ReadonlySet<UniversalTransitionBatch>;
	transitionRender: boolean;
	bridgeContextReads: Map<UniversalContext<any>, unknown> | null;
	// Whether this attempt may reuse committed component subtrees whose inputs
	// are provably unchanged instead of re-rendering them. Only plain urgent
	// attempts qualify; replay, transition, and bridge renders need every owner
	// re-executed for their own bookkeeping.
	retainEligible: boolean;
	retainedCount: number;
	// The dirty epoch this attempt consumed. An owner stamped with it contains
	// scheduled work, so its subtree must re-render even when its props, update
	// queues, and contexts look clean.
	dirtyEpoch: number;
}

const UNIVERSAL_TREE_PORTAL = 1 << 0;
const UNIVERSAL_TREE_REGION = 1 << 1;
const UNIVERSAL_TREE_EVENT = 1 << 2;
const UNIVERSAL_TREE_LIFECYCLE = 1 << 3;
const UNIVERSAL_TREE_LOCAL_CALLBACK = 1 << 4;
const UNIVERSAL_TREE_REF = 1 << 5;
const UNIVERSAL_TREE_HIDDEN = 1 << 6;

interface DraftOwner {
	record: UniversalOwnerRecord;
	componentProps: any;
	componentRevision: number;
	parent: DraftOwner | null;
	replayPath: readonly SuspendedOwnerSegment[];
	hooks: Map<unknown, UniversalHook>;
	clonedHooks: Set<unknown>;
	seenEffects: EffectHook[];
	children: DraftOwner[];
	// Committed child owners adopted without re-rendering, with the drafted-child
	// index each was claimed at so commit can rebuild record.children in exact
	// claim order.
	retainedChildren: { record: UniversalOwnerRecord; position: number }[] | null;
	claimedChildren: Set<UniversalOwnerRecord>;
	// Claims almost always revisit committed children in their original order,
	// so a plain cursor with a direct identity compare resolves them without
	// touching the identity-path index; the first out-of-order claim builds the
	// buckets and retires the cursor for this render.
	sequentialClaimCursor: number;
	childOwnerBuckets: OwnerIdentityIndex<UniversalOwnerRecord[]> | null;
	childClaimCursors: OwnerIdentityIndex<number> | null;
	childReplayOrdinals: OwnerIdentityIndex<number> | null;
	contextValues: Map<UniversalContext<any>, unknown> | null;
	appliedUpdates: Map<unknown, AppliedUniversalHookUpdates>;
	needsRender: boolean;
	implicitSlot: number;
	boundaryError: unknown;
	hasBoundaryError: boolean;
	boundaryThenable: PromiseLike<unknown> | null;
	isBoundary: boolean;
	canHandleSuspense: boolean;
	visibility: UniversalVisibility;
	// Lazily memoized answer to "has any context this owner can observe changed
	// value since the last commit?"; null until computed for this attempt.
	contextStable: boolean | null;
}

interface LazyLeafOwnerScope {
	readonly attempt: RenderAttempt;
	readonly parent: DraftOwner;
	readonly identityPath: readonly unknown[];
	key: UniversalKey;
	owner: DraftOwner | null;
}

interface SuspendedOwnerSegment {
	readonly component: UniversalComponent<any> | null;
	readonly identityPath: readonly unknown[];
	readonly key: unknown;
	readonly ordinal: number;
}

interface SuspendedMemoEntry {
	readonly ownerPath: readonly SuspendedOwnerSegment[];
	readonly slot: unknown;
	readonly deps: readonly unknown[];
	readonly value: PromiseLike<unknown>;
}

interface SuspendedMemoReplay {
	readonly entries: readonly SuspendedMemoEntry[];
	readonly component: UniversalComponent<any>;
	readonly props: any;
	readonly transitionBatches: ReadonlySet<UniversalTransitionBatch>;
	readonly transitionRender: boolean;
	active: boolean;
	asyncWorkQueued: boolean;
}

interface OwnerIdentityPathNode<T> {
	readonly children: Map<unknown, OwnerIdentityPathNode<T>>;
	values: Map<unknown, T> | null;
}

interface OwnerIdentityIndex<T> {
	readonly components: Map<UniversalComponent<any> | null, OwnerIdentityPathNode<T>>;
}

let CURRENT_ATTEMPT: RenderAttempt | null = null;
let CURRENT_OWNER: DraftOwner | null = null;
let CURRENT_LAZY_LEAF_OWNER: LazyLeafOwnerScope | null = null;
let CURRENT_MEMO_CONTEXT_READS: Map<UniversalContext<any>, unknown> | null = null;
const SCHEDULED_UNIVERSAL_ROOTS = new Set<UniversalRootImpl<any, any>>();
const PENDING_UNIVERSAL_PASSIVE_ROOTS = new Set<UniversalRootImpl<any, any>>();
let UNIVERSAL_SYNC_DEPTH = 0;
let UNIVERSAL_COMMIT_TASK_DEPTH = 0;
let UNIVERSAL_TRANSITION_DEPTH = 0;
let UNIVERSAL_ASYNC_TRANSITION_COUNT = 0;
let UNIVERSAL_DISCRETE_EVENT_DEPTH = 0;
let UNIVERSAL_TRANSITION_PENDING_COUNT = 0;
let ACTIVE_UNIVERSAL_TRANSITION_BATCH: UniversalTransitionBatch | null = null;
let IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH: UniversalTransitionBatch | null = null;
const UNIVERSAL_TRANSITION_LISTENERS = new Set<() => void>();
const UNIVERSAL_SYNC_DRAIN_LIMIT = 100;
let NEXT_HOOK_SLOT = 0;
let NEXT_OWNER_ID = 1;
let NEXT_UNIVERSAL_ID_ROOT = 1;
let NEXT_EVENT_ROOT = 1;
let NEXT_RESOURCE_ROOT = 1;
let NEXT_PORTAL_ROOT = 1;
let NEXT_TRANSPORT_ROOT = 1;
const EVENT_DISPATCHERS = new Map<number, (payload: unknown) => unknown>();
const UNIVERSAL_SLOT_STACK: unknown[] = [];
interface UniversalTransitionUpdate {
	readonly kind: 'state' | 'reducer';
}

interface UniversalHookUpdateQueue extends Array<unknown> {
	kind?: 'state' | 'reducer';
	baseState?: unknown;
	batches?: (UniversalTransitionBatch | null)[];
	rebases?: boolean[];
}

interface AppliedUniversalUrgentUpdates {
	readonly lane: false;
	readonly queue: UniversalHookUpdateQueue;
	readonly consumed: number;
	readonly baseState: unknown;
}

interface AppliedUniversalLaneUpdates {
	readonly lane: true;
	readonly queue: UniversalHookUpdateQueue;
	readonly consumed: number;
	readonly baseState: unknown;
	readonly remainingValues: unknown[];
	readonly remainingBatches: (UniversalTransitionBatch | null)[];
	readonly remainingRebases: boolean[];
}

type AppliedUniversalHookUpdates = AppliedUniversalUrgentUpdates | AppliedUniversalLaneUpdates;

interface UniversalTransitionBatch {
	readonly updates: Map<UniversalOwnerRecord, Map<unknown, UniversalTransitionUpdate>>;
	readonly roots: Set<UniversalRootImpl<any, any>>;
	pendingActions: number;
	pendingSignals: number;
	closed: boolean;
	promotionScheduled: boolean;
	promoted: boolean;
	settled: boolean;
}

const EMPTY_UNIVERSAL_TRANSITION_BATCHES: ReadonlySet<UniversalTransitionBatch> = new Set();

interface RendererRegionBridgeCell {
	active: boolean;
	disposing: boolean;
	readonly disposers: Set<() => void>;
}

/** Structural bridge contract shared with host runtimes through region props. */
interface RendererRegionOwnerBridge {
	readonly active: boolean;
	readContext<T>(context: UniversalContext<T>): T;
	routeError(error: unknown): boolean;
	routeSuspense(thenable: PromiseLike<unknown>): boolean;
	registerDispose(dispose: () => void): () => void;
}

class UniversalRendererRegionOwnerBridge implements RendererRegionOwnerBridge {
	private cell: RendererRegionBridgeCell | null = null;

	constructor(
		readonly owner: UniversalOwnerRecord,
		readonly ownerRenderer: string,
		readonly childRenderer: string,
		readonly component: unknown,
	) {}

	get active(): boolean {
		return this.cell?.active === true;
	}

	compatible(previous: UniversalRendererRegionOwnerBridge): boolean {
		return (
			previous.owner === this.owner &&
			previous.ownerRenderer === this.ownerRenderer &&
			previous.childRenderer === this.childRenderer &&
			previous.component === this.component
		);
	}

	activate(previous: UniversalRendererRegionOwnerBridge | null): RendererRegionBridgeCell {
		if (this.cell?.active === true) return this.cell;
		if (previous !== null && this.compatible(previous) && previous.cell?.active === true) {
			this.cell = previous.cell;
			return this.cell;
		}
		this.cell = { active: true, disposing: false, disposers: new Set() };
		return this.cell;
	}

	lifecycle(): RendererRegionBridgeCell | null {
		return this.cell;
	}

	readContext<T>(context: UniversalContext<T>): T {
		if (!this.active) {
			throw new Error('A renderer-region owner bridge cannot be read before its host commit.');
		}
		for (
			let current: UniversalOwnerRecord | null = this.owner;
			current !== null;
			current = current.parent
		) {
			if (current.contextValues?.has(context)) return current.contextValues.get(context) as T;
		}
		return this.owner.root.readBridgeContext(context);
	}

	routeError(error: unknown): boolean {
		return this.active && routeUniversalOwnerError(this.owner, error);
	}

	routeSuspense(thenable: PromiseLike<unknown>): boolean {
		return this.active && routeUniversalOwnerSuspense(this.owner, thenable);
	}

	registerDispose(dispose: () => void): () => void {
		const cell = this.cell;
		if (cell === null || !cell.active || cell.disposing) {
			throw new Error(
				'A renderer-owned child root cannot attach before its universal region commits.',
			);
		}
		if (typeof dispose !== 'function') {
			throw new TypeError('A renderer-region disposer must be a function.');
		}
		cell.disposers.add(dispose);
		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			cell.disposers.delete(dispose);
		};
	}

	deactivate(): void {
		const cell = this.cell;
		if (cell === null || !cell.active || cell.disposing) return;
		cell.active = false;
		cell.disposing = true;
		const disposers = [...cell.disposers];
		cell.disposers.clear();
		for (const dispose of disposers) {
			try {
				dispose();
			} catch (error) {
				if (routeUniversalOwnerError(this.owner, error)) continue;
				if (!reportUniversalUncaughtError(this.owner.root, error)) console.error(error);
			}
		}
		cell.disposing = false;
	}
}

class UniversalSuspense {
	constructor(readonly thenable: PromiseLike<unknown>) {}
}

class UniversalSuspendedAttemptImpl implements UniversalSuspendedAttempt {
	private state: 'suspended' | 'aborted' = 'suspended';

	constructor(
		private readonly root: UniversalRootImpl<any, any>,
		readonly thenable: PromiseLike<unknown>,
		readonly component: UniversalComponent<any>,
		readonly props: any,
		readonly replayEntries: readonly SuspendedMemoEntry[],
		readonly transitionBatches: ReadonlySet<UniversalTransitionBatch>,
		readonly transitionRender: boolean,
		readonly bridgeContextReads: ReadonlyMap<UniversalContext<any>, unknown> | null,
	) {
		thenable.then(
			() => this.settle(),
			() => this.settle(),
		);
	}

	get status(): 'suspended' | 'aborted' {
		return this.state;
	}

	private settle(): void {
		if (this.state !== 'suspended') return;
		this.root.finishSuspension(this, true);
	}

	abort(preserveTransitions = false): void {
		if (this.state !== 'suspended') return;
		this.state = 'aborted';
		this.root.finishSuspension(this, false, preserveTransitions);
	}
}

function assertRendererId(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError(`${label} must be a non-empty renderer id.`);
	}
}

function normalizeUniversalKey(value: unknown): UniversalKey | null {
	if (value == null) return null;
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'symbol' ||
		typeof value === 'bigint'
	) {
		return value;
	}
	throw new TypeError(`Universal keys must be strings, numbers, symbols, or bigints.`);
}

function freezePlanNode(node: UniversalPlanNode): UniversalPlanNode {
	if (node.kind === 'host') {
		if (typeof node.type !== 'string' || node.type === '') {
			throw new TypeError('A universal host plan requires a non-empty string type.');
		}
		const props =
			node.props === undefined ? EMPTY_STATIC_HOST_PROPS : Object.freeze({ ...node.props });
		const bindings = Object.freeze(
			(node.bindings ?? []).map((binding) => Object.freeze([binding[0], binding[1]] as const)),
		);
		const children = Object.freeze((node.children ?? []).map(freezePlanNode));
		return Object.freeze({
			kind: 'host',
			type: node.type,
			props,
			bindings,
			...(node.propsSlot === undefined ? null : { propsSlot: node.propsSlot }),
			children,
		});
	}
	if (node.kind === 'range') {
		return Object.freeze({
			kind: 'range',
			children: Object.freeze(node.children.map(freezePlanNode)),
		});
	}
	if (node.kind === 'slot') {
		return Object.freeze({ kind: 'slot', slot: node.slot });
	}
	if (node.kind === 'component') {
		return Object.freeze({
			kind: 'component',
			renderer: node.renderer,
			...(node.component === undefined ? null : { component: node.component }),
			...(node.componentSlot === undefined ? null : { componentSlot: node.componentSlot }),
			...(node.propsSlot === undefined ? null : { propsSlot: node.propsSlot }),
			...(node.keySlot === undefined ? null : { keySlot: node.keySlot }),
			children: Object.freeze((node.children ?? []).map(freezePlanNode)),
		});
	}
	if (node.kind === 'if') {
		return Object.freeze({
			kind: 'if',
			conditionSlot: node.conditionSlot,
			then: freezePlanNode(node.then),
			...(node.else === undefined ? null : { else: freezePlanNode(node.else) }),
		});
	}
	if (node.kind === 'switch') {
		return Object.freeze({
			kind: 'switch',
			valueSlot: node.valueSlot,
			cases: Object.freeze(
				node.cases.map(([value, child]) => Object.freeze([value, freezePlanNode(child)] as const)),
			),
			...(node.default === undefined ? null : { default: freezePlanNode(node.default) }),
		});
	}
	return Object.freeze({
		kind: 'text',
		...(node.value === undefined ? null : { value: node.value }),
		...(node.slot === undefined ? null : { slot: node.slot }),
	});
}

export function universalPlan(renderer: string, root: UniversalPlanNode): UniversalPlan {
	assertRendererId(renderer, 'universalPlan renderer');
	return Object.freeze({ $$kind: UNIVERSAL_PLAN, renderer, root: freezePlanNode(root) });
}

export function universalValue(
	plan: UniversalPlan,
	values: readonly unknown[] = [],
	key: UniversalKey | null = null,
): UniversalPlanValue {
	if (plan?.$$kind !== UNIVERSAL_PLAN)
		throw new TypeError('universalValue expected a universal plan.');
	return { $$kind: UNIVERSAL_VALUE, plan, values, key };
}

export function universalKey(key: UniversalKey, value: UniversalRenderable): UniversalRenderable {
	if ((value as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
		return { ...(value as UniversalPlanValue), key };
	}
	return { $$kind: UNIVERSAL_KEYED, key, value };
}

export function universalList<T>(
	items: Iterable<T>,
	render: (item: T, index: number) => UniversalRenderable,
	empty?: UniversalRenderable,
): UniversalListValue {
	const values: UniversalRenderable[] = [];
	let index = 0;
	const keys = new Set<UniversalKey>();
	for (const item of items) {
		const value = render(item, index++);
		const key = renderableKey(value);
		if (key === null) {
			throw new Error('Universal keyed lists require every item to have an explicit key.');
		}
		if (keys.has(key)) throw new Error(`Duplicate universal list key ${String(key)}.`);
		keys.add(key);
		values.push(value);
	}
	return { $$kind: UNIVERSAL_LIST, values, ...(values.length === 0 ? { empty } : null) };
}

function renderableKey(value: UniversalRenderable): UniversalKey | null {
	if ((value as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
		return (value as UniversalPlanValue).key;
	}
	if ((value as UniversalKeyedValue)?.$$kind === UNIVERSAL_KEYED) {
		return (value as UniversalKeyedValue).key;
	}
	if ((value as UniversalComponentValue)?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
		const component = value as UniversalComponentValue;
		return component.hasKey ? (component.key as UniversalKey) : null;
	}
	return null;
}

function defineUniversalProtoProp(props: Record<PropertyKey, unknown>, value: unknown): void {
	// Assignment would invoke Object.prototype.__proto__ instead of creating
	// the own data property required by object-spread/JSX semantics.
	Object.defineProperty(props, '__proto__', {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

function assignUniversalPropSpread(
	props: Record<PropertyKey, unknown>,
	value: unknown,
	canonicalizeHostClass: boolean,
): void {
	const source = Object(value);
	const hasOwnProto = Object.prototype.propertyIsEnumerable.call(source, '__proto__');
	const hasOwnClassName =
		canonicalizeHostClass && Object.prototype.propertyIsEnumerable.call(source, 'className');
	if (!hasOwnProto && !hasOwnClassName) {
		// Keep the ordinary spread path on the native Object.assign fast path,
		// including its enumerable-symbol and getter ordering semantics.
		Object.assign(props, source);
		return;
	}

	let protoAssigned = false;
	const needsProtoGuard = hasOwnProto && !hasOwnProp.call(props, '__proto__');
	if (needsProtoGuard) {
		Object.defineProperty(props, '__proto__', {
			configurable: true,
			set(next) {
				protoAssigned = true;
				defineUniversalProtoProp(props, next);
			},
		});
	}
	if (hasOwnClassName) {
		Object.defineProperty(props, 'className', {
			configurable: true,
			set(next) {
				props.class = next;
			},
		});
	}
	try {
		Object.assign(props, source);
	} finally {
		if (needsProtoGuard && !protoAssigned) delete props.__proto__;
		if (hasOwnClassName) delete props.className;
	}
}

export function universalProps(
	entries: readonly UniversalPropEntry[],
	children: unknown = NO_CHILDREN,
	canonicalizeHostClass = false,
	compilerOwnedRecord = false,
): UniversalPropsValue {
	if (compilerOwnedRecord) {
		return {
			$$kind: UNIVERSAL_PROPS,
			props: Object.freeze(entries as unknown as Record<string, unknown>),
			key: null,
			hasKey: false,
			hasChildren: false,
		};
	}
	const props: Record<string, unknown> = {};
	if (!canonicalizeHostClass) {
		for (const entry of entries) {
			if (entry[0] === 'set') {
				if (entry[1] === '__proto__') defineUniversalProtoProp(props, entry[2]);
				else props[entry[1]] = entry[2];
				continue;
			}
			const spread = entry[1];
			if (spread == null) continue;
			assignUniversalPropSpread(props, spread, false);
		}
	} else {
		// Universal host compilers canonicalize React's alias in authored prop
		// order. Components keep their ordinary `className` prop untouched.
		for (const entry of entries) {
			if (entry[0] === 'set') {
				const name = entry[1];
				if (name === '__proto__') defineUniversalProtoProp(props, entry[2]);
				else props[name === 'className' ? 'class' : name] = entry[2];
				continue;
			}
			const spread = entry[1];
			if (spread == null) continue;
			assignUniversalPropSpread(props, spread, true);
		}
	}
	if (children !== NO_CHILDREN) props.children = children;
	const hasKey = hasOwnProp.call(props, 'key');
	const key = hasKey ? props.key : null;
	if (hasKey) delete props.key;
	return {
		$$kind: UNIVERSAL_PROPS,
		props: Object.freeze(props),
		key,
		hasKey,
		hasChildren: hasOwnProp.call(props, 'children'),
	};
}

function normalizePropsValue(
	value: UniversalPropsValue | Readonly<Record<string, unknown>> | null | undefined,
): UniversalPropsValue {
	if ((value as UniversalPropsValue)?.$$kind === UNIVERSAL_PROPS) {
		return value as UniversalPropsValue;
	}
	return universalProps(value == null ? [] : [['spread', value]]);
}

export function universalComponent(
	renderer: string,
	component: UniversalComponent<any>,
	props: UniversalPropsValue | Readonly<Record<string, unknown>> | null = null,
	key: unknown = NO_KEY,
): UniversalComponentValue {
	assertRendererId(renderer, 'universalComponent renderer');
	const normalized = normalizePropsValue(props);
	return {
		$$kind: UNIVERSAL_COMPONENT_VALUE,
		renderer,
		component,
		props: normalized,
		key: key === NO_KEY ? normalized.key : key,
		hasKey: key !== NO_KEY || normalized.hasKey,
	};
}

export function universalChildren(
	renderer: string,
	render: () => UniversalRenderable,
): UniversalChildrenValue {
	assertRendererId(renderer, 'universalChildren renderer');
	if (typeof render !== 'function') throw new TypeError('universalChildren expected a function.');
	return { $$kind: UNIVERSAL_CHILDREN, renderer, render };
}

export function universalIf(
	condition: unknown,
	then: () => UniversalRenderable,
	otherwise: (() => UniversalRenderable) | null = null,
): UniversalIfValue {
	return { $$kind: UNIVERSAL_IF, condition: !!condition, then, else: otherwise };
}

export function universalSwitch(
	value: unknown,
	cases: readonly (readonly [unknown, () => UniversalRenderable])[],
	defaultValue: (() => UniversalRenderable) | null = null,
): UniversalSwitchValue {
	return { $$kind: UNIVERSAL_SWITCH, value, cases, default: defaultValue };
}

export function universalFor<T>(
	items: Iterable<T>,
	key: (item: T, index: number) => UniversalKey,
	render: (item: T, index: number) => UniversalRenderable,
	empty: (() => UniversalRenderable) | null = null,
	ownerless = false,
	compact = false,
	hostComponent?: UniversalComponent<any> | true,
	leafPlan?: UniversalPlan,
	leafSignature?: string,
	componentScope = false,
): UniversalForValue {
	if (componentScope) {
		return {
			$$kind: UNIVERSAL_FOR,
			items,
			key,
			render,
			empty,
			ownerless,
			compact,
			componentScope: true,
		};
	}
	if (hostComponent === true) {
		return { $$kind: UNIVERSAL_FOR, items, key, render, empty, ownerless, compact, template: true };
	}
	if (leafSignature !== undefined) {
		return {
			$$kind: UNIVERSAL_FOR,
			items,
			key,
			render,
			empty,
			ownerless,
			compact,
			...(hostComponent === undefined ? null : { hostComponent }),
			...(leafPlan === undefined ? null : { leafPlan }),
			leafSignature,
		};
	}
	if (leafPlan !== undefined) {
		return hostComponent === undefined
			? { $$kind: UNIVERSAL_FOR, items, key, render, empty, ownerless, compact, leafPlan }
			: {
					$$kind: UNIVERSAL_FOR,
					items,
					key,
					render,
					empty,
					ownerless,
					compact,
					hostComponent,
					leafPlan,
				};
	}
	return hostComponent === undefined
		? { $$kind: UNIVERSAL_FOR, items, key, render, empty, ownerless, compact }
		: { $$kind: UNIVERSAL_FOR, items, key, render, empty, ownerless, compact, hostComponent };
}

export function universalTry(
	body: () => UniversalRenderable,
	pending: (() => UniversalRenderable) | null = null,
	catchBody: ((error: unknown, reset: () => void) => UniversalRenderable) | null = null,
): UniversalTryValue {
	return { $$kind: UNIVERSAL_TRY, body, pending, catch: catchBody };
}

export function universalContext<T>(
	context: UniversalContext<T>,
	value: T,
	children: UniversalRenderable | (() => UniversalRenderable),
): UniversalContextValue {
	return { $$kind: UNIVERSAL_CONTEXT, context, value, children };
}

export function universalActivity(
	mode: 'visible' | 'hidden' | string,
	body: () => UniversalRenderable,
): UniversalActivityValue {
	if (mode !== 'visible' && mode !== 'hidden') {
		throw new TypeError(
			`Universal Activity mode must be "visible" or "hidden", received ${JSON.stringify(mode)}.`,
		);
	}
	if (typeof body !== 'function')
		throw new TypeError('universalActivity expected a body function.');
	return { $$kind: UNIVERSAL_ACTIVITY, mode, body };
}

/** Compiler/runtime ABI for an explicitly renderer-owned component prop. */
export function rendererRegion<P>(
	ownerRenderer: string,
	childRenderer: string,
	component: unknown,
	props: P,
): RendererRegion<P> {
	assertRendererId(ownerRenderer, 'rendererRegion owner renderer');
	assertRendererId(childRenderer, 'rendererRegion child renderer');
	if (ownerRenderer === childRenderer) {
		throw new Error('rendererRegion requires distinct owner and child renderers.');
	}
	if (typeof component !== 'function') {
		throw new TypeError('rendererRegion expected a child component function.');
	}
	let regionProps = props;
	const owner = activateLazyLeafOwner();
	if (owner !== null) {
		if (ownerRenderer !== owner.record.renderer) {
			throw new Error(
				`rendererRegion owner ${JSON.stringify(ownerRenderer)} does not match the active universal renderer ${JSON.stringify(owner.record.renderer)}.`,
			);
		}
		if ((typeof props !== 'object' && typeof props !== 'function') || props === null) {
			throw new TypeError(
				'A renderer region created by a universal component requires object props.',
			);
		}
		const bridge = new UniversalRendererRegionOwnerBridge(
			owner.record,
			ownerRenderer,
			childRenderer,
			component,
		);
		const nextProps = { ...(props as any) };
		Object.defineProperty(nextProps, RENDERER_REGION_OWNER, {
			value: bridge,
			enumerable: false,
			configurable: false,
			writable: false,
		});
		regionProps = Object.freeze(nextProps) as P;
	}
	return Object.freeze({
		$$kind: UNIVERSAL_RENDERER_REGION,
		ownerRenderer,
		childRenderer,
		component,
		props: regionProps,
	});
}

export function isRendererRegion(value: unknown): value is RendererRegion {
	return (value as RendererRegion | null)?.$$kind === UNIVERSAL_RENDERER_REGION;
}

function rendererRegionOwnerBridge(value: unknown): UniversalRendererRegionOwnerBridge | null {
	if (!isRendererRegion(value)) return null;
	const bridge = (value.props as any)?.[RENDERER_REGION_OWNER];
	return bridge instanceof UniversalRendererRegionOwnerBridge ? bridge : null;
}

export function defineUniversalComponent<P>(
	renderer: string,
	render: (props: P, context: UniversalRenderContext) => UniversalRenderable,
	metadata?: { module?: string },
): UniversalComponent<P> {
	assertRendererId(renderer, 'defineUniversalComponent renderer');
	if (typeof render !== 'function')
		throw new TypeError('defineUniversalComponent expected a function.');
	Object.defineProperty(render, UNIVERSAL_COMPONENT, {
		configurable: false,
		enumerable: false,
		value: Object.freeze({ id: renderer, module: metadata?.module, target: 'universal' }),
	});
	return render as UniversalComponent<P>;
}

/** Certify a binding-owned component that only forwards its props to one host. */
export function markUniversalHostComponent<P>(
	component: UniversalComponent<P>,
	renderer: string,
	plan: UniversalPlan,
): UniversalComponent<P> {
	assertRendererId(renderer, 'markUniversalHostComponent renderer');
	if (getComponentMetadata(component).id !== renderer) {
		throw new Error('A universal host component and its renderer must match.');
	}
	if ((component as any)[UNIVERSAL_HMR] !== undefined) {
		throw new Error('A hot-reloadable component cannot be certified as a universal host.');
	}
	if (
		plan?.$$kind !== UNIVERSAL_PLAN ||
		plan.renderer !== renderer ||
		plan.root.kind !== 'host' ||
		plan.root.type === '#text' ||
		plan.root.propsSlot !== 0 ||
		(plan.root.children?.length ?? 0) !== 0 ||
		(plan.root.bindings?.length ?? 0) !== 0 ||
		Object.keys(plan.root.props ?? {}).length !== 0
	) {
		throw new TypeError('A universal host component requires one matching forwarded-props host.');
	}
	const existing = (component as any)[UNIVERSAL_HOST_COMPONENT] as
		UniversalHostComponentMetadata<P> | undefined;
	if (existing !== undefined) {
		if (
			existing.component === component &&
			existing.renderer === renderer &&
			existing.plan === plan
		) {
			return component;
		}
		throw new Error('A universal host component cannot change its certified host plan.');
	}
	Object.defineProperty(component, UNIVERSAL_HOST_COMPONENT, {
		value: Object.freeze({ component, renderer, plan, specializations: new Map() }),
	});
	HAS_UNIVERSAL_HOST_COMPONENTS = true;
	return component;
}

function trustedUniversalHostComponent(
	component: UniversalComponent<any>,
	renderer: string,
): UniversalHostComponentMetadata | null {
	if (
		!HAS_UNIVERSAL_HOST_COMPONENTS ||
		(typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
	) {
		return null;
	}
	const metadata = (component as any)[UNIVERSAL_HOST_COMPONENT] as
		UniversalHostComponentMetadata | undefined;
	return metadata !== undefined &&
		metadata.component === component &&
		metadata.renderer === renderer &&
		(component as any)[UNIVERSAL_HMR] === undefined
		? metadata
		: null;
}

function parseUniversalHostComponentSignature(signature: string): readonly string[] {
	const names: unknown = JSON.parse(signature);
	if (
		!Array.isArray(names) ||
		new Set(names).size !== names.length ||
		names.some(
			(name) =>
				typeof name !== 'string' ||
				name === '__proto__' ||
				name === 'key' ||
				name === 'ref' ||
				name === 'children' ||
				name === 'attach' ||
				name.startsWith('on'),
		)
	) {
		throw new TypeError('A universal host component requires safe, unique ordinary prop names.');
	}
	return names;
}

/** Compiler ABI: resolve one certified adapter's immutable leaf plan once per list. */
export function universalHostComponentLeafPlan(
	renderer: string,
	component: UniversalComponent<any>,
	signature: string,
): UniversalPlan | undefined {
	const host = trustedUniversalHostComponent(component, renderer);
	if (host === null) return undefined;
	let plan = host.specializations.get(signature);
	if (plan === undefined) {
		const names = parseUniversalHostComponentSignature(signature);
		plan = universalPlan(renderer, {
			kind: 'host',
			type: (host.plan.root as UniversalHostPlan).type,
			bindings: names.map((name, index) => [name, index] as const),
		});
		host.specializations.set(signature, plan);
	}
	return plan;
}

export const UNIVERSAL_HMR: unique symbol = Symbol.for('octane.universal.hmr');

interface UniversalHmrMeta {
	component: UniversalComponent<any>;
	readonly owners: Set<UniversalOwnerRecord>;
	revision: number;
	update(incoming: UniversalComponent<any>): void;
}

type UniversalHmrComponent<P> = UniversalComponent<P> & {
	readonly [UNIVERSAL_HMR]: UniversalHmrMeta;
};

export function hmrUniversalComponent<P>(
	renderer: string,
	component: UniversalComponent<P>,
): UniversalComponent<P> {
	assertRendererId(renderer, 'hmrUniversalComponent renderer');
	const metadata = getComponentMetadata(component);
	if (metadata.id !== renderer) {
		throw new Error(
			`Universal HMR renderer mismatch: wrapper ${JSON.stringify(renderer)} cannot own ${JSON.stringify(metadata.id)}.`,
		);
	}
	const owners = new Set<UniversalOwnerRecord>();
	const meta: UniversalHmrMeta = {
		component,
		owners,
		revision: 0,
		update(incoming) {
			const incomingMeta = (incoming as UniversalHmrComponent<any>)[UNIVERSAL_HMR];
			const next = incomingMeta?.component ?? incoming;
			const nextMetadata = getComponentMetadata(next);
			if (nextMetadata.id !== renderer) {
				throw new Error(
					`Universal HMR renderer mismatch: wrapper ${JSON.stringify(renderer)} cannot accept ${JSON.stringify(nextMetadata.id)}.`,
				);
			}
			meta.component = next;
			meta.revision++;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
				__profileComponentSource(wrapper, next);
			}
			if ((next as any).__warm === undefined) delete (wrapper as any).__warm;
			else (wrapper as any).__warm = (next as any).__warm;
			for (const owner of owners) {
				if (owner.disposed) {
					owners.delete(owner);
					continue;
				}
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
					__profileSchedule(owner, 'hmr');
				}
				owner.root.schedule();
			}
		},
	};
	const wrapper = defineUniversalComponent<P>(
		renderer,
		(props, context) => {
			const owner = activateLazyLeafOwner();
			if (owner !== null) owners.add(owner.record);
			return meta.component(props, context);
		},
		{ module: metadata.module },
	) as UniversalHmrComponent<P>;
	Object.defineProperties(wrapper, {
		[UNIVERSAL_HMR]: { value: meta },
		[UNIVERSAL_COMPONENT_REVISION]: { get: () => meta.revision },
	});
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		__profileComponentSource(wrapper, component);
	}
	if ((component as any).__warm !== undefined) (wrapper as any).__warm = (component as any).__warm;
	return wrapper;
}

function getComponentMetadata(component: UniversalComponent): UniversalRendererMetadata {
	const metadata = component?.[UNIVERSAL_COMPONENT];
	if (metadata === undefined) {
		if ((component as any)?.[LAZY_COMPONENT] === true) return UNIVERSAL_LAZY_METADATA;
		throw new Error('Universal roots accept only compiler-defined universal components.');
	}
	return metadata;
}

function identityPathEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (!Object.is(left[index], right[index])) return false;
	}
	return true;
}

const OWNER_IDENTITY_NEGATIVE_ZERO = Symbol('octane.universal.owner-identity.-0');

function ownerIdentityMapKey(value: unknown): unknown {
	return typeof value === 'number' && Object.is(value, -0) ? OWNER_IDENTITY_NEGATIVE_ZERO : value;
}

function createOwnerIdentityIndex<T>(): OwnerIdentityIndex<T> {
	return { components: new Map() };
}

function readOwnerIdentity<T>(
	index: OwnerIdentityIndex<T>,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): T | undefined {
	let node = index.components.get(component);
	if (node === undefined) return undefined;
	for (const segment of identityPath) {
		node = node.children.get(ownerIdentityMapKey(segment));
		if (node === undefined) return undefined;
	}
	return node.values?.get(ownerIdentityMapKey(key));
}

function writeOwnerIdentity<T>(
	index: OwnerIdentityIndex<T>,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
	value: T,
): void {
	const existing = index.components.get(component);
	let node: OwnerIdentityPathNode<T>;
	if (existing === undefined) {
		node = { children: new Map(), values: null };
		index.components.set(component, node);
	} else {
		node = existing;
	}
	for (const segment of identityPath) {
		const segmentKey = ownerIdentityMapKey(segment);
		let child: OwnerIdentityPathNode<T> | undefined = node.children.get(segmentKey);
		if (child === undefined) {
			child = { children: new Map(), values: null };
			node.children.set(segmentKey, child);
		}
		node = child;
	}
	node.values ??= new Map();
	node.values.set(ownerIdentityMapKey(key), value);
}

function createOwnerRecord(
	root: UniversalRootImpl<any, any>,
	component: UniversalComponent<any> | null,
	parent: UniversalOwnerRecord | null,
	identityPath: readonly unknown[],
	key: unknown,
): UniversalOwnerRecord {
	return {
		root,
		renderer: root.renderer,
		component,
		componentProps: null,
		componentRevision: 0,
		parent,
		identityPath,
		key,
		id: NEXT_OWNER_ID++,
		rangeKey: Symbol('octane.universal.owner-range'),
		hooks: new Map(),
		effectOrder: [],
		children: [],
		dirtyEpoch: 0,
		range: null,
		contextValues: null,
		updates: new Map(),
		isBoundary: false,
		canHandleSuspense: false,
		boundaryError: undefined,
		hasBoundaryError: false,
		boundaryThenable: null,
		visibility: 'visible',
		mounted: false,
		disposed: false,
	};
}

function draftOwner(
	record: UniversalOwnerRecord,
	parent: DraftOwner | null,
	replayPath: readonly SuspendedOwnerSegment[],
): DraftOwner {
	return {
		record,
		componentProps: record.componentProps,
		componentRevision: record.componentRevision,
		parent,
		replayPath,
		hooks: new Map(record.hooks),
		clonedHooks: new Set(),
		seenEffects: [],
		children: [],
		retainedChildren: null,
		claimedChildren: new Set(),
		sequentialClaimCursor: 0,
		childOwnerBuckets: null,
		childClaimCursors: null,
		childReplayOrdinals: null,
		contextValues: record.contextValues === null ? null : new Map(record.contextValues),
		appliedUpdates: new Map(),
		needsRender: false,
		implicitSlot: 0,
		boundaryError: record.boundaryError,
		hasBoundaryError: record.hasBoundaryError,
		boundaryThenable: record.boundaryThenable,
		isBoundary: record.isBoundary,
		canHandleSuspense: record.canHandleSuspense,
		visibility: parent?.visibility ?? record.visibility,
		contextStable: null,
	};
}

function childReplayPath(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): readonly SuspendedOwnerSegment[] {
	const ordinals = (parent.childReplayOrdinals ??= createOwnerIdentityIndex());
	const ordinal = readOwnerIdentity(ordinals, component, identityPath, key) ?? 0;
	writeOwnerIdentity(ordinals, component, identityPath, key, ordinal + 1);
	return [...parent.replayPath, { component, identityPath, key, ordinal }];
}

function childOwnerBucket(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): UniversalOwnerRecord[] | undefined {
	let buckets = parent.childOwnerBuckets;
	if (buckets === null) {
		buckets = createOwnerIdentityIndex();
		for (const child of parent.record.children) {
			let bucket = readOwnerIdentity(buckets, child.component, child.identityPath, child.key);
			if (bucket === undefined) {
				bucket = [];
				writeOwnerIdentity(buckets, child.component, child.identityPath, child.key, bucket);
			}
			bucket.push(child);
		}
		parent.childOwnerBuckets = buckets;
	}
	return readOwnerIdentity(buckets, component, identityPath, key);
}

function identityPathsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
	if (left === right) return true;
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (!Object.is(left[index], right[index])) return false;
	}
	return true;
}

function findClaimableChildRecord(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): UniversalOwnerRecord | undefined {
	if (parent.record.children.length === 0) return undefined;
	// Order-stable renders resolve every claim with one positional compare; the
	// identity-path buckets exist for reorders, insertions, and removals.
	if (parent.childOwnerBuckets === null) {
		const candidate = parent.record.children[parent.sequentialClaimCursor];
		if (
			candidate !== undefined &&
			candidate.component === component &&
			Object.is(candidate.key, key) &&
			identityPathsEqual(candidate.identityPath, identityPath) &&
			!parent.claimedChildren.has(candidate)
		) {
			parent.sequentialClaimCursor++;
			return candidate;
		}
	}
	const bucket = childOwnerBucket(parent, component, identityPath, key);
	if (bucket === undefined) return undefined;
	const cursors = (parent.childClaimCursors ??= createOwnerIdentityIndex());
	let cursor = readOwnerIdentity(cursors, component, identityPath, key) ?? 0;
	while (cursor < bucket.length && parent.claimedChildren.has(bucket[cursor])) cursor++;
	const record = bucket[cursor];
	writeOwnerIdentity(
		cursors,
		component,
		identityPath,
		key,
		cursor + (record === undefined ? 0 : 1),
	);
	return record;
}

function adoptChildOwner(
	parent: DraftOwner,
	record: UniversalOwnerRecord,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): DraftOwner {
	const attempt = currentAttempt();
	parent.claimedChildren.add(record);
	const draft = draftOwner(record, parent, childReplayPath(parent, component, identityPath, key));
	parent.children.push(draft);
	attempt.owners.push(draft);
	return draft;
}

function claimChildOwner(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): DraftOwner {
	const record =
		findClaimableChildRecord(parent, component, identityPath, key) ??
		createOwnerRecord(currentAttempt().root, component, parent.record, identityPath, key);
	return adoptChildOwner(parent, record, component, identityPath, key);
}

// Whether every context value observable from `owner` still matches the last
// commit. Anything an in-scope provider changed this attempt shows up as a
// draft contextValues entry that differs from its committed record; providers
// outside the scope could not have re-rendered, so their values are unchanged.
function ancestorContextsStable(owner: DraftOwner): boolean {
	if (owner.contextStable !== null) return owner.contextStable;
	let stable = owner.parent === null ? true : ancestorContextsStable(owner.parent);
	if (stable && owner.contextValues !== null) {
		const committed = owner.record.mounted ? owner.record.contextValues : null;
		if (committed === null) {
			stable = owner.contextValues.size === 0;
		} else if (committed.size !== owner.contextValues.size) {
			stable = false;
		} else {
			for (const [context, value] of owner.contextValues) {
				if (!committed.has(context) || !Object.is(committed.get(context), value)) {
					stable = false;
					break;
				}
			}
		}
	}
	owner.contextStable = stable;
	return stable;
}

// Whether a committed owner subtree can be adopted without re-rendering: no
// pending hook updates, no active boundary episode, no retained-hidden
// content, no warm-plan component, and no HMR revision drift anywhere below.
function ownerSubtreeRetainable(owner: UniversalOwnerRecord): boolean {
	if (
		owner.updates.size !== 0 ||
		owner.visibility !== 'visible' ||
		owner.boundaryThenable !== null ||
		(owner.isBoundary && owner.hasBoundaryError) ||
		(owner.component as any)?.__warm !== undefined ||
		(owner.component !== null &&
			universalComponentRevision(owner.component) !== owner.componentRevision)
	) {
		return false;
	}
	for (const child of owner.children) {
		if (!ownerSubtreeRetainable(child)) return false;
	}
	return true;
}

function activateLazyLeafOwner(): DraftOwner | null {
	const scope = CURRENT_LAZY_LEAF_OWNER;
	const attempt = CURRENT_ATTEMPT;
	if (
		scope === null ||
		attempt !== scope.attempt ||
		(CURRENT_OWNER !== scope.parent && CURRENT_OWNER !== scope.owner)
	) {
		return CURRENT_OWNER;
	}
	const owner = (scope.owner ??= claimChildOwner(
		scope.parent,
		null,
		scope.identityPath,
		scope.key,
	));
	owner.contextValues = null;
	CURRENT_OWNER = owner;
	attempt.owner = owner;
	return owner;
}

function readOwnerContext<T>(
	owner: DraftOwner | null,
	context: UniversalContext<T>,
	trackMemoRead = true,
): T {
	let value: T;
	for (let current = owner; current !== null; current = current.parent) {
		if (current.contextValues?.has(context)) {
			value = current.contextValues.get(context) as T;
			if (trackMemoRead) CURRENT_MEMO_CONTEXT_READS?.set(context, value);
			return value;
		}
	}
	if (currentAttempt().scope !== null) {
		for (let current = owner?.record.parent ?? null; current !== null; current = current.parent) {
			if (current.contextValues?.has(context)) {
				value = current.contextValues.get(context) as T;
				if (trackMemoRead) CURRENT_MEMO_CONTEXT_READS?.set(context, value);
				return value;
			}
		}
	}
	value = currentAttempt().root.readBridgeContext(context);
	if (trackMemoRead) CURRENT_MEMO_CONTEXT_READS?.set(context, value);
	return value;
}

function executeOwner(
	owner: DraftOwner,
	build: () => BlueprintNode[],
	initialRenderCount = 0,
): BlueprintNode[] {
	const attempt = currentAttempt();
	const warmPlanCheckpoint = ACTIVE_UNIVERSAL_WARM_PLANS.length;
	let output: BlueprintNode[] = [];
	for (let renderCount = initialRenderCount; ; renderCount++) {
		ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
		if (renderCount === 25) throw new Error('Too many universal render-phase updates.');
		if (renderCount > 0) resetDraftChildren(owner);
		owner.seenEffects = [];
		owner.children = [];
		owner.retainedChildren = null;
		owner.claimedChildren = new Set();
		owner.sequentialClaimCursor = 0;
		owner.childClaimCursors = null;
		owner.childReplayOrdinals = null;
		owner.contextStable = null;
		owner.needsRender = false;
		owner.implicitSlot = 0;
		const previousOwner = CURRENT_OWNER;
		const previousAttemptOwner = attempt.owner;
		CURRENT_OWNER = owner;
		attempt.owner = owner;
		const component = owner.record.component;
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			component !== null
		) {
			__profileTrackComponent(owner.record, component);
		}
		const profileFrame =
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			component !== null
				? __profileBeginRender(owner.record, component, owner.record.mounted)
				: null;
		let didThrow = false;
		let thrown: unknown;
		try {
			output = build();
		} catch (error) {
			didThrow = true;
			thrown = error;
			throw error;
		} finally {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
				__profileEndRender(profileFrame, didThrow, thrown);
			}
			ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
			CURRENT_OWNER = previousOwner;
			attempt.owner = previousAttemptOwner;
		}
		if (!owner.needsRender) return output;
	}
}

function renderLazyLeafItem(
	scope: LazyLeafOwnerScope,
	render: (item: any, index: number) => UniversalRenderable,
	item: unknown,
	index: number,
	key: UniversalKey,
): UniversalRenderable {
	const previousScope = CURRENT_LAZY_LEAF_OWNER;
	const previousOwner = CURRENT_OWNER;
	const previousAttemptOwner = scope.attempt.owner;
	const warmPlanCheckpoint = ACTIVE_UNIVERSAL_WARM_PLANS.length;
	scope.key = key;
	scope.owner = null;
	CURRENT_LAZY_LEAF_OWNER = scope;
	let rendered: UniversalRenderable;
	try {
		rendered = render(item, index);
		const owner = scope.owner as DraftOwner | null;
		if (owner?.needsRender) {
			ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
			executeOwner(
				owner,
				() => {
					rendered = render(item, index);
					return [];
				},
				1,
			);
		}
		return rendered;
	} finally {
		if (ACTIVE_UNIVERSAL_WARM_PLANS.length !== warmPlanCheckpoint) {
			ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
		}
		CURRENT_LAZY_LEAF_OWNER = previousScope;
		if (scope.owner !== null) {
			CURRENT_OWNER = previousOwner;
			scope.attempt.owner = previousAttemptOwner;
		}
	}
}

function ownerRange(owner: DraftOwner, children: BlueprintNode[]): BlueprintNode[] {
	return [{ kind: 'range', key: owner.record.rangeKey, owner: owner.record, children }];
}

function readComponentContext<T>(context: UniversalContext<T>): T {
	return readOwnerContext(activateLazyLeafOwner(), context);
}

function componentInsertionEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[],
): void {
	enqueueUniversalEffect('insertion', create, deps);
}

function componentLayoutEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
	enqueueUniversalEffect('layout', create, deps);
}

function componentEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
	enqueueUniversalEffect('passive', create, deps);
}

function componentContext(renderer: string): UniversalRenderContext {
	return {
		renderer,
		readContext: readComponentContext,
		insertionEffect: componentInsertionEffect,
		layoutEffect: componentLayoutEffect,
		effect: componentEffect,
	};
}

function materializeComponentValue(
	value: UniversalComponentValue,
	expectedRenderer: string,
	path: readonly unknown[],
): BlueprintNode[] {
	if (value.renderer !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot materialize component descriptor ${JSON.stringify(value.renderer)}.`,
		);
	}
	const metadata = getComponentMetadata(value.component);
	if (metadata !== UNIVERSAL_LAZY_METADATA && metadata.id !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot render nested component ${JSON.stringify(metadata.id)}.`,
		);
	}
	const parent = CURRENT_OWNER;
	if (parent === null) throw new Error('A nested universal component requires an owner.');
	const normalized = normalizePropsValue(value.props);
	const host = trustedUniversalHostComponent(value.component, expectedRenderer);
	if (host !== null) {
		// Certified adapters cannot own hooks or context; the ordinary host
		// materializer still classifies their refs, callbacks, events, and children.
		const nodes = materializeNode(host.plan.root, [normalized], expectedRenderer, path);
		if (value.hasKey) nodes[0].key = normalizeUniversalKey(value.key);
		return nodes;
	}
	const key = value.hasKey ? value.key : null;
	const attempt = currentAttempt();
	const record = findClaimableChildRecord(parent, value.component, path, key);
	if (
		attempt.retainEligible &&
		record !== undefined &&
		record.mounted &&
		!record.disposed &&
		record.dirtyEpoch !== attempt.dirtyEpoch &&
		record.visibility === 'visible' &&
		parent.visibility === 'visible' &&
		record.componentProps !== null &&
		universalShallowEqual(record.componentProps, normalized.props) &&
		record.range !== null &&
		record.range.owner === record &&
		ancestorContextsStable(parent) &&
		ownerSubtreeRetainable(record)
	) {
		const features = logicalTreeFeatures(record.range);
		if ((features & (UNIVERSAL_TREE_PORTAL | UNIVERSAL_TREE_REGION)) === 0) {
			// Adopt the committed subtree wholesale: the claim is recorded so the
			// records survive reconciliation, but no draft is created and nothing
			// below re-renders. The committed features join the attempt's so the
			// commit keeps every staging branch those features rely on.
			parent.claimedChildren.add(record);
			(parent.retainedChildren ??= []).push({ record, position: parent.children.length });
			attempt.treeFeatures |= features;
			attempt.retainedCount++;
			return [
				{
					kind: 'range',
					key: record.range.key,
					owner: record,
					retained: record.range,
					children: [],
				},
			];
		}
	}
	const owner = adoptChildOwner(
		parent,
		record ?? createOwnerRecord(attempt.root, value.component, parent.record, path, key),
		value.component,
		path,
		key,
	);
	owner.componentRevision = universalComponentRevision(value.component);
	const props = { ...normalized.props };
	owner.componentProps = props;
	const nodes = executeOwner(owner, () => {
		const rendered = value.component(props, componentContext(expectedRenderer));
		return materializeValue(rendered, expectedRenderer, null, [...path, 'output']);
	});
	return ownerRange(owner, nodes);
}

function materializeScoped(
	parent: DraftOwner,
	path: readonly unknown[],
	key: unknown,
	build: () => UniversalRenderable,
	contextValues: Map<UniversalContext<any>, unknown> | null = null,
): BlueprintNode[] {
	const attempt = currentAttempt();
	const universalIdCheckpoint = attempt.nextUniversalId;
	const owner = claimChildOwner(parent, null, path, key);
	owner.contextValues = contextValues;
	try {
		const nodes = executeOwner(owner, () =>
			materializeValue(build(), parent.record.renderer, null, [...path, 'output']),
		);
		return ownerRange(owner, nodes);
	} catch (error) {
		// A scoped branch is the unit discarded by @try/@pending/@catch. IDs
		// allocated only by that abandoned branch must remain available to the
		// branch that actually commits.
		attempt.nextUniversalId = universalIdCheckpoint;
		throw error;
	}
}

function disposeUncommittedDraft(owner: DraftOwner): void {
	for (const child of owner.children) disposeUncommittedDraft(child);
	if (!owner.record.mounted) {
		owner.record.disposed = true;
		owner.record.componentProps = null;
		owner.record.range = null;
		owner.record.updates.clear();
		for (const hook of owner.hooks.values()) {
			if (hook.kind === 'effect-event') hook.cell.active = false;
		}
	}
}

function resetDraftChildren(owner: DraftOwner): void {
	for (const child of owner.children) disposeUncommittedDraft(child);
	owner.children = [];
	owner.retainedChildren = null;
	owner.claimedChildren = new Set();
	owner.sequentialClaimCursor = 0;
	owner.childClaimCursors = null;
	owner.childReplayOrdinals = null;
}

function retainCommittedOwnerTree(owner: DraftOwner): void {
	owner.hooks = new Map(owner.record.hooks);
	owner.seenEffects = [...owner.record.effectOrder];
	owner.contextValues =
		owner.record.contextValues === null ? null : new Map(owner.record.contextValues);
	owner.children = [];
	owner.retainedChildren = null;
	owner.claimedChildren = new Set(owner.record.children);
	owner.sequentialClaimCursor = 0;
	owner.childClaimCursors = null;
	owner.childReplayOrdinals = null;
	for (const childRecord of owner.record.children) {
		const child = draftOwner(
			childRecord,
			owner,
			childReplayPath(owner, childRecord.component, childRecord.identityPath, childRecord.key),
		);
		owner.children.push(child);
		currentAttempt().owners.push(child);
		retainCommittedOwnerTree(child);
	}
}

function findLogicalRange(record: LogicalRecord, key: UniversalKey): LogicalRecord | null {
	if (record.kind === 'range' && Object.is(record.key, key)) return record;
	for (const child of record.children) {
		const match = findLogicalRange(child, key);
		if (match !== null) return match;
	}
	return null;
}

function blueprintFromLogical(record: LogicalRecord): BlueprintNode {
	if (record.kind === 'range') {
		return {
			kind: 'range',
			key: record.key,
			...(record.owner === null ? null : { owner: record.owner }),
			children: record.children.map(blueprintFromLogical),
		};
	}
	if (record.kind === 'portal') {
		markUniversalTreeFeature(UNIVERSAL_TREE_PORTAL);
		return {
			kind: 'portal',
			key: record.key,
			target: null,
			registration: record.portalRegistration,
			children: record.children.map(blueprintFromLogical),
		};
	}
	if (record.events.size !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
	if (record.lifecycles.size !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
	if (record.localCallbacks.size !== 0) {
		markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
	}
	if (record.ref != null) markUniversalTreeFeature(UNIVERSAL_TREE_REF);
	if (record.visibility !== 'visible') markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
	for (const value of Object.values(record.props)) {
		if (isRendererRegion(value)) markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
	}
	return {
		kind: 'host',
		key: record.key,
		type: record.type!,
		props: { ...record.props },
		ref: record.ref,
		owner: record.owner!,
		events: new Map(record.events),
		lifecycles: new Map(record.lifecycles),
		localCallbacks: new Map(record.localCallbacks),
		visibility: record.visibility,
		children: record.children.map(blueprintFromLogical),
	};
}

function markDraftOwnerHidden(
	owner: DraftOwner,
	visibility: Exclude<UniversalVisibility, 'visible'>,
): void {
	// An Activity can retain a tree containing an independently suspended
	// primary. Keep that stricter lifetime until its own boundary retries.
	owner.visibility = owner.record.visibility === 'suspense-hidden' ? 'suspense-hidden' : visibility;
	for (const child of owner.children) markDraftOwnerHidden(child, owner.visibility);
}

function markBlueprintHidden(
	nodes: readonly BlueprintNode[],
	visibility: Exclude<UniversalVisibility, 'visible'>,
): void {
	for (const node of nodes) {
		if (node.kind === 'host') {
			if (node.visibility !== 'suspense-hidden') node.visibility = visibility;
			markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
		}
		markBlueprintHidden(node.children, visibility);
	}
}

function retainCommittedTryArm(owner: DraftOwner): BlueprintNode[] | null {
	if (!owner.record.mounted) return null;
	const childRecord = owner.record.children.find((child) => Object.is(child.key, 'try'));
	if (childRecord === undefined) return null;
	const range = findLogicalRange(owner.record.root.rootRecordForRetention(), childRecord.rangeKey);
	if (range === null) return null;
	resetDraftChildren(owner);
	const child = draftOwner(
		childRecord,
		owner,
		childReplayPath(owner, childRecord.component, childRecord.identityPath, childRecord.key),
	);
	owner.children.push(child);
	owner.claimedChildren.add(childRecord);
	currentAttempt().owners.push(child);
	retainCommittedOwnerTree(child);
	markDraftOwnerHidden(child, 'suspense-hidden');
	const nodes = ownerRange(child, range.children.map(blueprintFromLogical));
	markBlueprintHidden(nodes, 'suspense-hidden');
	return nodes;
}

/**
 * A hidden Activity is its own suspension boundary. Restore only its accepted
 * owner/host range, leaving the surrounding render free to commit. The failed
 * draft stays in attempt.owners for memoized-promise replay; a fresh committed
 * draft prevents its unapplied hook updates from being consumed by retention.
 * This allocation and tree walk occur only when background work suspends.
 */
function retainCommittedActivity(owner: DraftOwner): BlueprintNode[] {
	const attempt = currentAttempt();
	const record = owner.record;
	const parent = owner.parent!;
	const range = record.mounted
		? (record.range ?? findLogicalRange(attempt.root.rootRecordForRetention(), record.rangeKey))
		: null;
	resetDraftChildren(owner);
	const retained = draftOwner(record, parent, owner.replayPath);
	retained.visibility = owner.visibility;
	retained.canHandleSuspense = owner.canHandleSuspense;
	retained.boundaryThenable = owner.boundaryThenable;
	parent.children[parent.children.indexOf(owner)] = retained;
	attempt.owners.push(retained);
	retainCommittedOwnerTree(retained);
	const visibility = retained.visibility as Exclude<UniversalVisibility, 'visible'>;
	for (const child of retained.children) markDraftOwnerHidden(child, visibility);
	const nodes = range === null ? [] : range.children.map(blueprintFromLogical);
	markBlueprintHidden(nodes, visibility);
	return ownerRange(retained, nodes);
}

const OWNERLESS_LEAF_PLAN_CACHE = new WeakMap<UniversalPlan, UniversalHostPlan | null>();

function ownerlessLeafHostPlan(plan: UniversalPlan): UniversalHostPlan | null {
	const cached = OWNERLESS_LEAF_PLAN_CACHE.get(plan);
	if (cached !== undefined) return cached;
	const root = plan.root;
	let host: UniversalHostPlan | null = null;
	if (
		root.kind === 'host' &&
		root.type !== '#text' &&
		root.propsSlot === undefined &&
		(root.children?.length ?? 0) === 0
	) {
		const names = [
			...Object.keys(root.props ?? {}),
			...(root.bindings ?? []).map(([name]) => name),
		];
		if (!names.some((name) => name === 'key' || name === 'ref' || name === 'children')) {
			host = root;
		}
	}
	OWNERLESS_LEAF_PLAN_CACHE.set(plan, host);
	return host;
}

function materializeOwnerlessLeafValue(
	value: unknown,
	expectedRenderer: string,
	compilerLeafProps: boolean,
	owner: DraftOwner = CURRENT_OWNER!,
): BlueprintHost | null {
	if ((value as UniversalPlanValue)?.$$kind !== UNIVERSAL_VALUE) return null;
	const planValue = value as UniversalPlanValue;
	if (planValue.plan.renderer !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(planValue.plan.renderer)}.`,
		);
	}
	if (planValue.key !== null) return null;
	const node = ownerlessLeafHostPlan(planValue.plan);
	if (node === null) return null;

	const props: Record<string, unknown> = { ...(node.props ?? {}) };
	for (const [name, slot] of node.bindings ?? []) props[name] = planValue.values[slot];
	let events: Map<string, BlueprintEvent> | null = null;
	let lifecycles: Map<string, BlueprintHostCallback> | null = null;
	let localCallbacks: Map<string, BlueprintHostCallback> | null = null;
	const attempt = currentAttempt();
	for (const name of Object.keys(props)) {
		const handler = props[name];
		if (compilerLeafProps) {
			if (isRendererRegion(handler)) markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
			props[name] = attempt.root.encodeHostProp(node.type, name, handler);
			continue;
		}
		const lifecycle = attempt.root.classifyLifecycle(name, handler);
		if (lifecycle !== null) {
			delete props[name];
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal lifecycle prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`,
				);
			}
			(lifecycles ??= new Map()).set(lifecycle.type, {
				prop: name,
				type: lifecycle.type,
				handler: handler as (...args: any[]) => any,
				owner: owner.record,
			});
			continue;
		}
		const local = attempt.root.classifyLocalCallback(name, handler);
		if (local !== null) {
			delete props[name];
			if (attempt.root.driverCapabilities().localHostCallbacks !== true) {
				throw new Error(
					`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the local-host-callback capability.`,
				);
			}
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal local callback prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`,
				);
			}
			(localCallbacks ??= new Map()).set(local.type, {
				prop: name,
				type: local.type,
				handler: handler as (...args: any[]) => any,
				owner: owner.record,
			});
			continue;
		}
		const definition = attempt.root.classifyEvent(name);
		if (definition !== null) {
			delete props[name];
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal event prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`,
				);
			}
			(events ??= new Map()).set(definition.type, {
				prop: name,
				type: definition.type,
				priority: definition.priority ?? 'default',
				handler: handler as (...args: any[]) => any,
				owner: owner.record,
			});
			continue;
		}
		if (isRendererRegion(handler)) markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
		props[name] = attempt.root.encodeHostProp(node.type, name, handler);
	}
	if (events !== null && events.size !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
	if (lifecycles !== null && lifecycles.size !== 0)
		markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
	if (localCallbacks !== null && localCallbacks.size !== 0)
		markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
	if (owner.visibility !== 'visible') markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
	return {
		kind: 'host',
		key: null,
		type: node.type,
		props,
		ref: null,
		owner: owner.record,
		events: events ?? EMPTY_BLUEPRINT_EVENTS,
		lifecycles: lifecycles ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
		localCallbacks: localCallbacks ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
		visibility: owner.visibility,
		children: [],
	};
}

function materializeRawUniversalListValue(
	list: UniversalForValue,
	value: UniversalRenderable,
	renderer: string,
): UniversalRenderable {
	if (
		list.leafPlan !== undefined &&
		(list.hostComponent === undefined ||
			list.leafSignature === undefined ||
			trustedUniversalHostComponent(list.hostComponent, renderer) !== null)
	) {
		return universalValue(list.leafPlan, value as readonly unknown[]);
	}
	if (list.leafSignature === undefined) return value;
	if (list.hostComponent === undefined) {
		throw new TypeError('A specialized universal host list requires its original component.');
	}
	const values = value as readonly unknown[];
	const names = parseUniversalHostComponentSignature(list.leafSignature);
	if (names.length !== values.length) {
		throw new TypeError('A universal host component signature and its values must match.');
	}
	return universalComponent(
		renderer,
		list.hostComponent,
		universalProps(names.map((name, index) => ['set', name, values[index]] as const)),
	);
}

function materializeValue(
	value: unknown,
	expectedRenderer: string,
	key: UniversalKey | null,
	path: readonly unknown[],
): BlueprintNode[] {
	if (value == null || value === false || value === true) return [];
	if ((value as UniversalKeyedValue)?.$$kind === UNIVERSAL_KEYED) {
		const keyed = value as UniversalKeyedValue;
		const nodes = materializeValue(keyed.value, expectedRenderer, keyed.key, [...path, keyed.key]);
		if (nodes.length === 1) nodes[0].key = keyed.key;
		else return [{ kind: 'range', key: keyed.key, children: nodes }];
		return nodes;
	}
	if ((value as UniversalListValue)?.$$kind === UNIVERSAL_LIST) {
		const list = value as UniversalListValue;
		if (list.values.length === 0 && list.empty !== undefined) {
			return materializeValue(list.empty, expectedRenderer, null, [...path, 'empty']);
		}
		const output: BlueprintNode[] = [];
		for (let index = 0; index < list.values.length; index++) {
			const item = list.values[index];
			const itemKey = renderableKey(item);
			output.push(
				...materializeValue(item, expectedRenderer, itemKey, [...path, 'item', itemKey ?? index]),
			);
		}
		return output;
	}
	if ((value as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
		const planValue = value as UniversalPlanValue;
		const nodes = materializePlanValue(planValue, expectedRenderer, path);
		if (key !== null && nodes.length === 1) nodes[0].key = key;
		return nodes;
	}
	if ((value as UniversalComponentValue)?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
		const nodes = materializeComponentValue(
			value as UniversalComponentValue,
			expectedRenderer,
			path,
		);
		if (key !== null && nodes.length === 1) nodes[0].key = key;
		return nodes;
	}
	if ((value as UniversalChildrenValue)?.$$kind === UNIVERSAL_CHILDREN) {
		const children = value as UniversalChildrenValue;
		if (children.renderer !== expectedRenderer) {
			throw new Error(
				`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot render children for ${JSON.stringify(children.renderer)}.`,
			);
		}
		return materializeValue(children.render(), expectedRenderer, key, [...path, 'children']);
	}
	if ((value as UniversalPortalValue)?.$$kind === UNIVERSAL_PORTAL) {
		const portal = value as UniversalPortalValue;
		markUniversalTreeFeature(UNIVERSAL_TREE_PORTAL);
		return [
			{
				kind: 'portal',
				key,
				target: portal.target,
				registration: null,
				children: materializeValue(portal.children, expectedRenderer, null, [...path, 'portal']),
			},
		];
	}
	if ((value as UniversalActivityValue)?.$$kind === UNIVERSAL_ACTIVITY) {
		const activity = value as UniversalActivityValue;
		if (currentAttempt().root.driverCapabilities().visibility !== true) {
			throw new Error(
				`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability.`,
			);
		}
		const parent = CURRENT_OWNER;
		if (parent === null) throw new Error('Universal Activity requires an owning component.');
		const owner = claimChildOwner(parent, null, [...path, 'activity'], null);
		const hidden = activity.mode === 'hidden';
		owner.canHandleSuspense = hidden;
		owner.visibility =
			parent.visibility === 'suspense-hidden'
				? 'suspense-hidden'
				: parent.visibility === 'activity-hidden' || hidden
					? 'activity-hidden'
					: 'visible';
		const attempt = currentAttempt();
		const universalIdCheckpoint = attempt.nextUniversalId;
		let range: BlueprintNode[];
		try {
			if (owner.boundaryThenable !== null) throw new UniversalSuspense(owner.boundaryThenable);
			const nodes = executeOwner(owner, () =>
				materializeValue(activity.body(), expectedRenderer, null, [...path, 'activity-output']),
			);
			range = ownerRange(owner, nodes);
		} catch (error) {
			if (!hidden || !(error instanceof UniversalSuspense)) throw error;
			attempt.nextUniversalId = universalIdCheckpoint;
			// Routed renderer-region suspensions already installed a settlement
			// callback; render-origin suspensions use the ordinary local replay.
			if (owner.boundaryThenable === null) attempt.retryThenables.add(error.thenable);
			range = retainCommittedActivity(owner);
		}
		return key === null ? range : [{ kind: 'range', key, children: range }];
	}
	if ((value as UniversalIfValue)?.$$kind === UNIVERSAL_IF) {
		const branch = value as UniversalIfValue;
		const body = branch.condition ? branch.then : branch.else;
		if (body === null) return [];
		return materializeScoped(CURRENT_OWNER!, [...path, 'if'], branch.condition ? 1 : 0, body);
	}
	if ((value as UniversalSwitchValue)?.$$kind === UNIVERSAL_SWITCH) {
		const branch = value as UniversalSwitchValue;
		let selected = branch.default;
		let selectedKey: unknown = 'default';
		for (let index = 0; index < branch.cases.length; index++) {
			if (branch.cases[index][0] === branch.value) {
				selected = branch.cases[index][1];
				selectedKey = index;
				break;
			}
		}
		if (selected === null) return [];
		return materializeScoped(CURRENT_OWNER!, [...path, 'switch'], selectedKey, selected);
	}
	if ((value as UniversalForValue)?.$$kind === UNIVERSAL_FOR) {
		const list = value as UniversalForValue;
		const output: BlueprintNode[] = [];
		const certifiedHost =
			list.hostComponent === undefined ||
			trustedUniversalHostComponent(list.hostComponent, expectedRenderer) !== null;
		const compilerLeafProps =
			list.ownerless &&
			certifiedHost &&
			currentAttempt().root.driverCapabilities().compilerLeafProps === true;
		const compilerTemplateTree =
			list.template === true &&
			currentAttempt().root.driverCapabilities().templateProgramMount === true &&
			CURRENT_OWNER?.visibility === 'visible';
		const compilerComponentScope =
			list.componentScope === true &&
			currentAttempt().root.driverCapabilities().templateProgramRuns === true &&
			CURRENT_OWNER?.visibility === 'visible';
		if (
			list.ownerless &&
			list.compact &&
			certifiedHost &&
			currentAttempt().root.canCompactCompilerLeafProps()
		) {
			const attempt = currentAttempt();
			const parent = CURRENT_OWNER!;
			const lazyOwnerScope: LazyLeafOwnerScope = {
				attempt,
				parent,
				identityPath: [...path, 'for'],
				key: 0,
				owner: null,
			};
			const compactKeys: UniversalKey[] = [];
			const compactValues: (readonly unknown[])[] = [];
			let compactSeenKeys: Set<UniversalKey> | null = null;
			let previousNumericKey = Number.NEGATIVE_INFINITY;
			let compactOwners: Array<UniversalOwnerRecord | undefined> | null = null;
			const rawLeafValues = list.leafPlan !== undefined;
			let compactPlan: UniversalPlan | null = list.leafPlan ?? null;
			let compactHost: UniversalHostPlan | null =
				compactPlan === null ? null : ownerlessLeafHostPlan(compactPlan);
			if (compactPlan !== null) {
				if (compactPlan.renderer !== expectedRenderer) {
					throw new Error(
						`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(compactPlan.renderer)}.`,
					);
				}
				if (compactHost === null) {
					throw new Error(
						'Compact universal lists require one stable intrinsic leaf plan per item.',
					);
				}
			}
			let compactIndex = 0;
			for (const item of list.items) {
				const itemIndex = compactIndex++;
				const itemKey = list.key(item, itemIndex);
				if (
					compactSeenKeys === null &&
					typeof itemKey === 'number' &&
					itemKey > previousNumericKey
				) {
					previousNumericKey = itemKey;
				} else {
					const seen = (compactSeenKeys ??= new Set(compactKeys));
					if (seen.has(itemKey)) {
						throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
					}
					seen.add(itemKey);
				}
				const rendered = renderLazyLeafItem(lazyOwnerScope, list.render, item, itemIndex, itemKey);
				if (lazyOwnerScope.owner !== null) {
					(compactOwners ??= [])[itemIndex] = lazyOwnerScope.owner.record;
				}
				let values: readonly unknown[];
				if (rawLeafValues) {
					values = rendered as readonly unknown[];
				} else {
					if ((rendered as UniversalPlanValue)?.$$kind !== UNIVERSAL_VALUE) {
						throw new Error(
							'Compact universal lists require one compiler-proven intrinsic leaf host per item.',
						);
					}
					const planValue = rendered as UniversalPlanValue;
					if (planValue.plan !== compactPlan) {
						if (planValue.plan.renderer !== expectedRenderer) {
							throw new Error(
								`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(planValue.plan.renderer)}.`,
							);
						}
						if (compactPlan !== null) {
							throw new Error(
								'Compact universal lists require one stable intrinsic leaf plan per item.',
							);
						}
						compactPlan = planValue.plan;
						compactHost = ownerlessLeafHostPlan(compactPlan);
					}
					if (planValue.key !== null || compactHost === null) {
						throw new Error(
							'Compact universal lists require one stable intrinsic leaf plan per item.',
						);
					}
					values = planValue.values;
				}
				const host = compactHost!;
				if (itemIndex === 0 && host.props !== undefined) {
					for (const name of Object.keys(host.props)) {
						if (isRendererRegion(host.props[name])) {
							markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
						}
					}
				}
				const bindings = host.bindings;
				if (bindings !== undefined) {
					for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex++) {
						const binding = values[bindings[bindingIndex][1]];
						if (typeof binding === 'object' && binding !== null && isRendererRegion(binding)) {
							markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
						}
					}
				}
				compactKeys.push(itemKey);
				compactValues.push(values);
			}
			if (compactIndex === 0 && list.empty !== null) {
				return materializeScoped(CURRENT_OWNER!, [...path, 'for-empty'], null, list.empty);
			}
			const owner = parent;
			if (compactIndex !== 0 && owner.visibility !== 'visible') {
				markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
			}
			return [
				{
					kind: 'range',
					key: null,
					children: [],
					compactLeafList: {
						host: compactHost,
						keys: compactKeys,
						values: compactValues,
						owner: owner.record,
						owners: compactOwners,
						visibility: owner.visibility,
						props: [],
						propCount: -1,
					},
				},
			];
		}
		const parent = CURRENT_OWNER!;
		const attempt = currentAttempt();
		const keys = new Set<UniversalKey>();
		let compactTemplateEnabled =
			compilerTemplateTree && attempt.root.driverCapabilities().templateProgramRuns === true;
		let compactTemplateList: BlueprintCompactTemplateList | null = null;
		const lazyOwnerScope: LazyLeafOwnerScope | null =
			compilerLeafProps || compilerTemplateTree || compilerComponentScope
				? {
						attempt,
						parent,
						identityPath: [...path, 'for'],
						key: 0,
						owner: null,
					}
				: null;
		let componentScopeEnabled = compilerComponentScope;
		if (componentScopeEnabled) {
			const previous = parent.record.children[parent.sequentialClaimCursor];
			if (
				previous?.component === null &&
				identityPathsEqual(previous.identityPath, lazyOwnerScope!.identityPath)
			) {
				componentScopeEnabled = false;
			}
		}
		const componentPath = componentScopeEnabled
			? [...lazyOwnerScope!.identityPath, 'output']
			: null;
		let index = 0;
		for (const item of list.items) {
			const itemIndex = index++;
			const itemKey = list.key(item, itemIndex);
			if (keys.has(itemKey)) throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
			keys.add(itemKey);
			if (componentScopeEnabled) {
				const rendered = renderLazyLeafItem(lazyOwnerScope!, list.render, item, itemIndex, itemKey);
				const candidate = rendered as UniversalComponentValue;
				if (
					lazyOwnerScope!.owner === null &&
					candidate?.$$kind === UNIVERSAL_COMPONENT_VALUE &&
					candidate.renderer === expectedRenderer &&
					!candidate.hasKey
				) {
					const keyed: UniversalComponentValue = {
						...candidate,
						key: itemKey,
						hasKey: true,
					};
					output.push(...materializeComponentValue(keyed, expectedRenderer, componentPath!));
					continue;
				}
				if (lazyOwnerScope!.owner === null) {
					output.push(
						...materializeScoped(parent, lazyOwnerScope!.identityPath, itemKey, () => rendered),
					);
					continue;
				}
				const itemOwner = lazyOwnerScope!.owner;
				const previousOwner = CURRENT_OWNER;
				const previousAttemptOwner = attempt.owner;
				CURRENT_OWNER = itemOwner;
				attempt.owner = itemOwner;
				let nodes: BlueprintNode[];
				try {
					nodes = materializeValue(rendered, expectedRenderer, null, componentPath!);
				} finally {
					CURRENT_OWNER = previousOwner;
					attempt.owner = previousAttemptOwner;
				}
				output.push(...ownerRange(itemOwner, nodes));
			} else if (compilerTemplateTree) {
				const rendered = renderLazyLeafItem(lazyOwnerScope!, list.render, item, itemIndex, itemKey);
				if (compactTemplateEnabled) {
					const candidate = rendered as UniversalPlanValue;
					const candidatePlan = candidate?.$$kind === UNIVERSAL_VALUE ? candidate.plan : null;
					const compiled =
						candidatePlan?.root.kind === 'host'
							? compiledCollapsedTemplateProgram(candidatePlan.root)
							: null;
					const prepared =
						compiled === null ? null : attempt.root.prepareCollapsedTemplateProgram(compiled);
					const dense =
						compiled === null || prepared === null
							? null
							: prepareCollapsedTemplateValues(candidate, attempt.root, compiled, prepared);
					if (
						lazyOwnerScope!.owner === null &&
						candidatePlan !== null &&
						candidatePlan.renderer === expectedRenderer &&
						candidate.key === null &&
						compiled !== null &&
						prepared !== null &&
						dense !== null &&
						(compactTemplateList === null || compactTemplateList.plan === candidatePlan)
					) {
						compactTemplateList ??= {
							plan: candidatePlan,
							compiled,
							program: prepared,
							keys: [],
							values: [],
							captures: [],
							owner: parent.record,
						};
						compactTemplateList.keys.push(itemKey);
						compactTemplateList.values.push(dense);
						compactTemplateList.captures.push(candidate.values);
						if (prepared.events.length !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
						continue;
					}
					compactTemplateEnabled = false;
					if (compactTemplateList !== null) {
						for (
							let compactIndex = 0;
							compactIndex < compactTemplateList.keys.length;
							compactIndex++
						) {
							const host = preparedCollapsedTemplateBlueprint(
								compactTemplateList.plan,
								compactTemplateList.compiled,
								compactTemplateList.program,
								compactTemplateList.values[compactIndex],
								compactTemplateList.captures[compactIndex],
								compactTemplateList.owner,
							);
							host.key = compactTemplateList.keys[compactIndex];
							output.push(host);
						}
						compactTemplateList = null;
					}
				}
				const itemOwner = lazyOwnerScope!.owner ?? parent;
				const previousOwner = CURRENT_OWNER;
				const previousAttemptOwner = attempt.owner;
				CURRENT_OWNER = itemOwner;
				attempt.owner = itemOwner;
				let nodes: BlueprintNode[];
				try {
					nodes = materializeValue(rendered, expectedRenderer, null, path);
				} finally {
					CURRENT_OWNER = previousOwner;
					attempt.owner = previousAttemptOwner;
				}
				if (nodes.length !== 1 || nodes[0].kind !== 'host' || nodes[0].key !== null) {
					throw new Error(
						'Program-backed universal lists require one compiler-proven intrinsic host tree per item.',
					);
				}
				if (lazyOwnerScope!.owner === null) {
					nodes[0].key = itemKey;
					output.push(nodes[0]);
				} else {
					output.push(...ownerRange(itemOwner, nodes));
				}
			} else if (compilerLeafProps) {
				const rawOutput = renderLazyLeafItem(
					lazyOwnerScope!,
					list.render,
					item,
					itemIndex,
					itemKey,
				);
				const rendered = materializeRawUniversalListValue(list, rawOutput, expectedRenderer);
				const itemOwner = lazyOwnerScope!.owner ?? parent;
				const leaf = materializeOwnerlessLeafValue(
					rendered,
					expectedRenderer,
					compilerLeafProps,
					itemOwner,
				);
				if (leaf !== null) {
					leaf.key = itemKey;
					output.push(leaf);
					continue;
				}
				const previousOwner = CURRENT_OWNER;
				const previousAttemptOwner = attempt.owner;
				CURRENT_OWNER = itemOwner;
				attempt.owner = itemOwner;
				let nodes: BlueprintNode[];
				try {
					nodes = materializeValue(rendered, expectedRenderer, null, [...path, 'for', itemKey]);
				} finally {
					CURRENT_OWNER = previousOwner;
					attempt.owner = previousAttemptOwner;
				}
				if (
					nodes.length !== 1 ||
					nodes[0].kind !== 'host' ||
					nodes[0].key !== null ||
					nodes[0].children.length !== 0
				) {
					throw new Error(
						'Ownerless universal lists require exactly one intrinsic leaf host per item.',
					);
				}
				nodes[0].key = itemKey;
				output.push(nodes[0]);
			} else {
				output.push(
					...materializeScoped(parent, [...path, 'for'], itemKey, () => {
						return materializeRawUniversalListValue(
							list,
							list.render(item, itemIndex),
							expectedRenderer,
						);
					}),
				);
			}
		}
		if (compactTemplateEnabled && compactTemplateList !== null) {
			return [{ kind: 'range', key: null, children: [], compactTemplateList }];
		}
		if (index === 0 && list.empty !== null) {
			return materializeScoped(CURRENT_OWNER!, [...path, 'for-empty'], null, list.empty);
		}
		return output;
	}
	if ((value as UniversalContextValue)?.$$kind === UNIVERSAL_CONTEXT) {
		const provider = value as UniversalContextValue;
		const parent = CURRENT_OWNER!;
		const owner = claimChildOwner(parent, null, [...path, 'context', provider.context], null);
		owner.contextValues = new Map([[provider.context, provider.value]]);
		const nodes = executeOwner(owner, () => {
			const children = provider.children;
			const rendered =
				typeof children === 'function'
					? (children as () => UniversalRenderable)()
					: (children as UniversalRenderable);
			return materializeValue(rendered, expectedRenderer, null, [...path, 'context-output']);
		});
		return ownerRange(owner, nodes);
	}
	if ((value as UniversalTryValue)?.$$kind === UNIVERSAL_TRY) {
		const boundary = value as UniversalTryValue;
		const parent = CURRENT_OWNER!;
		const owner = claimChildOwner(parent, null, [...path, 'try-boundary'], null);
		owner.isBoundary = true;
		owner.canHandleSuspense = boundary.pending !== null;
		let branch: () => UniversalRenderable = boundary.body;
		let branchKey: unknown = 'try';
		if (owner.boundaryThenable !== null) {
			if (boundary.pending === null) throw new UniversalSuspense(owner.boundaryThenable);
			const retained = retainCommittedTryArm(owner);
			if (retained !== null) {
				if (currentAttempt().root.driverCapabilities().visibility !== true) {
					throw new Error(
						`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability required by retained Suspense.`,
					);
				}
				const pending = materializeScoped(owner, [...path, 'try-arm'], 'pending', boundary.pending);
				return ownerRange(owner, [...retained, ...pending]);
			}
			branchKey = 'pending';
			branch = boundary.pending;
		} else if (owner.hasBoundaryError) {
			if (boundary.catch === null) throw owner.boundaryError;
			const error = owner.boundaryError;
			branchKey = 'catch';
			branch = () =>
				boundary.catch!(error, () => {
					owner.record.hasBoundaryError = false;
					owner.record.boundaryError = undefined;
					owner.record.root.schedule();
				});
		}
		try {
			const nodes = materializeScoped(owner, [...path, 'try-arm'], branchKey, branch);
			return ownerRange(owner, nodes);
		} catch (error) {
			if (error instanceof UniversalSuspense) {
				const retained = retainCommittedTryArm(owner);
				if (retained !== null) {
					if (currentAttempt().transitionRender) throw error;
					if (boundary.pending === null) throw error;
					if (currentAttempt().root.driverCapabilities().visibility !== true) {
						throw new Error(
							`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability required by retained Suspense.`,
						);
					}
					currentAttempt().retryThenables.add(error.thenable);
					const pending = materializeScoped(
						owner,
						[...path, 'try-arm'],
						'pending',
						boundary.pending,
					);
					return ownerRange(owner, [...retained, ...pending]);
				}
				currentAttempt().retryThenables.add(error.thenable);
				resetDraftChildren(owner);
				if (boundary.pending === null) throw error;
				const nodes = materializeScoped(owner, [...path, 'try-arm'], 'pending', boundary.pending);
				return ownerRange(owner, nodes);
			}
			if (boundary.catch === null || branchKey === 'catch') throw error;
			resetDraftChildren(owner);
			owner.hasBoundaryError = true;
			owner.boundaryError = error;
			// The catch arm claims this render error here, in the throwing attempt
			// itself. Replays of an already-claimed error (the hasBoundaryError
			// branch above) do not re-report.
			reportUniversalCaughtError(owner.record.root, error);
			const nodes = materializeScoped(owner, [...path, 'try-arm'], 'catch', () =>
				boundary.catch!(error, () => {
					owner.record.hasBoundaryError = false;
					owner.record.boundaryError = undefined;
					owner.record.root.schedule();
				}),
			);
			return ownerRange(owner, nodes);
		}
	}
	if (Array.isArray(value)) {
		const output: BlueprintNode[] = [];
		const keys = new Set<UniversalKey>();
		for (let index = 0; index < value.length; index++) {
			const item = value[index] as UniversalRenderable;
			const itemKey = renderableKey(item);
			if (itemKey !== null) {
				if (keys.has(itemKey)) throw new Error(`Duplicate universal child key ${String(itemKey)}.`);
				keys.add(itemKey);
			}
			output.push(
				...materializeValue(item, expectedRenderer, itemKey, [
					...path,
					itemKey === null ? index : itemKey,
				]),
			);
		}
		return output;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		const text = currentAttempt().root.textPolicy();
		if (text === 'ignore') return [];
		if (text === 'reject') {
			throw new Error(
				`Universal renderer ${JSON.stringify(expectedRenderer)} rejects primitive text children.`,
			);
		}
		return [
			{
				kind: 'host',
				key,
				type: '#text',
				props: { value: String(value) },
				ref: null,
				owner: CURRENT_OWNER!.record,
				events: EMPTY_BLUEPRINT_EVENTS,
				lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
				localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
				visibility: CURRENT_OWNER!.visibility,
				children: [],
			},
		];
	}
	throw new TypeError(
		`Unsupported universal dynamic child ${Object.prototype.toString.call(value)}.`,
	);
}

function materializeNode(
	node: UniversalPlanNode,
	values: readonly unknown[],
	renderer: string,
	path: readonly unknown[],
): BlueprintNode[] {
	if (node.kind === 'slot')
		return materializeValue(values[node.slot], renderer, null, [...path, 'slot', node.slot]);
	if (node.kind === 'text') {
		const value = node.slot === undefined ? (node.value ?? '') : values[node.slot];
		return materializeValue(value, renderer, null, [...path, 'text']);
	}
	if (node.kind === 'range') {
		const children: BlueprintNode[] = [];
		for (let index = 0; index < node.children.length; index++) {
			children.push(
				...materializeNode(node.children[index], values, renderer, [...path, 'range', index]),
			);
		}
		return [{ kind: 'range', key: null, children }];
	}
	if (node.kind === 'component') {
		const component = node.component ?? (values[node.componentSlot!] as UniversalComponent<any>);
		let props =
			node.propsSlot === undefined
				? universalProps([])
				: normalizePropsValue(values[node.propsSlot] as any);
		if (node.children !== undefined && node.children.length > 0) {
			const childPlan = universalPlan(renderer, {
				kind: 'range',
				children: node.children,
			});
			const children = universalChildren(renderer, () => universalValue(childPlan, values));
			props = universalProps([['spread', props.props]], children);
		}
		return materializeComponentValue(
			universalComponent(
				node.renderer,
				component,
				props,
				node.keySlot === undefined ? NO_KEY : values[node.keySlot],
			),
			renderer,
			[...path, 'component'],
		);
	}
	if (node.kind === 'if') {
		const selected = values[node.conditionSlot] ? node.then : node.else;
		if (selected === undefined) return [];
		const owner = claimChildOwner(
			CURRENT_OWNER!,
			null,
			[...path, 'if'],
			values[node.conditionSlot] ? 1 : 0,
		);
		return ownerRange(
			owner,
			executeOwner(owner, () =>
				materializeNode(selected, values, renderer, [...path, 'if-output']),
			),
		);
	}
	if (node.kind === 'switch') {
		let selected = node.default;
		let selectedKey: unknown = 'default';
		for (let index = 0; index < node.cases.length; index++) {
			if (node.cases[index][0] === values[node.valueSlot]) {
				selected = node.cases[index][1];
				selectedKey = index;
				break;
			}
		}
		if (selected === undefined) return [];
		const owner = claimChildOwner(CURRENT_OWNER!, null, [...path, 'switch'], selectedKey);
		return ownerRange(
			owner,
			executeOwner(owner, () =>
				materializeNode(selected!, values, renderer, [...path, 'switch-output']),
			),
		);
	}
	if (node.type === '#text') {
		const text = currentAttempt().root.textPolicy();
		if (text === 'ignore') return [];
		if (text === 'reject') {
			throw new Error(
				`Universal renderer ${JSON.stringify(renderer)} rejects primitive text children.`,
			);
		}
	}
	const attempt = currentAttempt();
	const root = attempt.root;
	const staticProps = root.materializeStaticHostProps(node);
	const props: Record<string, unknown> = staticProps ?? { ...(node.props ?? {}) };
	if (staticProps === null) {
		for (const [name, slot] of node.bindings ?? []) props[name] = values[slot];
	}
	let propsValue: UniversalPropsValue | null = null;
	if (node.propsSlot !== undefined) {
		propsValue = normalizePropsValue(values[node.propsSlot] as any);
		Object.assign(props, propsValue.props);
	}
	const hasKey = staticProps === null && (propsValue?.hasKey || hasOwnProp.call(props, 'key'));
	const hostKey = normalizeUniversalKey(
		propsValue?.hasKey ? propsValue.key : hasKey ? props.key : null,
	);
	const ref = staticProps === null && hasOwnProp.call(props, 'ref') ? props.ref : null;
	const dynamicChildren =
		staticProps === null && hasOwnProp.call(props, 'children') ? props.children : undefined;
	if (staticProps === null) {
		delete props.ref;
		delete props.key;
		delete props.children;
	}
	let events: Map<string, BlueprintEvent> | null = null;
	let lifecycles: Map<string, BlueprintHostCallback> | null = null;
	let localCallbacks: Map<string, BlueprintHostCallback> | null = null;
	for (const name of staticProps === null ? Object.keys(props) : EMPTY_STATIC_PROP_NAMES) {
		const handler = props[name];
		const lifecycle = root.classifyLifecycle(name, handler);
		if (lifecycle !== null) {
			delete props[name];
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal lifecycle prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`,
				);
			}
			(lifecycles ??= new Map()).set(lifecycle.type, {
				prop: name,
				type: lifecycle.type,
				handler: handler as (...args: any[]) => any,
				owner: CURRENT_OWNER!.record,
			});
			continue;
		}
		const local = root.classifyLocalCallback(name, handler);
		if (local !== null) {
			delete props[name];
			if (root.driverCapabilities().localHostCallbacks !== true) {
				throw new Error(
					`Universal renderer ${JSON.stringify(renderer)} does not declare the local-host-callback capability.`,
				);
			}
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal local callback prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`,
				);
			}
			(localCallbacks ??= new Map()).set(local.type, {
				prop: name,
				type: local.type,
				handler: handler as (...args: any[]) => any,
				owner: CURRENT_OWNER!.record,
			});
			continue;
		}
		const definition = root.classifyEvent(name);
		if (definition !== null) {
			delete props[name];
			if (handler == null) continue;
			if (typeof handler !== 'function') {
				throw new TypeError(
					`Universal event prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`,
				);
			}
			(events ??= new Map()).set(definition.type, {
				prop: name,
				type: definition.type,
				priority: definition.priority ?? 'default',
				handler: handler as (...args: any[]) => any,
				owner: CURRENT_OWNER!.record,
			});
			continue;
		}
		if (isRendererRegion(handler)) markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
		props[name] = root.encodeHostProp(node.type, name, handler);
	}
	if (events !== null && events.size !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
	if (lifecycles !== null && lifecycles.size !== 0)
		markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
	if (localCallbacks !== null && localCallbacks.size !== 0)
		markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
	if (ref != null) markUniversalTreeFeature(UNIVERSAL_TREE_REF);
	if (CURRENT_OWNER!.visibility !== 'visible') markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
	const children: BlueprintNode[] = [];
	if ((node.children?.length ?? 0) > 0) {
		for (let index = 0; index < node.children!.length; index++) {
			children.push(
				...materializeNode(node.children![index], values, renderer, [...path, 'host', index]),
			);
		}
	} else if (dynamicChildren !== undefined) {
		children.push(...materializeValue(dynamicChildren, renderer, null, [...path, 'host-children']));
	}
	return [
		{
			kind: 'host',
			key: hostKey,
			type: node.type,
			props,
			ref,
			owner: CURRENT_OWNER!.record,
			events: events ?? EMPTY_BLUEPRINT_EVENTS,
			lifecycles: lifecycles ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
			localCallbacks: localCallbacks ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
			visibility: CURRENT_OWNER!.visibility,
			children,
		},
	];
}

function materializePlanValue(
	value: UniversalPlanValue,
	expectedRenderer: string,
	path: readonly unknown[] = [],
): BlueprintNode[] {
	if (value.plan.renderer !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(value.plan.renderer)}.`,
		);
	}
	const collapsed = materializeCollapsedTemplate(value);
	if (collapsed !== null) {
		if (value.key !== null) collapsed.key = value.key;
		return [collapsed];
	}
	const nodes = materializeNode(value.plan.root, value.values, expectedRenderer, [...path, 'plan']);
	if (
		currentAttempt().root.driverCapabilities().templateMount === true &&
		value.plan.root.kind === 'host' &&
		nodes.length === 1 &&
		nodes[0].kind === 'host'
	) {
		nodes[0].templatePlan = value.plan.root;
	}
	if (value.key === null) return nodes;
	if (nodes.length === 1) {
		nodes[0].key = value.key;
		return nodes;
	}
	return [{ kind: 'range', key: value.key, children: nodes }];
}

function materializeCollapsedTemplate(value: UniversalPlanValue): BlueprintHost | null {
	const owner = CURRENT_OWNER!;
	const root = currentAttempt().root;
	const capabilities = root.driverCapabilities();
	if (
		capabilities.templateMount !== true ||
		capabilities.collapsedTemplateMount !== true ||
		owner.visibility !== 'visible' ||
		value.plan.root.kind !== 'host'
	) {
		return null;
	}
	const program = compiledCollapsedTemplateProgram(value.plan.root);
	if (program === null) return null;
	const prepared = root.prepareCollapsedTemplateProgram(program);
	if (prepared !== null) {
		const fast = materializePreparedCollapsedTemplate(value, owner, root, program, prepared);
		if (fast !== null) return fast;
	}
	for (const node of program.plans) {
		if (node.kind === 'slot' || (node.kind === 'text' && node.slot !== undefined)) {
			const entry = value.values[node.slot!];
			if (
				(typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'bigint') ||
				root.textPolicy() !== 'host'
			) {
				return null;
			}
		} else if (node.kind === 'text' && root.textPolicy() !== 'host') {
			return null;
		}
	}
	const nodes: BlueprintCollapsedTemplateNode[] = new Array(program.plans.length);
	for (let index = 0; index < program.plans.length; index++) {
		const node = program.plans[index];
		if (node.kind === 'slot' || node.kind === 'text') {
			const text =
				node.kind === 'slot'
					? value.values[node.slot]
					: node.slot === undefined
						? (node.value ?? '')
						: value.values[node.slot];
			nodes[index] = { props: { value: String(text) } };
			continue;
		}
		const staticProps = root.materializeStaticHostProps(node);
		if (staticProps === null && (node.bindings?.length ?? 0) === 0) return null;
		if (staticProps !== null) {
			nodes[index] = { props: staticProps };
			continue;
		}
		const props: Record<string, unknown> = { ...(node.props ?? EMPTY_STATIC_HOST_PROPS) };
		for (const [name, slot] of node.bindings ?? []) props[name] = value.values[slot];
		let events: BlueprintEvent[] | undefined;
		for (const name of Object.keys(props)) {
			const current = props[name];
			if (
				root.classifyLifecycle(name, current) !== null ||
				root.classifyLocalCallback(name, current) !== null ||
				isRendererRegion(current)
			) {
				return null;
			}
			const definition = root.classifyEvent(name);
			if (definition !== null) {
				delete props[name];
				if (current == null) continue;
				if (typeof current !== 'function') return null;
				(events ??= []).push({
					prop: name,
					type: definition.type,
					priority: definition.priority ?? 'default',
					handler: current as (...args: any[]) => any,
					owner: owner.record,
				});
				continue;
			}
			props[name] = root.encodeHostProp(node.type, name, current);
		}
		if (events !== undefined) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
		nodes[index] = events === undefined ? { props } : { props, events };
	}
	const first = nodes[0];
	return {
		kind: 'host',
		key: null,
		type: value.plan.root.type,
		props: first.props,
		ref: null,
		owner: owner.record,
		events:
			first.events === undefined
				? EMPTY_BLUEPRINT_EVENTS
				: new Map(first.events.map((event) => [event.type, event])),
		lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
		localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
		visibility: 'visible',
		children: [],
		templatePlan: value.plan.root,
		collapsedTemplate: { program, nodes, ids: null },
	};
}

function materializePreparedCollapsedTemplate(
	value: UniversalPlanValue,
	owner: DraftOwner,
	root: UniversalRootImpl<any, any>,
	program: CompiledCollapsedTemplateProgram,
	prepared: PreparedCollapsedTemplateProgram,
): BlueprintHost | null {
	const values = prepareCollapsedTemplateValues(value, root, program, prepared);
	if (values === null) return null;
	if (prepared.events.length !== 0) markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
	return preparedCollapsedTemplateBlueprint(
		value.plan,
		program,
		prepared,
		values,
		value.values,
		owner.record,
	);
}

function prepareCollapsedTemplateValues(
	value: UniversalPlanValue,
	root: UniversalRootImpl<any, any>,
	program: CompiledCollapsedTemplateProgram,
	prepared: PreparedCollapsedTemplateProgram,
): readonly UniversalHostTemplateProgramValue[] | null {
	for (const site of prepared.events) {
		if (typeof value.values[site.slot] !== 'function') return null;
	}
	const values: UniversalHostTemplateProgramValue[] = new Array(prepared.values.length);
	for (let index = 0; index < prepared.values.length; index++) {
		const binding = prepared.values[index];
		const source = value.values[binding.slot];
		if (binding.text) {
			if (typeof source !== 'string' && typeof source !== 'number' && typeof source !== 'bigint') {
				return null;
			}
			values[index] = String(source);
			continue;
		}
		if (
			!isUniversalHostTemplateProgramValue(source) ||
			root.classifyLifecycle(binding.name, source) !== null ||
			root.classifyLocalCallback(binding.name, source) !== null
		) {
			return null;
		}
		const encoded = root.encodeHostProp(program.shape[binding.node].type, binding.name, source);
		if (!isUniversalHostTemplateProgramValue(encoded)) return null;
		values[index] = encoded;
	}
	return Object.freeze(values);
}

function preparedCollapsedTemplateBlueprint(
	plan: UniversalPlan,
	program: CompiledCollapsedTemplateProgram,
	prepared: PreparedCollapsedTemplateProgram,
	values: readonly UniversalHostTemplateProgramValue[],
	captures: readonly unknown[],
	owner: UniversalOwnerRecord,
): BlueprintHost {
	const props = materializePreparedCollapsedHostProps(prepared, values, 0);
	return {
		kind: 'host',
		key: null,
		type: plan.root.kind === 'host' ? plan.root.type : '',
		props,
		ref: null,
		owner,
		events: EMPTY_BLUEPRINT_EVENTS,
		lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
		localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
		visibility: 'visible',
		children: [],
		templatePlan: plan.root as UniversalHostPlan,
		collapsedTemplate: {
			program,
			nodes: null,
			prepared,
			values,
			captures,
			owner,
			ids: null,
		},
	};
}

function materializePreparedCollapsedHostProps(
	program: PreparedCollapsedTemplateProgram,
	values: readonly UniversalHostTemplateProgramValue[],
	index: number,
): Record<string, unknown> {
	const node = program.wire.nodes[index];
	if (node.bindings === undefined) return node.props as Record<string, unknown>;
	const props: Record<string, unknown> = { ...node.props };
	for (const binding of node.bindings) props[binding.name] = values[binding.valueIndex];
	return Object.freeze(props);
}

function materializeCollapsedBlueprintNode(
	collapsed: BlueprintCollapsedTemplate,
	index: number,
	owner: UniversalOwnerRecord,
): BlueprintCollapsedTemplateNode {
	if (collapsed.nodes !== null) return collapsed.nodes[index];
	const program = collapsed.prepared!;
	const props = materializePreparedCollapsedHostProps(program, collapsed.values!, index);
	let events: BlueprintEvent[] | undefined;
	for (const site of program.events) {
		if (site.node !== index) continue;
		(events ??= []).push({
			prop: site.prop,
			type: site.type,
			priority: site.priority,
			handler: collapsed.captures![site.slot] as (...args: any[]) => any,
			owner,
		});
	}
	return events === undefined ? { props } : { props, events };
}

function materializeCommittedCollapsedNode(
	state: CommittedCollapsedTemplate,
	index: number,
): { readonly id?: number; readonly props: Readonly<Record<string, unknown>> } {
	if (state.nodes !== null) return state.nodes[index];
	return {
		id: state.firstId! + index,
		props: materializePreparedCollapsedHostProps(state.prepared!, state.values!, index),
	};
}

function sameRecordShape(record: LogicalRecord, blueprint: BlueprintNode): boolean {
	return (
		record.kind === blueprint.kind &&
		Object.is(record.key, blueprint.key) &&
		(record.kind !== 'host' || record.type === (blueprint as BlueprintHost).type)
	);
}

function createLogicalRecord(id: number, blueprint: BlueprintNode): LogicalRecord {
	return {
		id,
		kind: blueprint.kind,
		key: blueprint.key,
		type: blueprint.kind === 'host' ? blueprint.type : null,
		props: EMPTY_STATIC_HOST_PROPS,
		ref: null,
		refCleanup: null,
		refAttached: false,
		owner: null,
		events: EMPTY_COMMITTED_EVENTS,
		lifecycles: EMPTY_COMMITTED_HOST_CALLBACKS,
		localCallbacks: EMPTY_COMMITTED_HOST_CALLBACKS,
		visibility: blueprint.kind === 'host' ? blueprint.visibility : 'visible',
		portalRegistration: null,
		parent: null,
		children: [],
	};
}

/**
 * Cross-realm plain-object test — the universal-side twin of
 * `packages/lynx/src/core/plain-object.ts`.
 *
 * A transported renderer can hand either side values built with a foreign
 * `Object.prototype` (an engine main thread hosted in an iframe realm, an
 * Electron process split, `node:vm`), so an identity test against this realm's
 * prototype misclassifies every structurally plain value that crossed a
 * boundary. Accept a null prototype, or any prototype one hop from null — the
 * shape of every realm's `Object.prototype`; class and built-in instances are
 * still rejected. `value` must already be a non-null, non-array object.
 */
export function hasCrossRealmPlainPrototype(value: object): boolean {
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/**
 * Whether a host prop value is unchanged — THE definition of "equal" for
 * deciding whether a committed host prop needs an update command.
 *
 * Identity is the fast path but cannot be the whole answer: on a transported
 * root every object-valued prop is re-encoded through `cloneSerializableValue`
 * each render, so two renders of the same value never share identity, and an
 * identity-only diff emits an update for every object-carrying host in the
 * tree on every commit — wire cost proportional to tree size instead of
 * change size. Equality is therefore the value semantics the wire itself
 * preserves: primitives by `Object.is`, arrays and plain records (from any
 * realm — see `hasCrossRealmPlainPrototype`) element-by-element, to a bounded
 * depth. The default depth of 2 covers the compiler's slot shapes — class
 * arrays, style records, and one level of nesting inside them — while deeper
 * or exotic values (class instances, functions, handles) fall back to
 * identity, so a pathological tree never turns the per-prop diff into an
 * unbounded walk.
 */
export function sameUniversalHostPropValue(left: unknown, right: unknown, depth = 2): boolean {
	if (Object.is(left, right)) return true;
	if (depth === 0) return false;
	if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
		return false;
	}
	if (Array.isArray(left)) {
		if (!Array.isArray(right) || left.length !== right.length) return false;
		for (let index = 0; index < left.length; index++) {
			if (!sameUniversalHostPropValue(left[index], right[index], depth - 1)) return false;
		}
		return true;
	}
	if (Array.isArray(right)) return false;
	if (!hasCrossRealmPlainPrototype(left) || !hasCrossRealmPlainPrototype(right)) return false;
	if (
		Object.getOwnPropertySymbols(left).length !== 0 ||
		Object.getOwnPropertySymbols(right).length !== 0
	) {
		return false;
	}
	let leftCount = 0;
	for (const key in left) {
		if (!hasOwnProp.call(left, key)) continue;
		leftCount++;
		if (!hasOwnProp.call(right, key)) return false;
		if (
			!sameUniversalHostPropValue(
				(left as Record<string, unknown>)[key],
				(right as Record<string, unknown>)[key],
				depth - 1,
			)
		) {
			return false;
		}
	}
	let rightCount = 0;
	for (const key in right) {
		if (hasOwnProp.call(right, key)) rightCount++;
	}
	return leftCount === rightCount;
}

function shallowPropsEqual(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
	rightCountHint = -1,
): boolean {
	if (left === right) return true;
	let leftCount = 0;
	for (const key in left) {
		if (!hasOwnProp.call(left, key)) continue;
		leftCount++;
		if (!hasOwnProp.call(right, key) || !sameUniversalHostPropValue(left[key], right[key])) {
			return false;
		}
	}
	if (rightCountHint >= 0) return leftCount === rightCountHint;
	let rightCount = 0;
	for (const key in right) {
		if (hasOwnProp.call(right, key)) rightCount++;
	}
	return leftCount === rightCount;
}

function collapsedTemplateRootPropsEqual(
	previous: CommittedCollapsedTemplate | undefined,
	next: BlueprintCollapsedTemplate | undefined,
): boolean | null {
	if (
		previous?.prepared === undefined ||
		previous.prepared !== next?.prepared ||
		previous.values === undefined ||
		next.values === undefined
	) {
		return null;
	}
	for (let index = 0; index < previous.prepared.values.length; index++) {
		if (previous.prepared.values[index].node !== 0) break;
		if (!Object.is(previous.values[index], next.values[index])) return false;
	}
	return true;
}

function physicalRecords(records: readonly LogicalRecord[]): LogicalRecord[] {
	const output: LogicalRecord[] = [];
	for (const record of records) {
		if (record.kind === 'host') output.push(record);
		else if (record.kind === 'range') output.push(...physicalRecords(record.children));
	}
	return output;
}

function physicalDrafts(drafts: readonly DraftRecord[]): LogicalRecord[] {
	const output: LogicalRecord[] = [];
	for (const draft of drafts) {
		if (draft.record.kind === 'host') output.push(draft.record);
		else if (draft.retained === true) output.push(...physicalRecords(draft.record.children));
		else if (draft.record.kind === 'range') output.push(...physicalDrafts(draft.children));
	}
	return output;
}

/**
 * Mark the new-order positions belonging to a longest increasing sequence of
 * old physical positions. Entries of -1 are fresh hosts and never participate.
 * The caller first proves that the survivor order is not already increasing,
 * keeping the predecessor/tail allocations off append and filtered-list paths.
 */
function stableUniversalPlacementPositions(sources: Int32Array): Uint8Array {
	const predecessors = new Int32Array(sources.length);
	const tails = new Int32Array(sources.length);
	let size = 0;
	for (let index = 0; index < sources.length; index++) {
		const source = sources[index];
		if (source === -1) continue;
		let low = 0;
		let high = size;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (sources[tails[middle]] < source) low = middle + 1;
			else high = middle;
		}
		predecessors[index] = low === 0 ? -1 : tails[low - 1];
		tails[low] = index;
		if (low === size) size++;
	}
	const stable = new Uint8Array(sources.length);
	let index = size === 0 ? -1 : tails[size - 1];
	while (index !== -1) {
		stable[index] = 1;
		index = predecessors[index];
	}
	return stable;
}

const UNIVERSAL_HOST_TEMPLATE_SHAPES = new WeakMap<
	UniversalHostPlan,
	readonly UniversalHostTemplateShapeNode[] | null
>();

function universalHostTemplateShape(
	plan: UniversalHostPlan,
): readonly UniversalHostTemplateShapeNode[] | null {
	const cached = UNIVERSAL_HOST_TEMPLATE_SHAPES.get(plan);
	if (cached !== undefined) return cached;
	const output: UniversalHostTemplateShapeNode[] = [];
	const visit = (node: UniversalPlanNode, parent: number): boolean => {
		if (node.kind === 'range') {
			for (const child of node.children) if (!visit(child, parent)) return false;
			return true;
		}
		if (node.kind === 'text' || node.kind === 'slot') {
			output.push(Object.freeze({ type: '#text', parent }));
			return true;
		}
		if (node.kind !== 'host') return false;
		if (node.type === 'list' || node.type === 'list-item') return false;
		const index = output.length;
		output.push(Object.freeze({ type: node.type, parent }));
		for (const child of node.children ?? []) if (!visit(child, index)) return false;
		return true;
	};
	const shape = visit(plan, -1) && output.length > 1 ? Object.freeze(output) : null;
	UNIVERSAL_HOST_TEMPLATE_SHAPES.set(plan, shape);
	return shape;
}

interface CompiledCollapsedTemplateProgram {
	readonly shape: readonly UniversalHostTemplateShapeNode[];
	readonly plans: readonly (UniversalHostPlan | UniversalTextPlan | UniversalSlotPlan)[];
}

interface PreparedCollapsedTemplateValue {
	readonly node: number;
	readonly name: string;
	readonly slot: number;
	readonly text: boolean;
}

interface PreparedCollapsedTemplateEvent {
	readonly node: number;
	readonly prop: string;
	readonly slot: number;
	readonly type: string;
	readonly priority: UniversalEventPriority;
}

interface PreparedCollapsedTemplateProgram {
	readonly wire: UniversalHostTemplateProgram;
	readonly values: readonly PreparedCollapsedTemplateValue[];
	readonly events: readonly PreparedCollapsedTemplateEvent[];
	readonly sharedNodes: readonly (BlueprintCollapsedTemplateNode | null)[];
}

const COMPILED_COLLAPSED_TEMPLATE_PROGRAMS = new WeakMap<
	UniversalHostPlan,
	CompiledCollapsedTemplateProgram | null
>();

function compiledCollapsedTemplateProgram(
	plan: UniversalHostPlan,
): CompiledCollapsedTemplateProgram | null {
	const cached = COMPILED_COLLAPSED_TEMPLATE_PROGRAMS.get(plan);
	if (cached !== undefined) return cached;
	const shape = universalHostTemplateShape(plan);
	if (shape === null) {
		COMPILED_COLLAPSED_TEMPLATE_PROGRAMS.set(plan, null);
		return null;
	}
	const plans: (UniversalHostPlan | UniversalTextPlan | UniversalSlotPlan)[] = [];
	const visit = (node: UniversalPlanNode): boolean => {
		if (node.kind === 'slot' || node.kind === 'text') {
			plans.push(node);
			return true;
		}
		if (node.kind !== 'host' || node.propsSlot !== undefined) return false;
		for (const name of Object.keys(node.props ?? EMPTY_STATIC_HOST_PROPS)) {
			if (
				name === 'ref' ||
				name === 'key' ||
				name === 'children' ||
				name.startsWith('main-thread:')
			) {
				return false;
			}
		}
		for (const [name] of node.bindings ?? []) {
			if (
				name === 'ref' ||
				name === 'key' ||
				name === 'children' ||
				name.startsWith('main-thread:')
			) {
				return false;
			}
		}
		plans.push(node);
		for (const child of node.children ?? []) if (!visit(child)) return false;
		return true;
	};
	const program =
		visit(plan) && plans.length === shape.length
			? Object.freeze({ shape, plans: Object.freeze(plans) })
			: null;
	COMPILED_COLLAPSED_TEMPLATE_PROGRAMS.set(plan, program);
	return program;
}

interface PendingUniversalHostTemplateMount {
	readonly shape: readonly UniversalHostTemplateShapeNode[];
	readonly drafts: readonly DraftRecord[];
	readonly nodes: UniversalHostTemplateNode[] | null;
	readonly collapsed?: BlueprintCollapsedTemplate;
	range?: {
		op: 'mount-template-range';
		parent: UniversalHostParent;
		before: number | null;
		program: UniversalHostTemplateProgram;
		firstId: number;
		values: readonly UniversalHostTemplateProgramValue[];
		firstListenerId: number | null;
	};
	run?: {
		op: 'mount-template-run';
		parent: UniversalHostParent;
		before: number | null;
		program: UniversalHostTemplateProgram;
		firstId: number;
		firstListenerId: number | null;
		count: number;
		values: UniversalHostTemplateProgramValue[];
	};
	runIndex?: number;
}

function collectUniversalHostTemplateDrafts(
	root: DraftRecord,
	shape: readonly UniversalHostTemplateShapeNode[],
): readonly DraftRecord[] | null {
	const output: DraftRecord[] = [];
	const visit = (draft: DraftRecord, parent: number): boolean => {
		if (draft.retained === true) return false;
		if (draft.record.kind === 'range') {
			if ((draft.blueprint as BlueprintRange).owner !== undefined) return false;
			for (const child of draft.children) if (!visit(child, parent)) return false;
			return true;
		}
		if (draft.record.kind !== 'host' || !draft.isNew) return false;
		const host = draft.blueprint as BlueprintHost;
		const index = output.length;
		const expected = shape[index];
		if (
			expected === undefined ||
			expected.type !== host.type ||
			expected.parent !== parent ||
			host.type === 'list' ||
			host.type === 'list-item' ||
			host.ref != null ||
			host.visibility !== 'visible' ||
			host.lifecycles.size !== 0 ||
			host.localCallbacks.size !== 0
		) {
			return false;
		}
		for (const name of Object.keys(host.props)) {
			if (name.startsWith('main-thread:')) return false;
		}
		output.push(draft);
		for (const child of draft.children) if (!visit(child, index)) return false;
		return true;
	};
	return visit(root, -1) && output.length === shape.length ? output : null;
}

function expandCollapsedTemplateBlueprint(host: BlueprintHost): void {
	const collapsed = host.collapsedTemplate;
	if (collapsed === undefined) return;
	const blueprints: BlueprintHost[] = [host];
	for (let index = 1; index < collapsed.program.shape.length; index++) {
		const node = materializeCollapsedBlueprintNode(collapsed, index, host.owner);
		const blueprint: BlueprintHost = {
			kind: 'host',
			key: null,
			type: collapsed.program.shape[index].type,
			props: node.props,
			ref: null,
			owner: host.owner,
			events:
				node.events === undefined
					? EMPTY_BLUEPRINT_EVENTS
					: new Map(node.events.map((event) => [event.type, event])),
			lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
			localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
			visibility: host.visibility,
			children: [],
		};
		blueprints.push(blueprint);
		blueprints[collapsed.program.shape[index].parent].children.push(blueprint);
	}
	delete host.collapsedTemplate;
}

function walkLogical(record: LogicalRecord, visit: (record: LogicalRecord) => void): void {
	visit(record);
	for (const child of record.children) walkLogical(child, visit);
}

function walkDraft(record: DraftRecord, visit: (record: DraftRecord) => void): void {
	visit(record);
	for (const child of record.children) walkDraft(child, visit);
}

function walkDraftPostOrder(record: DraftRecord, visit: (record: DraftRecord) => void): void {
	for (const child of record.children) walkDraftPostOrder(child, visit);
	visit(record);
}

function logicalTreeFeatures(record: LogicalRecord): number {
	let features = 0;
	walkLogical(record, (current) => {
		if (current.kind === 'portal') {
			features |= UNIVERSAL_TREE_PORTAL;
			return;
		}
		if (current.kind !== 'host') return;
		if (current.events.size !== 0) features |= UNIVERSAL_TREE_EVENT;
		if (current.lifecycles.size !== 0) features |= UNIVERSAL_TREE_LIFECYCLE;
		if (current.localCallbacks.size !== 0) features |= UNIVERSAL_TREE_LOCAL_CALLBACK;
		if (current.ref != null) features |= UNIVERSAL_TREE_REF;
		if (current.visibility !== 'visible') features |= UNIVERSAL_TREE_HIDDEN;
		for (const value of Object.values(current.props)) {
			if (isRendererRegion(value)) {
				features |= UNIVERSAL_TREE_REGION;
				break;
			}
		}
	});
	return features;
}

function ownerTreeHasWarmPlan(owner: UniversalOwnerRecord): boolean {
	if ((owner.component as any)?.__warm !== undefined) return true;
	for (const child of owner.children) {
		if (ownerTreeHasWarmPlan(child)) return true;
	}
	return false;
}

function commonOwnerAncestor(
	left: UniversalOwnerRecord,
	right: UniversalOwnerRecord,
): UniversalOwnerRecord | null {
	let leftDepth = 0;
	for (let current = left.parent; current !== null; current = current.parent) leftDepth++;
	let rightDepth = 0;
	for (let current = right.parent; current !== null; current = current.parent) rightDepth++;
	let a: UniversalOwnerRecord | null = left;
	let b: UniversalOwnerRecord | null = right;
	for (; leftDepth > rightDepth; leftDepth--) a = a!.parent;
	for (; rightDepth > leftDepth; rightDepth--) b = b!.parent;
	while (a !== null && a !== b) {
		a = a.parent;
		b = b!.parent;
	}
	return a;
}

function stableLogicalChildren(
	records: readonly LogicalRecord[],
	blueprints: readonly BlueprintNode[],
): boolean {
	if (records.length !== blueprints.length) return false;
	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		const blueprint = blueprints[index];
		if (blueprint.kind === 'range' && blueprint.retained !== undefined) {
			// An adopted committed subtree is shape-stable exactly when it stands
			// for the record already in this position.
			if (blueprint.retained === record) continue;
			return false;
		}
		if (
			(blueprint.kind === 'range' && blueprint.compactLeafList !== undefined) ||
			!sameRecordShape(record, blueprint) ||
			!stableLogicalChildren(record.children, blueprint.children)
		) {
			return false;
		}
	}
	return true;
}

function collectRemovedPostOrder(record: LogicalRecord, output: LogicalRecord[]): void {
	for (const child of record.children) collectRemovedPostOrder(child, output);
	if (record.kind === 'host') output.push(record);
}

function detachRef(
	record: LogicalRecord,
	ref: unknown = record.ref,
	refCleanup: (() => void) | null = record.refCleanup,
): void {
	if (ref == null || !record.refAttached) return;
	record.refAttached = false;
	if (refCleanup !== null) {
		if (record.refCleanup === refCleanup) record.refCleanup = null;
		refCleanup();
		return;
	}
	const tasks: (() => void)[] = [];
	const collect = (value: unknown) => {
		if (Array.isArray(value)) {
			for (const nested of value) collect(nested);
		} else if (typeof value === 'function') {
			tasks.push(() => value(null));
		} else if (value !== null && typeof value === 'object') {
			tasks.push(() => {
				(value as { current: unknown }).current = null;
			});
		}
	};
	collect(ref);
	runCommitTasks(tasks);
}

function attachRef(record: LogicalRecord, value: unknown): void {
	const ref = record.ref;
	if (ref == null) return;
	record.refAttached = true;
	const cleanupTasks: (() => void)[] = [];
	const attachTasks: (() => void)[] = [];
	const collect = (target: unknown) => {
		if (Array.isArray(target)) {
			for (const nested of target) collect(nested);
		} else if (typeof target === 'function') {
			attachTasks.push(() => {
				const cleanupIndex = cleanupTasks.length;
				cleanupTasks.push(() => target(null));
				const cleanup = target(value);
				if (typeof cleanup === 'function') cleanupTasks[cleanupIndex] = cleanup;
			});
		} else if (target !== null && typeof target === 'object') {
			attachTasks.push(() => {
				(target as { current: unknown }).current = value;
				cleanupTasks.push(() => {
					(target as { current: unknown }).current = null;
				});
			});
		}
	};
	collect(ref);
	record.refCleanup = () => runCommitTasks(cleanupTasks);
	runCommitTasks(attachTasks);
}

function runCommitTasks(tasks: readonly (() => void)[]): void {
	let hasError = false;
	let firstError: unknown;
	UNIVERSAL_COMMIT_TASK_DEPTH++;
	try {
		for (const task of tasks) {
			try {
				task();
			} catch (error) {
				if (!hasError) {
					hasError = true;
					firstError = error;
				}
			}
		}
	} finally {
		UNIVERSAL_COMMIT_TASK_DEPTH--;
	}
	if (hasError) throw firstError;
}

function depsEqual(left: readonly unknown[] | null, right: readonly unknown[] | null): boolean {
	if (left === null || right === null || left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (!Object.is(left[index], right[index])) return false;
	}
	return true;
}

function suspendedOwnerPathEqual(
	left: readonly SuspendedOwnerSegment[],
	right: readonly SuspendedOwnerSegment[],
): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		const leftSegment = left[index];
		const rightSegment = right[index];
		if (
			leftSegment.component !== rightSegment.component ||
			!Object.is(leftSegment.key, rightSegment.key) ||
			leftSegment.ordinal !== rightSegment.ordinal ||
			!identityPathEqual(leftSegment.identityPath, rightSegment.identityPath)
		) {
			return false;
		}
	}
	return true;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		(value !== null && typeof value === 'object' && typeof (value as any).then === 'function') ||
		(typeof value === 'function' && typeof (value as any).then === 'function')
	);
}

function findSuspendedMemo(
	owner: DraftOwner,
	slot: unknown,
	deps: readonly unknown[] | null,
): SuspendedMemoEntry | null {
	if (deps === null) return null;
	for (const entry of currentAttempt().replayEntries) {
		if (
			Object.is(entry.slot, slot) &&
			depsEqual(entry.deps, deps) &&
			suspendedOwnerPathEqual(entry.ownerPath, owner.replayPath)
		) {
			return entry;
		}
	}
	return null;
}

function collectSuspendedMemos(attempt: RenderAttempt): readonly SuspendedMemoEntry[] {
	const entries: SuspendedMemoEntry[] = [];
	for (let ownerIndex = attempt.owners.length - 1; ownerIndex >= 0; ownerIndex--) {
		const owner = attempt.owners[ownerIndex];
		for (const [slot, hook] of owner.hooks) {
			if (
				hook.kind !== 'memo' ||
				hook.deps === null ||
				!isThenable(hook.value) ||
				owner.record.hooks.get(slot) === hook
			) {
				continue;
			}
			if (
				entries.some(
					(entry) =>
						Object.is(entry.slot, slot) &&
						suspendedOwnerPathEqual(entry.ownerPath, owner.replayPath),
				)
			) {
				continue;
			}
			entries.push({
				ownerPath: owner.replayPath,
				slot,
				deps: hook.deps,
				value: hook.value,
			});
		}
	}
	return entries;
}

function currentAttempt(): RenderAttempt {
	if (CURRENT_ATTEMPT === null) {
		throw new Error('Universal hooks may only run while a universal component is rendering.');
	}
	return CURRENT_ATTEMPT;
}

function markUniversalTreeFeature(feature: number): void {
	currentAttempt().treeFeatures |= feature;
}

function resolveHookSlot(slot: unknown): unknown {
	currentAttempt();
	const owner = activateLazyLeafOwner();
	if (owner === null) {
		throw new Error('Universal hooks require an active component owner.');
	}
	const own = slot ?? `implicit:${owner.implicitSlot++}`;
	if (UNIVERSAL_SLOT_STACK.length === 0) return own;
	let key = '@octane:universal-hook:';
	for (const part of [...UNIVERSAL_SLOT_STACK, own]) {
		const value =
			typeof part === 'symbol'
				? `s${part.description?.length ?? 0}:${part.description ?? ''}`
				: `v${String(part).length}:${String(part)}`;
		key += value;
	}
	return Symbol.for(key);
}

export function hookSlots(count: number): number {
	const base = NEXT_HOOK_SLOT;
	NEXT_HOOK_SLOT += count;
	return base;
}

export function withSlot<T>(slot: unknown, fn: (...args: any[]) => T, ...args: any[]): T {
	UNIVERSAL_SLOT_STACK.push(slot);
	try {
		return fn(...args);
	} finally {
		UNIVERSAL_SLOT_STACK.pop();
	}
}

function createUniversalTransitionBatch(): UniversalTransitionBatch {
	const batch: UniversalTransitionBatch = {
		updates: new Map(),
		roots: new Set(),
		pendingActions: 0,
		pendingSignals: 0,
		closed: false,
		promotionScheduled: false,
		promoted: false,
		settled: false,
	};
	return batch;
}

function tickUniversalTransitionCount(delta: number): void {
	UNIVERSAL_TRANSITION_PENDING_COUNT += delta;
	if (UNIVERSAL_TRANSITION_PENDING_COUNT < 0) UNIVERSAL_TRANSITION_PENDING_COUNT = 0;
	UNIVERSAL_DISCRETE_EVENT_DEPTH++;
	try {
		for (const listener of [...UNIVERSAL_TRANSITION_LISTENERS]) listener();
	} finally {
		UNIVERSAL_DISCRETE_EVENT_DEPTH--;
	}
}

function settleUniversalTransitionBatch(batch: UniversalTransitionBatch): void {
	if (batch.settled) return;
	batch.settled = true;
	if (ACTIVE_UNIVERSAL_TRANSITION_BATCH === batch) ACTIVE_UNIVERSAL_TRANSITION_BATCH = null;
	if (IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH === batch) {
		IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH = null;
	}
	tickUniversalTransitionCount(-batch.pendingSignals);
}

function finishUniversalTransitionRoot(
	batch: UniversalTransitionBatch,
	root: UniversalRootImpl<any, any>,
): void {
	if (batch.settled) return;
	const rehomePromotion = !batch.promoted && batch.promotionScheduled;
	root.discardTransitionBatch(batch);
	batch.roots.delete(root);
	if (batch.closed && batch.pendingActions === 0 && batch.roots.size === 0) {
		settleUniversalTransitionBatch(batch);
	} else if (rehomePromotion) {
		// The original promotion callback may belong to a root that can no longer
		// run it. Re-home the callback onto the first remaining staged owner; the
		// stale callback is harmless because promotion and settlement are idempotent.
		batch.promotionScheduled = false;
		queueUniversalTransitionPromotion(batch);
	}
}

function promoteUniversalTransitionBatch(batch: UniversalTransitionBatch): void {
	if (batch.promoted || batch.settled || !batch.closed || batch.pendingActions !== 0) return;
	batch.promoted = true;
	const scheduledRoots = new Set<UniversalRootImpl<any, any>>();
	for (const [owner, bySlot] of batch.updates) {
		if (owner.disposed) continue;
		let hasUpdates = false;
		for (const slot of bySlot.keys()) {
			const queue = owner.updates.get(slot);
			if (queue?.batches?.some((queuedBatch) => queuedBatch === batch)) {
				hasUpdates = true;
				break;
			}
		}
		if (!hasUpdates) continue;
		if (!scheduledRoots.has(owner.root)) {
			scheduledRoots.add(owner.root);
			owner.root.scheduleTransition(batch);
		}
	}
	// Promoted updates now live in their owner-local ordered queues. Retaining this
	// staging index until every root settles would unnecessarily keep owners and
	// updater closures from already-committed roots alive.
	batch.updates.clear();
	for (const root of [...batch.roots]) {
		if (!scheduledRoots.has(root)) finishUniversalTransitionRoot(batch, root);
	}
	if (batch.roots.size === 0) settleUniversalTransitionBatch(batch);
}

function queueUniversalTransitionPromotion(batch: UniversalTransitionBatch): void {
	if (
		batch.promotionScheduled ||
		batch.promoted ||
		batch.settled ||
		!batch.closed ||
		batch.pendingActions !== 0
	) {
		return;
	}
	batch.promotionScheduled = true;
	const firstOwner = batch.updates.keys().next().value as UniversalOwnerRecord | undefined;
	const promote = () => {
		batch.promotionScheduled = false;
		promoteUniversalTransitionBatch(batch);
	};
	if (firstOwner !== undefined && !firstOwner.disposed) {
		firstOwner.root.__scheduleMicrotask(promote);
		return;
	}
	const scheduler = readGlobalMicrotaskScheduler();
	if (scheduler !== undefined) scheduler.call(globalThis, promote);
	else void Promise.resolve().then(promote);
}

function universalTransitionBatchForUpdate(): UniversalTransitionBatch | null {
	if (UNIVERSAL_TRANSITION_DEPTH > 0) return ACTIVE_UNIVERSAL_TRANSITION_BATCH;
	if (UNIVERSAL_DISCRETE_EVENT_DEPTH > 0) return null;
	if (UNIVERSAL_ASYNC_TRANSITION_COUNT > 0) return IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH;
	return null;
}

function stageUniversalTransitionUpdate(
	batch: UniversalTransitionBatch,
	owner: UniversalOwnerRecord,
	slot: unknown,
	kind: 'state' | 'reducer',
	value: unknown,
): void {
	enqueueUniversalHookUpdate(owner, slot, kind, value, batch);
	batch.roots.add(owner.root);
	let bySlot = batch.updates.get(owner);
	if (bySlot === undefined) {
		bySlot = new Map();
		batch.updates.set(owner, bySlot);
	}
	let update = bySlot.get(slot);
	if (update === undefined) {
		update = { kind };
		bySlot.set(slot, update);
	} else if (update.kind !== kind) {
		throw new Error('A universal transition cannot stage incompatible hook updates.');
	}
}

function enqueueUniversalHookUpdate(
	owner: UniversalOwnerRecord,
	slot: unknown,
	kind: 'state' | 'reducer',
	value: unknown,
	batch: UniversalTransitionBatch | null,
): void {
	let queue = owner.updates.get(slot);
	if (queue === undefined) {
		const hook = owner.hooks.get(slot);
		if (hook?.kind !== kind) {
			throw new Error(`Cannot queue a universal ${kind} update for an inactive hook.`);
		}
		queue = [];
		owner.updates.set(slot, queue);
		if (batch !== null) {
			queue.kind = kind;
			queue.baseState = hook.value;
			queue.batches = [];
		}
	} else if (queue.kind !== undefined && queue.kind !== kind) {
		throw new Error('A universal hook cannot queue incompatible update kinds.');
	}
	if (batch !== null && queue.batches === undefined) {
		const hook = owner.hooks.get(slot);
		if (hook?.kind !== kind) {
			throw new Error(`Cannot queue a universal ${kind} update for an inactive hook.`);
		}
		queue.kind = kind;
		queue.baseState = hook.value;
		queue.batches = new Array(queue.length).fill(null);
	}
	queue.push(value);
	queue.batches?.push(batch);
	queue.rebases?.push(false);
}

function scheduleOwner(owner: UniversalOwnerRecord, slot?: unknown): void {
	if (owner.disposed) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		__profileSchedule(
			owner,
			'state',
			typeof slot === 'symbol' || typeof slot === 'number' ? slot : undefined,
		);
	}
	owner.root.scheduleOwned(owner);
}

function currentDraftOwner(): DraftOwner {
	currentAttempt();
	const owner = activateLazyLeafOwner();
	if (owner === null) {
		throw new Error('Universal hooks require an active component owner.');
	}
	return owner;
}

function findDraftOwner(record: UniversalOwnerRecord): DraftOwner | null {
	const attempt = CURRENT_ATTEMPT;
	if (attempt === null) return null;
	for (let index = attempt.owners.length - 1; index >= 0; index--) {
		if (attempt.owners[index].record === record) return attempt.owners[index];
	}
	return null;
}

function applyUniversalHookUpdateQueue<T>(
	owner: DraftOwner,
	slot: unknown,
	kind: 'state' | 'reducer',
	fallback: T,
	apply: (state: T, update: unknown) => T,
): T {
	const queue = owner.record.updates.get(slot);
	if (queue === undefined) return fallback;
	if (queue.kind !== undefined && queue.kind !== kind) {
		throw new Error('A universal hook encountered an incompatible queued update kind.');
	}
	const consumed = queue.length;
	const batches = queue.batches;
	let value = batches === undefined ? fallback : (queue.baseState as T);
	if (batches === undefined) {
		for (let index = 0; index < consumed; index++) value = apply(value, queue[index]);
		owner.appliedUpdates.set(slot, {
			lane: false,
			queue,
			consumed,
			baseState: value,
		});
		return value;
	}
	let baseState = value;
	let skipped = false;
	const remainingValues: unknown[] = [];
	const remainingBatches: (UniversalTransitionBatch | null)[] = [];
	const remainingRebases: boolean[] = [];
	const attempt = currentAttempt();
	for (let index = 0; index < consumed; index++) {
		const update = queue[index];
		const batch = batches[index];
		const included =
			batch === null || (attempt.transitionRender && attempt.transitionBatches.has(batch));
		if (!included) {
			if (!skipped) {
				skipped = true;
				baseState = value;
			}
			remainingValues.push(update);
			remainingBatches.push(batch);
			remainingRebases.push(queue.rebases?.[index] ?? false);
			continue;
		}
		value = apply(value, update);
		// Once an earlier lane was skipped, every later applied update must remain
		// as a lane-free rebase entry so the eventual transition observes the same
		// ordering without replaying from the already-published urgent state.
		if (skipped) {
			remainingValues.push(update);
			remainingBatches.push(null);
			remainingRebases.push(true);
		}
	}
	owner.appliedUpdates.set(slot, {
		lane: true,
		queue,
		consumed,
		baseState: skipped ? baseState : value,
		remainingValues,
		remainingBatches,
		remainingRebases,
	});
	return value;
}

function hasUniversalUpdatesForAttempt(owner: UniversalOwnerRecord): boolean {
	if (owner.updates.size === 0) return false;
	const attempt = currentAttempt();
	for (const queue of owner.updates.values()) {
		const batches = queue.batches;
		if (batches === undefined) {
			if (queue.length !== 0) return true;
			continue;
		}
		for (const batch of batches) {
			if (batch === null || (attempt.transitionRender && attempt.transitionBatches.has(batch))) {
				return true;
			}
		}
	}
	return false;
}

function cloneStateHook<T>(owner: DraftOwner, slot: unknown): StateHook<T> | undefined {
	let hook = owner.hooks.get(slot) as StateHook<T> | undefined;
	if (hook?.kind !== 'state') return undefined;
	if (!owner.clonedHooks.has(slot)) {
		hook = { ...hook };
		owner.hooks.set(slot, hook);
		owner.clonedHooks.add(slot);
		hook.value = applyUniversalHookUpdateQueue(owner, slot, 'state', hook.value, (value, update) =>
			typeof update === 'function' ? (update as (previous: T) => T)(value) : (update as T),
		);
	}
	return hook;
}

function projectedStateValue<T>(record: UniversalOwnerRecord, slot: unknown, fallback: T): T {
	const draft = findDraftOwner(record);
	const draftHook = draft?.hooks.get(slot) as StateHook<T> | undefined;
	if (draftHook?.kind === 'state') return draftHook.value;
	const hook = record.hooks.get(slot) as StateHook<T> | undefined;
	const queue = record.updates.get(slot);
	if (queue === undefined) return hook?.kind === 'state' ? hook.value : fallback;
	// A trailing replacement determines the projected value by itself. External
	// store invalidations use replacement tokens, so replaying every earlier
	// update here would make a burst of N notifications quadratic.
	if (queue.length !== 0) {
		const last = queue[queue.length - 1];
		if (typeof last !== 'function') return last as T;
	}
	let value =
		queue.batches === undefined
			? hook?.kind === 'state'
				? hook.value
				: fallback
			: (queue.baseState as T);
	for (const update of queue) {
		value = typeof update === 'function' ? (update as (previous: T) => T)(value) : (update as T);
	}
	return value;
}

function visibleStateValue<T>(record: UniversalOwnerRecord, slot: unknown, fallback: T): T {
	const draft = findDraftOwner(record);
	const draftHook = draft?.hooks.get(slot) as StateHook<T> | undefined;
	if (draftHook?.kind === 'state') return draftHook.value;
	const hook = record.hooks.get(slot) as StateHook<T> | undefined;
	const queue = record.updates.get(slot);
	if (queue === undefined) return hook?.kind === 'state' ? hook.value : fallback;
	// Urgent reads exclude transition lanes. Only the last applicable update
	// can take the replacement shortcut; a trailing functional updater still
	// needs the ordinary ordered replay below.
	let last = queue.length - 1;
	while (last >= 0 && queue.batches !== undefined && queue.batches[last] !== null) last--;
	if (last >= 0 && typeof queue[last] !== 'function') return queue[last] as T;
	let value =
		queue.batches === undefined
			? hook?.kind === 'state'
				? hook.value
				: fallback
			: (queue.baseState as T);
	for (let index = 0; index <= last; index++) {
		if (queue.batches !== undefined && queue.batches[index] !== null) continue;
		const update = queue[index];
		value = typeof update === 'function' ? (update as (previous: T) => T)(value) : (update as T);
	}
	return value;
}

export function useState<T>(
	initial: T | (() => T),
	slot?: unknown,
): [T, (value: T | ((previous: T) => T)) => void, () => T] {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = cloneStateHook<T>(owner, resolved);
	if (hook?.kind !== 'state') {
		const record = owner.record;
		const initialValue = typeof initial === 'function' ? (initial as () => T)() : initial;
		hook = {
			kind: 'state',
			value: initialValue,
			set(value) {
				if (record.disposed) return;
				const draft = findDraftOwner(record);
				if (draft !== null) {
					const live = cloneStateHook<T>(draft, resolved);
					if (live === undefined) return;
					const next =
						typeof value === 'function' ? (value as (previous: T) => T)(live.value) : value;
					if (Object.is(next, live.value)) return;
					live.value = next;
					draft.needsRender = true;
					return;
				}
				const transition = universalTransitionBatchForUpdate();
				const previous =
					transition === null
						? visibleStateValue(record, resolved, initialValue)
						: projectedStateValue(record, resolved, initialValue);
				const next = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value;
				const queue = record.updates.get(resolved);
				const needsUrgentRebase =
					transition === null && queue?.batches?.some((batch) => batch !== null) === true;
				if (Object.is(next, previous) && !needsUrgentRebase) return;
				if (transition !== null) {
					stageUniversalTransitionUpdate(transition, record, resolved, 'state', value);
					return;
				}
				enqueueUniversalHookUpdate(record, resolved, 'state', value, null);
				scheduleOwner(record, resolved);
			},
			get() {
				return projectedStateValue(record, resolved, initialValue);
			},
		};
		owner.hooks.set(resolved, hook as UniversalHook);
		owner.clonedHooks.add(resolved);
	}
	return [hook.value, hook.set, hook.get];
}

export const __useStateWithGetter = useState;

function universalLinkedStateHook<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot: LinkedStateOptions<Source, Value> | unknown,
	maybeSlot: unknown,
	withGetter: boolean,
): [Value, (next: Value | ((previous: Value) => Value)) => void, (() => Value)?] {
	const options =
		optionsOrSlot !== null && typeof optionsOrSlot === 'object'
			? (optionsOrSlot as LinkedStateOptions<Source, Value>)
			: undefined;
	const slot = maybeSlot ?? (options === undefined ? optionsOrSlot : undefined);
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = owner.hooks.get(resolved) as LinkedStateHook<Source, Value> | undefined;
	const sourceEqual = options?.sourceEqual ?? Object.is;
	const valueEqual = options?.valueEqual ?? Object.is;

	if (hook?.linked !== true) {
		const record = owner.record;
		const initialValue = reconcile(source, undefined);
		const current: LinkedStateHook<Source, Value> = {
			kind: 'state',
			linked: true,
			source,
			generation: 0,
			generationBase: initialValue,
			value: initialValue,
			valueEqual,
			set(update) {
				if (record.disposed) return;
				const draft = findDraftOwner(record);
				if (draft !== null) {
					const live = cloneStateHook<Value>(draft, resolved) as
						LinkedStateHook<Source, Value> | undefined;
					if (live?.linked !== true) return;
					const next =
						typeof update === 'function'
							? (update as (previous: Value) => Value)(live.value)
							: update;
					if (live.valueEqual(live.value, next)) return;
					live.value = next;
					draft.needsRender = true;
					return;
				}

				const committed = record.hooks.get(resolved) as LinkedStateHook<Source, Value> | undefined;
				if (committed?.linked !== true) return;
				const transition = universalTransitionBatchForUpdate();
				const parked = PARKED_UNIVERSAL_LINKED_DRAFTS?.get(committed) as
					ParkedUniversalLinkedDraft<Source, Value> | undefined;
				if (
					transition === null &&
					record.visibility === 'suspense-hidden' &&
					parked !== undefined &&
					parked.generation === committed.generation
				) {
					const next =
						typeof update === 'function'
							? (update as (previous: Value) => Value)(parked.value)
							: update;
					if (parked.valueEqual(parked.value, next)) return;
					parked.value = next;
					parked.updated = true;
					scheduleOwner(record, resolved);
					return;
				}
				const previous =
					transition === null
						? visibleStateValue(record, resolved, committed.value)
						: projectedStateValue(record, resolved, committed.value);
				const next =
					typeof update === 'function' ? (update as (previous: Value) => Value)(previous) : update;
				const queue = record.updates.get(resolved);
				const needsUrgentRebase =
					transition === null && queue?.batches?.some((batch) => batch !== null) === true;
				if (committed.valueEqual(previous, next) && !needsUrgentRebase) return;

				const generation = committed.generation;
				const apply = (previousValue: Value): Value => {
					const latest = record.hooks.get(resolved) as LinkedStateHook<Source, Value> | undefined;
					if (latest?.linked !== true) return previousValue;
					// Source reconciliation publishes a new generation only on host
					// acceptance. An old lane may still carry its former base state;
					// replace it with the newly committed value instead of replaying
					// a draft that belonged to the abandoned source.
					if (latest.generation !== generation) return latest.generationBase;
					const candidate =
						typeof update === 'function'
							? (update as (previous: Value) => Value)(previousValue)
							: update;
					return latest.valueEqual(previousValue, candidate) ? previousValue : candidate;
				};
				if (transition !== null) {
					stageUniversalTransitionUpdate(transition, record, resolved, 'state', apply);
					return;
				}
				enqueueUniversalHookUpdate(record, resolved, 'state', apply, null);
				scheduleOwner(record, resolved);
			},
		};
		owner.hooks.set(resolved, current);
		owner.clonedHooks.add(resolved);
		hook = current;
	} else {
		if (!owner.clonedHooks.has(resolved)) {
			hook = { ...hook };
			owner.hooks.set(resolved, hook);
			owner.clonedHooks.add(resolved);
			hook.value = applyUniversalHookUpdateQueue(
				owner,
				resolved,
				'state',
				hook.value,
				(previous, update) =>
					typeof update === 'function'
						? (update as (previous: Value) => Value)(previous)
						: (update as Value),
			);
		}
		hook.valueEqual = valueEqual;
		const committed = owner.record.hooks.get(resolved) as
			LinkedStateHook<Source, Value> | undefined;
		let parked =
			committed === undefined
				? undefined
				: (PARKED_UNIVERSAL_LINKED_DRAFTS?.get(committed) as
						ParkedUniversalLinkedDraft<Source, Value> | undefined);
		if (parked !== undefined) {
			if (committed?.generation !== parked.generation || !sourceEqual(parked.source, source)) {
				PARKED_UNIVERSAL_LINKED_DRAFTS!.delete(committed!);
				parked = undefined;
			} else {
				parked.valueEqual = valueEqual;
			}
		}
		const sourceChanged = !sourceEqual(hook.source, source);
		if (sourceChanged) {
			const previous = { source: hook.source, value: hook.value };
			const next = reconcile(source, previous);
			const reconciled = valueEqual(hook.value, next) ? hook.value : next;
			const reuseParked =
				parked !== undefined &&
				owner.record.visibility === 'suspense-hidden' &&
				parked.updated &&
				parked.generation === committed?.generation;
			hook.value = reuseParked && parked !== undefined ? parked.value : reconciled;
			if (!reuseParked && committed !== undefined) {
				let boundary: DraftOwner | null = owner.parent;
				while (boundary !== null && !(boundary.isBoundary && boundary.canHandleSuspense)) {
					boundary = boundary.parent;
				}
				if (boundary !== null) {
					(PARKED_UNIVERSAL_LINKED_DRAFTS ??= new WeakMap()).set(committed, {
						source,
						value: hook.value,
						valueEqual,
						generation: committed.generation,
						updated: false,
					});
				}
			}
			hook.source = source;
			hook.generation++;
			hook.generationBase = hook.value;
			const applied = owner.appliedUpdates.get(resolved);
			if (applied?.lane) {
				// Applied/queued updates exclude owner-only fast commits. The full
				// transaction publishes this new linked origin to queue.baseState
				// only after host acceptance; abandoned drafts leave both untouched.
				owner.appliedUpdates.set(resolved, { ...applied, baseState: hook.value });
			}
		}
	}

	if (!withGetter) return [hook.value, hook.set];
	const record = owner.record;
	const initialValue = hook.value;
	const getter = (hook.get ??= () => {
		if (record.visibility === 'suspense-hidden' && findDraftOwner(record) === null) {
			const committed = record.hooks.get(resolved) as LinkedStateHook<Source, Value> | undefined;
			if (committed?.linked === true) {
				const parked = PARKED_UNIVERSAL_LINKED_DRAFTS?.get(committed);
				// Keep old-source lanes intact: an abandoned replacement must still
				// apply its pending edit if the original source is restored.
				if (parked?.generation === committed.generation) return committed.value;
			}
		}
		return projectedStateValue(record, resolved, initialValue);
	});
	return [hook.value, hook.set, getter];
}

export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value>,
	slot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value];
export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot?: LinkedStateOptions<Source, Value> | unknown,
	maybeSlot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value] {
	return universalLinkedStateHook(source, reconcile, optionsOrSlot, maybeSlot, false) as [
		Value,
		(next: Value | ((previous: Value) => Value)) => void,
		() => Value,
	];
}

export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value>,
	slot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value];
export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot?: LinkedStateOptions<Source, Value> | unknown,
	maybeSlot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value] {
	return universalLinkedStateHook(source, reconcile, optionsOrSlot, maybeSlot, true) as [
		Value,
		(next: Value | ((previous: Value) => Value)) => void,
		() => Value,
	];
}

export function useReducer<S, A, I = S>(
	reducer: (state: S, action: A) => S,
	initialArg: I,
	initOrSlot?: ((value: I) => S) | unknown,
	maybeSlot?: unknown,
): [S, (action: A) => void, () => S] {
	const init = typeof initOrSlot === 'function' ? (initOrSlot as (value: I) => S) : null;
	const slot = maybeSlot ?? (init === null ? initOrSlot : undefined);
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = owner.hooks.get(resolved) as ReducerHook<S, A> | undefined;
	if (hook?.kind !== 'reducer') {
		const record = owner.record;
		const initialValue = init === null ? (initialArg as unknown as S) : init(initialArg);
		hook = {
			kind: 'reducer',
			value: initialValue,
			reducer,
			dispatch(action) {
				if (record.disposed) return;
				const draft = findDraftOwner(record);
				if (draft !== null) {
					let live = draft.hooks.get(resolved) as ReducerHook<S, A> | undefined;
					if (live?.kind !== 'reducer') return;
					if (!draft.clonedHooks.has(resolved)) {
						live = { ...live };
						draft.hooks.set(resolved, live);
						draft.clonedHooks.add(resolved);
					}
					const next = live.reducer(live.value, action);
					if (Object.is(next, live.value)) return;
					live.value = next;
					draft.needsRender = true;
					return;
				}
				const transition = universalTransitionBatchForUpdate();
				if (transition !== null) {
					stageUniversalTransitionUpdate(transition, record, resolved, 'reducer', action);
					return;
				}
				enqueueUniversalHookUpdate(record, resolved, 'reducer', action, null);
				scheduleOwner(record, resolved);
			},
			get() {
				const draft = findDraftOwner(record);
				const draftHook = draft?.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				if (draftHook?.kind === 'reducer') return draftHook.value;
				const committed = record.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				const queue = record.updates.get(resolved);
				let value =
					queue === undefined
						? committed?.kind === 'reducer'
							? committed.value
							: initialValue
						: queue.batches === undefined
							? committed?.kind === 'reducer'
								? committed.value
								: initialValue
							: (queue.baseState as S);
				if (queue !== undefined) {
					for (const update of queue) {
						value = (committed?.reducer ?? reducer)(value, update as A);
					}
				}
				return value;
			},
		};
		owner.hooks.set(resolved, hook as UniversalHook);
		owner.clonedHooks.add(resolved);
	} else {
		if (!owner.clonedHooks.has(resolved)) {
			hook = { ...hook };
			owner.hooks.set(resolved, hook);
			owner.clonedHooks.add(resolved);
			hook.value = applyUniversalHookUpdateQueue(
				owner,
				resolved,
				'reducer',
				hook.value,
				(value, action) => reducer(value, action as A),
			);
		}
		hook.reducer = reducer;
	}
	return [hook.value, hook.dispatch, hook.get];
}

export const __useReducerWithGetter = useReducer;

function enqueueUniversalEffect(
	phase: EffectPhase,
	create: () => void | (() => void),
	deps: readonly unknown[] | null | undefined,
	slot?: unknown,
): void {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	const previous = owner.record.hooks.get(resolved) as EffectHook | undefined;
	const hook: EffectHook = {
		kind: 'effect',
		owner: owner.record,
		slot: resolved,
		phase,
		create,
		deps: deps === undefined ? null : deps,
		cleanup: previous?.kind === 'effect' ? previous.cleanup : null,
		mounted: previous?.kind === 'effect' ? previous.mounted : false,
		previous: previous?.kind === 'effect' ? previous : null,
	};
	owner.hooks.set(resolved, hook);
	owner.clonedHooks.add(resolved);
	owner.seenEffects.push(hook);
}

export function useInsertionEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('insertion', create, deps, slot);
}

export function useLayoutEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('layout', create, deps, slot);
}

export function useEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('passive', create, deps, slot);
}

function memoHookValue<T>(
	input: T | (() => T),
	compute: boolean,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): T {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	const previous = owner.hooks.get(resolved) as MemoHook<T> | undefined;
	const normalized = deps === undefined ? null : deps;
	if (previous?.kind === 'memo' && depsEqual(previous.deps, normalized)) return previous.value;
	// Compiler-generated memo cells around fresh `use()` inputs must survive a
	// suspended replay, but the draft hook map itself must never become live. The
	// replay cache is therefore attempt-scoped and keyed by the full structural
	// owner path, slot, and deps; only an accepted render publishes the hook cell.
	const replayed = findSuspendedMemo(owner, resolved, normalized);
	if (replayed !== null) {
		const value = replayed.value as T;
		owner.hooks.set(resolved, { kind: 'memo', value, deps: normalized });
		owner.clonedHooks.add(resolved);
		return value;
	}
	const warmed = takeUniversalWarmValue(owner.record.root, resolved, normalized);
	const value =
		warmed === NO_WARM_VALUE
			? compute
				? (input as (...args: unknown[]) => T)(...(normalized ?? []))
				: (input as T)
			: (warmed as T);
	owner.hooks.set(resolved, { kind: 'memo', value, deps: normalized });
	owner.clonedHooks.add(resolved);
	return value;
}

export function useMemo<T>(compute: () => T, deps?: readonly unknown[] | null, slot?: unknown): T {
	return memoHookValue<T>(compute, true, deps, slot);
}

export function useCallback<T extends (...args: any[]) => any>(
	callback: T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): T {
	return memoHookValue<T>(callback, false, deps, slot);
}

export function useRef<T>(initial: T, slot?: unknown): { current: T } {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = owner.hooks.get(resolved) as RefHook<T> | undefined;
	if (hook?.kind !== 'ref') {
		const record = owner.record;
		const value = {} as { current: T };
		Object.defineProperty(value, 'current', {
			enumerable: true,
			get() {
				const draft = findDraftOwner(record);
				const live = (draft?.hooks.get(resolved) ?? record.hooks.get(resolved)) as
					RefHook<T> | undefined;
				return live?.kind === 'ref' ? live.current : initial;
			},
			set(next: T) {
				const draft = findDraftOwner(record);
				if (draft !== null) {
					let live = draft.hooks.get(resolved) as RefHook<T> | undefined;
					if (live?.kind !== 'ref') return;
					if (!draft.clonedHooks.has(resolved)) {
						live = { ...live };
						draft.hooks.set(resolved, live);
						draft.clonedHooks.add(resolved);
					}
					live.current = next;
					return;
				}
				const live = record.hooks.get(resolved) as RefHook<T> | undefined;
				if (live?.kind === 'ref') live.current = next;
			},
		});
		hook = { kind: 'ref', current: initial, value };
		owner.hooks.set(resolved, hook);
		owner.clonedHooks.add(resolved);
	}
	return hook.value;
}

export function useId(slot?: unknown): string {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = owner.hooks.get(resolved) as IdHook | undefined;
	if (hook?.kind !== 'id') {
		const attempt = currentAttempt();
		hook = {
			kind: 'id',
			value: attempt.root.formatUniversalId(attempt.nextUniversalId++),
		};
		owner.hooks.set(resolved, hook);
		owner.clonedHooks.add(resolved);
	}
	return hook.value;
}

interface UniversalStoreState<T> {
	instance: UniversalStoreInstance<T>;
}

interface UniversalStoreInstance<T> {
	value: T;
	getSnapshot: () => T;
	committedState: UniversalStoreState<T>;
	notificationState: UniversalStoreState<T>;
	notificationValue: T;
	notificationFailed: boolean;
	forceUpdate: (state: UniversalStoreState<T>) => void;
}

function enqueueUniversalStoreSnapshot(
	instance: UniversalStoreInstance<any>,
	value: unknown,
): void {
	if (instance.notificationFailed || !Object.is(instance.notificationValue, value)) {
		instance.notificationFailed = false;
		instance.notificationValue = value;
		instance.notificationState = Object.is(instance.value, value)
			? instance.committedState
			: { instance };
	}
	// Reuse the token for identical notifications. The state setter then keeps
	// one ordinary pending update instead of appending and rescanning an
	// ever-growing queue. A held transition can still require urgent rebases.
	// Distinct snapshots receive distinct tokens, including while
	// an earlier transition is held; returning to the committed value uses its
	// token so the setter can preserve an urgent rebase over a pending transition.
	instance.forceUpdate(instance.notificationState);
}

function enqueueUniversalStoreError(instance: UniversalStoreInstance<any>): void {
	// A snapshot failure belongs to the next render, where the owning boundary
	// can handle it, rather than escaping through the store notifier.
	if (!instance.notificationFailed) {
		instance.notificationFailed = true;
		instance.notificationState = { instance };
	}
	instance.forceUpdate(instance.notificationState);
}

function notifyUniversalStore(instance: UniversalStoreInstance<any>): void {
	let value: unknown;
	try {
		value = instance.getSnapshot();
	} catch {
		enqueueUniversalStoreError(instance);
		return;
	}
	enqueueUniversalStoreSnapshot(instance, value);
}

function checkUniversalStore(instance: UniversalStoreInstance<any>): void {
	let value: unknown;
	try {
		value = instance.getSnapshot();
	} catch {
		enqueueUniversalStoreError(instance);
		return;
	}
	// Unlike an actual notification, an internal consistency read must not
	// promote an unrelated queued transition when the committed value still fits.
	if (!Object.is(instance.value, value)) enqueueUniversalStoreSnapshot(instance, value);
}

// Effect callbacks receive their dependency values as positional arguments.
// Publish only after host acceptance: an abandoned or rejected draft must not
// replace the getter used by the still-connected committed subscription.
function updateUniversalStoreInstance<T>(
	instance: UniversalStoreInstance<T>,
	value: T,
	getSnapshot: () => T,
	state: UniversalStoreState<T>,
): void {
	instance.value = value;
	instance.getSnapshot = getSnapshot;
	instance.committedState = state;
	instance.notificationState = state;
	instance.notificationValue = value;
	instance.notificationFailed = false;
	checkUniversalStore(instance);
}

function subscribeToUniversalStore<T>(
	instance: UniversalStoreInstance<T>,
	subscribe: (onStoreChange: () => void) => () => void,
): () => void {
	let activeInstance: UniversalStoreInstance<T> | null = instance;
	const onStoreChange = () => {
		if (activeInstance !== null) notifyUniversalStore(activeInstance);
	};
	let unsubscribe: (() => void) | null = null;
	try {
		unsubscribe = subscribe(onStoreChange);
	} catch (error) {
		activeInstance = null;
		throw error;
	}
	// subscribe itself can synchronously mutate the store. Checking after it
	// returns also closes the interval between the render read and connection.
	checkUniversalStore(instance);
	return () => {
		activeInstance = null;
		const cleanup = unsubscribe;
		unsubscribe = null;
		cleanup?.();
	};
}

export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
): T;
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot: () => T,
): T;
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot: (() => T) | undefined,
	slot: unknown,
): T;
export function useSyncExternalStore<T>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
	...serverSnapshotAndSlot: unknown[]
): T {
	let slot: unknown;
	if (serverSnapshotAndSlot.length === 1) {
		// An authored two-argument call receives only the compiler slot here. A
		// direct, uncompiled three-argument call may instead provide a server
		// snapshot function and relies on the implicit slot fallback.
		slot = typeof serverSnapshotAndSlot[0] === 'function' ? undefined : serverSnapshotAndSlot[0];
	} else if (serverSnapshotAndSlot.length > 1) {
		slot = serverSnapshotAndSlot[serverSnapshotAndSlot.length - 1];
	}
	const base = resolveHookSlot(slot);
	return withSlot(base, () => {
		const snapshot = getSnapshot();
		const [state, forceUpdate] = useState<UniversalStoreState<T>>(() => {
			const initial = {} as UniversalStoreState<T>;
			const instance: UniversalStoreInstance<T> = {
				value: snapshot,
				getSnapshot,
				committedState: initial,
				notificationState: initial,
				notificationValue: snapshot,
				notificationFailed: false,
				forceUpdate: (next) => forceUpdate(next),
			};
			initial.instance = instance;
			return initial;
		}, 'state');
		const instance = state.instance;
		// Getter/snapshot freshness and connection lifetime are independent. The
		// first effect commits the fresh read; the second stays connected until
		// subscribe changes or normal effect teardown hides/removes its owner.
		useLayoutEffect(
			updateUniversalStoreInstance as () => void,
			[instance, snapshot, getSnapshot, state],
			'snapshot',
		);
		useLayoutEffect(
			subscribeToUniversalStore as () => () => void,
			[instance, subscribe],
			'subscribe',
		);
		return snapshot;
	});
}

export function useDeferredValue<T>(value: T, ...initialValueAndSlot: unknown[]): T {
	const slot = initialValueAndSlot[initialValueAndSlot.length - 1];
	const hasInitialValue = initialValueAndSlot.length >= 2;
	const initialValue = initialValueAndSlot[0] as T;
	const base = resolveHookSlot(slot);
	return withSlot(base, () => {
		const owner = currentDraftOwner();
		const transitionRender = currentAttempt().transitionRender;
		const inactive = owner.visibility !== 'visible' || owner.record.visibility !== 'visible';
		const [deferred, setDeferred] = useState(
			hasInitialValue && !transitionRender && !inactive ? initialValue : value,
			'value',
		);
		if ((transitionRender || inactive) && !Object.is(deferred, value)) {
			setDeferred(value);
			return value;
		}
		useLayoutEffect(
			() => {
				if (Object.is(deferred, value)) return;
				startTransition(() => setDeferred(value));
			},
			[value, deferred],
			'defer',
		);
		return deferred;
	});
}

export function useTransition(slot?: unknown): [boolean, typeof startTransition] {
	const base = resolveHookSlot(slot);
	return withSlot(base, () => {
		const [pending, setPending] = useState(UNIVERSAL_TRANSITION_PENDING_COUNT > 0, 'pending');
		useLayoutEffect(
			() => {
				const update = () => setPending(UNIVERSAL_TRANSITION_PENDING_COUNT > 0);
				UNIVERSAL_TRANSITION_LISTENERS.add(update);
				update();
				return () => UNIVERSAL_TRANSITION_LISTENERS.delete(update);
			},
			[],
			'subscribe',
		);
		return [pending, startTransition];
	});
}

export function useActionState<State, Payload>(
	action: (previousState: State, payload: Payload) => State | Promise<State>,
	initialState: State,
	_permalinkOrSlot?: string | unknown,
	maybeSlot?: unknown,
): [State, (payload: Payload) => void, boolean] {
	const slot = maybeSlot ?? (typeof _permalinkOrSlot === 'string' ? undefined : _permalinkOrSlot);
	const base = resolveHookSlot(slot);
	const root = currentDraftOwner().record.root;
	return withSlot(base, () => {
		const [state, setState, getState] = useState(initialState, 'state');
		const [pending, setPending] = useState(false, 'pending');
		const dispatch = useCallback(
			(payload: Payload) => {
				let result: State | Promise<State>;
				try {
					result = action(getState(), payload);
				} catch (error) {
					root.__scheduleMicrotask(() => {
						throw error;
					});
					return;
				}
				if (result != null && typeof (result as any).then === 'function') {
					setPending(true);
					Promise.resolve(result).then(
						(value) => {
							setState(value);
							setPending(false);
						},
						(error) => {
							setPending(false);
							root.__scheduleMicrotask(() => {
								throw error;
							});
						},
					);
				} else {
					setState(result as State);
				}
			},
			[action],
			'dispatch',
		);
		return [state, dispatch, pending];
	});
}

/** ES-only fallback for hosts that do not provide the WHATWG FormData global. */
interface UniversalFormDataFallback {
	append(name: string, value: unknown, filename?: string): void;
	delete(name: string): void;
	get(name: string): unknown;
	getAll(name: string): unknown[];
	has(name: string): boolean;
	set(name: string, value: unknown, filename?: string): void;
	entries(): IterableIterator<[string, unknown]>;
	keys(): IterableIterator<string>;
	values(): IterableIterator<unknown>;
	[Symbol.iterator](): IterableIterator<[string, unknown]>;
}

/** Uses the host's FormData type when present without requiring the DOM lib. */
type UniversalFormData = typeof globalThis extends {
	FormData: { prototype: infer Data };
}
	? Data
	: UniversalFormDataFallback;

export interface FormStatus {
	pending: boolean;
	data: UniversalFormData | null;
	method: string | null;
	action: string | ((formData: UniversalFormData) => void | Promise<void>) | null;
}

const UNIVERSAL_FORM_STATUS: FormStatus = Object.freeze({
	pending: false,
	data: null,
	method: null,
	action: null,
});

export function useFormStatus(): FormStatus {
	return UNIVERSAL_FORM_STATUS;
}

export function useOptimistic<State>(passthrough: State): [State, (action: State) => void];
export function useOptimistic<State, Action = State>(
	passthrough: State,
	reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void];
export function useOptimistic<State, Action = State>(
	passthrough: State,
	reducer: ((state: State, action: Action) => State) | undefined,
	slot: unknown,
): [State, (action: Action) => void];
export function useOptimistic<State, Action = State>(
	passthrough: State,
	...reducerAndSlot: unknown[]
): [State, (action: Action) => void] {
	const defaultReducer = (_state: State, action: Action) => action as unknown as State;
	let reducer: (state: State, action: Action) => State = defaultReducer;
	let slot: unknown;
	if (reducerAndSlot.length === 1) {
		if (typeof reducerAndSlot[0] === 'function') {
			reducer = reducerAndSlot[0] as (state: State, action: Action) => State;
		} else {
			slot = reducerAndSlot[0];
		}
	} else if (reducerAndSlot.length > 1) {
		if (typeof reducerAndSlot[0] === 'function') {
			reducer = reducerAndSlot[0] as (state: State, action: Action) => State;
		}
		slot = reducerAndSlot[reducerAndSlot.length - 1];
	}
	const [optimistic, dispatch] = useReducer(reducer, passthrough, slot);
	return [Object.is(optimistic, passthrough) ? passthrough : optimistic, dispatch];
}

export function useContext<T>(context: UniversalContext<T>): T {
	return readOwnerContext(currentDraftOwner(), context);
}

type UniversalTrackedThenable<T = unknown> = PromiseLike<T> & {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: unknown;
};

function trackUniversalThenable<T>(thenable: UniversalTrackedThenable<T>): void {
	if (
		thenable.status === 'pending' ||
		thenable.status === 'fulfilled' ||
		thenable.status === 'rejected'
	)
		return;
	thenable.status = 'pending';
	thenable.then(
		(value) => {
			thenable.status = 'fulfilled';
			thenable.value = value;
		},
		(error) => {
			thenable.status = 'rejected';
			thenable.reason = error;
		},
	);
}

interface UniversalWarmEntry {
	readonly deps: readonly unknown[];
	readonly value: unknown;
	available: boolean;
}

const UNIVERSAL_WARM_CACHES = new WeakMap<
	UniversalRootImpl<any, any>,
	Map<unknown, UniversalWarmEntry[]>
>();
let CURRENT_UNIVERSAL_WARM: Map<unknown, UniversalWarmEntry[]> | null = null;
let CURRENT_UNIVERSAL_WARM_CLAIMS: Set<object> | null = null;
const ACTIVE_UNIVERSAL_WARM_PLANS: Array<() => void> = [];
let UNIVERSAL_WARM_DEPTH = 0;
const UNIVERSAL_WARM_DEPTH_CAP = 64;
// Per-slot occurrence queues live only for this render attempt and stay uncapped
// so repeated instances preserve their FIFO value mapping.
const NO_WARM_VALUE = Symbol('octane.universal.no-warm-value');

function takeUniversalWarmValue(
	root: UniversalRootImpl<any, any>,
	slot: unknown,
	deps: readonly unknown[] | null,
): unknown {
	if (deps === null) return NO_WARM_VALUE;
	const cache = UNIVERSAL_WARM_CACHES.get(root);
	const entries = cache?.get(slot);
	if (entries === undefined) return NO_WARM_VALUE;
	for (let index = 0; index < entries.length; index++) {
		if (!depsEqual(entries[index].deps, deps)) continue;
		if (!entries[index].available) continue;
		entries[index].available = false;
		return entries[index].value;
	}
	return NO_WARM_VALUE;
}

/** Compiler ABI: suspend once for all pending promises in one independent stratum. */
export function useBatch(items: any[], warm?: () => void): void {
	if (items.length === 0) {
		if (warm !== undefined) ACTIVE_UNIVERSAL_WARM_PLANS.push(warm);
		return;
	}
	let pending: UniversalTrackedThenable[] | null = null;
	for (const item of items) {
		if (item == null || typeof item.then !== 'function') continue;
		const thenable = item as UniversalTrackedThenable;
		trackUniversalThenable(thenable);
		if (thenable.status === 'rejected') break;
		if (thenable.status === 'pending') (pending ??= []).push(thenable);
	}
	if (pending === null) return;
	if (ACTIVE_UNIVERSAL_WARM_PLANS.length !== 0 || warm !== undefined) {
		const root = currentAttempt().root;
		let cache = UNIVERSAL_WARM_CACHES.get(root);
		if (cache === undefined) {
			cache = new Map();
			UNIVERSAL_WARM_CACHES.set(root, cache);
		}
		const previous = CURRENT_UNIVERSAL_WARM;
		const previousClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
		CURRENT_UNIVERSAL_WARM = cache;
		CURRENT_UNIVERSAL_WARM_CLAIMS = new Set();
		try {
			for (let i = 0; i < ACTIVE_UNIVERSAL_WARM_PLANS.length; i++) {
				CURRENT_UNIVERSAL_WARM_CLAIMS = new Set();
				try {
					ACTIVE_UNIVERSAL_WARM_PLANS[i]();
				} catch {
					// Independent speculative plans cannot block adjacent warming.
				}
			}
			if (warm !== undefined) {
				CURRENT_UNIVERSAL_WARM_CLAIMS = new Set();
				try {
					warm();
				} catch {
					// Speculative and independent from registered ancestor plans.
				}
			}
		} finally {
			CURRENT_UNIVERSAL_WARM = previous;
			CURRENT_UNIVERSAL_WARM_CLAIMS = previousClaims;
		}
	}
	if (pending.length === 1) throw new UniversalSuspense(pending[0]);
	let remaining = pending.length;
	const combined = new Promise<void>((resolve, reject) => {
		for (const thenable of pending) {
			thenable.then(() => {
				if (--remaining === 0) resolve();
			}, reject);
		}
	});
	throw new UniversalSuspense(combined);
}

/** Compiler ABI: cache one speculative creation per plan occurrence, slot, and deps. */
export function warmMemo(compute: () => any, deps: readonly any[], slot: unknown): void {
	const cache = CURRENT_UNIVERSAL_WARM;
	if (cache === null) return;
	let entries = cache.get(slot);
	if (entries !== undefined) {
		for (const entry of entries) {
			if (!depsEqual(entry.deps, deps) || CURRENT_UNIVERSAL_WARM_CLAIMS?.has(entry)) {
				continue;
			}
			CURRENT_UNIVERSAL_WARM_CLAIMS?.add(entry);
			return;
		}
	}
	// Parent plans recurse through the currently-rendering source owner. Mark an
	// already-created real memo anywhere in this attempt as consumed so a later
	// sibling's suspension cannot call its factory again.
	let activeCreation: MemoHook | undefined;
	for (const owner of currentAttempt().owners) {
		const hook = owner.hooks.get(slot) as MemoHook | undefined;
		if (
			hook?.kind === 'memo' &&
			depsEqual(hook.deps, deps) &&
			!CURRENT_UNIVERSAL_WARM_CLAIMS?.has(hook)
		) {
			activeCreation = hook;
			break;
		}
	}
	if (activeCreation !== undefined) {
		CURRENT_UNIVERSAL_WARM_CLAIMS?.add(activeCreation);
		if (entries === undefined) {
			entries = [];
			cache.set(slot, entries);
		}
		const entry = { deps: [...deps], value: undefined, available: false };
		entries.push(entry);
		CURRENT_UNIVERSAL_WARM_CLAIMS?.add(entry);
		return;
	}
	let value: unknown;
	try {
		value = compute();
	} catch {
		return;
	}
	if (value != null && typeof (value as any).then === 'function') {
		trackUniversalThenable(value as UniversalTrackedThenable);
	}
	if (entries === undefined) {
		entries = [];
		cache.set(slot, entries);
	}
	const entry = { deps: [...deps], value, available: true };
	entries.push(entry);
	CURRENT_UNIVERSAL_WARM_CLAIMS?.add(entry);
}

/** Compiler ABI: recurse into a compiled child's statically attached warm plan. */
export function warmChild(component: any, props: any): void {
	if (CURRENT_UNIVERSAL_WARM === null || component == null) return;
	const plan = component.__warm;
	if (typeof plan !== 'function' || UNIVERSAL_WARM_DEPTH >= UNIVERSAL_WARM_DEPTH_CAP) return;
	UNIVERSAL_WARM_DEPTH++;
	try {
		plan(props);
	} catch {
		// Fetch warming is speculative.
	} finally {
		UNIVERSAL_WARM_DEPTH--;
	}
}

function resolveUniversalLazyModule(module: unknown, renderer: string): UniversalComponent<any> {
	let component = module;
	if (module != null) {
		const defaultExport = (module as { readonly default?: unknown }).default;
		if (defaultExport !== undefined) component = defaultExport;
	}
	if (typeof component !== 'function' || (component as any)[LAZY_COMPONENT] === true) {
		throw new Error(
			`Universal lazy expected a component function or module default, got ${
				(component as any)?.[LAZY_COMPONENT] === true ? 'a lazy component' : typeof component
			}.`,
		);
	}
	const resolved = component as UniversalComponent<any>;
	const metadata = getComponentMetadata(resolved);
	if (metadata === UNIVERSAL_LAZY_METADATA || metadata.id !== renderer) {
		throw new Error(
			`Universal lazy for renderer ${JSON.stringify(renderer)} cannot render component ${JSON.stringify(metadata.id)}.`,
		);
	}
	return resolved;
}

/**
 * Host-neutral code-splitting component. The loader runs at most once after it
 * successfully returns a thenable; fulfillment and rejection are cached for
 * every owner of the wrapper. Compiler-generated warm plans call `__warm`
 * before an adjacent lazy child suspends, starting independent chunks in one
 * stratum without putting module namespaces in hydration or host payloads.
 */
/* @__NO_SIDE_EFFECTS__ */
export function lazy<C extends UniversalComponent<any>>(
	load: () => PromiseLike<{ default: C } | C>,
): C {
	let status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected' = 'uninitialized';
	let result: unknown = null;
	let thenable: UniversalTrackedThenable<{ default: C } | C> | null = null;

	const initialize = (): void => {
		if (status !== 'uninitialized') return;
		try {
			const loaded = load();
			thenable = loaded as UniversalTrackedThenable<{ default: C } | C>;
			loaded.then(
				(module) => {
					if (status === 'uninitialized' || status === 'pending') {
						result = module;
						status = 'fulfilled';
					}
				},
				(error) => {
					if (status === 'uninitialized' || status === 'pending') {
						result = error;
						status = 'rejected';
					}
				},
			);
		} catch (error) {
			if (status === 'uninitialized') thenable = null;
			throw error;
		}
		if (status === 'uninitialized') status = 'pending';
	};

	const wrapper = ((props: any, context: UniversalRenderContext): UniversalRenderable => {
		if (status === 'uninitialized') initialize();
		let settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
		if (settledStatus === 'fulfilled') {
			const component = resolveUniversalLazyModule(result, context.renderer);
			return component(resolveLazyDefaultProps(component, props), context);
		}
		if (settledStatus === 'rejected') throw result;
		useBatch([thenable!]);
		settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
		if (settledStatus === 'fulfilled') {
			const component = resolveUniversalLazyModule(result, context.renderer);
			return component(resolveLazyDefaultProps(component, props), context);
		}
		if (settledStatus === 'rejected') throw result;
		throw new UniversalSuspense(thenable!);
	}) as UniversalComponent<any>;
	Object.defineProperties(wrapper, {
		[LAZY_COMPONENT]: { value: true },
		__warm: { value: initialize },
	});
	return wrapper as C;
}

export function use<T>(usable: UniversalContext<T> | PromiseLike<T>): T {
	currentDraftOwner();
	if ((usable as UniversalContext<T>)?.$$kind === Symbol.for('octane.context')) {
		return useContext(usable as UniversalContext<T>);
	}
	const thenable = usable as UniversalTrackedThenable<T>;
	if (thenable.status === 'fulfilled') return thenable.value as T;
	if (thenable.status === 'rejected') throw thenable.reason;
	trackUniversalThenable(thenable);
	throw new UniversalSuspense(thenable);
}

export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null,
	create: () => T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	useLayoutEffect(
		() => {
			const value = create();
			if (typeof ref === 'function') ref(value);
			else if (ref !== null) ref.current = value;
			return () => {
				if (typeof ref === 'function') ref(null);
				else if (ref !== null) ref.current = null;
			};
		},
		deps,
		slot,
	);
}

export function useEffectEvent<T extends (...args: any[]) => any>(fn: T, slot?: unknown): T {
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	let hook = owner.hooks.get(resolved) as EffectEventHook | undefined;
	if (hook?.kind !== 'effect-event') {
		const cell = { impl: fn as (...args: any[]) => any, active: false };
		const value = ((...args: any[]) => {
			if (!cell.active) throw new Error('A universal Effect Event cannot run before commit.');
			return cell.impl(...args);
		}) as T;
		hook = { kind: 'effect-event', cell, next: fn, value };
	} else {
		hook = { ...hook, next: fn };
	}
	owner.hooks.set(resolved, hook);
	owner.clonedHooks.add(resolved);
	return hook.value as T;
}

export function useDebugValue(): void {}

export function startTransition(fn: () => void | Promise<unknown>): void {
	if (typeof fn !== 'function') throw new TypeError('startTransition expected a function.');
	tickUniversalTransitionCount(+1);
	const parentBatch = ACTIVE_UNIVERSAL_TRANSITION_BATCH;
	const pendingBatch = IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH;
	const batch = parentBatch ?? pendingBatch ?? createUniversalTransitionBatch();
	const ownsBatch = parentBatch === null && pendingBatch === null;
	batch.pendingSignals++;
	ACTIVE_UNIVERSAL_TRANSITION_BATCH = batch;
	UNIVERSAL_TRANSITION_DEPTH++;
	let result: void | Promise<unknown>;
	let then: ((resolve: () => void, reject: () => void) => unknown) | null = null;
	try {
		result = fn();
		if ((result !== null && typeof result === 'object') || typeof result === 'function') {
			const candidate = (result as any).then;
			if (typeof candidate === 'function') then = candidate;
		}
		if (then !== null) {
			batch.pendingActions++;
			IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH = batch;
		}
	} catch (error) {
		batch.pendingSignals--;
		tickUniversalTransitionCount(-1);
		if (ownsBatch) {
			batch.closed = true;
			queueUniversalTransitionPromotion(batch);
		}
		throw error;
	} finally {
		ACTIVE_UNIVERSAL_TRANSITION_BATCH = parentBatch;
		UNIVERSAL_TRANSITION_DEPTH--;
	}
	if (ownsBatch) batch.closed = true;
	if (then !== null) {
		UNIVERSAL_ASYNC_TRANSITION_COUNT++;
		let settled = false;
		const settle = () => {
			if (settled) return;
			settled = true;
			batch.pendingActions--;
			UNIVERSAL_ASYNC_TRANSITION_COUNT--;
			if (batch.pendingActions === 0 && IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH === batch) {
				IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH = null;
			}
			queueUniversalTransitionPromotion(batch);
		};
		try {
			then.call(result, settle, settle);
		} catch (error) {
			settle();
			throw error;
		}
	} else {
		queueUniversalTransitionPromotion(batch);
	}
}

export function requestFormReset(): void {
	// Universal renderers have no intrinsic form ownership. Form bindings may
	// layer reset behavior above this host-neutral no-op.
}

function universalShallowEqual(previous: unknown, next: unknown): boolean {
	if (Object.is(previous, next)) return true;
	if (
		previous === null ||
		next === null ||
		typeof previous !== 'object' ||
		typeof next !== 'object'
	) {
		return false;
	}
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	if (previousKeys.length !== nextKeys.length) return false;
	for (const key of previousKeys) {
		if (!hasOwnProp.call(next, key) || !Object.is((previous as any)[key], (next as any)[key])) {
			return false;
		}
	}
	return true;
}

function universalComponentRevision(component: UniversalComponent<any>): number {
	const revision = (component as any)[UNIVERSAL_COMPONENT_REVISION];
	return typeof revision === 'number' ? revision : 0;
}

function mergeMemoContextReads(contextReads: Map<UniversalContext<any>, unknown> | null): void {
	if (CURRENT_MEMO_CONTEXT_READS === null || contextReads === null) return;
	for (const [context, value] of contextReads) CURRENT_MEMO_CONTEXT_READS.set(context, value);
}

export function memo<P>(
	component: UniversalComponent<P>,
	compare?: (previous: Readonly<P>, next: Readonly<P>) => boolean,
): UniversalComponent<P> {
	if (typeof component !== 'function') throw new TypeError('memo expected a component function.');
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('memo compare must be a function.');
	}
	const metadata = getComponentMetadata(component);
	const equal = compare ?? universalShallowEqual;
	const memoSlot = Symbol('octane.universal.component-memo');
	const renderMemo = (props: P, context: UniversalRenderContext) => {
		const owner = currentDraftOwner();
		const previous = owner.record.hooks.get(memoSlot) as ComponentMemoHook<P> | undefined;
		const revision = universalComponentRevision(component);
		let contextsEqual = true;
		if (
			previous?.kind === 'component-memo' &&
			previous.component === component &&
			previous.revision === revision &&
			!hasUniversalUpdatesForAttempt(owner.record) &&
			equal(previous.props, props)
		) {
			for (const [readContext, previousValue] of previous.contextReads ?? []) {
				if (!Object.is(readOwnerContext(owner, readContext, false), previousValue)) {
					contextsEqual = false;
					break;
				}
			}
			if (contextsEqual) {
				owner.seenEffects = [...owner.record.effectOrder];
				owner.hooks.set(memoSlot, previous);
				mergeMemoContextReads(previous.contextReads);
				return previous.value;
			}
		}
		const parentContextReads = CURRENT_MEMO_CONTEXT_READS;
		const contextReads = new Map<UniversalContext<any>, unknown>();
		CURRENT_MEMO_CONTEXT_READS = contextReads;
		let value: UniversalRenderable;
		try {
			value = component(props, context);
		} finally {
			CURRENT_MEMO_CONTEXT_READS = parentContextReads;
		}
		mergeMemoContextReads(contextReads.size === 0 ? null : contextReads);
		owner.hooks.set(memoSlot, {
			kind: 'component-memo',
			component,
			revision,
			props,
			value,
			contextReads: contextReads.size === 0 ? null : contextReads,
		});
		return value;
	};
	let wrapper: UniversalComponent<P>;
	if (metadata === UNIVERSAL_LAZY_METADATA) {
		// The wrapper remains renderer-neutral until the lazy module resolves; the
		// wrapped lazy component still owns loader caching and renderer validation.
		wrapper = renderMemo as UniversalComponent<P>;
		Object.defineProperty(wrapper, LAZY_COMPONENT, { value: true });
	} else {
		wrapper = defineUniversalComponent<P>(metadata.id, renderMemo, { module: metadata.module });
	}
	Object.defineProperty(wrapper, UNIVERSAL_COMPONENT_REVISION, {
		get: () => universalComponentRevision(component),
	});
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		__profileComponentSource(wrapper, component);
	}
	if ((component as any).__warm !== undefined) (wrapper as any).__warm = (component as any).__warm;
	return wrapper;
}

export function createPortal(children: UniversalRenderable, target: unknown): UniversalPortalValue {
	return Object.freeze({ $$kind: UNIVERSAL_PORTAL, children, target });
}

/** Compiler sentinel for the supported universal Activity descriptor. */
export const Activity: unique symbol = Symbol.for('octane.Activity') as any;

function runEffectCreate(hook: EffectHook): void {
	const cleanup = (hook.create as (...args: unknown[]) => void | (() => void))(
		...(hook.deps ?? []),
	);
	hook.cleanup = typeof cleanup === 'function' ? cleanup : null;
	hook.mounted = true;
}

function runEffectCleanup(hook: EffectHook): void {
	const cleanup = hook.cleanup;
	hook.cleanup = null;
	hook.mounted = false;
	cleanup?.();
}

/**
 * Root error-callback handlers live OFF the root's shape (mirroring the DOM
 * runtime's Block-keyed WeakMap): registered only for roots created with at
 * least one callback, so every other root pays a single module-null check on
 * the (already cold) error paths and UniversalRootImpl's layout is untouched.
 */
interface UniversalRootErrorHandlers {
	onCaughtError: ((error: unknown) => void) | undefined;
	onUncaughtError: ((error: unknown) => void) | undefined;
}

let UNIVERSAL_ROOT_ERROR_HANDLERS: WeakMap<
	UniversalRootImpl<any, any>,
	UniversalRootErrorHandlers
> | null = null;

function registerUniversalRootErrorHandlers(
	root: UniversalRootImpl<any, any>,
	options: UniversalRootOptions<any>,
): void {
	const { onCaughtError, onUncaughtError } = options;
	if (onCaughtError === undefined && onUncaughtError === undefined) return;
	(UNIVERSAL_ROOT_ERROR_HANDLERS ??= new WeakMap()).set(root, { onCaughtError, onUncaughtError });
}

function universalRootErrorHandlersFor(
	root: UniversalRootImpl<any, any>,
): UniversalRootErrorHandlers | null {
	if (UNIVERSAL_ROOT_ERROR_HANDLERS === null) return null;
	return UNIVERSAL_ROOT_ERROR_HANDLERS.get(root) ?? null;
}

/** A throwing report callback must not corrupt recovery — report it and move on. */
function invokeUniversalRootErrorHandler(handler: (error: unknown) => void, err: unknown): void {
	try {
		handler(err);
	} catch (handlerErr) {
		console.error(handlerErr);
	}
}

/** Report a boundary-claimed error to the owning root's onCaughtError, if any. */
function reportUniversalCaughtError(root: UniversalRootImpl<any, any>, err: unknown): void {
	const h = universalRootErrorHandlersFor(root)?.onCaughtError;
	if (h !== undefined) invokeUniversalRootErrorHandler(h, err);
}

/** True when the owning root's onUncaughtError consumed the report (callers skip their default). */
function reportUniversalUncaughtError(root: UniversalRootImpl<any, any>, err: unknown): boolean {
	const h = universalRootErrorHandlersFor(root)?.onUncaughtError;
	if (h === undefined) return false;
	invokeUniversalRootErrorHandler(h, err);
	return true;
}

function routeUniversalOwnerError(owner: UniversalOwnerRecord, error: unknown): boolean {
	for (let current = owner.parent; current !== null; current = current.parent) {
		if (!current.isBoundary || current.disposed) continue;
		current.boundaryThenable = null;
		current.boundaryError = error;
		current.hasBoundaryError = true;
		current.root.schedule();
		// The boundary took ownership of the error episode; its catch-arm replay
		// deliberately does not re-report, so this is the claim's single report.
		reportUniversalCaughtError(current.root, error);
		return true;
	}
	return false;
}

function routeUniversalOwnerSuspense(
	owner: UniversalOwnerRecord,
	thenable: PromiseLike<unknown>,
): boolean {
	for (let current = owner.parent; current !== null; current = current.parent) {
		if (!current.canHandleSuspense || current.disposed) continue;
		current.boundaryThenable = thenable;
		current.boundaryError = undefined;
		current.hasBoundaryError = false;
		const settle = () => {
			if (current.disposed || current.boundaryThenable !== thenable) return;
			current.boundaryThenable = null;
			current.root.schedule();
		};
		thenable.then(settle, settle);
		current.root.schedule();
		return true;
	}
	return false;
}

function runOwnedEffectCreate(hook: EffectHook): void {
	try {
		runEffectCreate(hook);
	} catch (error) {
		if (routeUniversalOwnerError(hook.owner, error)) return;
		if (!reportUniversalUncaughtError(hook.owner.root, error)) throw error;
	}
}

function runOwnedEffectCleanup(hook: EffectHook): void {
	try {
		runEffectCleanup(hook);
	} catch (error) {
		if (routeUniversalOwnerError(hook.owner, error)) return;
		if (!reportUniversalUncaughtError(hook.owner.root, error)) throw error;
	}
}

function runOwnedCommit(owner: UniversalOwnerRecord | null, work: () => void): void {
	try {
		work();
	} catch (error) {
		if (owner === null) throw error;
		if (routeUniversalOwnerError(owner, error)) return;
		if (!reportUniversalUncaughtError(owner.root, error)) throw error;
	}
}

function cloneSerializableValue(
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): UniversalSerializableValue {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	if (typeof value !== 'object') {
		throw new TypeError(`Unsupported serializable host value ${String(value)}.`);
	}
	if ((value as Partial<UniversalResourceHandle>).$$kind === 'octane.universal.resource') {
		throw new TypeError('A resource handle must use the resource encoding branch.');
	}
	if (seen.has(value)) throw new TypeError('Serializable host values cannot contain cycles.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			return Object.freeze(value.map((entry) => cloneSerializableValue(entry, seen)));
		}
		if (!hasCrossRealmPlainPrototype(value)) {
			throw new TypeError(
				`Serializable host values require plain objects, received ${Object.prototype.toString.call(value)}.`,
			);
		}
		const output: Record<string, UniversalSerializableValue> = {};
		for (const [name, entry] of Object.entries(value)) {
			Object.defineProperty(output, name, {
				configurable: true,
				enumerable: true,
				value: cloneSerializableValue(entry, seen),
				writable: true,
			});
		}
		return Object.freeze(output);
	} finally {
		seen.delete(value);
	}
}

function freezeUniversalHostBatch(
	renderer: string,
	version: number,
	commands: readonly UniversalHostCommand[],
): UniversalHostBatch {
	for (const command of commands) {
		if (
			(command.op === 'event' || command.op === 'lifecycle' || command.op === 'local-callback') &&
			command.listener !== null
		) {
			Object.freeze(command.listener);
		}
		Object.freeze(command);
	}
	return Object.freeze({
		renderer,
		version,
		commands: Object.freeze(commands),
	});
}

function collectEffectEventCells(owners: readonly UniversalOwnerRecord[]): EffectEventCell[] {
	const cells: EffectEventCell[] = [];
	for (const owner of owners) {
		for (const hook of owner.hooks.values()) {
			if (hook.kind === 'effect-event') cells.push(hook.cell);
		}
	}
	return cells;
}

function deactivateEffectEventCells(cells: readonly EffectEventCell[]): void {
	for (const cell of cells) cell.active = false;
}

function snapshotHostAttachmentIds(value: readonly number[], label: string): readonly number[] {
	if (!Array.isArray(value)) {
		throw new TypeError(`Universal host attachment ${label} must be an array.`);
	}
	const ids: number[] = [];
	const seen = new Set<number>();
	for (const id of value) {
		if (!Number.isSafeInteger(id) || id <= 0) {
			throw new TypeError(`Universal host attachment ${label} IDs must be positive safe integers.`);
		}
		if (!seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}
	return Object.freeze(ids);
}

function snapshotHostAttachmentBatch(
	batch: UniversalHostAttachmentBatch,
): UniversalHostAttachmentBatch {
	if (batch === null || typeof batch !== 'object' || Array.isArray(batch)) {
		throw new TypeError('A universal host attachment batch must be an object.');
	}
	return Object.freeze({
		detached: snapshotHostAttachmentIds(batch.detached, 'detached'),
		attached: snapshotHostAttachmentIds(batch.attached, 'attached'),
	});
}

function logicalRecordDepth(record: LogicalRecord): number {
	let depth = 0;
	for (let parent = record.parent; parent !== null; parent = parent.parent) depth++;
	return depth;
}

interface UniversalHostAttachmentState {
	registration: UniversalHostAttachmentRegistration | null;
	readonly records: Map<number, LogicalRecord>;
	readonly pending: UniversalHostAttachmentBatch[];
	flushScheduled: boolean;
}

interface UniversalPortalHandleEntry {
	readonly handle: UniversalPortalTargetHandle;
	registrations: number;
	pending: number;
}

class UniversalRootImpl<Container, PublicInstance> implements UniversalRoot<any> {
	readonly renderer: string;
	private readonly rootRecord: LogicalRecord;
	private readonly universalIdRoot = NEXT_UNIVERSAL_ID_ROOT++;
	private readonly resourceRoot = NEXT_RESOURCE_ROOT++;
	private readonly portalRoot = NEXT_PORTAL_ROOT++;
	private readonly transportRoot = NEXT_TRANSPORT_ROOT++;
	private readonly portalHandles = new Map<string | number, UniversalPortalHandleEntry>();
	private owner: UniversalOwnerRecord | null = null;
	private bridge: BoundaryOwner | null = null;
	private bridgeContextReads: Map<UniversalContext<any>, unknown> | null = null;
	private unmounted = false;
	private unmounting = false;
	private unmountPromise: Promise<void> | null = null;
	private asyncWork: Promise<void> = Promise.resolve();
	private asyncWorkError: unknown = NO_PENDING_PASSIVE_ERROR;
	private nextId = 1;
	private nextLogicalRangeId = -1;
	private nextUniversalId = 1;
	private nextListener = NEXT_EVENT_ROOT++ * 1_000_000;
	private nextBatchVersion = 1;
	private acceptedBatchVersion = 0;
	private treeFeatures = 0;
	private handlers = new Map<number, CommittedEvent>();
	private eventDefinitions: Map<string, UniversalEventDefinition | null> | null = null;
	private staticHostProps: WeakMap<
		UniversalHostPlan,
		Readonly<Record<string, unknown>> | null
	> | null = null;
	private templatePrograms: WeakMap<
		CompiledCollapsedTemplateProgram,
		PreparedCollapsedTemplateProgram | null
	> | null = null;
	private localCallbacks = new Map<number, CommittedHostCallback>();
	private readonly publishedListeners = new Set<number>();
	private pending: UniversalTransactionImpl<Container, PublicInstance> | null = null;
	private suspended: UniversalSuspendedAttemptImpl | null = null;
	private urgentBoundarySuspension: UniversalSuspendedAttemptImpl | null = null;
	private awaitingReplay: SuspendedMemoReplay | null = null;
	private queuedReplay: SuspendedMemoReplay | null = null;
	private rootRetryAttempt: UniversalSuspendedAttemptImpl | null = null;
	private lastComponent: UniversalComponent<any> | null = null;
	private lastProps: any;
	private retryRenderInput: readonly [UniversalComponent<any>, any] | null = null;
	private scheduled = false;
	private scheduledUrgent = false;
	private scheduledFullRoot = false;
	private readonly scheduledOwners = new Set<UniversalOwnerRecord>();
	private scheduledPreparationDepth = 0;
	// The current dirty epoch: scheduleOwned() stamps it on the scheduled owner
	// and its ancestors, and prepare() bumps it as it consumes the batch, so an
	// attempt recognizes exactly the owners scheduled into it.
	private dirtyEpoch = 1;
	private attemptDirtyEpoch = 0;
	private attemptFullRootScheduled = false;
	private readonly scheduledTransitionBatches = new Set<UniversalTransitionBatch>();
	private readonly unattemptedTransitionBatches = new Set<UniversalTransitionBatch>();
	private eventScopeDepth = 0;
	private eventScopePriority: UniversalEventPriority | null = null;
	private eventScopeHandlers: ReadonlyMap<number, CommittedEvent> | null = null;
	private passiveScheduled = false;
	private readonly passiveTasks: (() => void)[] = [];
	private hostAttachments: UniversalHostAttachmentState | null = null;
	private collapsedTemplates: Set<LogicalRecord> | null = null;

	constructor(
		private readonly container: Container,
		private readonly driver: UniversalHostDriver<Container, PublicInstance>,
		private readonly transport:
			UniversalCommitTransport<Container> | UniversalAsyncCommitTransport<Container> | null,
		private readonly microtaskScheduler: ((callback: () => void) => void) | null,
	) {
		assertRendererId(driver.id, 'Universal driver id');
		if (transport?.mode === 'async' && driver.capabilities?.localHostCallbacks === true) {
			throw new Error(
				'Universal async transports do not support the local host callback capability.',
			);
		}
		this.renderer = driver.id;
		this.rootRecord = {
			id: 0,
			kind: 'range',
			key: null,
			type: null,
			props: {},
			ref: null,
			refCleanup: null,
			refAttached: false,
			owner: null,
			events: new Map(),
			lifecycles: new Map(),
			localCallbacks: new Map(),
			visibility: 'visible',
			portalRegistration: null,
			parent: null,
			children: [],
		};
		this.initializeHostAttachments();
	}

	private initializeHostAttachments(): void {
		const capability = this.driver.attachments;
		if (capability === undefined) return;
		if (typeof capability.subscribe !== 'function') {
			throw new TypeError('A universal host attachment capability must provide subscribe().');
		}
		const state: UniversalHostAttachmentState = {
			registration: null,
			records: new Map(),
			pending: [],
			flushScheduled: false,
		};
		this.hostAttachments = state;
		let registration: unknown;
		try {
			registration = capability.subscribe(this.container, (batch) =>
				this.receiveHostAttachmentBatch(batch),
			);
			if (registration === null || typeof registration !== 'object') {
				throw new TypeError('A universal host attachment subscription must return a registration.');
			}
			const candidate = registration as Partial<UniversalHostAttachmentRegistration>;
			if (typeof candidate.isAttached !== 'function') {
				throw new TypeError('A universal host attachment registration must provide isAttached().');
			}
			if (typeof candidate.unsubscribe !== 'function') {
				throw new TypeError('A universal host attachment registration must provide unsubscribe().');
			}
			state.registration = candidate as UniversalHostAttachmentRegistration;
			this.flushPendingHostAttachmentBatches();
		} catch (error) {
			this.hostAttachments = null;
			try {
				const unsubscribe = (registration as Partial<UniversalHostAttachmentRegistration> | null)
					?.unsubscribe;
				if (typeof unsubscribe === 'function') {
					unsubscribe.call(registration);
				}
			} catch {
				// Preserve the construction failure that made this registration unusable.
			}
			throw error;
		}
	}

	private receiveHostAttachmentBatch(batch: UniversalHostAttachmentBatch): void {
		const state = this.hostAttachments;
		if (state === null || this.unmounted) return;
		const snapshot = snapshotHostAttachmentBatch(batch);
		if (snapshot.detached.length === 0 && snapshot.attached.length === 0) return;
		state.pending.push(snapshot);
		if (state.registration === null || this.unmounting) return;
		if (
			CURRENT_ATTEMPT !== null ||
			UNIVERSAL_COMMIT_TASK_DEPTH > 0 ||
			this.pending?.isAwaitingTransportAcknowledgement()
		) {
			this.queueHostAttachmentFlush();
			return;
		}
		this.flushPendingHostAttachmentBatches();
	}

	private queueHostAttachmentFlush(): void {
		const state = this.hostAttachments;
		if (
			state === null ||
			state.flushScheduled ||
			state.pending.length === 0 ||
			this.unmounted ||
			this.unmounting
		) {
			return;
		}
		state.flushScheduled = true;
		this.__scheduleMicrotask(() => {
			state.flushScheduled = false;
			if (this.hostAttachments !== state || this.unmounted) {
				state.pending.splice(0);
				return;
			}
			if (this.unmounting || this.pending?.isAwaitingTransportAcknowledgement()) return;
			this.flushPendingHostAttachmentBatches();
		});
	}

	private readHostAttachment(id: number): boolean {
		const registration = this.hostAttachments?.registration ?? null;
		if (registration === null) return true;
		const attached = registration.isAttached(id);
		if (typeof attached !== 'boolean') {
			throw new TypeError('Universal host attachment isAttached() must return a boolean.');
		}
		return attached;
	}

	private attachHostRef(record: LogicalRecord): void {
		if (
			this.hostAttachments?.registration == null ||
			this.unmounted ||
			record.visibility !== 'visible'
		) {
			return;
		}
		if (!this.readHostAttachment(record.id)) return;
		const value = this.driver.getPublicInstance(this.container, record.id);
		// A recycling-aware driver must not publish a ref until both its attachment
		// state and public instance agree.
		if (value === null) return;
		attachRef(record, value);
	}

	private processHostAttachmentBatch(
		batch: UniversalHostAttachmentBatch,
		forcedDetaches?: ReadonlySet<number>,
	): void {
		const state = this.hostAttachments;
		if (state === null || state.registration === null) return;
		const records = state.records;
		const ordered = (ids: readonly number[], childFirst: boolean): LogicalRecord[] =>
			ids
				.map((id, index) => {
					const record = records.get(id);
					return {
						record,
						index,
						depth: record === undefined ? 0 : logicalRecordDepth(record),
					};
				})
				.filter(
					(entry): entry is { record: LogicalRecord; index: number; depth: number } =>
						entry.record?.kind === 'host',
				)
				.sort((left, right) => {
					const depth = left.depth - right.depth;
					return (childFirst ? -depth : depth) || left.index - right.index;
				})
				.map((entry) => entry.record);
		const tasks: (() => void)[] = [];
		for (const record of ordered(batch.detached, false)) {
			tasks.push(() => {
				if (
					this.unmounted ||
					records.get(record.id) !== record ||
					!record.refAttached ||
					(this.readHostAttachment(record.id) && !forcedDetaches?.has(record.id))
				) {
					return;
				}
				runOwnedCommit(record.owner, () => detachRef(record));
			});
		}
		for (const record of ordered(batch.attached, true)) {
			tasks.push(() => {
				if (
					this.unmounted ||
					records.get(record.id) !== record ||
					record.ref == null ||
					record.refAttached ||
					record.visibility !== 'visible' ||
					!this.readHostAttachment(record.id)
				) {
					return;
				}
				runOwnedCommit(record.owner, () => this.attachHostRef(record));
			});
		}
		runCommitTasks(tasks);
	}

	private flushPendingHostAttachmentBatches(): void {
		const state = this.hostAttachments;
		if (
			state === null ||
			state.pending.length === 0 ||
			state.registration === null ||
			this.unmounted ||
			this.unmounting ||
			this.pending?.isAwaitingTransportAcknowledgement()
		) {
			return;
		}
		const batches = state.pending.splice(0);
		const forcedDetaches = batches.map(() => new Set<number>());
		const laterAttachments = new Set<number>();
		// When detach + reattach happen while a commit acknowledgement gates ref
		// work, the current state is already attached by the time we drain. Preserve
		// one cleanup/attach cycle for that physical replacement instead of treating
		// the earlier detach as stale.
		for (let index = batches.length - 1; index >= 0; index--) {
			const batch = batches[index]!;
			for (const id of batch.attached) laterAttachments.add(id);
			for (const id of batch.detached) {
				if (laterAttachments.has(id)) forcedDetaches[index]!.add(id);
			}
		}
		// A failing user ref must not strand later physical notifications that were
		// already accepted into this flush.
		runCommitTasks(
			batches.map(
				(batch, index) => () => this.processHostAttachmentBatch(batch, forcedDetaches[index]),
			),
		);
	}

	private disposeHostAttachments(): void {
		const state = this.hostAttachments;
		if (state === null) return;
		const registration = state.registration;
		this.hostAttachments = null;
		state.registration = null;
		state.records.clear();
		state.pending.splice(0);
		state.flushScheduled = false;
		registration?.unsubscribe();
	}

	/** @internal Shared with the DOM-owned boundary facade. */
	__scheduleMicrotask(callback: () => void): void {
		if (this.microtaskScheduler !== null) {
			this.microtaskScheduler(callback);
			return;
		}
		const scheduler = readGlobalMicrotaskScheduler();
		if (scheduler === undefined) {
			throw new Error('The global queueMicrotask scheduler became unavailable.');
		}
		scheduler.call(globalThis, callback);
	}

	/** @internal Shared with the DOM-owned boundary facade. */
	__runCommitTasks(tasks: readonly (() => void)[]): void {
		runCommitTasks(tasks);
	}

	private hasAsyncTransport(): boolean {
		return this.transport?.mode === 'async';
	}

	private enqueueAsyncWork(work: () => Promise<void>): void {
		const run = async () => {
			try {
				await work();
			} catch (error) {
				if (this.asyncWorkError === NO_PENDING_PASSIVE_ERROR) this.asyncWorkError = error;
			}
		};
		this.asyncWork = this.asyncWork.then(run, run);
	}

	private flushQueuedTransportWork(): void {
		if (this.unmounted || this.unmounting) return;
		if (this.scheduled) this.flushScheduledWork();
		const replay = this.queuedReplay;
		if (this.bridge === null && replay !== null && replay.active) this.runReplay(replay);
	}

	async flushTransport(): Promise<void> {
		while (true) {
			const unmount = this.unmountPromise;
			if (unmount !== null) {
				try {
					await unmount;
				} catch {
					// The direct unmountAsync() caller owns teardown completion errors.
					// A pre-ACK rejection may have resumed scheduler/replay work that this
					// flush must still drain.
				}
			}
			this.flushQueuedTransportWork();
			const pending = this.asyncWork;
			await pending;
			if (this.unmountPromise !== null || (this.unmounting && !this.unmounted)) continue;
			if (
				pending === this.asyncWork &&
				(this.unmounted ||
					(!this.scheduled &&
						(this.bridge !== null || this.queuedReplay === null || !this.queuedReplay.active)))
			) {
				break;
			}
		}
		if (this.asyncWorkError !== NO_PENDING_PASSIVE_ERROR) {
			const error = this.asyncWorkError;
			this.asyncWorkError = NO_PENDING_PASSIVE_ERROR;
			throw error;
		}
	}

	private transportIdentity(version: number): UniversalTransportIdentity {
		return Object.freeze({
			protocol: UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
			renderer: this.renderer,
			root: this.transportRoot,
			version,
		});
	}

	validateTransportAcknowledgement(
		message: UniversalTransportAcknowledgement,
		version: number,
	): void {
		this.validateTransportIdentity(message, version, 'acknowledgement');
		if (message.type !== 'ack') {
			throw new Error(`Universal transport expected an acknowledgement for batch ${version}.`);
		}
	}

	private validateTransportIdentity(
		message: UniversalTransportIdentity,
		version: number,
		label: string,
	): void {
		if (message.protocol !== UNIVERSAL_TRANSPORT_PROTOCOL_VERSION) {
			throw new Error(
				`Universal transport ${label} uses protocol ${String(message.protocol)}; expected ${UNIVERSAL_TRANSPORT_PROTOCOL_VERSION}.`,
			);
		}
		if (message.renderer !== this.renderer) {
			throw new Error(
				`Universal transport ${label} renderer ${JSON.stringify(message.renderer)} does not match ${JSON.stringify(this.renderer)}.`,
			);
		}
		if (message.root !== this.transportRoot) {
			throw new Error(`Universal transport ${label} belongs to a stale or foreign root.`);
		}
		if (message.version !== version) {
			throw new Error(
				`Universal transport ${label} version ${message.version} does not match batch ${version}.`,
			);
		}
	}

	markBatchAccepted(version: number): void {
		if (version <= this.acceptedBatchVersion) {
			throw new Error(
				`Universal transport rejected stale accepted batch version ${version}; current version is ${this.acceptedBatchVersion}.`,
			);
		}
		this.acceptedBatchVersion = version;
	}

	setBridge(bridge: BoundaryOwner): void {
		if (this.bridge !== null && this.bridge !== bridge) {
			throw new Error('A universal root cannot be owned by more than one host boundary.');
		}
		this.bridge = bridge;
	}

	clearBridge(bridge: BoundaryOwner): void {
		if (this.bridge === bridge) this.bridge = null;
	}

	readBridgeContext<T>(context: UniversalContext<T>): T {
		const value = this.bridge === null ? context.defaultValue : this.bridge.readContext(context);
		if (this.bridge !== null && CURRENT_ATTEMPT?.root === this) {
			(CURRENT_ATTEMPT.bridgeContextReads ??= new Map()).set(context, value);
		}
		return value;
	}

	rootRecordForRetention(): LogicalRecord {
		return this.rootRecord;
	}

	formatUniversalId(index: number): string {
		// Cantor pairing keeps IDs distinct across roots without reserving draft
		// IDs globally. The per-root index advances only when a transaction is
		// accepted, so abandoned work can reuse the same opaque ID.
		const sum = this.universalIdRoot + index;
		const paired = (sum * (sum + 1)) / 2 + index;
		return `:octane-u${paired.toString(36)}:`;
	}

	classifyEvent(name: string): UniversalEventDefinition | null {
		const capability = this.driver.events;
		if (capability === undefined) return null;
		const definitions = (this.eventDefinitions ??= new Map());
		const cached = definitions.get(name);
		if (cached !== undefined) return cached;
		const definition = capability.classify(name) ?? null;
		if (definitions.size < 128) definitions.set(name, definition);
		return definition;
	}

	materializeStaticHostProps(node: UniversalHostPlan): Record<string, unknown> | null {
		if (node.propsSlot !== undefined || (node.bindings?.length ?? 0) !== 0) return null;
		const source = node.props ?? EMPTY_STATIC_HOST_PROPS;
		if (source === EMPTY_STATIC_HOST_PROPS) return EMPTY_STATIC_HOST_PROPS;
		if (
			this.driver.props !== undefined &&
			this.driver.capabilities?.stableStaticHostProps !== true
		) {
			return null;
		}
		const cache = (this.staticHostProps ??= new WeakMap());
		const cached = cache.get(node);
		if (cached !== undefined) return cached as Record<string, unknown> | null;
		if (Object.getOwnPropertySymbols(source).length !== 0) {
			cache.set(node, null);
			return null;
		}
		const names = Object.keys(source);
		for (const name of names) {
			const value = source[name];
			if (
				name === 'ref' ||
				name === 'key' ||
				name === 'children' ||
				name.startsWith('main-thread:') ||
				(value !== null &&
					(typeof value === 'object' ||
						typeof value === 'function' ||
						typeof value === 'symbol')) ||
				this.classifyLifecycle(name, value) !== null ||
				this.classifyLocalCallback(name, value) !== null ||
				this.classifyEvent(name) !== null
			) {
				cache.set(node, null);
				return null;
			}
		}
		let props = source as Record<string, unknown>;
		for (const name of names) {
			const encoded = this.encodeHostProp(node.type, name, source[name]);
			if (!Object.is(encoded, source[name])) {
				if (props === source) props = { ...source };
				props[name] = encoded;
			}
		}
		Object.freeze(props);
		cache.set(node, props);
		return props;
	}

	prepareCollapsedTemplateProgram(
		compiled: CompiledCollapsedTemplateProgram,
	): PreparedCollapsedTemplateProgram | null {
		if (
			this.driver.capabilities?.templateProgramMount !== true ||
			this.driver.capabilities?.stableStaticHostProps !== true ||
			this.textPolicy() !== 'host'
		) {
			return null;
		}
		const cache = (this.templatePrograms ??= new WeakMap());
		const cached = cache.get(compiled);
		if (cached !== undefined) return cached;
		const wireNodes: UniversalHostTemplateProgramNode[] = [];
		const wireEvents: UniversalHostTemplateProgramEvent[] = [];
		const values: PreparedCollapsedTemplateValue[] = [];
		const events: PreparedCollapsedTemplateEvent[] = [];
		const sharedNodes: (BlueprintCollapsedTemplateNode | null)[] = [];
		const reject = (): null => {
			cache.set(compiled, null);
			return null;
		};
		for (let index = 0; index < compiled.plans.length; index++) {
			const node = compiled.plans[index];
			const shape = compiled.shape[index];
			if (node.kind === 'slot' || node.kind === 'text') {
				if (node.kind === 'text' && node.slot === undefined) {
					const props = Object.freeze({ value: String(node.value ?? '') });
					wireNodes.push(Object.freeze({ type: shape.type, parent: shape.parent, props }));
					sharedNodes.push(Object.freeze({ props }));
				} else {
					const valueIndex = values.length;
					values.push({ node: index, name: 'value', slot: node.slot!, text: true });
					const binding = Object.freeze({ name: 'value', valueIndex });
					wireNodes.push(
						Object.freeze({
							type: shape.type,
							parent: shape.parent,
							props: EMPTY_STATIC_HOST_PROPS,
							bindings: Object.freeze([binding]),
						}),
					);
					sharedNodes.push(null);
				}
				continue;
			}
			const source = node.props ?? EMPTY_STATIC_HOST_PROPS;
			const overwritten = new Set<string>();
			for (const [name] of node.bindings ?? []) {
				if (overwritten.has(name)) return reject();
				overwritten.add(name);
			}
			let staticProps: Record<string, unknown>;
			if (overwritten.size === 0) {
				const shared = this.materializeStaticHostProps(node);
				if (shared === null) return reject();
				staticProps = shared;
			} else {
				let output: Record<string, unknown> | null = null;
				for (const name of Object.keys(source)) {
					if (overwritten.has(name)) continue;
					const entry = source[name];
					if (
						!isUniversalHostTemplateProgramValue(entry) ||
						this.classifyLifecycle(name, entry) !== null ||
						this.classifyLocalCallback(name, entry) !== null ||
						this.classifyEvent(name) !== null
					) {
						return reject();
					}
					const encoded = this.encodeHostProp(node.type, name, entry);
					if (!isUniversalHostTemplateProgramValue(encoded)) return reject();
					(output ??= {})[name] = encoded;
				}
				staticProps = output === null ? EMPTY_STATIC_HOST_PROPS : Object.freeze(output);
			}
			const bindings: UniversalHostTemplateProgramBinding[] = [];
			let eventful = false;
			const types = new Set<string>();
			for (const [name, slot] of node.bindings ?? []) {
				const definition = this.classifyEvent(name);
				if (definition !== null) {
					if (index === 0 || types.has(definition.type)) return reject();
					types.add(definition.type);
					const priority = definition.priority ?? 'default';
					wireEvents.push(Object.freeze({ node: index, type: definition.type, priority }));
					events.push({ node: index, prop: name, slot, type: definition.type, priority });
					eventful = true;
					continue;
				}
				const valueIndex = values.length;
				values.push({ node: index, name, slot, text: false });
				bindings.push(Object.freeze({ name, valueIndex }));
			}
			wireNodes.push(
				Object.freeze({
					type: shape.type,
					parent: shape.parent,
					props: staticProps,
					...(bindings.length === 0 ? null : { bindings: Object.freeze(bindings) }),
				}),
			);
			sharedNodes.push(
				bindings.length === 0 && !eventful ? Object.freeze({ props: staticProps }) : null,
			);
		}
		const prepared = Object.freeze({
			wire: Object.freeze({ nodes: Object.freeze(wireNodes), events: Object.freeze(wireEvents) }),
			values: Object.freeze(values),
			events: Object.freeze(events),
			sharedNodes: Object.freeze(sharedNodes),
		});
		cache.set(compiled, prepared);
		return prepared;
	}

	private expandCollapsedTemplate(record: LogicalRecord): void {
		const state = record.collapsedTemplate;
		if (state === undefined) return;
		const events = new Map<number, Map<string, CommittedEvent>>();
		for (const entry of state.events) {
			let current = events.get(entry.index);
			if (current === undefined) events.set(entry.index, (current = new Map()));
			current.set(entry.event.type, entry.event);
		}
		const records: LogicalRecord[] = [record];
		for (let index = 1; index < state.shape.length; index++) {
			const node = materializeCommittedCollapsedNode(state, index);
			const child: LogicalRecord = {
				id: node.id ?? state.firstId! + index,
				kind: 'host',
				key: null,
				type: state.shape[index].type,
				props: node.props as Record<string, unknown>,
				ref: null,
				refCleanup: null,
				refAttached: false,
				owner: state.owner,
				events: events.get(index) ?? EMPTY_COMMITTED_EVENTS,
				lifecycles: EMPTY_COMMITTED_HOST_CALLBACKS,
				localCallbacks: EMPTY_COMMITTED_HOST_CALLBACKS,
				visibility: 'visible',
				portalRegistration: null,
				parent: records[state.shape[index].parent],
				children: [],
			};
			records.push(child);
			child.parent!.children.push(child);
		}
		delete record.collapsedTemplate;
		this.collapsedTemplates?.delete(record);
	}

	private expandCollapsedTemplates(): void {
		const records = this.collapsedTemplates;
		if (records === null || records.size === 0) return;
		for (const record of [...records]) this.expandCollapsedTemplate(record);
	}

	classifyLifecycle(name: string, value: unknown): UniversalHostCallbackDefinition | null {
		return this.driver.lifecycles?.classify(name, value) ?? null;
	}

	classifyLocalCallback(name: string, value: unknown): UniversalHostCallbackDefinition | null {
		return this.driver.localCallbacks?.classify(name, value) ?? null;
	}

	textPolicy(): UniversalTextPolicy {
		return this.driver.capabilities?.text ?? 'reject';
	}

	driverCapabilities(): UniversalHostCapabilities {
		return this.driver.capabilities ?? {};
	}

	canCompactCompilerLeafProps(): boolean {
		return (
			this.transport === null &&
			this.driver.props === undefined &&
			this.driver.capabilities?.compilerLeafProps === true
		);
	}

	private acquirePortalTargetHandle(
		id: string | number,
		pendingEntries: UniversalPortalHandleEntry[],
	): UniversalPortalTargetHandle {
		if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
			throw new TypeError(
				'A universal portal target handle ID must be a non-empty string or number.',
			);
		}
		let entry = this.portalHandles.get(id);
		if (entry === undefined) {
			entry = {
				handle: Object.freeze({
					$$kind: 'octane.universal.portal-target' as const,
					renderer: this.renderer,
					root: this.portalRoot,
					id,
				}),
				registrations: 0,
				pending: 0,
			};
			this.portalHandles.set(id, entry);
		}
		entry.pending++;
		pendingEntries.push(entry);
		return entry.handle;
	}

	private releasePortalHandleEntry(entry: UniversalPortalHandleEntry): void {
		if (
			entry.registrations === 0 &&
			entry.pending === 0 &&
			this.portalHandles.get(entry.handle.id) === entry
		) {
			this.portalHandles.delete(entry.handle.id);
		}
	}

	private preparePortalTarget(target: unknown): UniversalPortalTargetRegistration {
		const capability = this.driver.portals;
		if (capability === undefined) {
			throw new Error(
				`Universal renderer ${JSON.stringify(this.renderer)} does not declare the portal capability.`,
			);
		}
		const pendingEntries: UniversalPortalHandleEntry[] = [];
		let release: (() => void) | null = null;
		try {
			const registration = capability.prepareTarget({
				container: this.container,
				renderer: this.renderer,
				target,
				transported: this.transport !== null,
				createPortalTargetHandle: (id) => this.acquirePortalTargetHandle(id, pendingEntries),
			});
			release =
				registration !== null &&
				typeof registration === 'object' &&
				typeof registration.release === 'function'
					? registration.release.bind(registration)
					: null;
			if (registration === null || typeof registration !== 'object' || release === null) {
				throw new TypeError(
					'A universal portal capability must return a valid target registration.',
				);
			}
			const handle = registration.handle;
			const entry =
				handle !== null && typeof handle === 'object'
					? this.portalHandles.get(handle.id)
					: undefined;
			if (
				handle?.$$kind !== 'octane.universal.portal-target' ||
				handle.renderer !== this.renderer ||
				handle.root !== this.portalRoot ||
				(typeof handle.id !== 'string' && typeof handle.id !== 'number') ||
				entry?.handle !== handle
			) {
				throw new Error(
					`Universal portal target handle does not belong to renderer ${JSON.stringify(this.renderer)} and this root.`,
				);
			}
			const registrationRelease = release;
			let released = false;
			const prepared = Object.freeze({
				handle,
				release: () => {
					if (released) return;
					released = true;
					try {
						registrationRelease();
					} finally {
						entry.registrations--;
						this.releasePortalHandleEntry(entry);
					}
				},
			});
			entry.registrations++;
			return prepared;
		} catch (error) {
			try {
				release?.();
			} catch {
				// Preserve the capability-contract diagnostic that invalidated the registration.
			}
			throw error;
		} finally {
			for (const entry of pendingEntries) {
				entry.pending--;
				this.releasePortalHandleEntry(entry);
			}
		}
	}

	encodeHostProp(hostType: string, name: string, value: unknown): unknown {
		const codec = this.driver.props;
		if (codec === undefined) {
			// A local driver may intentionally accept renderer-owned objects. Once a
			// transport is present, however, every ordinary prop must satisfy the wire
			// value contract even when the renderer did not install a custom codec.
			return this.transport === null ? value : cloneSerializableValue(value);
		}
		const result = codec.encode({
			container: this.container,
			renderer: this.renderer,
			hostType,
			name,
			value,
			createResourceHandle: (id) => {
				if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
					throw new TypeError(
						'A universal resource handle ID must be a non-empty string or number.',
					);
				}
				return Object.freeze({
					$$kind: 'octane.universal.resource' as const,
					renderer: this.renderer,
					root: this.resourceRoot,
					id,
				});
			},
		});
		if (result === null || typeof result !== 'object') {
			throw new TypeError(
				`Universal prop codec for ${JSON.stringify(name)} returned an invalid result.`,
			);
		}
		if (result.kind === 'unsupported') {
			throw new TypeError(
				result.reason ??
					`Universal renderer ${JSON.stringify(this.renderer)} does not support host prop ${JSON.stringify(name)}.`,
			);
		}
		if (result.kind === 'value') return cloneSerializableValue(result.value);
		if (result.kind !== 'resource') {
			throw new TypeError(
				`Universal prop codec for ${JSON.stringify(name)} returned unknown encoding ${JSON.stringify((result as any).kind)}.`,
			);
		}
		const handle = result.handle;
		if (
			handle?.$$kind !== 'octane.universal.resource' ||
			handle.renderer !== this.renderer ||
			handle.root !== this.resourceRoot ||
			(typeof handle.id !== 'string' && typeof handle.id !== 'number')
		) {
			throw new Error(
				`Universal resource handle for ${JSON.stringify(name)} does not belong to renderer ${JSON.stringify(this.renderer)} and this root.`,
			);
		}
		return handle;
	}

	eventScope<T>(priority: UniversalEventPriority, run: () => T): T {
		if (priority !== 'discrete' && priority !== 'continuous' && priority !== 'default') {
			throw new TypeError(`Unknown universal event priority ${JSON.stringify(priority)}.`);
		}
		if (this.eventScopeDepth > 0) {
			if (this.eventScopePriority !== priority) {
				throw new Error(
					`Nested universal event scopes must retain priority ${JSON.stringify(this.eventScopePriority)}.`,
				);
			}
			this.eventScopeDepth++;
			try {
				return run();
			} finally {
				this.eventScopeDepth--;
			}
		}
		this.eventScopeDepth = 1;
		this.eventScopePriority = priority;
		this.eventScopeHandlers = this.handlers;
		if (priority === 'discrete') UNIVERSAL_DISCRETE_EVENT_DEPTH++;
		try {
			return run();
		} finally {
			if (priority === 'discrete') UNIVERSAL_DISCRETE_EVENT_DEPTH--;
			this.eventScopeDepth = 0;
			this.eventScopePriority = null;
			this.eventScopeHandlers = null;
			if (this.scheduled) {
				if (priority === 'discrete') this.flushScheduledWork();
				else this.queueScheduledWork();
			}
		}
	}

	dispatchEvent(listener: number, payload: unknown): unknown {
		if (this.eventScopeDepth === 0) {
			const event = this.handlers.get(listener);
			if (event === undefined || event.owner.disposed) {
				throw new Error(`Unknown or inactive universal event listener ${listener}.`);
			}
			return this.eventScope(event.priority, () => this.dispatchEvent(listener, payload));
		}
		const event = this.eventScopeHandlers!.get(listener);
		if (event === undefined) {
			throw new Error(`Unknown or inactive universal event listener ${listener}.`);
		}
		let result: unknown;
		try {
			result = event.handler(payload);
		} catch (error) {
			if (!routeUniversalOwnerError(event.owner, error)) throw error;
		}
		return result;
	}

	dispatchTransportEvent(message: UniversalTransportEventMessage): readonly unknown[] {
		if (this.unmounted) {
			throw new Error('Cannot dispatch a transported event to an unmounted universal root.');
		}
		this.validateTransportIdentity(message, this.acceptedBatchVersion, 'event');
		if (message.type !== 'event') {
			throw new Error('Universal transport expected an event message.');
		}
		if (
			message.priority !== 'discrete' &&
			message.priority !== 'continuous' &&
			message.priority !== 'default'
		) {
			throw new TypeError(`Unknown universal event priority ${JSON.stringify(message.priority)}.`);
		}
		// Validate the complete propagation batch before invoking any callback. A
		// renderer must not be able to prefix a stale or priority-forged listener
		// with a valid delivery and thereby partially dispatch an invalid message.
		for (const { listener } of message.deliveries) {
			const event = this.handlers.get(listener);
			if (event === undefined || event.owner.disposed) {
				throw new Error(`Unknown or inactive universal event listener ${listener}.`);
			}
			if (event.priority !== message.priority) {
				throw new Error(
					`Universal event listener ${listener} has priority ${JSON.stringify(event.priority)}, not transported priority ${JSON.stringify(message.priority)}.`,
				);
			}
		}

		let errors: unknown[] | null = null;
		const results = this.eventScope(message.priority, () => {
			const values = new Array<unknown>(message.deliveries.length);
			for (let index = 0; index < message.deliveries.length; index++) {
				const { listener, payload } = message.deliveries[index];
				try {
					values[index] = this.dispatchEvent(listener, payload);
				} catch (error) {
					(errors ??= []).push(error);
				}
			}
			return values;
		});
		// TypeScript does not model assignments made by the event-scope callback.
		const dispatchedErrors = errors as unknown[] | null;
		if (dispatchedErrors !== null) {
			if (dispatchedErrors.length === 1) throw dispatchedErrors[0];
			throw typeof AggregateError === 'function'
				? new AggregateError(dispatchedErrors, 'Multiple universal event listeners failed.')
				: dispatchedErrors[0];
		}
		return results;
	}

	invokeLocalCallback(listener: number, args: readonly unknown[]): unknown {
		const callback = this.localCallbacks.get(listener);
		if (callback === undefined || callback.owner.disposed) {
			throw new Error(`Unknown or inactive universal local callback ${listener}.`);
		}
		let result: unknown;
		runOwnedCommit(callback.owner, () => {
			result = callback.handler(...args);
		});
		if (typeof result !== 'function') return result;
		const cleanup = result as () => void;
		return () => runOwnedCommit(callback.owner, cleanup);
	}

	private scheduledRenderInput(): readonly [UniversalComponent<any>, any] | null {
		// A transition retry can inherit newer explicit props from an urgent
		// suspension. Preserve that desired input if another urgent state update
		// arrives before the resource settles; falling back to lastProps would
		// accidentally recommit the older accepted input.
		const pendingInput =
			this.suspended ?? (this.queuedReplay?.active === true ? this.queuedReplay : null);
		const component = pendingInput?.component ?? this.retryRenderInput?.[0] ?? this.lastComponent;
		if (component === null) return null;
		return [component, pendingInput?.props ?? this.retryRenderInput?.[1] ?? this.lastProps];
	}

	private retryRejectedScheduledAttempt(
		attempt: UniversalPreparedAttempt,
		component: UniversalComponent<any>,
		props: any,
	): void {
		if (attempt.status !== 'aborted' || this.unmounted || this.unmounting) return;
		// A pre-ACK rejection publishes neither the cloned hook cells nor their
		// consumed queues. Keep the desired input and raise a fresh urgent pass;
		// post-ACK errors report a committed status and must never replay. A
		// transition-only abort may take one harmless urgent pass before its requeued
		// lane runs, which is preferable to missing coalesced lane-free work.
		this.retryRenderInput = [component, props];
		this.schedule();
	}

	private restoreRejectedReplay(
		attempt: UniversalPreparedAttempt,
		replay: SuspendedMemoReplay,
	): void {
		if (attempt.status !== 'aborted' || this.unmounted || this.unmounting) return;
		if (this.queuedReplay !== null && this.queuedReplay !== replay && this.queuedReplay.active) {
			return;
		}
		// Transaction.finish() requeues transition batches after a pre-ACK abort.
		// A transition replay can coalesce all of them into its cached retry. An
		// urgent replay must remain urgent: suppress the transition callback until
		// this replay commits or suspends, then ensureScheduledTransitionWork()
		// restores it without withholding already-prepared urgent content.
		let transitionBatches: ReadonlySet<UniversalTransitionBatch> = replay.transitionBatches;
		if (replay.transitionRender) {
			const merged = new Set(replay.transitionBatches);
			for (const batch of this.takeScheduledTransitionBatches()) merged.add(batch);
			transitionBatches = merged;
		} else {
			for (const batch of replay.transitionBatches) {
				this.scheduledTransitionBatches.delete(batch);
				this.unattemptedTransitionBatches.delete(batch);
			}
		}
		if (!this.scheduledUrgent) {
			this.scheduled = false;
			SCHEDULED_UNIVERSAL_ROOTS.delete(this);
		}
		const restored: SuspendedMemoReplay = {
			entries: replay.entries,
			component: replay.component,
			props: replay.props,
			transitionBatches,
			transitionRender: replay.transitionRender,
			active: true,
			asyncWorkQueued: false,
		};
		this.queueReplay(restored);
	}

	flushScheduledWork(): void {
		if (!this.scheduled) return;
		// A transported teardown is provisional until acknowledgement. Keep work
		// raised by the still-accepted listener table queued so rejection can resume
		// it against the accepted tree.
		if (this.unmounting) return;
		this.scheduled = false;
		SCHEDULED_UNIVERSAL_ROOTS.delete(this);
		if (this.unmounted || this.owner?.disposed || this.lastComponent === null) return;
		if (this.bridge !== null) {
			this.bridge.invalidate();
		} else if (this.hasAsyncTransport()) {
			this.enqueueAsyncWork(async () => {
				// A direct renderAsync() does not run on the scheduler's asyncWork chain.
				// Wait for its transaction to settle before preparing the event update;
				// otherwise prepare() would try to abort a batch already awaiting ACK.
				while (this.pending?.isAwaitingTransportAcknowledgement()) {
					const pending = this.pending;
					try {
						await pending.commitAsync();
					} catch {
						// The direct caller owns its completion error. A pre-ACK rejection
						// still leaves this accepted state update eligible for retry.
					}
				}
				if (this.unmounting) await this.waitForProvisionalUnmount();
				if (this.unmounted) return;
				const input = this.scheduledRenderInput();
				if (input === null) return;
				let attempt: UniversalPreparedAttempt;
				try {
					attempt = this.__prepareScheduled(input[0], input[1]);
				} catch (error) {
					// Scheduled work has no direct caller to observe the throw — without
					// a handler it surfaces through flushTransport()'s async-work error.
					// A root created with onUncaughtError consumes its own report; the
					// failed attempt is already discarded and recovery is unchanged.
					if (!reportUniversalUncaughtError(this, error)) throw error;
					return;
				}
				if (attempt.status === 'prepared') {
					try {
						await attempt.commitAsync();
					} catch (error) {
						this.retryRejectedScheduledAttempt(attempt, input[0], input[1]);
						throw error;
					}
				}
			});
		} else {
			const input = this.scheduledRenderInput();
			if (input === null) return;
			let attempt: UniversalPreparedAttempt;
			try {
				attempt = this.__prepareScheduled(input[0], input[1]);
			} catch (error) {
				// Scheduled work has no direct caller to observe the throw — without a
				// handler it escapes into the host's microtask channel. A root created
				// with onUncaughtError consumes its own report; the failed attempt is
				// already discarded and recovery is unchanged.
				if (!reportUniversalUncaughtError(this, error)) throw error;
				return;
			}
			if (attempt.status === 'prepared') attempt.commit();
		}
	}

	queueScheduledWork(): void {
		if (!this.scheduled) return;
		if (this.unmounting) return;
		if (UNIVERSAL_SYNC_DEPTH > 0) return;
		if (this.bridge !== null) {
			this.scheduled = false;
			SCHEDULED_UNIVERSAL_ROOTS.delete(this);
			this.bridge.invalidate();
			return;
		}
		this.__scheduleMicrotask(() => this.flushScheduledWork());
	}

	private markUrgentScheduled(): void {
		if (this.unmounted || this.owner?.disposed || this.lastComponent === null) return;
		this.scheduledUrgent = true;
		if (this.scheduled) return;
		this.scheduled = true;
		SCHEDULED_UNIVERSAL_ROOTS.add(this);
		if (this.eventScopeDepth === 0 && UNIVERSAL_SYNC_DEPTH === 0) this.queueScheduledWork();
	}

	scheduleOwned(owner: UniversalOwnerRecord): void {
		if (owner.root !== this || owner.disposed) return;
		this.scheduledOwners.add(owner);
		// Stamp the owner and its ancestors so retained-subtree adoption can see
		// scheduled work with one integer compare. The early stop bounds repeat
		// schedules and converging chains to O(1) amortized per call.
		for (
			let current: UniversalOwnerRecord | null = owner;
			current !== null && current.dirtyEpoch !== this.dirtyEpoch;
			current = current.parent
		) {
			current.dirtyEpoch = this.dirtyEpoch;
		}
		this.markUrgentScheduled();
	}

	schedule(): void {
		this.scheduledFullRoot = true;
		this.markUrgentScheduled();
	}

	/** @internal Associates promoted transition work with its accepting transaction. */
	scheduleTransition(batch: UniversalTransitionBatch): void {
		if (batch.settled || this.unmounted || this.owner?.disposed || this.lastComponent === null) {
			finishUniversalTransitionRoot(batch, this);
			return;
		}
		this.scheduledTransitionBatches.add(batch);
		// A newly promoted batch gets one attempt even when its target currently
		// belongs to retained Suspense content. The update itself may be what makes
		// that content renderable again; only a residual queue after an accepted
		// attempt proves that retained work is genuinely blocked.
		this.unattemptedTransitionBatches.add(batch);
		this.ensureScheduledTransitionWork();
	}

	private ensureScheduledTransitionWork(): void {
		if (
			this.scheduledTransitionBatches.size === 0 ||
			this.unmounted ||
			this.owner?.disposed ||
			this.lastComponent === null
		) {
			return;
		}
		let runnable = false;
		for (const batch of [...this.scheduledTransitionBatches]) {
			const state = this.transitionQueueState(batch);
			if (state === 'none') {
				this.scheduledTransitionBatches.delete(batch);
				finishUniversalTransitionRoot(batch, this);
			} else if (state === 'runnable') {
				runnable = true;
			}
		}
		if (!runnable) return;
		if (this.scheduled) return;
		this.scheduled = true;
		SCHEDULED_UNIVERSAL_ROOTS.add(this);
		if (this.eventScopeDepth === 0 && UNIVERSAL_SYNC_DEPTH === 0) this.queueScheduledWork();
	}

	private requeueTransitionBatches(batches: ReadonlySet<UniversalTransitionBatch>): void {
		for (const batch of batches) {
			if (batch.settled) continue;
			this.scheduledTransitionBatches.add(batch);
			// An aborted or rejected attempt published no state. Its queues must get a
			// fresh chance even if the last accepted owner tree is Suspense-hidden.
			this.unattemptedTransitionBatches.add(batch);
		}
	}

	private transitionQueueState(batch: UniversalTransitionBatch): 'none' | 'blocked' | 'runnable' {
		let state: 'none' | 'blocked' | 'runnable' = 'none';
		const needsFirstAttempt = this.unattemptedTransitionBatches.has(batch);
		const visit = (owner: UniversalOwnerRecord): void => {
			if (state === 'runnable') return;
			for (const queue of owner.updates.values()) {
				if (queue.batches?.includes(batch) !== true) continue;
				state =
					needsFirstAttempt || owner.visibility !== 'suspense-hidden' ? 'runnable' : 'blocked';
				if (state === 'runnable') return;
			}
			for (const child of owner.children) visit(child);
		};
		if (this.owner !== null) visit(this.owner);
		return state;
	}

	private detachCompletedTransitionBatch(batch: UniversalTransitionBatch): void {
		const visit = (owner: UniversalOwnerRecord): void => {
			// Retained Suspense owners were not executed by the accepted attempt. Keep
			// their lane provenance so the boundary retry can finish the same batch.
			if (owner.visibility !== 'suspense-hidden') {
				for (const queue of owner.updates.values()) {
					const batches = queue.batches;
					if (batches === undefined || !batches.includes(batch)) continue;
					for (let index = 0; index < batches.length; index++) {
						if (batches[index] === batch) batches[index] = null;
					}
					// Keep lane metadata even when every tag is now null. A conditional hook
					// may already have published later urgent entries as rebase clones. When
					// the slot reappears, replaying from baseState preserves chronological
					// replacement and functional-update ordering without double-applying them.
				}
			}
			for (const child of owner.children) visit(child);
		};
		if (this.owner !== null) visit(this.owner);
	}

	private completeTransitionBatches(batches: ReadonlySet<UniversalTransitionBatch>): void {
		for (const batch of batches) {
			if (batch.settled) continue;
			// A tagged update left on an owner that participated in the accepted tree
			// belongs to a currently inactive conditional hook. Settle this transition
			// without losing the update: it becomes ordinary pending work and applies if
			// that hook call site appears again. Activity-hidden owners still execute;
			// only Suspense-retained trees remain batch-blocking.
			this.detachCompletedTransitionBatch(batch);
			if (this.transitionQueueState(batch) === 'none') {
				finishUniversalTransitionRoot(batch, this);
			} else {
				this.scheduledTransitionBatches.add(batch);
			}
		}
	}

	private takeScheduledTransitionBatches(): ReadonlySet<UniversalTransitionBatch> {
		if (this.scheduledTransitionBatches.size === 0) return EMPTY_UNIVERSAL_TRANSITION_BATCHES;
		const batches = new Set(this.scheduledTransitionBatches);
		this.scheduledTransitionBatches.clear();
		for (const batch of batches) this.unattemptedTransitionBatches.delete(batch);
		return batches;
	}

	private finishTransitionBatches(batches: ReadonlySet<UniversalTransitionBatch>): void {
		for (const batch of batches) finishUniversalTransitionRoot(batch, this);
	}

	/** @internal Drops canceled lane entries without disturbing later rebase updates. */
	discardTransitionBatch(batch: UniversalTransitionBatch): void {
		this.scheduledTransitionBatches.delete(batch);
		this.unattemptedTransitionBatches.delete(batch);
		for (const owner of batch.updates.keys()) {
			if (owner.root === this) batch.updates.delete(owner);
		}
		const visit = (owner: UniversalOwnerRecord): void => {
			for (const [slot, queue] of owner.updates) {
				const batches = queue.batches;
				if (batches === undefined || !batches.includes(batch)) continue;
				const values: unknown[] = [];
				const remainingBatches: (UniversalTransitionBatch | null)[] = [];
				const rebases: boolean[] = [];
				for (let index = 0; index < queue.length; index++) {
					if (batches[index] === batch) continue;
					values.push(queue[index]);
					remainingBatches.push(batches[index]);
					rebases.push(queue.rebases?.[index] ?? false);
				}
				if (values.length === 0) {
					owner.updates.delete(slot);
				} else if (
					remainingBatches.every((remaining) => remaining === null) &&
					rebases.every(Boolean)
				) {
					// Every survivor is an urgent rebase already reflected in the committed
					// hook. With no lane update left to replay, retaining them would apply the
					// same urgent work twice.
					owner.updates.delete(slot);
				} else {
					queue.length = 0;
					queue.push(...values);
					queue.batches = remainingBatches;
					if (rebases.some(Boolean)) queue.rebases = rebases;
					else delete queue.rebases;
				}
			}
			for (const child of owner.children) visit(child);
		};
		if (this.owner !== null) visit(this.owner);
	}

	private cancelSuspendedReplays(preserveTransitions = false): void {
		if (
			this.awaitingReplay === null &&
			this.queuedReplay === null &&
			this.rootRetryAttempt === null
		) {
			return;
		}
		const batches = new Set<UniversalTransitionBatch>();
		for (const batch of this.awaitingReplay?.transitionBatches ?? []) batches.add(batch);
		for (const batch of this.queuedReplay?.transitionBatches ?? []) batches.add(batch);
		for (const batch of this.rootRetryAttempt?.transitionBatches ?? []) batches.add(batch);
		if (this.awaitingReplay !== null) this.awaitingReplay.active = false;
		if (this.queuedReplay !== null) this.queuedReplay.active = false;
		this.awaitingReplay = null;
		this.queuedReplay = null;
		this.rootRetryAttempt = null;
		if (preserveTransitions) this.requeueTransitionBatches(batches);
		else this.finishTransitionBatches(batches);
	}

	private runReplay(replay: SuspendedMemoReplay): void {
		if (!replay.active || this.queuedReplay !== replay || this.unmounted || this.unmounting) return;
		if (this.hasAsyncTransport()) {
			if (replay.asyncWorkQueued) return;
			replay.asyncWorkQueued = true;
			this.enqueueAsyncWork(async () => {
				try {
					// Keep the replay published until its serialized transport turn starts. A
					// teardown can otherwise abort the prepared replay before commitAsync(),
					// leaving no replay state to restore when that teardown is rejected.
					if (this.unmounting) await this.waitForProvisionalUnmount();
					if (!replay.active || this.queuedReplay !== replay || this.unmounted || this.unmounting) {
						return;
					}
					this.queuedReplay = null;
					replay.active = false;
					this.rootRetryAttempt = null;
					let attempt: UniversalPreparedAttempt;
					try {
						attempt = this.prepareWithReplay(
							replay.component,
							replay.props,
							replay.entries,
							replay.transitionBatches,
							replay.transitionRender,
							false,
						);
					} catch (error) {
						const batches = new Set(replay.transitionBatches);
						for (const batch of this.takeScheduledTransitionBatches()) batches.add(batch);
						this.finishTransitionBatches(batches);
						// A resumed replay is scheduler-owned work like any other scheduled
						// render — a root created with onUncaughtError consumes its report.
						if (!reportUniversalUncaughtError(this, error)) throw error;
						return;
					}
					// Commit errors have transaction-owned acceptance semantics. In
					// particular, do not cancel unrelated blocked transitions after a
					// post-accept lifecycle or host fault.
					if (attempt.status === 'prepared') {
						try {
							await attempt.commitAsync();
						} catch (error) {
							this.restoreRejectedReplay(attempt, replay);
							throw error;
						}
					} else {
						this.ensureScheduledTransitionWork();
					}
				} finally {
					replay.asyncWorkQueued = false;
				}
			});
			return;
		}
		this.queuedReplay = null;
		replay.active = false;
		this.rootRetryAttempt = null;
		let attempt: UniversalPreparedAttempt;
		try {
			attempt = this.prepareWithReplay(
				replay.component,
				replay.props,
				replay.entries,
				replay.transitionBatches,
				replay.transitionRender,
				false,
			);
		} catch (error) {
			const batches = new Set(replay.transitionBatches);
			for (const batch of this.takeScheduledTransitionBatches()) batches.add(batch);
			this.finishTransitionBatches(batches);
			// A resumed replay is scheduler-owned work like any other scheduled
			// render — a root created with onUncaughtError consumes its report.
			if (!reportUniversalUncaughtError(this, error)) throw error;
			return;
		}
		if (attempt.status === 'prepared') attempt.commit();
		else this.ensureScheduledTransitionWork();
	}

	private queueReplay(replay: SuspendedMemoReplay): void {
		if (!replay.active || this.unmounted) return;
		if (this.awaitingReplay === replay) this.awaitingReplay = null;
		if (this.queuedReplay === replay) return;
		if (this.queuedReplay !== null) {
			this.queuedReplay.active = false;
			this.finishTransitionBatches(this.queuedReplay.transitionBatches);
		}
		this.queuedReplay = replay;
		if (this.bridge !== null) {
			// Keep the cache published before invalidating the owning renderer. Its
			// ensuing boundary render consumes this exact replay below.
			this.bridge.invalidate();
			return;
		}
		this.__scheduleMicrotask(() => this.runReplay(replay));
	}

	private resumeAfterRejectedUnmount(): void {
		this.unmounting = false;
		if (this.hostAttachments !== null) this.queueHostAttachmentFlush();
		if (this.scheduled) this.queueScheduledWork();
		const replay = this.queuedReplay;
		if (replay === null || !replay.active) return;
		if (this.bridge !== null) this.bridge.invalidate();
		else this.__scheduleMicrotask(() => this.runReplay(replay));
	}

	private async waitForProvisionalUnmount(): Promise<void> {
		while (this.unmounting && !this.unmounted) {
			const unmount = this.unmountPromise;
			if (unmount === null) {
				// unmountAsync() installs its public promise after preparing and starting
				// the token. Yield through that synchronous setup window rather than
				// treating queued accepted work as canceled.
				await Promise.resolve();
				continue;
			}
			try {
				await unmount;
			} catch {
				// The unmountAsync() caller owns teardown errors. Rejection before ACK
				// reopens this root, so the queued accepted work continues below.
			}
		}
	}

	private publishLocalReplay(
		thenables: readonly PromiseLike<unknown>[],
		entries: readonly SuspendedMemoEntry[],
		component: UniversalComponent<any>,
		props: any,
	): void {
		if (this.awaitingReplay !== null) this.awaitingReplay.active = false;
		const replay: SuspendedMemoReplay = {
			entries,
			component,
			props,
			transitionBatches: EMPTY_UNIVERSAL_TRANSITION_BATCHES,
			transitionRender: false,
			active: true,
			asyncWorkQueued: false,
		};
		this.awaitingReplay = replay;
		for (const thenable of thenables) {
			thenable.then(
				() => this.queueReplay(replay),
				() => this.queueReplay(replay),
			);
		}
	}

	private suspend(
		thenable: PromiseLike<unknown>,
		component: UniversalComponent<any>,
		props: any,
		replayEntries: readonly SuspendedMemoEntry[],
		transitionBatches: ReadonlySet<UniversalTransitionBatch>,
		transitionRender: boolean,
		bridgeContextReads: ReadonlyMap<UniversalContext<any>, unknown> | null,
	): UniversalSuspendedAttempt {
		const attempt = new UniversalSuspendedAttemptImpl(
			this,
			thenable,
			component,
			props,
			replayEntries,
			transitionBatches,
			transitionRender,
			bridgeContextReads,
		);
		this.suspended = attempt;
		if (!transitionRender && this.bridge !== null) {
			this.urgentBoundarySuspension = attempt;
			const releaseProjection = () => {
				if (this.urgentBoundarySuspension !== attempt) return;
				this.urgentBoundarySuspension = null;
				this.ensureScheduledTransitionWork();
			};
			thenable.then(releaseProjection, releaseProjection);
		}
		return attempt;
	}

	finishSuspension(
		attempt: UniversalSuspendedAttemptImpl,
		schedule: boolean,
		preserveTransitions = false,
	): void {
		if (schedule && this.urgentBoundarySuspension === attempt) {
			this.urgentBoundarySuspension = null;
		}
		if (this.suspended === attempt) this.suspended = null;
		else if (this.rootRetryAttempt !== attempt) return;
		if (!schedule || this.unmounted) {
			if (this.rootRetryAttempt === attempt) {
				this.rootRetryAttempt = null;
				if (this.queuedReplay !== null) this.queuedReplay.active = false;
				this.queuedReplay = null;
			}
			if (preserveTransitions) this.requeueTransitionBatches(attempt.transitionBatches);
			else this.finishTransitionBatches(attempt.transitionBatches);
			return;
		}
		this.rootRetryAttempt = attempt;
		this.queueReplay({
			entries: attempt.replayEntries,
			component: attempt.component,
			props: attempt.props,
			transitionBatches: attempt.transitionBatches,
			transitionRender: attempt.transitionRender,
			active: true,
			asyncWorkQueued: false,
		});
	}

	flushPassiveTasks(): void {
		PENDING_UNIVERSAL_PASSIVE_ROOTS.delete(this);
		this.passiveScheduled = false;
		if (this.passiveTasks.length === 0) return;
		const tasks = this.passiveTasks.splice(0);
		runCommitTasks(tasks);
	}

	enqueuePassive(task: () => void): void {
		this.passiveTasks.push(task);
		PENDING_UNIVERSAL_PASSIVE_ROOTS.add(this);
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		this.__scheduleMicrotask(() => {
			this.flushPassiveTasks();
		});
	}

	flushPassivesBeforeRender(): void {
		this.flushPassiveTasks();
	}

	private discardDraftOwners(owners: readonly DraftOwner[]): void {
		const committed = new Set<UniversalOwnerRecord>();
		const collect = (owner: UniversalOwnerRecord | null) => {
			if (owner === null || committed.has(owner)) return;
			committed.add(owner);
			for (const child of owner.children) collect(child);
		};
		collect(this.owner);
		for (const draft of owners) {
			if (committed.has(draft.record)) continue;
			draft.record.disposed = true;
			draft.record.componentProps = null;
			draft.record.range = null;
			draft.record.updates.clear();
			for (const hook of draft.hooks.values()) {
				if (hook.kind === 'effect-event') hook.cell.active = false;
			}
		}
	}

	/** @internal Preserves scheduler lane provenance through host-boundary renders. */
	__prepareScheduled(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		this.scheduledPreparationDepth++;
		try {
			return this.prepare(component, props);
		} finally {
			this.scheduledPreparationDepth--;
		}
	}

	/** @internal Separates renderer-root invalidation from coalesced host input updates. */
	__prepareBoundaryScheduled(
		component: UniversalComponent<any>,
		props: any,
	): {
		readonly attempt: UniversalPreparedAttempt;
		readonly transition: boolean;
		readonly projectedThenable: PromiseLike<unknown> | null;
	} {
		const urgentSuspension =
			this.suspended !== null && !this.suspended.transitionRender ? this.suspended : null;
		const urgentProjection = this.urgentBoundarySuspension;
		const previousUrgentAttempt = urgentProjection ?? urgentSuspension;
		const previousComponent = previousUrgentAttempt?.component ?? this.lastComponent;
		const previousProps = previousUrgentAttempt?.props ?? this.lastProps;
		const previousContextReads =
			previousUrgentAttempt?.bridgeContextReads ?? this.bridgeContextReads;
		let inputsChanged =
			component !== previousComponent || !universalShallowEqual(previousProps, props);
		if (!inputsChanged && previousContextReads !== null) {
			for (const [context, previousValue] of previousContextReads) {
				const value =
					this.bridge === null ? context.defaultValue : this.bridge.readContext(context);
				if (!Object.is(value, previousValue)) {
					inputsChanged = true;
					break;
				}
			}
		}
		const urgentReplay = this.queuedReplay?.active === true && !this.queuedReplay.transitionRender;
		if (urgentProjection !== null && !this.scheduledUrgent && !urgentReplay && !inputsChanged) {
			return {
				attempt: urgentProjection,
				transition: false,
				projectedThenable: urgentProjection.thenable,
			};
		}
		const transition =
			urgentSuspension === null && !this.scheduledUrgent && !urgentReplay && !inputsChanged;
		return {
			attempt: transition
				? this.__prepareScheduled(component, props)
				: this.prepare(component, props),
			transition,
			projectedThenable: null,
		};
	}

	// A local state update may replay only the component range that owns its hook.
	// The retained topology check keeps reconciliation atomic: features that need
	// root-wide coordination, or any structural change, fall back to the ordinary
	// full-root attempt before a host batch is prepared.
	private prepareOwnedUpdate(
		target: UniversalOwnerRecord,
		component: UniversalComponent<any>,
		props: any,
	): UniversalPreparedAttempt | null {
		const range = target.range;
		// Transported and bridged roots stay on the full-root path: their commits
		// are acknowledged (or invalidated) against a whole-tree version, so a
		// scoped batch would need its own ACK/rollback protocol on the far side
		// before it could be accepted independently.
		if (
			this.transport !== null ||
			this.bridge !== null ||
			target.component === null ||
			target.componentProps === null ||
			ownerTreeHasWarmPlan(target) ||
			range === null ||
			range.kind !== 'range' ||
			range.owner !== target ||
			target.visibility === 'suspense-hidden'
		) {
			return null;
		}
		// An idle ancestor boundary needs no coordination: a scoped render that
		// suspends or throws below it falls back to the full-root attempt, where
		// the boundary handles the episode exactly as it always has. Only an
		// already-active episode keeps its subtree on the full-root path.
		for (let ancestor = target.parent; ancestor !== null; ancestor = ancestor.parent) {
			if (
				ancestor.boundaryThenable !== null ||
				(ancestor.isBoundary && ancestor.hasBoundaryError)
			) {
				return null;
			}
		}
		const unsupported = UNIVERSAL_TREE_PORTAL | UNIVERSAL_TREE_REGION;
		// A root-scoped update covers the whole committed tree, whose feature union
		// the last full commit already recorded; walking the tree again per update
		// would reintroduce the O(tree) cost this path exists to avoid.
		const scopeFeatures =
			range === this.rootRecord ? this.treeFeatures : logicalTreeFeatures(range);
		if ((scopeFeatures & unsupported) !== 0) return null;

		this.flushPassivesBeforeRender();
		this.pending?.abort();
		const owner = draftOwner(target, null, [
			{
				component: target.component,
				identityPath: target.identityPath,
				key: target.key,
				ordinal: 0,
			},
		]);
		owner.componentRevision = universalComponentRevision(target.component);
		const previousAttempt = CURRENT_ATTEMPT;
		const previousOwner = CURRENT_OWNER;
		const previousWarm = CURRENT_UNIVERSAL_WARM;
		const previousWarmClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
		const previousWarmPlans = ACTIVE_UNIVERSAL_WARM_PLANS.slice();
		const attempt: RenderAttempt = {
			root: this,
			owner,
			scope: target,
			owners: [owner],
			treeFeatures: 0,
			replayEntries: [],
			retryThenables: new Set(),
			nextUniversalId: this.nextUniversalId,
			implicitSlot: 0,
			transitionBatches: EMPTY_UNIVERSAL_TRANSITION_BATCHES,
			transitionRender: false,
			bridgeContextReads: null,
			// The owned-update guards already require a plain urgent local-driver
			// attempt, which is exactly the retain-eligible shape.
			retainEligible: true,
			retainedCount: 0,
			dirtyEpoch: this.attemptDirtyEpoch,
		};
		ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
		CURRENT_UNIVERSAL_WARM = null;
		CURRENT_UNIVERSAL_WARM_CLAIMS = null;
		CURRENT_ATTEMPT = attempt;
		CURRENT_OWNER = owner;
		let nodes: BlueprintNode[];
		try {
			nodes = executeOwner(owner, () => {
				const value = target.component!(target.componentProps, componentContext(this.renderer));
				return materializeValue(value, this.renderer, null, [...target.identityPath, 'output']);
			});
		} catch (error) {
			this.discardDraftOwners(attempt.owners);
			if (error instanceof UniversalSuspense) {
				UNIVERSAL_WARM_CACHES.delete(this);
				return null;
			}
			// An error that escapes the scope can only be handled by a boundary
			// above it. Fall back so the full-root attempt reaches that boundary's
			// materialize-time handling; without one the error is the caller's.
			for (let ancestor = target.parent; ancestor !== null; ancestor = ancestor.parent) {
				if (ancestor.isBoundary) {
					UNIVERSAL_WARM_CACHES.delete(this);
					return null;
				}
			}
			throw error;
		} finally {
			ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
			ACTIVE_UNIVERSAL_WARM_PLANS.push(...previousWarmPlans);
			CURRENT_UNIVERSAL_WARM = previousWarm;
			CURRENT_UNIVERSAL_WARM_CLAIMS = previousWarmClaims;
			CURRENT_ATTEMPT = previousAttempt;
			CURRENT_OWNER = previousOwner;
		}
		if (attempt.retryThenables.size !== 0 || (attempt.treeFeatures & unsupported) !== 0) {
			this.discardDraftOwners(attempt.owners);
			UNIVERSAL_WARM_CACHES.delete(this);
			return null;
		}

		const blueprint: BlueprintRange = {
			kind: 'range',
			// The committed range key: rangeKey for an ownerRange() scope, null for
			// the root range, so the reapplied key never drifts from what the full
			// render path would commit.
			key: range.key,
			owner: target,
			children: nodes,
		};
		// Retained compact rows are ordinary expanded host records, so the scoped
		// blueprint expands the same way before it is compared or reconciled.
		this.expandCompactLeafLists(blueprint);
		// Structural changes commit through a physical frame for the scope. A
		// portal or detached ancestor has no such frame, so those scopes fall
		// back once their shape changes; shape-stable updates need no frame.
		let scopePlacement: { parent: number | null; endAnchor: number | null } | null = null;
		// The root scope has no out-of-scope siblings: commit plans its placements
		// against the container directly, so it needs no precomputed frame.
		if (range !== this.rootRecord && !stableLogicalChildren(range.children, blueprint.children)) {
			scopePlacement = this.scopePhysicalPlacement(range);
			if (scopePlacement === null) {
				this.discardDraftOwners(attempt.owners);
				UNIVERSAL_WARM_CACHES.delete(this);
				return null;
			}
		}
		try {
			const transaction = this.createPreparedTransaction(
				blueprint,
				attempt,
				component,
				props,
				new Set(),
				range,
				scopeFeatures,
				scopePlacement,
			);
			this.pending = transaction;
			return transaction;
		} catch (error) {
			this.discardDraftOwners(attempt.owners);
			throw error;
		}
	}

	// The physical frame a scoped range commits into: its nearest host (or
	// container) ancestor plus the first physical host that follows the scope
	// inside that parent. Untouched siblings cannot move during a scoped commit,
	// so both stay valid anchors for inserted or reordered scope content. A
	// portal or detached ancestor owns a separate physical tree: no frame.
	private scopePhysicalPlacement(
		scope: LogicalRecord,
	): { parent: number | null; endAnchor: number | null } | null {
		let endAnchor: number | null = null;
		let current = scope;
		for (let parent = current.parent; parent !== null; current = parent, parent = current.parent) {
			if (parent.kind !== 'host' && parent.kind !== 'range') return null;
			if (endAnchor === null) {
				const siblings = parent.children;
				for (let index = siblings.indexOf(current) + 1; index < siblings.length; index++) {
					const found = physicalRecords([siblings[index]]);
					if (found.length !== 0) {
						endAnchor = found[0].id;
						break;
					}
				}
			}
			if (parent.kind === 'host') return { parent: parent.id, endAnchor };
			if (parent === this.rootRecord) return { parent: null, endAnchor };
		}
		return null;
	}

	// A scheduled owner that cannot replay alone (an anonymous @for-item owner,
	// or several owners raised by one event scope) still has one smallest
	// ancestor whose retained props and range can replay every queued update:
	// the nearest enclosing component owner of their common ancestor.
	private resolveScopedTarget(): UniversalOwnerRecord | undefined {
		let scope: UniversalOwnerRecord | null = null;
		for (const owner of this.scheduledOwners) {
			if (owner.disposed) continue;
			// Retained-hidden content belongs to a boundary episode; only the
			// full-root attempt coordinates its retention and reveal.
			if (owner.visibility === 'suspense-hidden') return undefined;
			scope = scope === null ? owner : commonOwnerAncestor(scope, owner);
			if (scope === null) return undefined;
		}
		let target: UniversalOwnerRecord | null = null;
		for (let current = scope; current !== null; current = current.parent) {
			if (current.component !== null && current.componentProps !== null && current.range !== null) {
				target = current;
				break;
			}
		}
		if (target === null) return undefined;
		// Hoisting may carry the replay across boundaries the scheduled owner sits
		// under. An idle boundary re-renders its body inline like any other owner,
		// but an active episode (pending thenable or routed error) owns retained
		// arms whose replay and reveal are coordinated from the root.
		for (const owner of this.scheduledOwners) {
			if (owner.disposed) continue;
			for (
				let current: UniversalOwnerRecord | null = owner;
				current !== target;
				current = current.parent
			) {
				if (
					current === null ||
					current.boundaryThenable !== null ||
					(current.isBoundary && current.hasBoundaryError)
				) {
					return undefined;
				}
			}
		}
		return target;
	}

	prepare(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		const ownedTarget =
			this.scheduledPreparationDepth > 0 &&
			this.scheduledUrgent &&
			!this.scheduledFullRoot &&
			this.scheduledOwners.size !== 0
				? this.resolveScopedTarget()
				: undefined;
		const scheduledUrgent = this.scheduledUrgent || this.scheduledPreparationDepth === 0;
		// Scheduling is not always a hook update: a boundary invalidation (resolved
		// thenable, routed error, Activity reveal) re-renders its owner with an
		// empty update queue. scheduleOwned() already epoch-stamped every
		// scheduled owner and its ancestors; consuming the batch here just
		// records that epoch for the attempt and opens the next one, so stale
		// stamps expire without walking or clearing anything. Never retain at
		// all when a full-root refresh was demanded.
		this.attemptFullRootScheduled = this.scheduledFullRoot;
		this.attemptDirtyEpoch = this.dirtyEpoch;
		this.dirtyEpoch++;
		this.scheduledUrgent = false;
		this.scheduledFullRoot = false;
		this.scheduledOwners.clear();
		if (scheduledUrgent) this.urgentBoundarySuspension = null;
		const bridgeReplay = this.bridge === null ? null : this.queuedReplay;
		if (
			!scheduledUrgent &&
			bridgeReplay !== null &&
			bridgeReplay.component === component &&
			bridgeReplay.active
		) {
			const scheduledTransitions = this.takeScheduledTransitionBatches();
			this.queuedReplay = null;
			bridgeReplay.active = false;
			this.rootRetryAttempt = null;
			const transitions = new Set([...bridgeReplay.transitionBatches, ...scheduledTransitions]);
			try {
				return this.prepareWithReplay(
					component,
					props,
					bridgeReplay.entries,
					transitions,
					!scheduledUrgent && (bridgeReplay.transitionRender || scheduledTransitions.size !== 0),
				);
			} catch (error) {
				this.finishTransitionBatches(transitions);
				throw error;
			}
		}
		// A fresh attempt invalidates the old replay cache, but its transition
		// updates remain queued. Non-urgent work consumes every promoted batch in
		// one ordered rebase; urgent work leaves them scheduled for the next pass.
		this.suspended?.abort(true);
		this.cancelSuspendedReplays(true);
		const scheduledTransitions = scheduledUrgent
			? EMPTY_UNIVERSAL_TRANSITION_BATCHES
			: this.takeScheduledTransitionBatches();
		// A fresh render is a new suspension episode. Keep consumed warm entries
		// across automatic retries, but never let their tombstones suppress a later
		// update or remount that returns to the same dependency values.
		UNIVERSAL_WARM_CACHES.delete(this);
		try {
			if (
				ownedTarget !== undefined &&
				component === this.lastComponent &&
				universalShallowEqual(props, this.lastProps)
			) {
				const ownedAttempt = this.prepareOwnedUpdate(ownedTarget, component, props);
				if (ownedAttempt !== null) return ownedAttempt;
			}
			const attempt = this.prepareWithReplay(
				component,
				props,
				[],
				scheduledTransitions,
				!scheduledUrgent && scheduledTransitions.size !== 0,
			);
			if (scheduledUrgent && attempt.status === 'suspended') {
				this.ensureScheduledTransitionWork();
			}
			return attempt;
		} catch (error) {
			this.finishTransitionBatches(scheduledTransitions);
			// An uncaught urgent render has no automatic retry owner. Cancel promoted
			// transition work that it deliberately left queued so global pending state
			// and owner-local lane entries cannot remain stranded forever.
			if (scheduledUrgent) {
				this.finishTransitionBatches(this.takeScheduledTransitionBatches());
			}
			throw error;
		}
	}

	private prepareWithReplay(
		component: UniversalComponent<any>,
		props: any,
		replayEntries: readonly SuspendedMemoEntry[],
		transitionBatches: ReadonlySet<UniversalTransitionBatch>,
		transitionRender: boolean,
		// A queued replay re-renders content a boundary retained while suspended;
		// its attempt must rebuild that content even where inputs look unchanged.
		allowRetain = true,
	): UniversalPreparedAttempt {
		if (this.unmounted || this.unmounting) {
			throw new Error('Cannot render an unmounted universal root.');
		}
		// Match Octane's DOM runtime: a previous commit's passive work becomes
		// observable before the next render attempt starts. This also prevents two
		// synchronous universal commits from collapsing the first commit's effects.
		this.flushPassivesBeforeRender();
		const metadata = getComponentMetadata(component);
		if (metadata !== UNIVERSAL_LAZY_METADATA && metadata.id !== this.renderer) {
			throw new Error(
				`Universal renderer mismatch: root ${JSON.stringify(this.renderer)} cannot render component ${JSON.stringify(metadata.id)}.`,
			);
		}
		this.pending?.abort();
		this.suspended?.abort();
		const ownerRecord =
			this.owner?.component === component
				? this.owner
				: createOwnerRecord(this, component, null, ['root'], null);
		const rootPath: readonly SuspendedOwnerSegment[] = [
			{ component, identityPath: ownerRecord.identityPath, key: ownerRecord.key, ordinal: 0 },
		];
		const owner = draftOwner(ownerRecord, null, rootPath);
		owner.componentProps = props;
		owner.componentRevision = universalComponentRevision(component);
		const previousAttempt = CURRENT_ATTEMPT;
		const previousOwner = CURRENT_OWNER;
		const previousWarm = CURRENT_UNIVERSAL_WARM;
		const previousWarmClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
		const previousWarmPlans = ACTIVE_UNIVERSAL_WARM_PLANS.slice();
		const attempt: RenderAttempt = {
			root: this,
			owner,
			scope: null,
			owners: [owner],
			treeFeatures: 0,
			replayEntries,
			retryThenables: new Set(),
			nextUniversalId: this.nextUniversalId,
			implicitSlot: 0,
			transitionBatches,
			transitionRender,
			bridgeContextReads: null,
			// Replay, transition, and bridge attempts re-execute every owner for
			// their own bookkeeping. An ordinary transported full-root commit can
			// adopt unchanged subtrees: its acknowledgement still covers the whole
			// tree, and committed hosts and listeners remain published.
			retainEligible:
				allowRetain &&
				this.bridge === null &&
				!this.attemptFullRootScheduled &&
				replayEntries.length === 0 &&
				transitionBatches.size === 0 &&
				!transitionRender,
			retainedCount: 0,
			dirtyEpoch: this.attemptDirtyEpoch,
		};
		// A nested universal root is a separate render attempt. Do not let the
		// caller's active component plans or speculative cache leak into it; child
		// owners inside this attempt still inherit plans through executeOwner.
		ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
		CURRENT_UNIVERSAL_WARM = null;
		CURRENT_UNIVERSAL_WARM_CLAIMS = null;
		CURRENT_ATTEMPT = attempt;
		CURRENT_OWNER = owner;
		let nodes: BlueprintNode[];
		try {
			nodes = executeOwner(owner, () => {
				const value = component(props, componentContext(this.renderer));
				// The same `[identityPath, 'output']` shape materializeComponentValue
				// uses, so a later owner-scoped replay of the root claims the exact
				// child identities this render committed.
				return materializeValue(value, this.renderer, null, [
					...ownerRecord.identityPath,
					'output',
				]);
			});
		} catch (error) {
			// Replay ordinals count only drafted children, so an attempt that adopted
			// retained subtrees cannot produce replay paths a full retry (which
			// drafts everything) would resolve identically. Retry cold instead.
			const suspendedMemos = attempt.retainedCount !== 0 ? [] : collectSuspendedMemos(attempt);
			this.discardDraftOwners(attempt.owners);
			if (error instanceof UniversalSuspense) {
				return this.suspend(
					error.thenable,
					component,
					props,
					suspendedMemos,
					transitionBatches,
					transitionRender,
					attempt.bridgeContextReads,
				);
			}
			throw error;
		} finally {
			ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
			ACTIVE_UNIVERSAL_WARM_PLANS.push(...previousWarmPlans);
			CURRENT_UNIVERSAL_WARM = previousWarm;
			CURRENT_UNIVERSAL_WARM_CLAIMS = previousWarmClaims;
			CURRENT_ATTEMPT = previousAttempt;
			CURRENT_OWNER = previousOwner;
		}
		try {
			// The root range carries its owner exactly like every ownerRange() child,
			// so resolveScopedTarget() can hoist to the root component when state
			// lives at the top of the app.
			const rootBlueprint: BlueprintRange = {
				kind: 'range',
				key: null,
				owner: owner.record,
				children: nodes,
			};
			const transaction = this.createTransaction(rootBlueprint, attempt, component, props);
			this.pending = transaction;
			return transaction;
		} catch (error) {
			// Component execution may have exposed state APIs or reverse-renderer
			// descriptors before validation/reconciliation rejects the attempt. They
			// must be disposed just like render-time failures, never left as live
			// handles to a tree that had no accepted transaction.
			this.discardDraftOwners(attempt.owners);
			throw error;
		}
	}

	render(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		if (this.hasAsyncTransport()) {
			throw new Error('A transported universal root must use renderAsync().');
		}
		const attempt = this.prepare(component, props);
		if (attempt.status === 'prepared') attempt.commit();
		return attempt;
	}

	async renderAsync(
		component: UniversalComponent<any>,
		props: any,
	): Promise<UniversalPreparedAttempt> {
		const attempt = this.prepare(component, props);
		if (attempt.status === 'prepared') await attempt.commitAsync();
		return attempt;
	}

	private stableAttemptOwnersEqual(attempt: RenderAttempt): boolean {
		const contextValuesEqual = (
			previous: Map<UniversalContext<any>, unknown> | null,
			next: Map<UniversalContext<any>, unknown> | null,
		) => {
			if (previous === null || next === null) return previous === next;
			if (previous.size !== next.size) return false;
			for (const [context, value] of next) {
				if (!previous.has(context) || !Object.is(previous.get(context), value)) return false;
			}
			return true;
		};
		let ownerCount = 0;
		const validateOwner = (draft: DraftOwner, parent: DraftOwner | null): boolean => {
			ownerCount++;
			const record = draft.record;
			if (
				!record.mounted ||
				record.disposed ||
				record.parent !== (parent?.record ?? null) ||
				record.visibility !== draft.visibility ||
				record.isBoundary !== draft.isBoundary ||
				record.canHandleSuspense !== draft.canHandleSuspense ||
				record.hasBoundaryError !== draft.hasBoundaryError ||
				!Object.is(record.boundaryError, draft.boundaryError) ||
				record.boundaryThenable !== draft.boundaryThenable ||
				!contextValuesEqual(record.contextValues, draft.contextValues) ||
				draft.appliedUpdates.size !== 0 ||
				record.updates.size !== 0 ||
				record.children.length !== draft.children.length ||
				record.effectOrder.length !== draft.seenEffects.length ||
				record.hooks.size !== draft.hooks.size
			) {
				return false;
			}
			for (let index = 0; index < draft.children.length; index++) {
				if (record.children[index] !== draft.children[index].record) return false;
			}
			for (let index = 0; index < draft.seenEffects.length; index++) {
				const next = draft.seenEffects[index];
				const previous = record.effectOrder[index];
				if (
					previous.kind !== 'effect' ||
					next.previous !== previous ||
					next.phase !== previous.phase ||
					!previous.mounted ||
					!depsEqual(previous.deps, next.deps)
				) {
					return false;
				}
			}
			for (const hook of draft.hooks.values()) if (hook.kind !== 'effect') return false;
			for (const child of draft.children) if (!validateOwner(child, draft)) return false;
			return true;
		};
		return validateOwner(attempt.owner, null) && ownerCount === attempt.owners.length;
	}

	private compactLeafProps(list: BlueprintCompactLeafList, index: number): Record<string, unknown> {
		const cached = list.props[index];
		if (cached !== undefined) return cached;
		if (list.host === null) {
			throw new Error('A compact universal leaf list has no host plan.');
		}
		const host = list.host;
		const props: Record<string, unknown> = host.props === undefined ? {} : { ...host.props };
		const values = list.values[index];
		const bindings = host.bindings;
		if (bindings !== undefined) {
			for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex++) {
				const binding = bindings[bindingIndex];
				props[binding[0]] = values[binding[1]];
			}
		}
		if (this.driver.props !== undefined || this.transport !== null) {
			for (const name of Object.keys(props)) {
				props[name] = this.encodeHostProp(host.type, name, props[name]);
			}
		}
		if (list.propCount < 0) list.propCount = Object.keys(props).length;
		list.props[index] = props;
		return props;
	}

	private expandCompactLeafLists(node: BlueprintNode): void {
		let expanded: BlueprintNode[] | null = null;
		for (let index = 0; index < node.children.length; index++) {
			const child = node.children[index];
			const list = child.kind === 'range' ? child.compactLeafList : undefined;
			const templates = child.kind === 'range' ? child.compactTemplateList : undefined;
			if (list === undefined && templates === undefined) {
				this.expandCompactLeafLists(child);
				if (expanded !== null) expanded.push(child);
				continue;
			}

			expanded ??= node.children.slice(0, index);
			const hosts: BlueprintHost[] = [];
			if (templates !== undefined) {
				for (let templateIndex = 0; templateIndex < templates.keys.length; templateIndex++) {
					const host = preparedCollapsedTemplateBlueprint(
						templates.plan,
						templates.compiled,
						templates.program,
						templates.values[templateIndex],
						templates.captures[templateIndex],
						templates.owner,
					);
					host.key = templates.keys[templateIndex];
					hosts.push(host);
				}
			} else if (list!.host !== null) {
				const host = list!.host;
				for (let leafIndex = 0; leafIndex < list!.keys.length; leafIndex++) {
					hosts.push({
						kind: 'host',
						key: list!.keys[leafIndex],
						type: host.type,
						props: this.compactLeafProps(list!, leafIndex),
						ref: null,
						owner: list!.owners?.[leafIndex] ?? list!.owner,
						events: EMPTY_BLUEPRINT_EVENTS,
						lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
						localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
						visibility: list!.visibility,
						children: [],
					});
				}
			}
			if (child.key === null) expanded.push(...hosts);
			else expanded.push({ kind: 'range', key: child.key, children: hosts });
		}
		if (expanded !== null) node.children = expanded;
	}

	private tryCreateCompactTemplateUpdateTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> | null {
		const owner = this.owner;
		const draftOwner = attempt.owner;
		if (
			this.driver.capabilities?.templateProgramRuns !== true ||
			owner === null ||
			draftOwner.record !== owner ||
			attempt.owners.length !== 1 ||
			owner.children.length !== 0 ||
			draftOwner.children.length !== 0 ||
			owner.effectOrder.length !== 0 ||
			draftOwner.seenEffects.length !== 0 ||
			owner.contextValues !== null ||
			draftOwner.contextValues !== null ||
			owner.visibility !== 'visible' ||
			draftOwner.visibility !== 'visible' ||
			owner.isBoundary ||
			draftOwner.isBoundary ||
			owner.componentRevision !== draftOwner.componentRevision ||
			owner.hooks.size !== draftOwner.hooks.size ||
			attempt.scope !== null ||
			attempt.retryThenables.size !== 0 ||
			attempt.replayEntries.length !== 0 ||
			attempt.transitionBatches.size !== 0 ||
			attempt.transitionRender ||
			this.bridge !== null ||
			((this.treeFeatures | attempt.treeFeatures) & ~UNIVERSAL_TREE_EVENT) !== 0
		) {
			return null;
		}
		for (const [slot, hook] of draftOwner.hooks) {
			const previous = owner.hooks.get(slot);
			if (
				previous === undefined ||
				previous.kind !== hook.kind ||
				(hook.kind !== 'state' && hook.kind !== 'reducer') ||
				(hook.kind === 'state' && 'linked' in hook)
			) {
				return null;
			}
		}
		for (const [slot, queue] of owner.updates) {
			const applied = draftOwner.appliedUpdates.get(slot);
			if (applied === undefined || applied.lane || applied.queue !== queue || queue.batches) {
				return null;
			}
		}
		const shells: { record: LogicalRecord; blueprint: BlueprintHost }[] = [];
		const lists: {
			list: BlueprintCompactTemplateList;
			records: readonly LogicalRecord[];
			start: number;
		}[] = [];
		const pair = (
			records: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): boolean => {
			let recordIndex = 0;
			for (const next of blueprints) {
				const list = next.kind === 'range' ? next.compactTemplateList : undefined;
				if (list !== undefined) {
					if (
						next.key !== null ||
						list.owner !== owner ||
						list.keys.length !== list.values.length ||
						list.keys.length !== list.captures.length
					) {
						return false;
					}
					const start = recordIndex;
					for (let index = 0; index < list.keys.length; index++) {
						const record = records[recordIndex++];
						const state = record?.collapsedTemplate;
						if (
							record === undefined ||
							record.kind !== 'host' ||
							!Object.is(record.key, list.keys[index]) ||
							record.type !== list.program.wire.nodes[0].type ||
							record.owner !== owner ||
							record.children.length !== 0 ||
							record.ref != null ||
							record.events.size !== 0 ||
							state?.prepared !== list.program ||
							state.values === undefined ||
							state.firstId === undefined ||
							state.events.length !== list.program.events.length
						) {
							return false;
						}
					}
					lists.push({ list, records, start });
					continue;
				}
				const record = records[recordIndex++];
				if (record === undefined || !sameRecordShape(record, next) || record.kind === 'portal') {
					return false;
				}
				if (record.kind === 'range') {
					if (
						next.kind !== 'range' ||
						next.compactLeafList !== undefined ||
						record.owner !== (next.owner ?? null) ||
						!pair(record.children, next.children)
					) {
						return false;
					}
					continue;
				}
				if (
					next.kind !== 'host' ||
					record.owner !== next.owner ||
					record.ref != null ||
					next.ref != null ||
					record.events.size !== 0 ||
					next.events.size !== 0 ||
					record.lifecycles.size !== 0 ||
					next.lifecycles.size !== 0 ||
					record.localCallbacks.size !== 0 ||
					next.localCallbacks.size !== 0 ||
					record.visibility !== 'visible' ||
					next.visibility !== 'visible' ||
					record.collapsedTemplate !== undefined ||
					next.collapsedTemplate !== undefined ||
					!pair(record.children, next.children)
				) {
					return false;
				}
				shells.push({ record, blueprint: next });
			}
			return recordIndex === records.length;
		};
		if (!pair(this.rootRecord.children, blueprint.children) || lists.length === 0) return null;
		const commands: UniversalHostCommand[] = [];
		const rowUpdates: { record: LogicalRecord; props: Record<string, unknown> }[] = [];
		const recreatedEvents: {
			id: number;
			type: string;
			listener: UniversalEventListenerDescriptor;
		}[] = [];
		const stageUpdate = (
			type: string,
			id: number,
			previous: Readonly<Record<string, unknown>>,
			next: Record<string, unknown>,
		): UniversalHostUpdateKind => {
			const kind = this.driver.updates?.classify(type, previous, next) ?? 'update';
			if (kind !== 'update' && kind !== 'recreate') {
				throw new TypeError(
					`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
				);
			}
			commands.push(
				kind === 'recreate'
					? { op: 'recreate', id, type, props: Object.freeze(next) }
					: { op: 'update', id, props: Object.freeze(next) },
			);
			return kind;
		};
		for (const { record, blueprint: host } of shells) {
			if (!shallowPropsEqual(record.props, host.props)) {
				stageUpdate(host.type, record.id, record.props, host.props);
			}
		}
		for (const { list, records, start } of lists) {
			const program = list.program;
			for (let row = 0; row < list.keys.length; row++) {
				const record = records[start + row];
				const accepted = record.collapsedTemplate!;
				const values = list.values[row];
				let previousChangedNode = -1;
				for (let valueIndex = 0; valueIndex < program.values.length; valueIndex++) {
					if (Object.is(accepted.values![valueIndex], values[valueIndex])) continue;
					const index = program.values[valueIndex].node;
					if (previousChangedNode === index) continue;
					previousChangedNode = index;
					const next = materializePreparedCollapsedHostProps(program, values, index);
					const previous =
						index === 0
							? record.props
							: materializePreparedCollapsedHostProps(program, accepted.values!, index);
					const id = accepted.firstId! + index;
					const kind = stageUpdate(program.wire.nodes[index].type, id, previous, next);
					if (index === 0) rowUpdates.push({ record, props: next });
					if (kind === 'recreate') {
						for (let eventIndex = 0; eventIndex < program.events.length; eventIndex++) {
							const site = program.events[eventIndex];
							if (site.node !== index) continue;
							const event = accepted.events[eventIndex].event;
							recreatedEvents.push({
								id,
								type: site.type,
								listener: { id: event.listener, priority: site.priority },
							});
						}
					}
				}
				for (let eventIndex = 0; eventIndex < program.events.length; eventIndex++) {
					const site = program.events[eventIndex];
					const previous = accepted.events[eventIndex];
					if (
						previous.index !== site.node ||
						previous.event.type !== site.type ||
						typeof list.captures[row][site.slot] !== 'function'
					) {
						return null;
					}
				}
			}
		}
		for (const event of recreatedEvents) commands.push({ op: 'event', ...event });
		const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
		const identity = this.transportIdentity(batch.version);
		const prepareHost = (value: UniversalHostBatch) =>
			this.driver.prepareBatch(this.container, value, {
				invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
			});
		let sync: UniversalPreparedHostBatch | null = null;
		let async: UniversalAsyncPreparedHostBatch | null = null;
		if (this.transport?.mode === 'async') {
			async = this.transport.prepareBatch(this.container, batch, identity);
		} else {
			sync =
				this.transport === null
					? prepareHost(batch)
					: this.transport.prepareBatch(this.container, batch, prepareHost);
		}
		const prepared = sync ?? async;
		if (!isValidPreparedHostBatch(prepared)) {
			throw new TypeError('A universal host driver must return a valid prepared batch token.');
		}
		return new UniversalTransactionImpl(
			this,
			batch,
			sync === null ? null : () => sync!.apply(),
			async === null ? null : (acknowledge) => async!.apply(acknowledge),
			identity,
			() => {
				for (const { record, blueprint: host } of shells) record.props = host.props;
				for (const update of rowUpdates) update.record.props = update.props;
				for (const { list, records, start } of lists) {
					const program = list.program;
					for (let row = 0; row < list.keys.length; row++) {
						const state = records[start + row].collapsedTemplate!;
						(state as { values: readonly UniversalHostTemplateProgramValue[] }).values =
							list.values[row];
						for (let eventIndex = 0; eventIndex < program.events.length; eventIndex++) {
							const site = program.events[eventIndex];
							const previous = state.events[eventIndex].event;
							const handler = list.captures[row][site.slot] as (...args: any[]) => any;
							if (previous.handler === handler && previous.owner === list.owner) continue;
							const event: CommittedEvent = {
								prop: site.prop,
								type: site.type,
								priority: site.priority,
								handler,
								owner: list.owner,
								listener: previous.listener,
							};
							(state.events as CommittedCollapsedTemplateEvent[])[eventIndex] = {
								index: site.node,
								event,
							};
							this.handlers.set(event.listener, event);
						}
					}
				}
				owner.componentProps = draftOwner.componentProps;
				owner.componentRevision = draftOwner.componentRevision;
				owner.hooks = draftOwner.hooks;
				for (const [slot, applied] of draftOwner.appliedUpdates) {
					const queue = owner.updates.get(slot);
					if (queue !== applied.queue || applied.lane) continue;
					queue.splice(0, applied.consumed);
					if (queue.length === 0) owner.updates.delete(slot);
				}
				this.owner = owner;
				this.lastComponent = component;
				this.lastProps = props;
				this.retryRenderInput = null;
				this.urgentBoundarySuspension = null;
				this.bridgeContextReads = attempt.bridgeContextReads;
				this.nextUniversalId = attempt.nextUniversalId;
				this.treeFeatures = attempt.treeFeatures;
			},
			() => prepared.afterAccept?.(),
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			null,
			() => prepared.abort(),
			() => this.discardDraftOwners(attempt.owners),
			attempt.transitionBatches,
		);
	}

	/** Publish stable owner records only after their compact host batch is accepted. */
	private publishAcceptedCompactOwners(
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): void {
		for (const draft of attempt.owners) {
			const record = draft.record;
			record.componentProps = draft.componentProps;
			record.componentRevision = draft.componentRevision;
			record.parent = draft.parent?.record ?? null;
			record.hooks = draft.hooks;
			record.effectOrder = [...draft.seenEffects];
			record.children = draft.children.map((child) => child.record);
			record.contextValues = draft.contextValues;
			record.isBoundary = draft.isBoundary;
			record.canHandleSuspense = draft.canHandleSuspense;
			record.boundaryError = draft.boundaryError;
			record.hasBoundaryError = draft.hasBoundaryError;
			record.boundaryThenable = draft.boundaryThenable;
			record.visibility = draft.visibility;
			record.mounted = true;
			record.disposed = false;
		}
		this.owner = attempt.owner.record;
		this.lastComponent = component;
		this.lastProps = props;
		this.retryRenderInput = null;
		this.urgentBoundarySuspension = null;
		this.bridgeContextReads = attempt.bridgeContextReads;
		this.nextUniversalId = attempt.nextUniversalId;
		this.treeFeatures = 0;
	}

	private tryCreateCompactLeafUpdateTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> | null {
		if (
			this.transport !== null ||
			this.owner === null ||
			attempt.owner.record !== this.owner ||
			this.treeFeatures !== 0 ||
			attempt.treeFeatures !== 0 ||
			attempt.retryThenables.size !== 0
		) {
			return null;
		}

		const matches: {
			list: BlueprintCompactLeafList;
			records: readonly LogicalRecord[];
			start: number;
		}[] = [];
		let sawCompactList = false;
		const pairChildren = (
			records: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): boolean => {
			let recordIndex = 0;
			for (const next of blueprints) {
				const list = next.kind === 'range' ? next.compactLeafList : undefined;
				if (list !== undefined) {
					sawCompactList = true;
					if (next.key !== null || list.owners !== null) return false;
					if (list.host === null) continue;
					const host = list.host;
					if (list.keys.length !== list.values.length) return false;
					const start = recordIndex;
					for (let leafIndex = 0; leafIndex < list.keys.length; leafIndex++) {
						const record = records[recordIndex++];
						if (
							record === undefined ||
							record.kind !== 'host' ||
							!Object.is(record.key, list.keys[leafIndex]) ||
							record.type !== host.type ||
							record.children.length !== 0 ||
							record.owner !== list.owner
						) {
							return false;
						}
					}
					matches.push({ list, records, start });
					continue;
				}

				const record = records[recordIndex++];
				if (
					record === undefined ||
					record.kind !== 'range' ||
					next.kind !== 'range' ||
					!sameRecordShape(record, next) ||
					!pairChildren(record.children, next.children)
				) {
					return false;
				}
			}
			return recordIndex === records.length;
		};
		if (
			!pairChildren(this.rootRecord.children, blueprint.children) ||
			!sawCompactList ||
			!this.stableAttemptOwnersEqual(attempt)
		) {
			return null;
		}

		for (const { list } of matches) {
			for (let index = 0; index < list.keys.length; index++) this.compactLeafProps(list, index);
		}
		const commands: UniversalHostCommand[] = [];
		for (const { list, records, start } of matches) {
			const host = list.host!;
			const bindings = host.bindings;
			const lastBinding =
				bindings === undefined || bindings.length === 0 ? null : bindings[bindings.length - 1][0];
			for (let index = 0; index < list.keys.length; index++) {
				const record = records[start + index];
				const hostProps = list.props[index]!;
				if (
					(lastBinding === null ||
						!hasOwnProp.call(record.props, lastBinding) ||
						!hasOwnProp.call(hostProps, lastBinding) ||
						Object.is(record.props[lastBinding], hostProps[lastBinding])) &&
					shallowPropsEqual(record.props, hostProps, list.propCount)
				) {
					continue;
				}
				const kind = this.driver.updates?.classify(host.type, record.props, hostProps) ?? 'update';
				const frozenProps = Object.freeze(hostProps);
				if (kind === 'update') {
					commands.push({ op: 'update', id: record.id, props: frozenProps });
				} else if (kind === 'recreate') {
					commands.push({
						op: 'recreate',
						id: record.id,
						type: host.type,
						props: frozenProps,
					});
				} else {
					throw new TypeError(
						`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
					);
				}
			}
		}
		if (commands.length === 0) return null;

		const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
		const preparedHost = this.driver.prepareBatch(this.container, batch, {
			invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
		});
		if (!isValidPreparedHostBatch(preparedHost)) {
			throw new TypeError('A universal host driver must return a valid prepared batch token.');
		}
		return new UniversalTransactionImpl(
			this,
			batch,
			() => preparedHost.apply(),
			null,
			this.transportIdentity(batch.version),
			() => {
				for (const { list, records, start } of matches) {
					for (let index = 0; index < list.keys.length; index++) {
						records[start + index].props = list.props[index]!;
					}
				}
				this.publishAcceptedCompactOwners(attempt, component, props);
			},
			() => preparedHost.afterAccept?.(),
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			null,
			() => preparedHost.abort(),
			() => this.discardDraftOwners(attempt.owners),
			attempt.transitionBatches,
		);
	}

	private tryCreateStableLeafUpdateTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> | null {
		if (
			this.transport !== null ||
			this.owner === null ||
			attempt.owner.record !== this.owner ||
			this.treeFeatures !== 0 ||
			attempt.treeFeatures !== 0 ||
			attempt.retryThenables.size !== 0
		) {
			return null;
		}

		if (!this.stableAttemptOwnersEqual(attempt)) return null;

		const hostRecords: LogicalRecord[] = [];
		const hostBlueprints: BlueprintHost[] = [];
		const commands: UniversalHostCommand[] = [];
		const pairChildren = (
			records: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): boolean => {
			if (records.length !== blueprints.length) return false;
			for (let index = 0; index < records.length; index++) {
				const record = records[index];
				const next = blueprints[index];
				if (!sameRecordShape(record, next) || record.kind === 'portal') return false;
				if (record.kind === 'host') {
					if (next.kind !== 'host') return false;
					if (
						record.children.length !== 0 ||
						next.children.length !== 0 ||
						record.owner !== next.owner
					) {
						return false;
					}
					hostRecords.push(record);
					hostBlueprints.push(next);
				} else if (!pairChildren(record.children, next.children)) {
					return false;
				}
			}
			return true;
		};
		if (!pairChildren(this.rootRecord.children, blueprint.children)) return null;
		for (let index = 0; index < hostRecords.length; index++) {
			const record = hostRecords[index];
			const host = hostBlueprints[index];
			if (shallowPropsEqual(record.props, host.props)) continue;
			const kind = this.driver.updates?.classify(host.type, record.props, host.props) ?? 'update';
			const frozenProps = Object.freeze(host.props);
			if (kind === 'update') {
				commands.push({ op: 'update', id: record.id, props: frozenProps });
			} else if (kind === 'recreate') {
				commands.push({
					op: 'recreate',
					id: record.id,
					type: host.type,
					props: frozenProps,
				});
			} else {
				throw new TypeError(
					`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
				);
			}
		}
		if (commands.length === 0) return null;

		const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
		const preparedHost = this.driver.prepareBatch(this.container, batch, {
			invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
		});
		if (!isValidPreparedHostBatch(preparedHost)) {
			throw new TypeError('A universal host driver must return a valid prepared batch token.');
		}
		const transaction = new UniversalTransactionImpl(
			this,
			batch,
			() => preparedHost.apply(),
			null,
			this.transportIdentity(batch.version),
			() => {
				for (let index = 0; index < hostRecords.length; index++) {
					const record = hostRecords[index];
					const host = hostBlueprints[index];
					record.props = host.props;
					record.owner = host.owner;
				}
				this.publishAcceptedCompactOwners(attempt, component, props);
			},
			() => preparedHost.afterAccept?.(),
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			noopUniversalCommitTask,
			null,
			() => preparedHost.abort(),
			() => this.discardDraftOwners(attempt.owners),
			attempt.transitionBatches,
		);
		return transaction;
	}

	private createTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> {
		const compactTemplateUpdate = this.tryCreateCompactTemplateUpdateTransaction(
			blueprint,
			attempt,
			component,
			props,
		);
		if (compactTemplateUpdate !== null) return compactTemplateUpdate;
		const compactLeafUpdate = this.tryCreateCompactLeafUpdateTransaction(
			blueprint,
			attempt,
			component,
			props,
		);
		if (compactLeafUpdate !== null) return compactLeafUpdate;
		this.expandCompactLeafLists(blueprint);
		const stableLeafUpdate = this.tryCreateStableLeafUpdateTransaction(
			blueprint,
			attempt,
			component,
			props,
		);
		if (stableLeafUpdate !== null) return stableLeafUpdate;
		const stagedPortalRegistrations = new Set<UniversalPortalTargetRegistration>();
		if (((this.treeFeatures | attempt.treeFeatures) & UNIVERSAL_TREE_PORTAL) === 0) {
			return this.createPreparedTransaction(
				blueprint,
				attempt,
				component,
				props,
				stagedPortalRegistrations,
			);
		}
		const preparePortals = (node: BlueprintNode) => {
			if (node.kind === 'portal' && node.registration === null) {
				node.registration = this.preparePortalTarget(node.target);
				stagedPortalRegistrations.add(node.registration);
			}
			for (const child of node.children) preparePortals(child);
		};
		try {
			preparePortals(blueprint);
			return this.createPreparedTransaction(
				blueprint,
				attempt,
				component,
				props,
				stagedPortalRegistrations,
			);
		} catch (error) {
			for (const registration of stagedPortalRegistrations) {
				try {
					registration.release();
				} catch {
					// Preserve the error that prevented a transaction from being prepared.
				}
			}
			throw error;
		}
	}

	private createPreparedTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
		stagedPortalRegistrations: Set<UniversalPortalTargetRegistration>,
		scopeRecord: LogicalRecord = this.rootRecord,
		scopeFeatures = 0,
		scopePlacement: { parent: number | null; endAnchor: number | null } | null = null,
	): UniversalTransactionImpl<Container, PublicInstance> {
		let nextId = this.nextId;
		let nextLogicalRangeId = this.nextLogicalRangeId;
		const scoped = scopeRecord !== this.rootRecord;
		const treeFeatures = (scoped ? scopeFeatures : this.treeFeatures) | attempt.treeFeatures;
		const templateExcludedFeatures =
			UNIVERSAL_TREE_PORTAL | UNIVERSAL_TREE_REGION | UNIVERSAL_TREE_HIDDEN;
		// Owner ranges never reach the host, but interleaving their logical IDs
		// with host IDs splits component-owned template instances into separate
		// runs. Keep their transactional identity in a disjoint namespace only
		// when this renderer can consume the resulting contiguous host ranges.
		const compactLogicalRangeIds =
			this.driver.capabilities?.templateProgramRuns === true &&
			(treeFeatures & templateExcludedFeatures) === 0;
		if ((treeFeatures & templateExcludedFeatures) !== 0) {
			const expandBlueprint = (node: BlueprintNode): void => {
				if (node.kind === 'host') expandCollapsedTemplateBlueprint(node);
				for (const child of node.children) expandBlueprint(child);
			};
			expandBlueprint(blueprint);
		}
		const used = new Set<LogicalRecord>([scopeRecord]);
		const changedRangeOwners: DraftRecord[] = [];
		let topologyChanged = false;
		const retainedScopes = new Set<LogicalRecord>();
		// A retained marker matched to its own committed record adopts the whole
		// subtree in place. A marker whose record could not be matched (its
		// physical parent changed shape) expands into an ordinary blueprint built
		// from the committed records: the hosts recreate under the new parent
		// while the owner records, and therefore all hook state, carry over.
		const retainedDraft = (record: LogicalRecord, blueprint: BlueprintRange): DraftRecord => {
			retainedScopes.add(record);
			return { record, blueprint, children: [], isNew: false, hostUpdate: null, retained: true };
		};
		const expandRetained = (marker: BlueprintRange): BlueprintRange => {
			// blueprintFromLogical reports tree features against the active attempt.
			const previousAttempt = CURRENT_ATTEMPT;
			CURRENT_ATTEMPT = attempt;
			try {
				return blueprintFromLogical(marker.retained!) as BlueprintRange;
			} finally {
				CURRENT_ATTEMPT = previousAttempt;
			}
		};
		const reconcileCollapsedTemplate = (record: LogicalRecord, next: BlueprintNode): void => {
			if (record.kind !== 'host' || next.kind !== 'host') return;
			const previous = record.collapsedTemplate;
			const collapsed = next.collapsedTemplate;
			if (previous !== undefined) {
				if (collapsed === undefined || previous.shape !== collapsed.program.shape) {
					this.expandCollapsedTemplate(record);
					if (collapsed !== undefined) expandCollapsedTemplateBlueprint(next);
				}
			} else if (collapsed !== undefined) {
				expandCollapsedTemplateBlueprint(next);
			}
		};
		const reserveCollapsedTemplateIds = (record: LogicalRecord, next: BlueprintNode): void => {
			if (next.kind !== 'host' || next.collapsedTemplate === undefined) return;
			const collapsed = next.collapsedTemplate;
			if (collapsed.prepared !== undefined) {
				collapsed.firstId = record.id;
				nextId += collapsed.program.shape.length - 1;
				return;
			}
			const ids = new Array<number>(collapsed.program.shape.length);
			ids[0] = record.id;
			for (let index = 1; index < ids.length; index++) ids[index] = nextId++;
			collapsed.ids = ids;
		};
		const reconcileChildren = (
			oldChildren: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): DraftRecord[] => {
			if (oldChildren.length === 0) {
				if (blueprints.length === 0) return [];
				topologyChanged = true;
				const output: DraftRecord[] = new Array(blueprints.length);
				let keys: Set<UniversalKey> | undefined;
				for (let index = 0; index < blueprints.length; index++) {
					let child = blueprints[index];
					if (child.key !== null) {
						keys ??= new Set();
						if (keys.has(child.key)) {
							throw new Error(`Duplicate universal child key ${String(child.key)}.`);
						}
						keys.add(child.key);
					}
					if (child.kind === 'range' && child.retained !== undefined) {
						child = expandRetained(child);
					}
					const record = createLogicalRecord(
						compactLogicalRangeIds && child.kind === 'range' ? nextLogicalRangeId-- : nextId++,
						child,
					);
					reserveCollapsedTemplateIds(record, child);
					const draft: DraftRecord = {
						record,
						blueprint: child,
						children: reconcileChildren(record.children, child.children),
						isNew: true,
						hostUpdate: null,
					};
					if (
						record.kind === 'range' &&
						record.owner !== ((child as BlueprintRange).owner ?? null)
					) {
						changedRangeOwners.push(draft);
					}
					output[index] = draft;
				}
				return output;
			}
			if (
				(treeFeatures & UNIVERSAL_TREE_PORTAL) === 0 &&
				oldChildren.length === blueprints.length &&
				oldChildren.every((record, index) => sameRecordShape(record, blueprints[index]))
			) {
				return oldChildren.map((record, index) => {
					used.add(record);
					let blueprint = blueprints[index];
					if (blueprint.kind === 'range' && blueprint.retained !== undefined) {
						if (blueprint.retained === record) return retainedDraft(record, blueprint);
						blueprint = expandRetained(blueprint);
					}
					reconcileCollapsedTemplate(record, blueprint);
					const draft: DraftRecord = {
						record,
						blueprint,
						children: reconcileChildren(record.children, blueprint.children),
						isNew: false,
						hostUpdate: null,
					};
					if (
						record.kind === 'range' &&
						record.owner !== ((blueprint as BlueprintRange).owner ?? null)
					) {
						changedRangeOwners.push(draft);
					}
					return draft;
				});
			}
			const keyed = new Map<UniversalKey, LogicalRecord>();
			for (const old of oldChildren) if (old.key !== null) keyed.set(old.key, old);
			const claimed = new Set<LogicalRecord>();
			const nextKeys = new Set<UniversalKey>();
			const output: DraftRecord[] = [];
			for (let childIndex = 0; childIndex < blueprints.length; childIndex++) {
				let child = blueprints[childIndex];
				let record: LogicalRecord | undefined;
				if (child.key !== null) {
					if (nextKeys.has(child.key)) {
						throw new Error(`Duplicate universal child key ${String(child.key)}.`);
					}
					nextKeys.add(child.key);
					const candidate = keyed.get(child.key);
					if (
						candidate !== undefined &&
						!claimed.has(candidate) &&
						sameRecordShape(candidate, child)
					) {
						record = candidate;
					}
				} else {
					const candidate = oldChildren[childIndex];
					if (
						candidate !== undefined &&
						candidate.key === null &&
						!claimed.has(candidate) &&
						sameRecordShape(candidate, child)
					) {
						record = candidate;
					}
				}
				if (child.kind === 'range' && child.retained !== undefined) {
					if (record === child.retained && record !== undefined) {
						claimed.add(record);
						used.add(record);
						output.push(retainedDraft(record, child));
						continue;
					}
					child = expandRetained(child);
				}
				if (record?.kind === 'portal' && child.kind === 'portal') {
					const previousRegistration = record.portalRegistration;
					const nextRegistration = child.registration;
					if (
						previousRegistration !== null &&
						nextRegistration !== null &&
						previousRegistration !== nextRegistration &&
						Object.is(previousRegistration.handle, nextRegistration.handle)
					) {
						stagedPortalRegistrations.delete(nextRegistration);
						nextRegistration.release();
						child.registration = previousRegistration;
					} else if (
						previousRegistration !== null &&
						nextRegistration !== null &&
						!Object.is(previousRegistration.handle, nextRegistration.handle)
					) {
						topologyChanged = true;
					}
				}
				const isNew = record === undefined;
				record ??= createLogicalRecord(
					compactLogicalRangeIds && child.kind === 'range' ? nextLogicalRangeId-- : nextId++,
					child,
				);
				if (isNew) reserveCollapsedTemplateIds(record, child);
				else reconcileCollapsedTemplate(record, child);
				claimed.add(record);
				used.add(record);
				const draft: DraftRecord = {
					record,
					blueprint: child,
					children: reconcileChildren(record.children, child.children),
					isNew,
					hostUpdate: null,
				};
				if (record.kind === 'range' && record.owner !== ((child as BlueprintRange).owner ?? null)) {
					changedRangeOwners.push(draft);
				}
				output.push(draft);
			}
			if (
				oldChildren.length !== output.length ||
				output.some((draft, index) => draft.record !== oldChildren[index])
			) {
				topologyChanged = true;
			}
			return output;
		};

		const draftRoot: DraftRecord = {
			record: scopeRecord,
			blueprint,
			children: reconcileChildren(scopeRecord.children, blueprint.children),
			isNew: false,
			hostUpdate: null,
		};
		// The scope record itself never passes through reconcileChildren, so its
		// owner link (the root range adopting the root component owner, or a new
		// root owner after the rendered component changed) is staged here.
		if (scopeRecord.kind === 'range' && scopeRecord.owner !== (blueprint.owner ?? null)) {
			changedRangeOwners.push(draftRoot);
		}
		const removedRoots: LogicalRecord[] = [];
		const findRemoved = (parent: LogicalRecord) => {
			for (const child of parent.children) {
				// A retained scope's descendants have no drafts, so they are absent
				// from `used` while remaining fully committed: never descend.
				if (!used.has(child)) removedRoots.push(child);
				else if (!retainedScopes.has(child)) findRemoved(child);
			}
		};
		if (topologyChanged) findRemoved(scopeRecord);
		// A removed root that is itself a still-collapsed program-run instance
		// with implicit contiguous ids needs no per-host teardown: a capable
		// driver accepts one destroy-run per contiguous range and derives the
		// removals, event unbinds, and destroys from the program it already
		// holds. Anything observable per host (refs, callbacks, explicit node
		// ids, portals) falls back to expansion.
		const teardownRunRecords =
			this.driver.capabilities?.teardownRuns === true
				? new Map<LogicalRecord, CommittedCollapsedTemplate>()
				: null;
		const physicalParentIdOf = (record: LogicalRecord): number | null | undefined => {
			let ancestor = record.parent;
			while (ancestor !== undefined && ancestor !== null) {
				if (ancestor.kind === 'portal') return undefined;
				if (ancestor.kind === 'host') return ancestor.id;
				ancestor = ancestor.parent;
			}
			return ancestor === null || record.parent === undefined ? null : undefined;
		};
		for (const removed of removedRoots) {
			const visitRemoved = (record: LogicalRecord, underRemovedHost: boolean): void => {
				if (record.collapsedTemplate !== undefined) {
					const collapsed = record.collapsedTemplate;
					if (
						teardownRunRecords !== null &&
						!underRemovedHost &&
						record.kind === 'host' &&
						collapsed.prepared !== undefined &&
						collapsed.firstId !== undefined &&
						(collapsed.nodes === null || collapsed.nodes.every((node) => node.id === undefined)) &&
						record.visibility === 'visible' &&
						record.ref == null &&
						record.portalRegistration === null &&
						record.lifecycles.size === 0 &&
						record.localCallbacks.size === 0 &&
						physicalParentIdOf(record) !== undefined
					) {
						teardownRunRecords.set(record, collapsed);
						return;
					}
					this.expandCollapsedTemplate(record);
				}
				const nextUnderRemovedHost = underRemovedHost || record.kind === 'host';
				for (const child of record.children) visitRemoved(child, nextUnderRemovedHost);
			};
			visitRemoved(removed, false);
		}
		const previousPortalRegistrations = new Set<UniversalPortalTargetRegistration>();
		const nextPortalRegistrations = new Set<UniversalPortalTargetRegistration>();
		let reorderedPortalRecords: Set<LogicalRecord> | null = null;
		if ((treeFeatures & UNIVERSAL_TREE_PORTAL) !== 0) {
			const previousPortalsByTarget = topologyChanged
				? new Map<UniversalPortalTargetHandle, LogicalRecord[]>()
				: null;
			for (const child of scopeRecord.children) {
				walkLogical(child, (record) => {
					if (record.kind === 'portal' && record.portalRegistration !== null) {
						previousPortalRegistrations.add(record.portalRegistration);
						if (previousPortalsByTarget !== null) {
							let records = previousPortalsByTarget.get(record.portalRegistration.handle);
							if (records === undefined) {
								records = [];
								previousPortalsByTarget.set(record.portalRegistration.handle, records);
							}
							records.push(record);
						}
					}
				});
			}
			const nextPortalsByTarget = topologyChanged
				? new Map<UniversalPortalTargetHandle, DraftRecord[]>()
				: null;
			walkDraft(draftRoot, (draft) => {
				if (draft.blueprint.kind !== 'portal') return;
				const registration = draft.blueprint.registration;
				if (registration === null) {
					throw new Error('A universal portal target was not prepared before reconciliation.');
				}
				nextPortalRegistrations.add(registration);
				if (nextPortalsByTarget !== null) {
					let records = nextPortalsByTarget.get(registration.handle);
					if (records === undefined) {
						records = [];
						nextPortalsByTarget.set(registration.handle, records);
					}
					records.push(draft);
				}
			});
			if (nextPortalsByTarget !== null && previousPortalsByTarget !== null) {
				for (const [target, nextPortals] of nextPortalsByTarget) {
					const previousPortals = previousPortalsByTarget.get(target);
					if (
						previousPortals?.length === nextPortals.length &&
						nextPortals.every((draft, index) => draft.record === previousPortals[index])
					) {
						continue;
					}
					// Portal boundaries are logical records and therefore disappear from
					// their ordinary parent's physical child list. When multiple keyed
					// portals share a target, reorder their physical child ranges in the
					// next logical order explicitly instead of leaving the old target order.
					const reordered = (reorderedPortalRecords ??= new Set());
					for (const draft of nextPortals) reordered.add(draft.record);
				}
			}
		}

		const previousRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
		const stagedRegionBridges: {
			next: UniversalRendererRegionOwnerBridge;
			previous: UniversalRendererRegionOwnerBridge | null;
		}[] = [];
		const nextRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
		if ((treeFeatures & UNIVERSAL_TREE_REGION) !== 0) {
			for (const child of scopeRecord.children) {
				walkLogical(child, (record) => {
					if (record.kind !== 'host') return;
					for (const value of Object.values(record.props)) {
						const bridge = rendererRegionOwnerBridge(value);
						if (bridge !== null) previousRegionBridges.add(bridge);
					}
				});
			}
			const attemptedOwnerRecords = new Set(attempt.owners.map((owner) => owner.record));
			walkDraft(draftRoot, (draft) => {
				if (draft.record.kind !== 'host') return;
				const props = (draft.blueprint as BlueprintHost).props;
				for (const name of Object.keys(props)) {
					const value = props[name];
					if (!isRendererRegion(value)) continue;
					if (value.ownerRenderer !== this.renderer) {
						throw new Error(
							`Universal renderer region owner mismatch: region owner ${JSON.stringify(value.ownerRenderer)} cannot be committed by root ${JSON.stringify(this.renderer)}.`,
						);
					}
					const next = rendererRegionOwnerBridge(value);
					if (next === null) {
						throw new Error(
							'A universal renderer region must be created while its owning component renders.',
						);
					}
					if (!attemptedOwnerRecords.has(next.owner)) {
						throw new Error(
							'A renderer region cannot escape the universal owner attempt that created it.',
						);
					}
					if (nextRegionBridges.has(next)) {
						throw new Error('One renderer-region descriptor cannot own more than one host region.');
					}
					nextRegionBridges.add(next);
					const previous = rendererRegionOwnerBridge(draft.record.props[name]);
					stagedRegionBridges.push({ next, previous });
				}
			});
		}

		const creates: UniversalHostCommand[] = [];
		const updates: UniversalHostCommand[] = [];
		const recreated = new Set<LogicalRecord>();
		const hostDrafts: DraftRecord[] = [];
		const collapsedUpdates: {
			record: LogicalRecord;
			previous: CommittedCollapsedTemplate;
			next: BlueprintCollapsedTemplate;
		}[] = [];
		const templateMounts = new Map<LogicalRecord, PendingUniversalHostTemplateMount>();
		const templatedRecords = new Set<LogicalRecord>();
		const canMountTemplates =
			this.driver.capabilities?.templateMount === true &&
			(treeFeatures & templateExcludedFeatures) === 0;
		walkDraft(draftRoot, (draft) => {
			if (draft.record.kind !== 'host') return;
			hostDrafts.push(draft);
			const blueprintHost = draft.blueprint as BlueprintHost;
			if (canMountTemplates && draft.isNew && !templatedRecords.has(draft.record)) {
				const collapsed = blueprintHost.collapsedTemplate;
				if (collapsed !== undefined) {
					templateMounts.set(draft.record, {
						shape: collapsed.program.shape,
						drafts: [draft],
						nodes:
							collapsed.prepared === undefined ? new Array(collapsed.program.shape.length) : null,
						collapsed,
					});
					templatedRecords.add(draft.record);
				} else if (blueprintHost.templatePlan !== undefined) {
					const plan = blueprintHost.templatePlan;
					const shape = universalHostTemplateShape(plan);
					if (shape !== null) {
						const drafts = collectUniversalHostTemplateDrafts(draft, shape);
						if (drafts !== null) {
							templateMounts.set(draft.record, {
								shape,
								drafts,
								nodes: new Array(drafts.length),
							});
							for (const templated of drafts) templatedRecords.add(templated.record);
						}
					}
				}
			}
			if (
				!draft.isNew &&
				draft.record.collapsedTemplate !== undefined &&
				blueprintHost.collapsedTemplate !== undefined
			) {
				collapsedUpdates.push({
					record: draft.record,
					previous: draft.record.collapsedTemplate,
					next: blueprintHost.collapsedTemplate,
				});
			}
			if (draft.isNew) {
				Object.freeze(blueprintHost.props);
				if (!templatedRecords.has(draft.record)) {
					creates.push({
						op: 'create',
						id: draft.record.id,
						type: blueprintHost.type,
						props: blueprintHost.props,
					});
				}
			} else if (!(
				collapsedTemplateRootPropsEqual(
					draft.record.collapsedTemplate,
					blueprintHost.collapsedTemplate,
				) ?? shallowPropsEqual(draft.record.props, blueprintHost.props)
			)) {
				const props = Object.freeze(blueprintHost.props);
				const kind =
					this.driver.updates?.classify(
						blueprintHost.type,
						draft.record.props,
						blueprintHost.props,
					) ?? 'update';
				if (kind !== 'update' && kind !== 'recreate') {
					throw new TypeError(
						`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
					);
				}
				draft.hostUpdate = kind;
				if (kind === 'recreate') {
					recreated.add(draft.record);
					updates.push({
						op: 'recreate',
						id: draft.record.id,
						type: blueprintHost.type,
						props,
					});
				} else {
					updates.push({ op: 'update', id: draft.record.id, props });
				}
			}
		});

		const removes: UniversalHostCommand[] = [];
		const placements: UniversalHostCommand[] = [];
		const templateRuns: NonNullable<PendingUniversalHostTemplateMount['run']>[] = [];
		const placeTemplate = (
			template: PendingUniversalHostTemplateMount,
			parent: UniversalHostParent,
			before: number | null,
		): void => {
			const collapsed = template.collapsed;
			if (collapsed?.prepared !== undefined) {
				if (this.driver.capabilities?.templateProgramRuns === true) {
					const previous = placements[placements.length - 1];
					if (
						previous?.op === 'mount-template-run' &&
						previous.program === collapsed.prepared.wire &&
						Object.is(previous.parent, parent) &&
						previous.before === before &&
						previous.firstId + previous.count * previous.program.nodes.length === collapsed.firstId
					) {
						const run = previous as NonNullable<PendingUniversalHostTemplateMount['run']>;
						template.runIndex = run.count++;
						run.values.push(...collapsed.values!);
						template.run = run;
						return;
					}
					const run = {
						op: 'mount-template-run' as const,
						parent,
						before,
						program: collapsed.prepared.wire,
						firstId: collapsed.firstId!,
						firstListenerId: null as number | null,
						count: 1,
						values: [...collapsed.values!],
					};
					template.run = run;
					template.runIndex = 0;
					templateRuns.push(run);
					placements.push(run);
					return;
				}
				const range = {
					op: 'mount-template-range' as const,
					parent,
					before,
					program: collapsed.prepared.wire,
					firstId: collapsed.firstId!,
					values: collapsed.values!,
					firstListenerId: null as number | null,
				};
				template.range = range;
				placements.push(range);
				return;
			}
			placements.push({
				op: 'mount-template',
				parent,
				before,
				shape: template.shape,
				nodes: template.nodes!,
			});
		};
		const planPlacements = (
			parentId: UniversalHostParent,
			oldRecords: readonly LogicalRecord[],
			newDrafts: readonly DraftRecord[],
			sourceParentId: UniversalHostParent = parentId,
			forceMove = false,
			endAnchor: number | null = null,
		) => {
			if (oldRecords.length === 0 && !forceMove) {
				if (newDrafts.length === 0) return;
				for (const record of physicalDrafts(newDrafts)) {
					const template = templateMounts.get(record);
					if (template !== undefined) {
						placeTemplate(template, parentId, endAnchor);
					} else if (!templatedRecords.has(record)) {
						placements.push({
							op: 'insert',
							parent: parentId,
							id: record.id,
							before: endAnchor,
						});
					}
				}
				return;
			}
			const oldPhysical = physicalRecords(oldRecords);
			const newPhysical = physicalDrafts(newDrafts);
			if (oldPhysical.length === 0 && newPhysical.length === 0) return;
			const desiredIds = new Set<number>();
			for (const entry of newPhysical) desiredIds.add(entry.id);
			const previousPositions = new Map<number, number>();
			for (let index = 0; index < oldPhysical.length; index++) {
				const old = oldPhysical[index];
				previousPositions.set(old.id, index);
				if (!desiredIds.has(old.id)) {
					if (teardownRunRecords?.has(old) !== true) {
						removes.push({ op: 'remove', parent: sourceParentId, id: old.id });
					}
				}
			}
			if (forceMove) {
				for (const record of newPhysical) {
					placements.push({
						op: previousPositions.has(record.id) ? 'move' : 'insert',
						parent: parentId,
						id: record.id,
						before: endAnchor,
					});
				}
				return;
			}
			const sources = new Int32Array(newPhysical.length);
			let previousSource = -1;
			let reordered = false;
			for (let index = 0; index < newPhysical.length; index++) {
				const source = previousPositions.get(newPhysical[index].id) ?? -1;
				sources[index] = source;
				if (source === -1) continue;
				if (source < previousSource) reordered = true;
				previousSource = source;
			}
			const stable = reordered ? stableUniversalPlacementPositions(sources) : null;
			const isStable = (index: number): boolean =>
				stable === null ? sources[index] !== -1 : stable[index] === 1;
			let nextStable = 0;
			while (nextStable < newPhysical.length && !isStable(nextStable)) nextStable++;
			for (let index = 0; index < newPhysical.length; index++) {
				if (index === nextStable) {
					nextStable++;
					while (nextStable < newPhysical.length && !isStable(nextStable)) nextStable++;
					continue;
				}
				const record = newPhysical[index];
				const id = record.id;
				const before = nextStable < newPhysical.length ? newPhysical[nextStable].id : endAnchor;
				if (sources[index] === -1) {
					const template = templateMounts.get(record);
					if (template !== undefined) placeTemplate(template, parentId, before);
					else placements.push({ op: 'insert', parent: parentId, id, before });
				} else {
					placements.push({ op: 'move', parent: parentId, id, before });
				}
			}
		};
		if (topologyChanged) {
			walkDraftPostOrder(draftRoot, (draft) => {
				if (draft.record === this.rootRecord) {
					planPlacements(null, this.rootRecord.children, draft.children);
				} else if (scoped && draft === draftRoot && scopePlacement !== null) {
					// The scope's own top-level hosts sit inside a physical parent that
					// also holds untouched out-of-scope siblings; the precomputed frame
					// anchors appends before the first host that follows the scope.
					planPlacements(
						scopePlacement.parent,
						draft.record.children,
						draft.children,
						scopePlacement.parent,
						false,
						scopePlacement.endAnchor,
					);
				} else if (draft.record.kind === 'host') {
					if (templatedRecords.has(draft.record)) return;
					planPlacements(draft.record.id, draft.record.children, draft.children);
				} else if (draft.record.kind === 'portal') {
					const nextRegistration = (draft.blueprint as BlueprintPortal).registration!;
					const previousRegistration = draft.record.portalRegistration;
					const retainedTarget =
						previousRegistration !== null &&
						Object.is(previousRegistration.handle, nextRegistration.handle);
					planPlacements(
						nextRegistration.handle,
						draft.record.children,
						draft.children,
						previousRegistration?.handle ?? nextRegistration.handle,
						(previousRegistration !== null && !retainedTarget) ||
							reorderedPortalRecords?.has(draft.record) === true,
					);
				}
			});
		}
		for (const removed of removedRoots) {
			walkLogical(removed, (record) => {
				if (record.kind !== 'portal' || record.portalRegistration === null) return;
				for (const child of physicalRecords(record.children)) {
					removes.push({
						op: 'remove',
						parent: record.portalRegistration.handle,
						id: child.id,
					});
				}
			});
		}
		if (teardownRunRecords !== null && teardownRunRecords.size !== 0) {
			const runs = [...teardownRunRecords.entries()].sort((a, b) => a[1].firstId! - b[1].firstId!);
			let open: {
				parent: UniversalHostParent;
				firstId: number;
				count: number;
				width: number;
				program: PreparedCollapsedTemplateProgram;
			} | null = null;
			const flush = () => {
				if (open === null) return;
				removes.push({
					op: 'destroy-run',
					parent: open.parent,
					firstId: open.firstId,
					count: open.count,
					width: open.width,
				});
				open = null;
			};
			for (const [record, collapsed] of runs) {
				const width = collapsed.shape.length;
				const parent = physicalParentIdOf(record) as number | null;
				if (
					open !== null &&
					open.program === collapsed.prepared &&
					open.parent === parent &&
					open.firstId + open.count * open.width === collapsed.firstId!
				) {
					open.count++;
					continue;
				}
				flush();
				open = {
					parent,
					firstId: collapsed.firstId!,
					count: 1,
					width,
					program: collapsed.prepared!,
				};
			}
			flush();
		}
		const hiddenVisibilityCommands: UniversalHostCommand[] = [];
		const visibleVisibilityCommands: UniversalHostCommand[] = [];
		const stageHiddenVisibility = (draft: DraftRecord) => {
			if (draft.record.kind !== 'host') return;
			const nextHidden = (draft.blueprint as BlueprintHost).visibility !== 'visible';
			const previousHidden = draft.record.visibility !== 'visible';
			if (nextHidden && (draft.isNew || recreated.has(draft.record) || !previousHidden)) {
				hiddenVisibilityCommands.push({
					op: 'visibility',
					id: draft.record.id,
					state: 'hidden',
				});
			}
		};
		const stageVisibleVisibility = (draft: DraftRecord) => {
			if (draft.record.kind !== 'host') return;
			const nextHidden = (draft.blueprint as BlueprintHost).visibility !== 'visible';
			const previousHidden = draft.record.visibility !== 'visible';
			if (!nextHidden && !draft.isNew && previousHidden) {
				visibleVisibilityCommands.push({
					op: 'visibility',
					id: draft.record.id,
					state: 'visible',
				});
			}
		};
		// Hide descendants before ancestors so attached resources can detach from
		// their live parent; reveal parents before descendants for the inverse path.
		if ((treeFeatures & UNIVERSAL_TREE_HIDDEN) !== 0) {
			walkDraftPostOrder(draftRoot, stageHiddenVisibility);
			walkDraft(draftRoot, stageVisibleVisibility);
		}
		const visibilityCommands = [...hiddenVisibilityCommands, ...visibleVisibilityCommands];

		const removedHosts: LogicalRecord[] = [];
		for (const removed of removedRoots) collectRemovedPostOrder(removed, removedHosts);
		let nextListener = this.nextListener;
		const eventCommands: UniversalHostCommand[] = [];
		const stagedEvents = new Map<LogicalRecord, Map<string, CommittedEvent>>();
		const stagedVisibleEventRecords = new Set<LogicalRecord>();
		if ((treeFeatures & UNIVERSAL_TREE_EVENT) !== 0) {
			for (const draft of hostDrafts) {
				const blueprintHost = draft.blueprint as BlueprintHost;
				const blueprintEvents = blueprintHost.events;
				if (blueprintEvents.size === 0 && draft.record.events.size === 0) continue;
				const wasVisible = draft.record.visibility === 'visible';
				const isVisible = blueprintHost.visibility === 'visible';
				if (isVisible) stagedVisibleEventRecords.add(draft.record);
				const nextEvents = new Map<string, CommittedEvent>();
				for (const [type, event] of blueprintEvents) {
					const previous = draft.record.events.get(type);
					const listener = previous?.listener ?? nextListener++;
					const committed = { ...event, listener };
					nextEvents.set(type, committed);
					// A fresh handler closure is not a wire change: the listener ID it
					// dispatches through is stable, and the dispatch table below rebinds
					// to the newest closure whether or not a command is emitted. Only
					// what the host can observe — a new listener, its priority, or its
					// owning scope — re-announces the binding.
					const descriptorChanged =
						previous === undefined ||
						previous.priority !== event.priority ||
						previous.owner !== event.owner;
					if (
						isVisible &&
						(!wasVisible || descriptorChanged) &&
						!templatedRecords.has(draft.record)
					) {
						eventCommands.push({
							op: 'event',
							id: draft.record.id,
							type,
							listener: { id: listener, priority: event.priority },
						});
					}
				}
				for (const [type] of draft.record.events) {
					if (wasVisible && (!isVisible || !nextEvents.has(type))) {
						eventCommands.push({ op: 'event', id: draft.record.id, type, listener: null });
					}
				}
				stagedEvents.set(draft.record, nextEvents);
			}
			for (const record of removedHosts) {
				if (record.visibility !== 'visible') continue;
				for (const [type] of record.events) {
					eventCommands.push({ op: 'event', id: record.id, type, listener: null });
				}
			}
		}
		const stagedCollapsedTemplates = new Map<LogicalRecord, CommittedCollapsedTemplate>();
		const previousCollapsedEventListeners = new Set<number>();
		const nextCollapsedEvents: CommittedEvent[] = [];
		for (const update of collapsedUpdates) {
			const { previous, next } = update;
			if (
				previous.prepared !== undefined &&
				previous.prepared === next.prepared &&
				previous.values !== undefined &&
				next.values !== undefined
			) {
				const program = previous.prepared;
				let nodes = previous.nodes;
				let events = previous.events;
				let changed = false;
				let previousChangedNode = -1;
				let recreatedNodes: Set<number> | null = null;
				for (let valueIndex = 0; valueIndex < program.values.length; valueIndex++) {
					if (Object.is(previous.values[valueIndex], next.values[valueIndex])) continue;
					const index = program.values[valueIndex].node;
					if (index === previousChangedNode) continue;
					previousChangedNode = index;
					const sourceProps = materializePreparedCollapsedHostProps(program, next.values, index);
					const accepted = previous.nodes?.[index];
					const acceptedProps =
						accepted?.props ??
						materializePreparedCollapsedHostProps(program, previous.values, index);
					if (index !== 0) {
						const kind =
							this.driver.updates?.classify(
								previous.shape[index].type,
								acceptedProps,
								sourceProps,
							) ?? 'update';
						if (kind !== 'update' && kind !== 'recreate') {
							throw new TypeError(
								`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
							);
						}
						const id = accepted?.id ?? previous.firstId! + index;
						if (kind === 'recreate') {
							(recreatedNodes ??= new Set()).add(index);
							updates.push({
								op: 'recreate',
								id,
								type: previous.shape[index].type,
								props: sourceProps,
							});
						} else {
							updates.push({ op: 'update', id, props: sourceProps });
						}
					}
					if (nodes !== null) {
						if (nodes === previous.nodes) nodes = nodes.slice();
						(nodes as { id?: number; props: Readonly<Record<string, unknown>> }[])[index] =
							Object.freeze({ ...accepted, props: sourceProps });
					}
					changed = true;
				}
				for (let eventIndex = 0; eventIndex < program.events.length; eventIndex++) {
					const site = program.events[eventIndex];
					const prior = previous.events[eventIndex];
					const handler = next.captures?.[site.slot];
					if (
						prior === undefined ||
						prior.index !== site.node ||
						prior.event.type !== site.type ||
						typeof handler !== 'function'
					) {
						throw new Error('A universal template program lost an accepted event site.');
					}
					if (
						prior.event.handler !== handler ||
						prior.event.owner !== next.owner ||
						prior.event.priority !== site.priority
					) {
						const committed: CommittedEvent = {
							prop: site.prop,
							type: site.type,
							priority: site.priority,
							handler: handler as (...args: any[]) => any,
							owner: next.owner!,
							listener: prior.event.listener,
						};
						if (events === previous.events) events = previous.events.slice();
						(events as CommittedCollapsedTemplateEvent[])[eventIndex] = {
							index: site.node,
							event: committed,
						};
						nextCollapsedEvents.push(committed);
						changed = true;
					}
					if (prior.event.priority !== site.priority || recreatedNodes?.has(site.node)) {
						eventCommands.push({
							op: 'event',
							id: previous.nodes?.[site.node].id ?? previous.firstId! + site.node,
							type: site.type,
							listener: { id: prior.event.listener, priority: site.priority },
						});
					}
				}
				if (changed) {
					if (nodes !== null && nodes !== previous.nodes) Object.freeze(nodes);
					stagedCollapsedTemplates.set(update.record, {
						shape: previous.shape,
						nodes,
						events,
						owner: (update.record.owner ?? attempt.owner.record) as UniversalOwnerRecord,
						...(previous.firstId === undefined ? null : { firstId: previous.firstId }),
						prepared: program,
						values: previousChangedNode === -1 ? previous.values : next.values,
					});
				}
				continue;
			}
			const previousNodes =
				previous.nodes ??
				previous.shape.map((_shape, index) => materializeCommittedCollapsedNode(previous, index));
			const nextNodes =
				next.nodes ??
				next.program.shape.map((_shape, index) =>
					materializeCollapsedBlueprintNode(next, index, next.owner!),
				);
			let nodes = previousNodes;
			const committedEvents: CommittedCollapsedTemplateEvent[] = [];
			let changed = false;
			let previousEventCursor = 0;
			for (let index = 0; index < nextNodes.length; index++) {
				const source = nextNodes[index];
				const accepted = previousNodes[index];
				const acceptedId = accepted.id ?? previous.firstId! + index;
				// Mounts and fallback updates append committed events in node order, so
				// each node can consume its prior range without rescanning the template.
				while (
					previousEventCursor < previous.events.length &&
					previous.events[previousEventCursor].index < index
				) {
					previousEventCursor++;
				}
				const previousEventStart = previousEventCursor;
				while (
					previousEventCursor < previous.events.length &&
					previous.events[previousEventCursor].index === index
				) {
					previousEventCursor++;
				}
				const propsChanged = !shallowPropsEqual(accepted.props, source.props);
				let recreatedNode = false;
				if (propsChanged) {
					Object.freeze(source.props);
					if (index !== 0) {
						const kind =
							this.driver.updates?.classify(
								previous.shape[index].type,
								accepted.props,
								source.props,
							) ?? 'update';
						if (kind !== 'update' && kind !== 'recreate') {
							throw new TypeError(
								`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`,
							);
						}
						recreatedNode = kind === 'recreate';
						updates.push(
							recreatedNode
								? {
										op: 'recreate',
										id: acceptedId,
										type: previous.shape[index].type,
										props: source.props,
									}
								: { op: 'update', id: acceptedId, props: source.props },
						);
					}
					if (nodes === previousNodes) nodes = previousNodes.slice();
					(nodes as { id?: number; props: Readonly<Record<string, unknown>> }[])[index] =
						Object.freeze({
							...accepted,
							props: source.props,
						});
					changed = true;
				}
				if (index === 0) continue;
				const events = source.events;
				if (events === undefined) continue;
				for (const event of events) {
					let prior: CommittedEvent | undefined;
					for (
						let previousEventIndex = previousEventStart;
						previousEventIndex < previousEventCursor;
						previousEventIndex++
					) {
						const candidate = previous.events[previousEventIndex].event;
						if (candidate.type === event.type) {
							prior = candidate;
							break;
						}
					}
					const listener = prior?.listener ?? nextListener++;
					const committed = { ...event, listener };
					committedEvents.push({ index, event: committed });
					if (
						prior === undefined ||
						prior.handler !== event.handler ||
						prior.owner !== event.owner ||
						prior.priority !== event.priority
					) {
						changed = true;
						nextCollapsedEvents.push(committed);
					}
					if (prior === undefined || prior.priority !== event.priority || recreatedNode) {
						eventCommands.push({
							op: 'event',
							id: acceptedId,
							type: event.type,
							listener: { id: listener, priority: event.priority },
						});
					}
				}
			}
			for (const accepted of previous.events) {
				const nextEvents = nextNodes[accepted.index].events;
				if (nextEvents?.some((event) => event.type === accepted.event.type) === true) continue;
				previousCollapsedEventListeners.add(accepted.event.listener);
				eventCommands.push({
					op: 'event',
					id: previousNodes[accepted.index].id ?? previous.firstId! + accepted.index,
					type: accepted.event.type,
					listener: null,
				});
				changed = true;
			}
			if (changed) {
				if (nodes !== previousNodes) Object.freeze(nodes);
				stagedCollapsedTemplates.set(update.record, {
					shape: previous.shape,
					nodes,
					events: committedEvents,
					owner: (update.record.owner ?? attempt.owner.record) as UniversalOwnerRecord,
					...(previous.firstId === undefined ? null : { firstId: previous.firstId }),
					...(next.prepared === undefined
						? null
						: { prepared: next.prepared, values: next.values }),
				});
			}
		}
		for (const template of templateMounts.values()) {
			const collapsed = template.collapsed;
			const count = collapsed?.program.shape.length ?? template.drafts.length;
			const collapsedEvents: CommittedCollapsedTemplateEvent[] = [];
			if (
				(template.range !== undefined || template.run !== undefined) &&
				collapsed?.prepared !== undefined
			) {
				const sites = collapsed.prepared.events;
				if (template.range !== undefined) {
					template.range.firstListenerId = sites.length === 0 ? null : nextListener;
				} else if (sites.length !== 0) {
					const run = template.run!;
					if (run.firstListenerId === null) run.firstListenerId = nextListener;
					if (run.firstListenerId + template.runIndex! * sites.length !== nextListener) {
						throw new Error('A universal template run requires consecutive listener IDs.');
					}
				}
				for (const site of sites) {
					const handler = collapsed.captures?.[site.slot];
					if (typeof handler !== 'function') {
						throw new Error('A universal template program lost a prepared event site.');
					}
					const committed: CommittedEvent = {
						prop: site.prop,
						type: site.type,
						priority: site.priority,
						handler: handler as (...args: any[]) => any,
						owner: collapsed.owner!,
						listener: nextListener++,
					};
					collapsedEvents.push({ index: site.node, event: committed });
					nextCollapsedEvents.push(committed);
				}
				stagedCollapsedTemplates.set(template.drafts[0].record, {
					shape: template.shape,
					nodes: null,
					events: collapsedEvents,
					owner: (template.drafts[0].blueprint as BlueprintHost).owner,
					firstId: collapsed.firstId!,
					prepared: collapsed.prepared,
					values: collapsed.values,
				});
				continue;
			}
			for (let index = 0; index < count; index++) {
				const draft = template.drafts[collapsed === undefined ? index : 0];
				const host = draft.blueprint as BlueprintHost;
				const staged =
					index === 0 || collapsed === undefined ? stagedEvents.get(draft.record) : undefined;
				const source = collapsed?.nodes?.[index];
				const id = collapsed === undefined ? draft.record.id : collapsed.ids![index];
				let events: readonly UniversalHostTemplateEvent[] | undefined;
				if (staged !== undefined && staged.size !== 0) {
					const nextEvents: UniversalHostTemplateEvent[] = [];
					for (const event of staged.values()) {
						nextEvents.push(
							Object.freeze({
								type: event.type,
								listener: Object.freeze({ id: event.listener, priority: event.priority }),
							}),
						);
					}
					events = Object.freeze(nextEvents);
				} else if (source?.events !== undefined && index !== 0) {
					const nextEvents: UniversalHostTemplateEvent[] = [];
					for (const event of source.events) {
						const committed = { ...event, listener: nextListener++ };
						collapsedEvents.push({ index, event: committed });
						nextCollapsedEvents.push(committed);
						nextEvents.push(
							Object.freeze({
								type: committed.type,
								listener: Object.freeze({
									id: committed.listener,
									priority: committed.priority,
								}),
							}),
						);
					}
					events = Object.freeze(nextEvents);
				}
				template.nodes![index] = Object.freeze({
					id,
					props: Object.freeze(source?.props ?? host.props),
					...(events === undefined ? null : { events }),
				});
			}
			Object.freeze(template.nodes);
			if (collapsed !== undefined) {
				const draft = template.drafts[0];
				stagedCollapsedTemplates.set(draft.record, {
					shape: template.shape,
					nodes: template.nodes!,
					events: collapsedEvents,
					owner: (draft.blueprint as BlueprintHost).owner,
				});
			}
		}
		for (const run of templateRuns) Object.freeze(run.values);
		const stageHostCallbacks = (
			op: 'lifecycle' | 'local-callback',
			readBlueprint: (host: BlueprintHost) => Map<string, BlueprintHostCallback>,
			readCommitted: (record: LogicalRecord) => Map<string, CommittedHostCallback>,
		) => {
			const commands: UniversalHostCommand[] = [];
			const staged = new Map<LogicalRecord, Map<string, CommittedHostCallback>>();
			const feature = op === 'lifecycle' ? UNIVERSAL_TREE_LIFECYCLE : UNIVERSAL_TREE_LOCAL_CALLBACK;
			if ((treeFeatures & feature) === 0) return { commands, staged };
			for (const draft of hostDrafts) {
				const blueprintCallbacks = readBlueprint(draft.blueprint as BlueprintHost);
				const previousCallbacks = readCommitted(draft.record);
				const nextCallbacks = new Map<string, CommittedHostCallback>();
				for (const [type, callback] of blueprintCallbacks) {
					const previous = previousCallbacks.get(type);
					const listener = previous?.listener ?? nextListener++;
					nextCallbacks.set(type, { ...callback, listener });
					// Unlike events, a host callback's closure identity is observable:
					// an attach callback re-runs (detach + attach) when its handler is
					// replaced, so a changed closure must re-announce.
					if (
						previous === undefined ||
						previous.handler !== callback.handler ||
						previous.owner !== callback.owner
					) {
						commands.push({ op, id: draft.record.id, type, listener: { id: listener } });
					}
				}
				for (const [type] of previousCallbacks) {
					if (!nextCallbacks.has(type)) {
						commands.push({ op, id: draft.record.id, type, listener: null });
					}
				}
				staged.set(draft.record, nextCallbacks);
			}
			for (const record of removedHosts) {
				for (const [type] of readCommitted(record)) {
					commands.push({ op, id: record.id, type, listener: null });
				}
			}
			return { commands, staged };
		};
		const lifecycleStage = stageHostCallbacks(
			'lifecycle',
			(host) => host.lifecycles,
			(record) => record.lifecycles,
		);
		const localCallbackStage = stageHostCallbacks(
			'local-callback',
			(host) => host.localCallbacks,
			(record) => record.localCallbacks,
		);
		const publicInstanceCommands: UniversalHostCommand[] = [];
		if (
			this.driver.capabilities?.lazyPublicInstances === true &&
			(treeFeatures &
				(UNIVERSAL_TREE_REF | UNIVERSAL_TREE_LIFECYCLE | UNIVERSAL_TREE_LOCAL_CALLBACK)) !==
				0
		) {
			for (const draft of hostDrafts) {
				const host = draft.blueprint as BlueprintHost;
				if (host.ref != null || host.lifecycles.size !== 0 || host.localCallbacks.size !== 0) {
					publicInstanceCommands.push({ op: 'ensure-public-instance', id: draft.record.id });
				}
			}
		}
		const destroys: UniversalHostCommand[] = [];
		for (const record of removedHosts) {
			if (teardownRunRecords?.has(record) === true) continue;
			destroys.push({ op: 'destroy', id: record.id });
		}
		const commands: UniversalHostCommand[] = [
			...creates,
			...updates,
			...publicInstanceCommands,
			...eventCommands,
			...lifecycleStage.commands,
			...localCallbackStage.commands,
			...removes,
			...placements,
			...visibilityCommands,
			...destroys,
		];
		const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
		const retryThenables = [...attempt.retryThenables];
		const retryMemos = retryThenables.length === 0 ? ([] as const) : collectSuspendedMemos(attempt);

		const refDetaches: {
			record: LogicalRecord;
			ref: unknown;
			cleanup: (() => void) | null;
		}[] = [];
		const refAttaches: DraftRecord[] = [];
		const lifecycleHosts = new Set<LogicalRecord>();
		if ((treeFeatures & UNIVERSAL_TREE_LIFECYCLE) !== 0) {
			const hostsById = new Map<number, LogicalRecord>();
			walkDraft(draftRoot, (draft) => {
				if (draft.retained === true) {
					// A retained subtree re-renders nothing, but a reorder around it can
					// still move its top-level hosts; their committed lifecycle
					// callbacks must observe that placement like any drafted host's.
					for (const host of physicalRecords(draft.record.children)) {
						hostsById.set(host.id, host);
					}
					return;
				}
				if (draft.record.kind !== 'host') return;
				hostsById.set(draft.record.id, draft.record);
				if (draft.isNew || draft.hostUpdate !== null) lifecycleHosts.add(draft.record);
			});
			for (const placement of placements) {
				if (placement.op !== 'move') continue;
				const host = hostsById.get(placement.id);
				if (host !== undefined) lifecycleHosts.add(host);
			}
		}
		if ((treeFeatures & UNIVERSAL_TREE_REF) !== 0) {
			for (const removed of removedRoots) {
				walkLogical(removed, (record) => {
					if (record.kind === 'host' && record.refAttached) {
						refDetaches.push({ record, ref: record.ref, cleanup: record.refCleanup });
					}
				});
			}
			walkDraftPostOrder(draftRoot, (draft) => {
				if (draft.record.kind !== 'host') return;
				const blueprintHost = draft.blueprint as BlueprintHost;
				const nextRef = blueprintHost.ref;
				const hide =
					draft.record.visibility === 'visible' && blueprintHost.visibility !== 'visible';
				const reveal =
					draft.record.visibility !== 'visible' && blueprintHost.visibility === 'visible';
				if (
					!draft.isNew &&
					draft.record.refAttached &&
					(recreated.has(draft.record) || hide || !Object.is(draft.record.ref, nextRef))
				) {
					refDetaches.push({
						record: draft.record,
						ref: draft.record.ref,
						cleanup: draft.record.refCleanup,
					});
				}
				if (
					nextRef != null &&
					blueprintHost.visibility === 'visible' &&
					(draft.isNew ||
						recreated.has(draft.record) ||
						reveal ||
						!draft.record.refAttached ||
						!Object.is(draft.record.ref, nextRef))
				) {
					refAttaches.push(draft);
				}
			});
		}

		const draftOwnersParentFirst: DraftOwner[] = [];
		const draftOwnersPostOrder: DraftOwner[] = [];
		const walkDraftOwners = (owner: DraftOwner) => {
			draftOwnersParentFirst.push(owner);
			for (const child of owner.children) walkDraftOwners(child);
			draftOwnersPostOrder.push(owner);
		};
		walkDraftOwners(attempt.owner);
		const changedContexts = new Set<UniversalContext<any>>();
		for (const draft of draftOwnersParentFirst) {
			const previous = draft.record.contextValues;
			if (previous === null || draft.contextValues === null) continue;
			for (const [context, value] of draft.contextValues) {
				if (previous.has(context) && !Object.is(previous.get(context), value)) {
					changedContexts.add(context);
				}
			}
		}
		const draftedRecords = new Set(draftOwnersParentFirst.map((owner) => owner.record));
		// Owners the render adopted without re-drafting stay committed exactly as
		// they are: neither they nor their descendants may be treated as removed.
		const retainedOwnerRoots = new Set<UniversalOwnerRecord>();
		for (const draft of draftOwnersParentFirst) {
			if (draft.retainedChildren === null) continue;
			for (const entry of draft.retainedChildren) retainedOwnerRoots.add(entry.record);
		}
		const committedOwnersParentFirst: UniversalOwnerRecord[] = [];
		const walkCommittedOwners = (owner: UniversalOwnerRecord | null) => {
			if (owner === null) return;
			committedOwnersParentFirst.push(owner);
			for (const child of owner.children) {
				if (!retainedOwnerRoots.has(child)) walkCommittedOwners(child);
			}
		};
		walkCommittedOwners(scoped ? attempt.owner.record : this.owner);
		const removedOwners = committedOwnersParentFirst.filter((owner) => !draftedRecords.has(owner));
		const removedEffectEventCells = collectEffectEventCells(removedOwners);
		const orderedEffectCleanups: { phase: EffectPhase; hook: EffectHook }[] = [];
		for (const owner of removedOwners) {
			for (const hook of owner.effectOrder) {
				if (hook.mounted) orderedEffectCleanups.push({ phase: hook.phase, hook });
			}
		}
		const effectChanges: { owner: DraftOwner; next: EffectHook; changed: boolean }[] = [];
		const disconnectedPreviousEffects = new Set<EffectHook>();
		// Activity/Suspense deactivation follows deletion cleanup order: parent
		// owners before their children. Insertion effects intentionally stay live.
		for (const owner of draftOwnersParentFirst) {
			if (
				owner.record.visibility !== 'visible' ||
				owner.visibility === 'visible' ||
				!owner.record.mounted
			) {
				continue;
			}
			const nextBySlot = new Map(owner.seenEffects.map((effect) => [effect.slot, effect]));
			for (const previous of owner.record.effectOrder) {
				if (previous.phase === 'insertion' || !previous.mounted) continue;
				const next = nextBySlot.get(previous.slot);
				orderedEffectCleanups.push({
					phase: previous.phase,
					hook: next?.phase === previous.phase ? next : previous,
				});
				disconnectedPreviousEffects.add(previous);
			}
		}
		for (const owner of draftOwnersPostOrder) {
			const seenSlots = new Set(owner.seenEffects.map((effect) => effect.slot));
			const nextByPrevious = new Map<EffectHook, EffectHook>();
			for (const next of owner.seenEffects) {
				const visibilityChanged =
					next.phase !== 'insertion' &&
					(owner.record.visibility === 'visible') !== (owner.visibility === 'visible');
				const changed =
					visibilityChanged ||
					(owner.record.hooks.get(next.slot) !== next &&
						(next.previous === null ||
							next.previous.phase !== next.phase ||
							!depsEqual(next.previous.deps, next.deps) ||
							!next.previous.mounted));
				effectChanges.push({ owner, next, changed });
				if (
					changed &&
					next.previous !== null &&
					next.previous.mounted &&
					!disconnectedPreviousEffects.has(next.previous)
				) {
					nextByPrevious.set(next.previous, next);
				}
			}
			for (const previous of owner.record.effectOrder) {
				if (!seenSlots.has(previous.slot)) {
					owner.hooks.delete(previous.slot);
					if (previous.mounted && !disconnectedPreviousEffects.has(previous)) {
						orderedEffectCleanups.push({ phase: previous.phase, hook: previous });
					}
					continue;
				}
				const replacement = nextByPrevious.get(previous);
				if (replacement !== undefined) {
					orderedEffectCleanups.push({ phase: previous.phase, hook: replacement });
				}
			}
		}

		let portalReleaseError: unknown = NO_PENDING_PASSIVE_ERROR;
		const applyLogicalTopology = () => {
			const applyHost = (draft: DraftRecord) => {
				const record = draft.record;
				const host = draft.blueprint as BlueprintHost;
				record.type = host.type;
				record.props = host.props;
				record.ref = host.ref;
				record.owner = host.owner;
				record.events = stagedEvents.get(record) ?? record.events;
				record.lifecycles = lifecycleStage.staged.get(record) ?? record.lifecycles;
				record.localCallbacks = localCallbackStage.staged.get(record) ?? record.localCallbacks;
				record.visibility = host.visibility;
			};
			const applyRangeOwner = (draft: DraftRecord) => {
				const record = draft.record;
				const nextOwner = (draft.blueprint as BlueprintRange).owner ?? null;
				if (record.owner !== nextOwner && record.owner?.range === record) {
					record.owner.range = null;
				}
				record.owner = nextOwner;
				if (nextOwner !== null) nextOwner.range = record;
			};
			const apply = (draft: DraftRecord, parent: LogicalRecord | null) => {
				const record = draft.record;
				if (draft.retained === true) {
					// The adopted subtree is already committed; only its attachment
					// point may have moved.
					record.parent = parent;
					return;
				}
				record.parent = parent;
				record.key = draft.blueprint.key;
				if (record.kind === 'host') {
					applyHost(draft);
				} else if (record.kind === 'range') {
					applyRangeOwner(draft);
				} else if (record.kind === 'portal') {
					record.portalRegistration = (draft.blueprint as BlueprintPortal).registration;
				}
				record.children = draft.children.map((child) => child.record);
				for (const child of draft.children) apply(child, record);
			};
			if (topologyChanged) apply(draftRoot, scoped ? scopeRecord.parent : null);
			else {
				for (const draft of hostDrafts) applyHost(draft);
				for (const draft of changedRangeOwners) applyRangeOwner(draft);
			}
			stagedPortalRegistrations.clear();
			for (const registration of previousPortalRegistrations) {
				if (nextPortalRegistrations.has(registration)) continue;
				try {
					registration.release();
				} catch (error) {
					if (portalReleaseError === NO_PENDING_PASSIVE_ERROR) portalReleaseError = error;
				}
			}
		};
		const lifecycleOrder: LogicalRecord[] = [];
		if (lifecycleHosts.size !== 0) {
			walkDraftPostOrder(draftRoot, (draft) => {
				if (draft.retained === true) {
					for (const host of physicalRecords(draft.record.children)) {
						if (lifecycleHosts.has(host)) lifecycleOrder.push(host);
					}
					return;
				}
				if (lifecycleHosts.has(draft.record)) lifecycleOrder.push(draft.record);
			});
		}
		const hasPassiveWork =
			removedEffectEventCells.length !== 0 ||
			orderedEffectCleanups.some((cleanup) => cleanup.phase === 'passive') ||
			effectChanges.some(({ next, changed }) => changed && next.phase === 'passive');
		// Listeners to retire: those owned by hosts this commit re-staged or
		// removed. Hosts inside retained subtrees have no drafts and keep their
		// committed listeners registered as-is.
		const previousReplacedEventListeners = new Set<number>();
		const previousReplacedLocalCallbacks = new Set<number>();
		if ((treeFeatures & (UNIVERSAL_TREE_EVENT | UNIVERSAL_TREE_LOCAL_CALLBACK)) !== 0) {
			const collectReplaced = (record: LogicalRecord) => {
				if (record.kind !== 'host') return;
				for (const event of record.events.values()) {
					previousReplacedEventListeners.add(event.listener);
				}
				const collapsed = record.collapsedTemplate;
				if (collapsed !== undefined && teardownRunRecords?.has(record) === true) {
					for (const entry of collapsed.events) {
						previousReplacedEventListeners.add(entry.event.listener);
					}
				}
				for (const callback of record.localCallbacks.values()) {
					previousReplacedLocalCallbacks.add(callback.listener);
				}
			};
			for (const draft of hostDrafts) collectReplaced(draft.record);
			for (const removed of removedHosts) collectReplaced(removed);
		}
		const prepareHost = (value: UniversalHostBatch) =>
			this.driver.prepareBatch(this.container, value, {
				invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
			});
		const identity = this.transportIdentity(batch.version);
		let preparedHost: UniversalPreparedHostBatch | null = null;
		let preparedAsyncHost: UniversalAsyncPreparedHostBatch | null = null;
		if (this.transport?.mode === 'async') {
			preparedAsyncHost = this.transport.prepareBatch(this.container, batch, identity);
			if (!isValidPreparedHostBatch(preparedAsyncHost)) {
				throw new TypeError(
					'A universal async transport must return a valid prepared batch token.',
				);
			}
		} else {
			preparedHost =
				this.transport === null
					? prepareHost(batch)
					: this.transport.prepareBatch(this.container, batch, prepareHost);
			if (!isValidPreparedHostBatch(preparedHost)) {
				throw new TypeError('A universal host driver must return a valid prepared batch token.');
			}
		}

		const transaction = new UniversalTransactionImpl(
			this,
			batch,
			preparedHost === null ? null : () => preparedHost!.apply(),
			preparedAsyncHost === null ? null : (acknowledge) => preparedAsyncHost!.apply(acknowledge),
			identity,
			() => {
				applyLogicalTopology();
				if (teardownRunRecords !== null && teardownRunRecords.size !== 0) {
					for (const record of teardownRunRecords.keys()) {
						delete record.collapsedTemplate;
						this.collapsedTemplates?.delete(record);
					}
				}
				if (stagedCollapsedTemplates.size !== 0) {
					const collapsed = (this.collapsedTemplates ??= new Set());
					for (const [record, state] of stagedCollapsedTemplates) {
						record.collapsedTemplate = state;
						collapsed.add(record);
					}
				}
				if (this.hostAttachments !== null && (treeFeatures & UNIVERSAL_TREE_REF) !== 0) {
					for (const record of removedHosts) this.hostAttachments.records.delete(record.id);
					for (const draft of hostDrafts) {
						this.hostAttachments.records.set(draft.record.id, draft.record);
					}
				}
				if ((treeFeatures & UNIVERSAL_TREE_EVENT) !== 0) {
					// The accepted listener table is edited in place: this closure is
					// already the accept point (EVENT_DISPATCHERS mutates here either
					// way), retiring only the listeners of re-staged or removed hosts.
					// Rebuilding from staged events would drop the live listeners of
					// retained subtrees, which this commit never re-staged.
					const handlers = this.handlers;
					for (const listener of previousReplacedEventListeners) {
						EVENT_DISPATCHERS.delete(listener);
						this.publishedListeners.delete(listener);
						handlers.delete(listener);
					}
					for (const listener of previousCollapsedEventListeners) {
						EVENT_DISPATCHERS.delete(listener);
						this.publishedListeners.delete(listener);
						handlers.delete(listener);
					}
					for (const [record, events] of stagedEvents) {
						if (!stagedVisibleEventRecords.has(record)) continue;
						for (const event of events.values()) {
							handlers.set(event.listener, event);
							this.publishedListeners.add(event.listener);
							EVENT_DISPATCHERS.set(event.listener, (payload) =>
								this.dispatchEvent(event.listener, payload),
							);
						}
					}
					for (const event of nextCollapsedEvents) {
						handlers.set(event.listener, event);
						if (!this.publishedListeners.has(event.listener)) {
							this.publishedListeners.add(event.listener);
							EVENT_DISPATCHERS.set(event.listener, (payload) =>
								this.dispatchEvent(event.listener, payload),
							);
						}
					}
				}
				if ((treeFeatures & UNIVERSAL_TREE_LOCAL_CALLBACK) !== 0) {
					const localCallbacks = this.localCallbacks;
					for (const listener of previousReplacedLocalCallbacks) {
						localCallbacks.delete(listener);
					}
					for (const callbacks of localCallbackStage.staged.values()) {
						for (const callback of callbacks.values()) {
							localCallbacks.set(callback.listener, callback);
						}
					}
				}
				for (const owner of removedOwners) {
					owner.disposed = true;
					owner.mounted = false;
					owner.componentProps = null;
					owner.range = null;
					owner.updates.clear();
				}
				for (const draft of draftOwnersParentFirst) {
					const record = draft.record;
					record.componentProps = draft.componentProps;
					record.componentRevision = draft.componentRevision;
					if (!scoped || draft !== attempt.owner) {
						record.parent = draft.parent?.record ?? null;
					}
					record.hooks = draft.hooks;
					record.effectOrder = [...draft.seenEffects];
					if (draft.retainedChildren === null) {
						record.children = draft.children.map((child) => child.record);
					} else {
						// Interleave adopted committed children back at the drafted-child
						// index each was claimed at, restoring exact claim order.
						const merged: UniversalOwnerRecord[] = [];
						let retainedIndex = 0;
						for (let index = 0; index <= draft.children.length; index++) {
							while (
								retainedIndex < draft.retainedChildren.length &&
								draft.retainedChildren[retainedIndex].position === index
							) {
								merged.push(draft.retainedChildren[retainedIndex++].record);
							}
							if (index < draft.children.length) merged.push(draft.children[index].record);
						}
						record.children = merged;
					}
					record.contextValues = draft.contextValues;
					record.isBoundary = draft.isBoundary;
					record.canHandleSuspense = draft.canHandleSuspense;
					record.boundaryError = draft.boundaryError;
					record.hasBoundaryError = draft.hasBoundaryError;
					record.boundaryThenable = draft.boundaryThenable;
					record.visibility = draft.visibility;
					record.mounted = true;
					record.disposed = false;
					for (const [slot, applied] of draft.appliedUpdates) {
						const queue = record.updates.get(slot);
						if (queue !== applied.queue) continue;
						if (!applied.lane) {
							queue.splice(0, applied.consumed);
							if (queue.batches !== undefined) {
								queue.batches.splice(0, applied.consumed);
								queue.rebases?.splice(0, applied.consumed);
								queue.baseState = applied.baseState;
							}
							if (queue.length === 0) record.updates.delete(slot);
							continue;
						}
						const appendedValues = queue.slice(applied.consumed);
						const appendedBatches =
							queue.batches?.slice(applied.consumed) ??
							new Array<UniversalTransitionBatch | null>(appendedValues.length).fill(null);
						const appendedRebases =
							queue.rebases?.slice(applied.consumed) ??
							new Array<boolean>(appendedValues.length).fill(false);
						queue.length = 0;
						queue.push(...applied.remainingValues, ...appendedValues);
						queue.baseState = applied.baseState;
						queue.batches = [...applied.remainingBatches, ...appendedBatches];
						const rebases = [...applied.remainingRebases, ...appendedRebases];
						if (rebases.some(Boolean)) queue.rebases = rebases;
						else delete queue.rebases;
						if (queue.length === 0) {
							record.updates.delete(slot);
						} else if (queue.batches.every((batch) => batch === null)) {
							const pendingValues = queue.filter((_, index) => !rebases[index]);
							queue.length = 0;
							queue.push(...pendingValues);
							delete queue.kind;
							delete queue.baseState;
							delete queue.batches;
							delete queue.rebases;
							if (queue.length === 0) record.updates.delete(slot);
						}
					}
					for (const hook of record.hooks.values()) {
						if (hook.kind === 'effect-event') {
							hook.cell.impl = hook.next;
							hook.cell.active = true;
						}
					}
				}
				if (!scoped) this.owner = attempt.owner.record;
				this.lastComponent = component;
				this.lastProps = props;
				this.retryRenderInput = null;
				this.urgentBoundarySuspension = null;
				if (!scoped) this.bridgeContextReads = attempt.bridgeContextReads;
				if (retryThenables.length > 0) {
					this.publishLocalReplay(retryThenables, retryMemos, component, props);
				}
				this.nextId = nextId;
				this.nextLogicalRangeId = nextLogicalRangeId;
				this.nextUniversalId = attempt.nextUniversalId;
				this.nextListener = nextListener;
				this.treeFeatures = scoped
					? this.treeFeatures | attempt.treeFeatures
					: attempt.treeFeatures;
				for (const context of changedContexts) context.$$version++;
				const retainedRegionCells = new Set<RendererRegionBridgeCell>();
				for (const { next, previous } of stagedRegionBridges) {
					retainedRegionCells.add(next.activate(previous));
				}
				const deactivatedRegionCells = new Set<RendererRegionBridgeCell>();
				for (const previous of previousRegionBridges) {
					const cell = previous.lifecycle();
					if (cell === null || retainedRegionCells.has(cell) || deactivatedRegionCells.has(cell)) {
						continue;
					}
					deactivatedRegionCells.add(cell);
					previous.deactivate();
				}
				if (portalReleaseError !== NO_PENDING_PASSIVE_ERROR) throw portalReleaseError;
			},
			() => (preparedHost ?? preparedAsyncHost)?.afterAccept?.(),
			() => {
				const tasks: (() => void)[] = [];
				for (const cleanup of orderedEffectCleanups) {
					if (cleanup.phase === 'insertion') {
						tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
					}
				}
				for (const { next, changed } of effectChanges) {
					if (changed && next.phase === 'insertion') tasks.push(() => runOwnedEffectCreate(next));
				}
				for (const cleanup of orderedEffectCleanups) {
					if (cleanup.phase === 'layout') {
						tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
					}
				}
				for (const { record, ref, cleanup } of refDetaches) {
					tasks.push(() => runOwnedCommit(record.owner, () => detachRef(record, ref, cleanup)));
				}
				runCommitTasks(tasks);
			},
			() => {
				const tasks: (() => void)[] = [];
				for (const record of lifecycleOrder) {
					for (const callback of record.lifecycles.values()) {
						tasks.push(() =>
							runOwnedCommit(callback.owner, () =>
								callback.handler(this.driver.getPublicInstance(this.container, record.id)),
							),
						);
					}
				}
				runCommitTasks(tasks);
			},
			() => {
				const tasks: (() => void)[] = [];
				if (this.driver.attachments === undefined) {
					for (const draft of refAttaches) {
						const record = draft.record;
						tasks.push(() =>
							runOwnedCommit(record.owner, () =>
								attachRef(record, this.driver.getPublicInstance(this.container, record.id)),
							),
						);
					}
				} else {
					for (const draft of refAttaches) {
						const record = draft.record;
						tasks.push(() => runOwnedCommit(record.owner, () => this.attachHostRef(record)));
					}
					tasks.push(() => this.flushPendingHostAttachmentBatches());
				}
				for (const { owner, next, changed } of effectChanges) {
					if (changed && next.phase === 'layout' && owner.visibility === 'visible') {
						tasks.push(() => runOwnedEffectCreate(next));
					}
				}
				runCommitTasks(tasks);
			},
			hasPassiveWork
				? () => {
						const tasks: (() => void)[] = [];
						try {
							for (const cleanup of orderedEffectCleanups) {
								if (cleanup.phase === 'passive') {
									tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
								}
							}
							if (this.unmounted || this.owner === null || this.owner.disposed) {
								runCommitTasks(tasks);
								return;
							}
							for (const { owner, next, changed } of effectChanges) {
								if (!changed || next.phase !== 'passive') continue;
								if (
									owner.record.hooks.get(next.slot) !== next ||
									owner.record.disposed ||
									owner.record.visibility !== 'visible'
								) {
									continue;
								}
								tasks.push(() => runOwnedEffectCreate(next));
							}
							runCommitTasks(tasks);
						} finally {
							deactivateEffectEventCells(removedEffectEventCells);
						}
					}
				: null,
			() => (preparedHost === null ? preparedAsyncHost!.abort() : preparedHost.abort()),
			() => {
				const tasks = [...stagedPortalRegistrations].map(
					(registration) => () => registration.release(),
				);
				stagedPortalRegistrations.clear();
				tasks.push(() => this.discardDraftOwners(draftOwnersParentFirst));
				runCommitTasks(tasks);
			},
			attempt.transitionBatches,
		);
		return transaction;
	}

	finish(transaction: UniversalTransactionImpl<Container, PublicInstance>): void {
		if (this.pending === transaction) {
			this.pending = null;
			if (transaction.status === 'committed') {
				this.completeTransitionBatches(transaction.transitionBatches);
			} else {
				this.requeueTransitionBatches(transaction.transitionBatches);
			}
			if (this.hostAttachments !== null) this.queueHostAttachmentFlush();
			this.ensureScheduledTransitionWork();
		}
	}

	unmount(): void {
		if (this.hasAsyncTransport()) {
			throw new Error('A transported universal root must use unmountAsync().');
		}
		if (this.unmounted) return;
		const work = this.stageUnmount();
		let acceptedHostError: unknown = NO_PENDING_PASSIVE_ERROR;
		if (work.batch !== null) {
			const prepare = (value: UniversalHostBatch) =>
				this.driver.prepareBatch(this.container, value, {
					invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
				});
			const prepared =
				this.transport === null
					? prepare(work.batch)
					: (this.transport as UniversalCommitTransport<Container>).prepareBatch(
							this.container,
							work.batch,
							prepare,
						);
			try {
				runCommitTasks([
					() => prepared.apply(),
					() => this.markBatchAccepted(work.batch!.version),
					() => prepared.afterAccept?.(),
				]);
			} catch (error) {
				acceptedHostError = error;
			}
		}
		work.finalize(acceptedHostError);
	}

	unmountAsync(): Promise<void> {
		const transport = this.transport;
		if (transport?.mode !== 'async') {
			try {
				this.unmount();
				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		}
		if (this.unmountPromise !== null) return this.unmountPromise;
		if (this.unmounted) return Promise.resolve();
		if (this.pending?.isAwaitingTransportAcknowledgement()) {
			return Promise.reject(
				new Error('Cannot unmount a universal root while a batch awaits acknowledgement.'),
			);
		}
		this.unmounting = true;
		let work: ReturnType<UniversalRootImpl<Container, PublicInstance>['stageUnmount']>;
		try {
			work = this.stageUnmount();
		} catch (error) {
			this.resumeAfterRejectedUnmount();
			return Promise.reject(error);
		}
		if (work.batch === null) {
			try {
				work.finalize(NO_PENDING_PASSIVE_ERROR);
				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		}

		const batch = work.batch;
		const identity = this.transportIdentity(batch.version);
		let prepared: UniversalAsyncPreparedHostBatch;
		try {
			prepared = transport.prepareBatch(this.container, batch, identity);
		} catch (error) {
			this.resumeAfterRejectedUnmount();
			return Promise.reject(error);
		}
		if (!isValidPreparedHostBatch(prepared)) {
			this.resumeAfterRejectedUnmount();
			return Promise.reject(
				new TypeError('A universal async transport must return a valid prepared batch token.'),
			);
		}

		let acknowledged = false;
		let closed = false;
		let finalizeError: unknown = NO_PENDING_PASSIVE_ERROR;
		const rejectBeforeAcknowledgement = (error: unknown): never => {
			closed = true;
			runCommitTasks([
				() => {
					throw error;
				},
				() => prepared.abort(),
				() => this.resumeAfterRejectedUnmount(),
			]);
			throw error;
		};
		const acknowledge = (message: UniversalTransportAcknowledgement) => {
			if (closed || acknowledged || this.unmounted) {
				throw new Error(
					`Universal transport received a stale or duplicate acknowledgement for batch ${batch.version}.`,
				);
			}
			this.validateTransportAcknowledgement(message, batch.version);
			acknowledged = true;
			this.markBatchAccepted(batch.version);
			try {
				runCommitTasks([
					() => prepared.afterAccept?.(),
					() => work.finalize(NO_PENDING_PASSIVE_ERROR),
				]);
			} catch (error) {
				finalizeError = error;
			}
		};

		let applying: Promise<void>;
		try {
			const result = prepared.apply(acknowledge);
			if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
				throw new TypeError('A universal async transport apply() method must return a Promise.');
			}
			applying = Promise.resolve(result);
		} catch (error) {
			closed = true;
			applying = Promise.reject(error);
		}

		this.unmountPromise = applying
			.then(
				() => {
					closed = true;
					if (!acknowledged) {
						return rejectBeforeAcknowledgement(
							new Error(
								`Universal transport completed teardown batch ${batch.version} without acknowledgement.`,
							),
						);
					}
					if (finalizeError !== NO_PENDING_PASSIVE_ERROR) throw finalizeError;
				},
				(error) => {
					closed = true;
					if (!acknowledged) {
						return rejectBeforeAcknowledgement(error);
					}
					if (finalizeError !== NO_PENDING_PASSIVE_ERROR) throw finalizeError;
					throw error;
				},
			)
			.finally(() => {
				this.unmountPromise = null;
			});
		return this.unmountPromise;
	}

	private stageUnmount(): {
		batch: UniversalHostBatch | null;
		finalize: (acceptedHostError: unknown) => void;
	} {
		let pendingAbortError: unknown = NO_PENDING_PASSIVE_ERROR;
		try {
			this.pending?.abort();
		} catch (error) {
			pendingAbortError = error;
		}
		this.expandCollapsedTemplates();
		const owners: UniversalOwnerRecord[] = [];
		const collectOwners = (owner: UniversalOwnerRecord | null) => {
			if (owner === null) return;
			owners.push(owner);
			for (const child of owner.children) collectOwners(child);
		};
		collectOwners(this.owner);
		const stagedTransitionBatches = new Set<UniversalTransitionBatch>();
		for (const owner of owners) {
			for (const queue of owner.updates.values()) {
				for (const transition of queue.batches ?? []) {
					if (transition !== null) stagedTransitionBatches.add(transition);
				}
			}
		}
		const effectEventCells = collectEffectEventCells(owners);
		const effects = owners.flatMap((owner) => owner.effectOrder);
		const children = [...this.rootRecord.children];
		const regionBridges = new Set<UniversalRendererRegionOwnerBridge>();
		for (const child of children) {
			walkLogical(child, (record) => {
				if (record.kind !== 'host') return;
				for (const value of Object.values(record.props)) {
					const bridge = rendererRegionOwnerBridge(value);
					if (bridge !== null) regionBridges.add(bridge);
				}
			});
		}
		const physical = physicalRecords(this.rootRecord.children);
		const portalRegistrations = new Set<UniversalPortalTargetRegistration>();
		const portalRemoves: UniversalHostCommand[] = [];
		for (const child of this.rootRecord.children) {
			walkLogical(child, (record) => {
				if (record.kind !== 'portal' || record.portalRegistration === null) return;
				portalRegistrations.add(record.portalRegistration);
				for (const physicalChild of physicalRecords(record.children)) {
					portalRemoves.push({
						op: 'remove',
						parent: record.portalRegistration.handle,
						id: physicalChild.id,
					});
				}
			});
		}
		const removedHosts: LogicalRecord[] = [];
		for (const child of this.rootRecord.children) collectRemovedPostOrder(child, removedHosts);
		const batch =
			removedHosts.length === 0
				? null
				: freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, [
						...removedHosts.flatMap((record) =>
							[...record.events.keys()].map((type): UniversalHostCommand => ({
								op: 'event',
								id: record.id,
								type,
								listener: null,
							})),
						),
						...removedHosts.flatMap((record) =>
							[...record.lifecycles.keys()].map((type): UniversalHostCommand => ({
								op: 'lifecycle',
								id: record.id,
								type,
								listener: null,
							})),
						),
						...removedHosts.flatMap((record) =>
							[...record.localCallbacks.keys()].map((type): UniversalHostCommand => ({
								op: 'local-callback',
								id: record.id,
								type,
								listener: null,
							})),
						),
						...physical.map((record) => ({
							op: 'remove' as const,
							parent: null,
							id: record.id,
						})),
						...portalRemoves,
						...removedHosts.map((record) => ({ op: 'destroy' as const, id: record.id })),
					]);

		return {
			batch,
			finalize: (acceptedHostError) => {
				this.scheduled = false;
				this.scheduledUrgent = false;
				this.scheduledFullRoot = false;
				this.scheduledOwners.clear();
				SCHEDULED_UNIVERSAL_ROOTS.delete(this);
				const transitionBatches = new Set(this.takeScheduledTransitionBatches());
				for (const transition of stagedTransitionBatches) transitionBatches.add(transition);
				this.finishTransitionBatches(transitionBatches);
				this.suspended?.abort();
				this.cancelSuspendedReplays();
				// Settling transition observers above can briefly enqueue this still-live
				// root. Teardown owns the final scheduler state and drops that stale wave.
				this.scheduled = false;
				this.scheduledUrgent = false;
				this.scheduledFullRoot = false;
				this.scheduledOwners.clear();
				SCHEDULED_UNIVERSAL_ROOTS.delete(this);
				let attachmentUnsubscribeError: unknown = NO_PENDING_PASSIVE_ERROR;
				if (this.hostAttachments !== null) {
					try {
						this.disposeHostAttachments();
					} catch (error) {
						attachmentUnsubscribeError = error;
					}
				}
				this.rootRecord.children = [];
				this.rootRecord.owner = null;
				let portalReleaseError: unknown = NO_PENDING_PASSIVE_ERROR;
				for (const registration of portalRegistrations) {
					try {
						registration.release();
					} catch (error) {
						if (portalReleaseError === NO_PENDING_PASSIVE_ERROR) portalReleaseError = error;
					}
				}
				this.portalHandles.clear();
				for (const listener of this.publishedListeners) EVENT_DISPATCHERS.delete(listener);
				this.publishedListeners.clear();
				this.handlers = new Map();
				this.localCallbacks = new Map();
				for (const owner of owners) {
					owner.disposed = true;
					owner.mounted = false;
					owner.componentProps = null;
					owner.range = null;
					owner.updates.clear();
				}
				const deactivatedRegionCells = new Set<RendererRegionBridgeCell>();
				for (const bridge of regionBridges) {
					const cell = bridge.lifecycle();
					if (cell === null || deactivatedRegionCells.has(cell)) continue;
					deactivatedRegionCells.add(cell);
					bridge.deactivate();
				}
				this.owner = null;
				this.urgentBoundarySuspension = null;
				this.bridgeContextReads = null;
				this.treeFeatures = 0;
				this.unmounted = true;
				this.unmounting = false;
				this.lastComponent = null;
				this.retryRenderInput = null;
				let pendingPassiveError: unknown = NO_PENDING_PASSIVE_ERROR;
				try {
					this.flushPassiveTasks();
				} catch (error) {
					pendingPassiveError = error;
				}
				const insertionTasks: (() => void)[] = [];
				const layoutTasks: (() => void)[] = [];
				const refTasks: (() => void)[] = [];
				const passiveTasks: (() => void)[] = [];
				for (const hook of effects) {
					if (!hook.mounted) continue;
					if (hook.phase === 'passive') passiveTasks.push(() => runOwnedEffectCleanup(hook));
					else if (hook.phase === 'insertion') {
						insertionTasks.push(() => runOwnedEffectCleanup(hook));
					} else {
						layoutTasks.push(() => runOwnedEffectCleanup(hook));
					}
				}
				for (const child of children) {
					walkLogical(child, (record) => {
						if (record.refAttached) {
							refTasks.push(() => runOwnedCommit(record.owner, () => detachRef(record)));
						}
					});
				}
				const syncTasks = [...insertionTasks, ...layoutTasks, ...refTasks];
				if (attachmentUnsubscribeError !== NO_PENDING_PASSIVE_ERROR) {
					syncTasks.unshift(() => {
						throw attachmentUnsubscribeError;
					});
				}
				if (acceptedHostError !== NO_PENDING_PASSIVE_ERROR) {
					syncTasks.unshift(() => {
						throw acceptedHostError;
					});
				}
				if (portalReleaseError !== NO_PENDING_PASSIVE_ERROR) {
					syncTasks.unshift(() => {
						throw portalReleaseError;
					});
				}
				if (pendingPassiveError !== NO_PENDING_PASSIVE_ERROR) {
					syncTasks.unshift(() => {
						throw pendingPassiveError;
					});
				}
				if (pendingAbortError !== NO_PENDING_PASSIVE_ERROR) {
					syncTasks.unshift(() => {
						throw pendingAbortError;
					});
				}
				if (passiveTasks.length > 0) {
					this.enqueuePassive(() => {
						try {
							runCommitTasks(passiveTasks);
						} finally {
							deactivateEffectEventCells(effectEventCells);
						}
					});
					runCommitTasks(syncTasks);
				} else {
					try {
						runCommitTasks(syncTasks);
					} finally {
						deactivateEffectEventCells(effectEventCells);
					}
				}
			},
		};
	}
}

class UniversalTransactionImpl<Container, PublicInstance> implements UniversalTransaction {
	private state: 'prepared' | 'committed' | 'aborted' = 'prepared';
	private hostAccepted = false;
	private commitStarted = false;
	private completion: Promise<void> | null = null;
	private acceptedCommitError: unknown = NO_PENDING_PASSIVE_ERROR;
	private passiveScheduled = false;
	private passiveRan = false;

	constructor(
		private readonly root: UniversalRootImpl<Container, PublicInstance>,
		readonly batch: UniversalHostBatch,
		private readonly applyHost: (() => void) | null,
		private readonly applyHostAsync:
			((acknowledge: (message: UniversalTransportAcknowledgement) => void) => Promise<void>) | null,
		private readonly transportIdentity: UniversalTransportIdentity,
		private readonly publishHost: () => void,
		private readonly afterHostAccept: () => void,
		private readonly afterMutation: () => void,
		private readonly lifecycle: () => void,
		private readonly layout: () => void,
		private readonly passive: (() => void) | null,
		private readonly abortHost: () => void,
		private readonly onAbort: () => void,
		readonly transitionBatches: ReadonlySet<UniversalTransitionBatch>,
	) {}

	get status(): 'prepared' | 'committed' | 'aborted' {
		return this.state;
	}

	isAwaitingTransportAcknowledgement(): boolean {
		return this.applyHostAsync !== null && this.commitStarted && !this.hostAccepted;
	}

	commitMutation(): void {
		if (this.state !== 'prepared' || this.hostAccepted) return;
		if (this.applyHost === null) {
			throw new Error('A transported universal transaction must use commitAsync().');
		}
		this.commitStarted = true;
		this.hostAccepted = true;
		runCommitTasks([
			this.applyHost,
			() => this.root.markBatchAccepted(this.batch.version),
			this.publishHost,
			this.afterHostAccept,
			this.afterMutation,
			this.lifecycle,
		]);
	}

	commitLayout(): void {
		if (this.state !== 'prepared') return;
		if (!this.hostAccepted) this.commitMutation();
		if (this.state !== 'prepared') return;
		try {
			this.layout();
		} finally {
			this.state = 'committed';
			this.root.finish(this);
			this.schedulePassive();
		}
	}

	commitPassive(): void {
		if (this.state !== 'committed') return;
		this.schedulePassive();
		this.root.flushPassivesBeforeRender();
	}

	commit(): void {
		if (this.state !== 'prepared') return;
		if (this.applyHostAsync !== null) {
			throw new Error('A transported universal transaction must use commitAsync().');
		}
		let hasError = false;
		let firstError: unknown;
		try {
			this.commitMutation();
		} catch (error) {
			hasError = true;
			firstError = error;
		}
		// Driver rejection leaves the transaction wholly prepared. Once the host
		// accepted, however, finish every remaining commit callback so one thrown
		// insertion/layout-cleanup cannot strand refs or later layout effects.
		if (this.hostAccepted) {
			try {
				this.commitLayout();
			} catch (error) {
				if (!hasError) {
					hasError = true;
					firstError = error;
				}
			}
		}
		if (hasError) throw firstError;
	}

	commitAsync(): Promise<void> {
		if (this.applyHostAsync === null) {
			try {
				this.commit();
				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		}
		if (this.completion !== null) return this.completion;
		if (this.state !== 'prepared') return Promise.resolve();
		this.commitStarted = true;

		const acknowledge = (message: UniversalTransportAcknowledgement) => {
			if (this.state !== 'prepared' || this.hostAccepted) {
				throw new Error(
					`Universal transport received a stale or duplicate acknowledgement for batch ${this.batch.version}.`,
				);
			}
			this.root.validateTransportAcknowledgement(message, this.transportIdentity.version);
			this.hostAccepted = true;
			let hasError = false;
			let firstError: unknown;
			try {
				runCommitTasks([
					() => this.root.markBatchAccepted(this.batch.version),
					this.publishHost,
					this.afterHostAccept,
					this.afterMutation,
					this.lifecycle,
				]);
			} catch (error) {
				hasError = true;
				firstError = error;
			}
			try {
				this.commitLayout();
			} catch (error) {
				if (!hasError) {
					hasError = true;
					firstError = error;
				}
			}
			if (hasError) this.acceptedCommitError = firstError;
		};

		let applying: Promise<void>;
		try {
			const result = this.applyHostAsync(acknowledge);
			if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
				throw new TypeError('A universal async transport apply() method must return a Promise.');
			}
			applying = Promise.resolve(result);
		} catch (error) {
			applying = Promise.reject(error);
		}

		this.completion = applying.then(
			() => {
				if (!this.hostAccepted) {
					const error = new Error(
						`Universal transport completed batch ${this.batch.version} without acknowledgement.`,
					);
					this.rejectBeforeAcknowledgement();
					throw error;
				}
				if (this.acceptedCommitError !== NO_PENDING_PASSIVE_ERROR) {
					throw this.acceptedCommitError;
				}
			},
			(error) => {
				if (!this.hostAccepted) {
					this.rejectBeforeAcknowledgement();
					throw error;
				}
				if (this.acceptedCommitError !== NO_PENDING_PASSIVE_ERROR) {
					throw this.acceptedCommitError;
				}
				throw error;
			},
		);
		return this.completion;
	}

	private rejectBeforeAcknowledgement(): void {
		if (this.state !== 'prepared' || this.hostAccepted) return;
		this.state = 'aborted';
		try {
			runCommitTasks([this.abortHost, this.onAbort]);
		} finally {
			this.root.finish(this);
		}
	}

	private schedulePassive(): void {
		const passive = this.passive;
		if (passive === null || this.passiveScheduled) return;
		this.passiveScheduled = true;
		this.root.enqueuePassive(() => {
			if (this.passiveRan) return;
			this.passiveRan = true;
			passive();
		});
	}

	abort(): void {
		if (this.state !== 'prepared') return;
		if (this.hostAccepted) {
			throw new Error('A universal transaction cannot be aborted after its host batch committed.');
		}
		if (this.commitStarted) {
			throw new Error(
				'A universal transaction cannot be aborted while awaiting transport acknowledgement.',
			);
		}
		this.state = 'aborted';
		try {
			runCommitTasks([this.abortHost, this.onAbort]);
		} finally {
			this.root.finish(this);
		}
	}
}

function queuePendingUniversalWork(): void {
	for (const root of [...SCHEDULED_UNIVERSAL_ROOTS]) root.queueScheduledWork();
}

function flushScheduledUniversalWave(): void {
	for (const root of [...SCHEDULED_UNIVERSAL_ROOTS]) root.flushScheduledWork();
}

function flushUniversalPassiveWave(): void {
	for (const root of [...PENDING_UNIVERSAL_PASSIVE_ROOTS]) root.flushPassiveTasks();
}

export type UniversalSyncFlusher = <T>(run: () => T) => T;

const INLINE_UNIVERSAL_FLUSHER: UniversalSyncFlusher = (run) => run();

/** Discover a mounted owner scheduler without retaining the owner renderer. */
export function getUniversalHostFlusher(): UniversalSyncFlusher | undefined {
	return getRendererHostFlusher();
}

function runUniversalSyncBoundary<T>(
	run: () => T,
	flushOwner: UniversalSyncFlusher,
	includePassives: boolean,
	label: string,
): T {
	const canDrain =
		UNIVERSAL_SYNC_DEPTH === 0 && CURRENT_ATTEMPT === null && UNIVERSAL_COMMIT_TASK_DEPTH === 0;
	UNIVERSAL_SYNC_DEPTH++;
	if (!canDrain) {
		try {
			return run();
		} finally {
			UNIVERSAL_SYNC_DEPTH--;
			if (UNIVERSAL_SYNC_DEPTH === 0) queuePendingUniversalWork();
		}
	}

	let completed = false;
	let invoked = false;
	let result!: T;
	try {
		for (let pass = 0; pass < UNIVERSAL_SYNC_DRAIN_LIMIT; pass++) {
			flushOwner(() => {
				if (!invoked) {
					invoked = true;
					result = run();
				}
				flushScheduledUniversalWave();
				if (includePassives) flushUniversalPassiveWave();
			});
			if (
				SCHEDULED_UNIVERSAL_ROOTS.size === 0 &&
				(!includePassives || PENDING_UNIVERSAL_PASSIVE_ROOTS.size === 0)
			) {
				completed = true;
				return result;
			}
		}
		throw new Error(
			`${label}(): scheduler did not stabilize after ${UNIVERSAL_SYNC_DRAIN_LIMIT} iterations — likely an infinite render loop`,
		);
	} finally {
		UNIVERSAL_SYNC_DEPTH--;
		// A callback/commit failure or a re-entrant call must not strand work that
		// was deliberately kept off the microtask queue while this scope was open.
		if (UNIVERSAL_SYNC_DEPTH === 0 && !completed) queuePendingUniversalWork();
	}
}

/**
 * Renderer-infrastructure companion to a host runtime's `flushSync`.
 *
 * Universal roots normally batch hook and HMR updates in a microtask. A host
 * package supplies its owner flusher so direct and bridged roots alternate to
 * quiescence before the public scheduler boundary returns.
 */
export function flushUniversalSync<T>(
	run: () => T,
	flushOwner: UniversalSyncFlusher = INLINE_UNIVERSAL_FLUSHER,
): T {
	return runUniversalSyncBoundary(run, flushOwner, false, 'flushUniversalSync');
}

/** Universal renderer companion used by host packages to implement sync `act`. */
export function flushUniversalAct<T>(
	run: () => T,
	flushOwner: UniversalSyncFlusher = INLINE_UNIVERSAL_FLUSHER,
): T {
	return runUniversalSyncBoundary(run, flushOwner, true, 'flushUniversalAct');
}

export function createUniversalRoot<Container, PublicInstance>(
	container: Container,
	driver: UniversalHostDriver<Container, PublicInstance>,
	options: UniversalRootOptions<Container> = {},
): UniversalRoot {
	if (options.scheduleMicrotask !== undefined && typeof options.scheduleMicrotask !== 'function') {
		throw new TypeError('Universal root options.scheduleMicrotask must be a function.');
	}
	const scheduleMicrotask = options.scheduleMicrotask ?? null;
	if (scheduleMicrotask === null && readGlobalMicrotaskScheduler() === undefined) {
		throw new Error(
			'Universal roots require options.scheduleMicrotask when the host has no global queueMicrotask.',
		);
	}
	const root = new UniversalRootImpl(
		container,
		driver,
		options.transport ?? null,
		scheduleMicrotask,
	);
	registerUniversalRootErrorHandlers(root, options);
	return root;
}

function readGlobalMicrotaskScheduler(): ((callback: () => void) => void) | undefined {
	const scheduler = (globalThis as { queueMicrotask?: unknown }).queueMicrotask;
	return typeof scheduler === 'function'
		? (scheduler as (callback: () => void) => void)
		: undefined;
}

const OBJECT_DRIVER_STATE = Symbol('octane.object-driver.state');

export interface ObjectHostInstance {
	readonly id: number;
	readonly type: string;
	props: Readonly<Record<string, unknown>>;
	visible: boolean;
	readonly children: ObjectHostInstance[];
}

interface ObjectDriverState {
	instances: Map<number, ObjectHostInstance>;
	parents: Map<number, number | null>;
	events: Map<number, Map<string, UniversalEventListenerDescriptor>>;
	lifecycles: Map<number, Map<string, UniversalListenerDescriptor>>;
	localCallbacks: Map<number, Map<string, UniversalListenerDescriptor>>;
	localCleanups: Map<number, Map<string, () => void>>;
}

export interface ObjectHostContainer {
	readonly renderer: string;
	readonly children: ObjectHostInstance[];
	readonly commits: UniversalHostBatch[];
	/** Number of driver instances currently allocated, including detached ones. */
	readonly instanceCount: number;
	dispatchEvent(instance: ObjectHostInstance | number, type: string, payload: unknown): unknown;
	readonly [OBJECT_DRIVER_STATE]: ObjectDriverState;
}

export function createObjectContainer(renderer = 'object'): ObjectHostContainer {
	assertRendererId(renderer, 'Object container renderer');
	const state: ObjectDriverState = {
		instances: new Map(),
		parents: new Map(),
		events: new Map(),
		lifecycles: new Map(),
		localCallbacks: new Map(),
		localCleanups: new Map(),
	};
	return {
		renderer,
		children: [],
		commits: [],
		get instanceCount() {
			return state.instances.size;
		},
		dispatchEvent(instance, type, payload) {
			const id = typeof instance === 'number' ? instance : instance.id;
			const current = state.instances.get(id);
			if (current === undefined) throw new Error(`Object driver: unknown event target ${id}.`);
			if (typeof instance !== 'number' && current !== instance) {
				throw new Error(`Object driver: stale event target ${id}.`);
			}
			const listener = state.events.get(id)?.get(type.toLowerCase());
			if (listener === undefined) {
				throw new Error(`Object driver: target ${id} has no ${JSON.stringify(type)} listener.`);
			}
			const dispatch = EVENT_DISPATCHERS.get(listener.id);
			if (dispatch === undefined) {
				throw new Error(`Object driver: inactive listener ${listener.id}.`);
			}
			return dispatch(payload);
		},
		[OBJECT_DRIVER_STATE]: state,
	};
}

function objectChildren(
	container: ObjectHostContainer,
	parent: number | null,
	instances: Map<number, ObjectHostInstance>,
): ObjectHostInstance[] {
	if (parent === null) return container.children;
	const instance = instances.get(parent);
	if (instance === undefined) throw new Error(`Object driver: unknown parent ${parent}.`);
	return instance.children;
}

export function createObjectDriver(
	renderer = 'object',
): UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> {
	assertRendererId(renderer, 'Object driver renderer');
	return {
		id: renderer,
		capabilities: { text: 'host', localHostCallbacks: true, visibility: true },
		events: {
			classify(name) {
				if (!/^on[A-Z]/.test(name)) return null;
				return { type: name.slice(2).toLowerCase(), priority: 'discrete' };
			},
		},
		lifecycles: {
			classify(name) {
				return name === 'onUpdate' ? { type: 'update' } : null;
			},
		},
		localCallbacks: {
			classify(name, value) {
				return name === 'attach' && (value == null || typeof value === 'function')
					? { type: 'attach' }
					: null;
			},
		},
		prepareBatch(container, batch, context) {
			if (container.renderer !== renderer || batch.renderer !== renderer) {
				throw new Error(
					`Object driver renderer mismatch: driver ${JSON.stringify(renderer)}, container ${JSON.stringify(container.renderer)}, batch ${JSON.stringify(batch.renderer)}.`,
				);
			}
			const state = container[OBJECT_DRIVER_STATE];
			type SimulatedInstance = {
				type: string;
				props: Readonly<Record<string, unknown>>;
				visible: boolean;
				children: number[];
				events: Map<string, UniversalEventListenerDescriptor>;
				lifecycles: Map<string, UniversalListenerDescriptor>;
				localCallbacks: Map<string, UniversalListenerDescriptor>;
			};
			const simulated = new Map<number, SimulatedInstance>();
			const destroyed = new Set<number>();
			const readSimulated = (id: number): SimulatedInstance | undefined => {
				if (destroyed.has(id)) return undefined;
				let value = simulated.get(id);
				if (value !== undefined) return value;
				const instance = state.instances.get(id);
				if (instance === undefined) return undefined;
				value = {
					type: instance.type,
					props: instance.props,
					visible: instance.visible,
					children: instance.children.map((child) => child.id),
					events: new Map(state.events.get(id)),
					lifecycles: new Map(state.lifecycles.get(id)),
					localCallbacks: new Map(state.localCallbacks.get(id)),
				};
				simulated.set(id, value);
				return value;
			};
			const hasSimulated = (id: number): boolean =>
				!destroyed.has(id) && (simulated.has(id) || state.instances.has(id));
			const stagedInstances = new Map<number, ObjectHostInstance>();
			const cleanupKeys = new Set<string>();
			const invokeKeys = new Set<string>();
			const keyFor = (id: number, type: string) => `${id}:${type}`;
			const parseKey = (key: string): [number, string] => {
				const separator = key.indexOf(':');
				return [Number(key.slice(0, separator)), key.slice(separator + 1)];
			};
			const DETACHED = Symbol('octane.object-driver.detached');
			type SimulatedParent = number | null | typeof DETACHED;
			const parentChanges = new Map<number, SimulatedParent>();
			let rootChildren: number[] | null = null;
			const readParent = (id: number): SimulatedParent => {
				if (parentChanges.has(id)) return parentChanges.get(id)!;
				return state.parents.has(id) ? state.parents.get(id)! : DETACHED;
			};
			const simulatedChildren = (parent: number | null) => {
				if (parent === null) {
					return (rootChildren ??= container.children.map((child) => child.id));
				}
				const value = readSimulated(parent);
				if (value === undefined) throw new Error(`Object driver: unknown parent ${parent}.`);
				return value.children;
			};
			const detachSimulated = (id: number): void => {
				const parent = readParent(id);
				if (parent === DETACHED) return;
				const children = simulatedChildren(parent);
				const index = children.indexOf(id);
				if (index === -1) throw new Error(`Object driver: child ${id} is not attached.`);
				children.splice(index, 1);
				parentChanges.set(id, DETACHED);
			};
			for (const command of batch.commands) {
				if (command.op === 'create') {
					if (hasSimulated(command.id))
						throw new Error(`Object driver: duplicate id ${command.id}.`);
					destroyed.delete(command.id);
					simulated.set(command.id, {
						type: command.type,
						props: command.props,
						visible: true,
						children: [],
						events: new Map(),
						lifecycles: new Map(),
						localCallbacks: new Map(),
					});
					stagedInstances.set(command.id, {
						id: command.id,
						type: command.type,
						props: command.props,
						visible: true,
						children: [],
					});
				} else if (command.op === 'update') {
					const value = readSimulated(command.id);
					if (value === undefined) throw new Error(`Object driver: unknown update ${command.id}.`);
					value.props = command.props;
				} else if (command.op === 'recreate') {
					const value = readSimulated(command.id);
					const current = state.instances.get(command.id);
					if (value === undefined || current === undefined) {
						throw new Error(`Object driver: unknown recreate ${command.id}.`);
					}
					if (value.type !== command.type) {
						throw new Error(`Object driver: recreate type mismatch for ${command.id}.`);
					}
					value.props = command.props;
					stagedInstances.set(command.id, {
						id: command.id,
						type: command.type,
						props: command.props,
						visible: true,
						children: [...current.children],
					});
					for (const type of value.localCallbacks.keys()) {
						cleanupKeys.add(keyFor(command.id, type));
						invokeKeys.add(keyFor(command.id, type));
					}
				} else if (command.op === 'visibility') {
					const value = readSimulated(command.id);
					if (value === undefined) {
						throw new Error(`Object driver: unknown visibility target ${command.id}.`);
					}
					value.visible = command.state === 'visible';
				} else if (command.op === 'event') {
					const value = readSimulated(command.id);
					if (value === undefined)
						throw new Error(`Object driver: unknown event target ${command.id}.`);
					if (command.listener === null) value.events.delete(command.type);
					else value.events.set(command.type, command.listener);
				} else if (command.op === 'lifecycle') {
					const value = readSimulated(command.id);
					if (value === undefined)
						throw new Error(`Object driver: unknown lifecycle target ${command.id}.`);
					if (command.listener === null) value.lifecycles.delete(command.type);
					else value.lifecycles.set(command.type, command.listener);
				} else if (command.op === 'local-callback') {
					const value = readSimulated(command.id);
					if (value === undefined)
						throw new Error(`Object driver: unknown local callback target ${command.id}.`);
					const key = keyFor(command.id, command.type);
					cleanupKeys.add(key);
					if (command.listener === null) value.localCallbacks.delete(command.type);
					else {
						value.localCallbacks.set(command.type, command.listener);
						invokeKeys.add(key);
					}
				} else if (command.op === 'insert' || command.op === 'move') {
					if (command.parent !== null && typeof command.parent !== 'number') {
						throw new Error('Object driver does not support portal target parents.');
					}
					if (!hasSimulated(command.id))
						throw new Error(`Object driver: unknown child ${command.id}.`);
					detachSimulated(command.id);
					const children = simulatedChildren(command.parent);
					const before =
						command.before === null ? children.length : children.indexOf(command.before);
					if (before === -1) throw new Error(`Object driver: unknown before id ${command.before}.`);
					children.splice(before, 0, command.id);
					parentChanges.set(command.id, command.parent);
					if (command.op === 'move') {
						for (const type of readSimulated(command.id)!.localCallbacks.keys()) {
							const key = keyFor(command.id, type);
							cleanupKeys.add(key);
							invokeKeys.add(key);
						}
					}
				} else if (command.op === 'remove') {
					if (command.parent !== null && typeof command.parent !== 'number') {
						throw new Error('Object driver does not support portal target parents.');
					}
					const children = simulatedChildren(command.parent);
					const index = children.indexOf(command.id);
					if (index === -1) throw new Error(`Object driver: child ${command.id} is not attached.`);
					children.splice(index, 1);
					parentChanges.set(command.id, DETACHED);
					for (const type of readSimulated(command.id)!.localCallbacks.keys()) {
						cleanupKeys.add(keyFor(command.id, type));
					}
				} else if (command.op === 'destroy') {
					const instance = readSimulated(command.id);
					if (instance === undefined)
						throw new Error(`Object driver: unknown destroy ${command.id}.`);
					detachSimulated(command.id);
					for (const child of instance.children) parentChanges.set(child, DETACHED);
					instance.children.length = 0;
					destroyed.add(command.id);
				}
			}
			for (const [id, instance] of stagedInstances) {
				const staged = readSimulated(id);
				if (staged === undefined) continue;
				instance.visible = staged.visible;
				instance.children.splice(
					0,
					instance.children.length,
					...staged.children.map(
						(child) => stagedInstances.get(child) ?? state.instances.get(child)!,
					),
				);
			}
			let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
			let acceptedCallbacksRan = false;
			const liveChildren = (parent: number | null): ObjectHostInstance[] =>
				objectChildren(container, parent, state.instances);
			const detachLive = (id: number): void => {
				if (!state.parents.has(id)) return;
				const parent = state.parents.get(id)!;
				const instance = state.instances.get(id)!;
				const children = liveChildren(parent);
				const index = children.indexOf(instance);
				if (index !== -1) children.splice(index, 1);
				state.parents.delete(id);
			};
			return {
				apply() {
					if (status !== 'prepared') return;
					status = 'applied';
					const tasks: (() => void)[] = [];
					for (const key of cleanupKeys) {
						const [id, type] = parseKey(key);
						const cleanups = state.localCleanups.get(id);
						const cleanup = cleanups?.get(type);
						if (cleanup === undefined) continue;
						cleanups!.delete(type);
						tasks.push(cleanup);
					}
					tasks.push(() => {
						for (const command of batch.commands) {
							if (command.op === 'create') {
								const instance = stagedInstances.get(command.id)!;
								state.instances.set(command.id, instance);
								for (const child of instance.children) {
									state.parents.set(child.id, command.id);
								}
								state.events.set(command.id, new Map());
								state.lifecycles.set(command.id, new Map());
								state.localCallbacks.set(command.id, new Map());
								state.localCleanups.set(command.id, new Map());
							} else if (command.op === 'update') {
								state.instances.get(command.id)!.props = command.props;
							} else if (command.op === 'recreate') {
								const previous = state.instances.get(command.id)!;
								const replacement = stagedInstances.get(command.id)!;
								if (state.parents.has(command.id)) {
									const parent = liveChildren(state.parents.get(command.id)!);
									const index = parent.indexOf(previous);
									if (index !== -1) parent[index] = replacement;
								}
								previous.children.length = 0;
								state.instances.set(command.id, replacement);
							} else if (command.op === 'visibility') {
								state.instances.get(command.id)!.visible = command.state === 'visible';
							} else if (command.op === 'event') {
								const events = state.events.get(command.id)!;
								if (command.listener === null) events.delete(command.type);
								else events.set(command.type, command.listener);
							} else if (command.op === 'lifecycle') {
								const lifecycles = state.lifecycles.get(command.id)!;
								if (command.listener === null) lifecycles.delete(command.type);
								else lifecycles.set(command.type, command.listener);
							} else if (command.op === 'local-callback') {
								const callbacks = state.localCallbacks.get(command.id)!;
								if (command.listener === null) callbacks.delete(command.type);
								else callbacks.set(command.type, command.listener);
							} else if (command.op === 'insert' || command.op === 'move') {
								if (command.parent !== null && typeof command.parent !== 'number') {
									throw new Error('Object driver does not support portal target parents.');
								}
								const instance = state.instances.get(command.id)!;
								detachLive(command.id);
								const children = liveChildren(command.parent);
								const before =
									command.before === null
										? children.length
										: children.indexOf(state.instances.get(command.before)!);
								children.splice(before, 0, instance);
								state.parents.set(command.id, command.parent);
							} else if (command.op === 'remove') {
								if (command.parent !== null && typeof command.parent !== 'number') {
									throw new Error('Object driver does not support portal target parents.');
								}
								const children = liveChildren(command.parent);
								children.splice(children.indexOf(state.instances.get(command.id)!), 1);
								state.parents.delete(command.id);
							} else if (command.op === 'destroy') {
								const instance = state.instances.get(command.id)!;
								detachLive(command.id);
								for (const child of instance.children) state.parents.delete(child.id);
								instance.children.length = 0;
								state.instances.delete(command.id);
								state.parents.delete(command.id);
								state.events.delete(command.id);
								state.lifecycles.delete(command.id);
								state.localCallbacks.delete(command.id);
								state.localCleanups.delete(command.id);
							}
						}
						container.commits.push(batch);
					});
					runCommitTasks(tasks);
				},
				afterAccept() {
					if (status !== 'applied' || acceptedCallbacksRan) return;
					acceptedCallbacksRan = true;
					const tasks: (() => void)[] = [];
					for (const key of invokeKeys) {
						const [id, type] = parseKey(key);
						const instance = state.instances.get(id);
						const listener = state.localCallbacks.get(id)?.get(type);
						if (instance === undefined || listener === undefined) continue;
						tasks.push(() => {
							const parentId = state.parents.get(id);
							const parent = parentId == null ? null : (state.instances.get(parentId) ?? null);
							const cleanup = context.invokeLocalCallback(listener.id, [parent, instance]);
							if (cleanup == null) return;
							if (typeof cleanup !== 'function') {
								throw new TypeError(
									'A universal local host callback must return a cleanup or nothing.',
								);
							}
							state.localCleanups.get(id)!.set(type, cleanup as () => void);
						});
					}
					runCommitTasks(tasks);
				},
				abort() {
					if (status !== 'prepared') return;
					status = 'aborted';
					for (const instance of stagedInstances.values()) instance.children.length = 0;
					stagedInstances.clear();
				},
			};
		},
		getPublicInstance(container, id) {
			return container[OBJECT_DRIVER_STATE].instances.get(id) ?? null;
		},
	};
}
