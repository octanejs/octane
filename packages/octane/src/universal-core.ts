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
import {
	__profileBeginRender,
	__profileComponentSource,
	__profileEndRender,
	__profileSchedule,
	__profileTrackComponent,
} from './profiling.js';
import {
	isStateModelTransparent,
	markStateModel,
	markStateModelMethods,
	markStateModelTransparent,
	normalizeRuntimeStateModel,
	STATE_WRITE_CONTEXT,
	stateModelOf,
	STATE_MODEL_CAUSAL,
	STATE_MODEL_PERMISSIVE,
	type RuntimeStateModel,
} from './state-model-runtime.js';

// Replaced by the package build; keep browser-only renderer consumers from
// needing Node's ambient types merely to type-check this source module.
declare const process: { env: { NODE_ENV?: string } };

export { markStateModel, markStateModelMethods };

const UNIVERSAL_PLAN = Symbol.for('octane.universal.plan');
const UNIVERSAL_VALUE = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST = Symbol.for('octane.universal.list');
const UNIVERSAL_COMPONENT = Symbol.for('octane.universal.component');
const UNIVERSAL_COMPONENT_VALUE = Symbol.for('octane.universal.component-value');
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

const NO_CHILDREN = Symbol('octane.universal.no-children');
const NO_KEY = Symbol('octane.universal.no-key');
const NO_PENDING_PASSIVE_ERROR = Symbol('octane.universal.no-pending-passive-error');

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

export type UniversalPropEntry =
	| readonly ['set', name: string, value: unknown]
	| readonly ['spread', value: unknown];

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

export type UniversalHostCommand =
	| {
			readonly op: 'create';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'update';
			readonly id: number;
			readonly props: Readonly<Record<string, unknown>>;
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
	| { readonly op: 'destroy'; readonly id: number };

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
	| UniversalTransportCommitMessage
	| UniversalTransportAbortMessage;

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

interface BlueprintRange {
	kind: 'range';
	key: UniversalKey | null;
	children: BlueprintNode[];
	compactLeafList?: BlueprintCompactLeafList;
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

interface DraftRecord {
	record: LogicalRecord;
	blueprint: BlueprintNode;
	children: DraftRecord[];
	isNew: boolean;
	hostUpdate: UniversalHostUpdateKind | null;
}

type EffectPhase = 'insertion' | 'layout' | 'passive';
type UniversalVisibility = 'visible' | 'activity-hidden' | 'suspense-hidden';

interface StateHook<T = unknown> {
	kind: 'state';
	value: T;
	model: RuntimeStateModel;
	set: (value: T | ((previous: T) => T)) => void;
	get: () => T;
}

interface ReducerHook<S = unknown, A = unknown> {
	kind: 'reducer';
	value: S;
	model: RuntimeStateModel;
	reducer: (state: S, action: A) => S;
	dispatch: (action: A) => void;
	get: () => S;
}

interface MemoHook<T = unknown> {
	kind: 'memo';
	value: T;
	deps: readonly unknown[] | null;
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
	| ReducerHook<any, any>
	| MemoHook
	| RefHook
	| IdHook
	| EffectHook
	| EffectEventHook;

interface UniversalOwnerRecord {
	readonly root: UniversalRootImpl<any, any>;
	readonly renderer: string;
	component: UniversalComponent<any> | null;
	parent: UniversalOwnerRecord | null;
	identityPath: readonly unknown[];
	key: unknown;
	id: number;
	rangeKey: symbol;
	hooks: Map<unknown, UniversalHook>;
	effectOrder: EffectHook[];
	children: UniversalOwnerRecord[];
	contextValues: Map<UniversalContext<any>, unknown> | null;
	updates: Map<unknown, unknown[]>;
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
	owners: DraftOwner[];
	treeFeatures: number;
	replayEntries: readonly SuspendedMemoEntry[];
	retryThenables: Set<PromiseLike<unknown>>;
	nextUniversalId: number;
	implicitSlot: number;
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
	parent: DraftOwner | null;
	replayPath: readonly SuspendedOwnerSegment[];
	hooks: Map<unknown, UniversalHook>;
	clonedHooks: Set<unknown>;
	seenEffects: EffectHook[];
	children: DraftOwner[];
	claimedChildren: Set<UniversalOwnerRecord>;
	childOwnerBuckets: OwnerIdentityIndex<UniversalOwnerRecord[]> | null;
	childClaimCursors: OwnerIdentityIndex<number> | null;
	childReplayOrdinals: OwnerIdentityIndex<number> | null;
	contextValues: Map<UniversalContext<any>, unknown> | null;
	appliedUpdates: Map<unknown, number>;
	needsRender: boolean;
	implicitSlot: number;
	boundaryError: unknown;
	hasBoundaryError: boolean;
	boundaryThenable: PromiseLike<unknown> | null;
	isBoundary: boolean;
	canHandleSuspense: boolean;
	visibility: UniversalVisibility;
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
const SCHEDULED_UNIVERSAL_ROOTS = new Set<UniversalRootImpl<any, any>>();
const PENDING_UNIVERSAL_PASSIVE_ROOTS = new Set<UniversalRootImpl<any, any>>();
let UNIVERSAL_SYNC_DEPTH = 0;
let UNIVERSAL_COMMIT_TASK_DEPTH = 0;
const UNIVERSAL_STATE_PHASE_RENDER = 1;
const UNIVERSAL_STATE_PHASE_INITIALIZER = 2;
const UNIVERSAL_STATE_PHASE_MEMO = 3;
const UNIVERSAL_STATE_PHASE_UPDATER = 4;
const UNIVERSAL_STATE_PHASE_REDUCER = 5;
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

class UniversalCausalStateModelError extends Error {}

function universalStatePhaseName(): string {
	switch (STATE_WRITE_CONTEXT.phase) {
		case UNIVERSAL_STATE_PHASE_INITIALIZER:
			return 'a state initializer is evaluating';
		case UNIVERSAL_STATE_PHASE_MEMO:
			return 'a memo calculation is evaluating';
		case UNIVERSAL_STATE_PHASE_UPDATER:
			return 'a functional state updater is evaluating';
		case UNIVERSAL_STATE_PHASE_REDUCER:
			return 'a reducer is evaluating';
		default:
			return 'a component is rendering';
	}
}

function assertUniversalCausalStateWriteAllowed(
	model: RuntimeStateModel,
	target: UniversalOwnerRecord,
): void {
	if (
		!STATE_WRITE_CONTEXT.active ||
		STATE_WRITE_CONTEXT.depth === 0 ||
		(model !== STATE_MODEL_CAUSAL && STATE_WRITE_CONTEXT.sourceModel !== STATE_MODEL_CAUSAL)
	)
		return;
	const component = STATE_WRITE_CONTEXT.source ?? target.component;
	const name = component?.name || 'Unknown';
	if (process.env.NODE_ENV === 'production') {
		throw new UniversalCausalStateModelError(
			`Octane causal-state violation (OCTANE_CAUSAL_STATE_WRITE) in <${name}>.`,
		);
	}
	throw new UniversalCausalStateModelError(
		`Octane's causal state model does not allow a state update while ${universalStatePhaseName()} in <${name}>. ` +
			'Derive render values directly, or move the transition to the event, action, or external-source callback that caused it.',
	);
}

function evaluateUniversalState<T>(
	model: RuntimeStateModel,
	phase: number,
	owner: UniversalOwnerRecord | null,
	fn: () => T,
	source: Function | null = owner?.component ?? STATE_WRITE_CONTEXT.source,
): T {
	if (!STATE_WRITE_CONTEXT.active) return fn();
	const previousModel = STATE_WRITE_CONTEXT.sourceModel;
	const previousPhase = STATE_WRITE_CONTEXT.phase;
	const previousSource = STATE_WRITE_CONTEXT.source;
	STATE_WRITE_CONTEXT.depth++;
	STATE_WRITE_CONTEXT.sourceModel = model;
	STATE_WRITE_CONTEXT.phase = phase;
	STATE_WRITE_CONTEXT.source = source;
	try {
		return fn();
	} finally {
		STATE_WRITE_CONTEXT.sourceModel = previousModel;
		STATE_WRITE_CONTEXT.phase = previousPhase;
		STATE_WRITE_CONTEXT.source = previousSource;
		STATE_WRITE_CONTEXT.depth--;
	}
}

function runWithUniversalStateWriteContextSuspended<T>(fn: () => T): T {
	if (!STATE_WRITE_CONTEXT.active || STATE_WRITE_CONTEXT.depth === 0) return fn();
	const previousDepth = STATE_WRITE_CONTEXT.depth;
	const previousModel = STATE_WRITE_CONTEXT.sourceModel;
	const previousPhase = STATE_WRITE_CONTEXT.phase;
	const previousSource = STATE_WRITE_CONTEXT.source;
	STATE_WRITE_CONTEXT.depth = 0;
	STATE_WRITE_CONTEXT.sourceModel = STATE_MODEL_PERMISSIVE;
	STATE_WRITE_CONTEXT.phase = 0;
	STATE_WRITE_CONTEXT.source = null;
	try {
		return fn();
	} finally {
		STATE_WRITE_CONTEXT.depth = previousDepth;
		STATE_WRITE_CONTEXT.sourceModel = previousModel;
		STATE_WRITE_CONTEXT.phase = previousPhase;
		STATE_WRITE_CONTEXT.source = previousSource;
	}
}

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
				if (!routeUniversalOwnerError(this.owner, error)) console.error(error);
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

	abort(): void {
		if (this.state !== 'suspended') return;
		this.state = 'aborted';
		this.root.finishSuspension(this, false);
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
		const props = Object.freeze({ ...(node.props ?? {}) });
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
	const needsProtoGuard = hasOwnProto && !Object.prototype.hasOwnProperty.call(props, '__proto__');
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
): UniversalPropsValue {
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
	const hasKey = Object.prototype.hasOwnProperty.call(props, 'key');
	const key = hasKey ? props.key : null;
	if (hasKey) delete props.key;
	return {
		$$kind: UNIVERSAL_PROPS,
		props: Object.freeze(props),
		key,
		hasKey,
		hasChildren: Object.prototype.hasOwnProperty.call(props, 'children'),
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
): UniversalForValue {
	return { $$kind: UNIVERSAL_FOR, items, key, render, empty, ownerless, compact };
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

export const UNIVERSAL_HMR: unique symbol = Symbol.for('octane.universal.hmr');

interface UniversalHmrMeta {
	component: UniversalComponent<any>;
	readonly owners: Set<UniversalOwnerRecord>;
	update(incoming: UniversalComponent<any>): boolean;
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
		update(incoming) {
			const incomingMeta = (incoming as UniversalHmrComponent<any>)[UNIVERSAL_HMR];
			const next = incomingMeta?.component ?? incoming;
			const nextMetadata = getComponentMetadata(next);
			if (nextMetadata.id !== renderer) {
				throw new Error(
					`Universal HMR renderer mismatch: wrapper ${JSON.stringify(renderer)} cannot accept ${JSON.stringify(nextMetadata.id)}.`,
				);
			}
			if (stateModelOf(meta.component) !== stateModelOf(next)) {
				return false;
			}
			meta.component = next;
			__profileComponentSource(wrapper, next);
			if ((next as any).__warm === undefined) delete (wrapper as any).__warm;
			else (wrapper as any).__warm = (next as any).__warm;
			for (const owner of owners) {
				if (owner.disposed) {
					owners.delete(owner);
					continue;
				}
				__profileSchedule(owner, 'hmr');
				owner.root.schedule();
			}
			return true;
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
	Object.defineProperty(wrapper, UNIVERSAL_HMR, { value: meta });
	markStateModel(wrapper, stateModelOf(component));
	__profileComponentSource(wrapper, component);
	if ((component as any).__warm !== undefined) (wrapper as any).__warm = (component as any).__warm;
	return wrapper;
}

function getComponentMetadata(component: UniversalComponent): UniversalRendererMetadata {
	const metadata = component?.[UNIVERSAL_COMPONENT];
	if (metadata === undefined) {
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
		parent,
		identityPath,
		key,
		id: NEXT_OWNER_ID++,
		rangeKey: Symbol('octane.universal.owner-range'),
		hooks: new Map(),
		effectOrder: [],
		children: [],
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
		parent,
		replayPath,
		hooks: new Map(record.hooks),
		clonedHooks: new Set(),
		seenEffects: [],
		children: [],
		claimedChildren: new Set(),
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
		visibility: parent?.visibility ?? 'visible',
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

function claimChildOwner(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): DraftOwner {
	const attempt = currentAttempt();
	let record: UniversalOwnerRecord | undefined;
	const bucket = childOwnerBucket(parent, component, identityPath, key);
	if (bucket !== undefined) {
		const cursors = (parent.childClaimCursors ??= createOwnerIdentityIndex());
		let cursor = readOwnerIdentity(cursors, component, identityPath, key) ?? 0;
		while (cursor < bucket.length && parent.claimedChildren.has(bucket[cursor])) cursor++;
		record = bucket[cursor];
		writeOwnerIdentity(
			cursors,
			component,
			identityPath,
			key,
			cursor + (record === undefined ? 0 : 1),
		);
	}
	record ??= createOwnerRecord(attempt.root, component, parent.record, identityPath, key);
	parent.claimedChildren.add(record);
	const draft = draftOwner(record, parent, childReplayPath(parent, component, identityPath, key));
	parent.children.push(draft);
	attempt.owners.push(draft);
	return draft;
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

function readOwnerContext<T>(owner: DraftOwner | null, context: UniversalContext<T>): T {
	for (let current = owner; current !== null; current = current.parent) {
		if (current.contextValues?.has(context)) return current.contextValues.get(context) as T;
	}
	return currentAttempt().root.readBridgeContext(context);
}

function executeOwner(
	owner: DraftOwner,
	build: () => BlueprintNode[],
	initialRenderCount = 0,
): BlueprintNode[] {
	const attempt = currentAttempt();
	const sourceComponent = owner.record.component;
	const transparent = sourceComponent === null || isStateModelTransparent(sourceComponent);
	const stateModel = transparent ? STATE_WRITE_CONTEXT.sourceModel : stateModelOf(sourceComponent);
	const stateSource = transparent ? STATE_WRITE_CONTEXT.source : sourceComponent;
	const warmPlanCheckpoint = ACTIVE_UNIVERSAL_WARM_PLANS.length;
	let output: BlueprintNode[] = [];
	for (let renderCount = initialRenderCount; ; renderCount++) {
		ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
		if (renderCount === 25) throw new Error('Too many universal render-phase updates.');
		if (renderCount > 0) resetDraftChildren(owner);
		owner.seenEffects = [];
		owner.children = [];
		owner.claimedChildren = new Set();
		owner.childClaimCursors = null;
		owner.childReplayOrdinals = null;
		owner.needsRender = false;
		owner.implicitSlot = 0;
		const previousOwner = CURRENT_OWNER;
		const previousAttemptOwner = attempt.owner;
		CURRENT_OWNER = owner;
		attempt.owner = owner;
		const component = owner.record.component;
		if (component !== null) __profileTrackComponent(owner.record, component);
		const profileFrame =
			component === null
				? null
				: __profileBeginRender(owner.record, component, owner.record.mounted);
		let didThrow = false;
		let thrown: unknown;
		try {
			output = evaluateUniversalState(
				stateModel,
				UNIVERSAL_STATE_PHASE_RENDER,
				owner.record,
				build,
				stateSource,
			);
		} catch (error) {
			didThrow = true;
			thrown = error;
			throw error;
		} finally {
			__profileEndRender(profileFrame, didThrow, thrown);
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
		ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
		CURRENT_LAZY_LEAF_OWNER = previousScope;
		CURRENT_OWNER = previousOwner;
		scope.attempt.owner = previousAttemptOwner;
	}
}

function ownerRange(owner: DraftOwner, children: BlueprintNode[]): BlueprintNode[] {
	return [{ kind: 'range', key: owner.record.rangeKey, children }];
}

function componentContext(renderer: string): UniversalRenderContext {
	return {
		renderer,
		readContext: (context) => readOwnerContext(activateLazyLeafOwner(), context),
		insertionEffect: (create, deps) => enqueueUniversalEffect('insertion', create, deps),
		layoutEffect: (create, deps) => enqueueUniversalEffect('layout', create, deps),
		effect: (create, deps) => enqueueUniversalEffect('passive', create, deps),
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
	if (metadata.id !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot render nested component ${JSON.stringify(metadata.id)}.`,
		);
	}
	const parent = CURRENT_OWNER;
	if (parent === null) throw new Error('A nested universal component requires an owner.');
	const normalized = normalizePropsValue(value.props);
	const owner = claimChildOwner(parent, value.component, path, value.hasKey ? value.key : null);
	const props = { ...normalized.props };
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
		for (const hook of owner.hooks.values()) {
			if (hook.kind === 'effect-event') hook.cell.active = false;
		}
	}
}

function resetDraftChildren(owner: DraftOwner): void {
	for (const child of owner.children) disposeUncommittedDraft(child);
	owner.children = [];
	owner.claimedChildren = new Set();
	owner.childClaimCursors = null;
	owner.childReplayOrdinals = null;
}

function retainCommittedOwnerTree(owner: DraftOwner): void {
	owner.hooks = new Map(owner.record.hooks);
	owner.seenEffects = [...owner.record.effectOrder];
	owner.contextValues =
		owner.record.contextValues === null ? null : new Map(owner.record.contextValues);
	owner.children = [];
	owner.claimedChildren = new Set(owner.record.children);
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

function markDraftOwnerSuspenseHidden(owner: DraftOwner): void {
	owner.visibility = 'suspense-hidden';
	for (const child of owner.children) markDraftOwnerSuspenseHidden(child);
}

function markBlueprintSuspenseHidden(nodes: readonly BlueprintNode[]): void {
	for (const node of nodes) {
		if (node.kind === 'host') {
			node.visibility = 'suspense-hidden';
			markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
		}
		markBlueprintSuspenseHidden(node.children);
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
	markDraftOwnerSuspenseHidden(child);
	const nodes = ownerRange(child, range.children.map(blueprintFromLogical));
	markBlueprintSuspenseHidden(nodes);
	return nodes;
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
		owner.visibility =
			parent.visibility === 'suspense-hidden'
				? 'suspense-hidden'
				: parent.visibility === 'activity-hidden' || activity.mode === 'hidden'
					? 'activity-hidden'
					: 'visible';
		const nodes = executeOwner(owner, () =>
			materializeValue(activity.body(), expectedRenderer, null, [...path, 'activity-output']),
		);
		const range = ownerRange(owner, nodes);
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
		const keys = new Set<UniversalKey>();
		const compilerLeafProps =
			list.ownerless && currentAttempt().root.driverCapabilities().compilerLeafProps === true;
		if (list.ownerless && list.compact && currentAttempt().root.canCompactCompilerLeafProps()) {
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
			let compactOwners: Array<UniversalOwnerRecord | undefined> | null = null;
			let compactPlan: UniversalPlan | null = null;
			let compactHost: UniversalHostPlan | null = null;
			let compactIndex = 0;
			for (const item of list.items) {
				const itemIndex = compactIndex++;
				const itemKey = list.key(item, itemIndex);
				if (keys.has(itemKey)) {
					throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
				}
				keys.add(itemKey);
				const rendered = renderLazyLeafItem(lazyOwnerScope, list.render, item, itemIndex, itemKey);
				if (lazyOwnerScope.owner !== null) {
					(compactOwners ??= [])[itemIndex] = lazyOwnerScope.owner.record;
				}
				if ((rendered as UniversalPlanValue)?.$$kind !== UNIVERSAL_VALUE) {
					throw new Error(
						'Compact universal lists require one compiler-proven intrinsic leaf host per item.',
					);
				}
				const planValue = rendered as UniversalPlanValue;
				if (planValue.plan.renderer !== expectedRenderer) {
					throw new Error(
						`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(planValue.plan.renderer)}.`,
					);
				}
				if (compactPlan !== null && compactPlan !== planValue.plan) {
					throw new Error(
						'Compact universal lists require one stable intrinsic leaf plan per item.',
					);
				}
				const host: UniversalHostPlan | null =
					compactPlan === null ? ownerlessLeafHostPlan(planValue.plan) : compactHost;
				if (planValue.key !== null || host === null) {
					throw new Error(
						'Compact universal lists require one stable intrinsic leaf plan per item.',
					);
				}
				if (compactPlan === null) {
					compactPlan = planValue.plan;
					compactHost = host;
					if (host.props !== undefined) {
						for (const name of Object.keys(host.props)) {
							if (isRendererRegion(host.props[name])) {
								markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
							}
						}
					}
				}
				for (const [, slot] of host.bindings ?? []) {
					const binding = planValue.values[slot];
					if (typeof binding === 'object' && binding !== null && isRendererRegion(binding)) {
						markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
					}
				}
				compactKeys.push(itemKey);
				compactValues.push(planValue.values);
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
		const lazyOwnerScope: LazyLeafOwnerScope | null = compilerLeafProps
			? {
					attempt,
					parent,
					identityPath: [...path, 'for'],
					key: 0,
					owner: null,
				}
			: null;
		let index = 0;
		for (const item of list.items) {
			const itemIndex = index++;
			const itemKey = list.key(item, itemIndex);
			if (keys.has(itemKey)) throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
			keys.add(itemKey);
			if (compilerLeafProps) {
				const rendered = renderLazyLeafItem(lazyOwnerScope!, list.render, item, itemIndex, itemKey);
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
					...materializeScoped(parent, [...path, 'for'], itemKey, () =>
						list.render(item, itemIndex),
					),
				);
			}
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
				events: new Map(),
				lifecycles: new Map(),
				localCallbacks: new Map(),
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
	const props: Record<string, unknown> = { ...(node.props ?? {}) };
	for (const [name, slot] of node.bindings ?? []) props[name] = values[slot];
	let propsValue: UniversalPropsValue | null = null;
	if (node.propsSlot !== undefined) {
		propsValue = normalizePropsValue(values[node.propsSlot] as any);
		Object.assign(props, propsValue.props);
	}
	const hasKey = propsValue?.hasKey || Object.prototype.hasOwnProperty.call(props, 'key');
	const hostKey = normalizeUniversalKey(
		propsValue?.hasKey ? propsValue.key : hasKey ? props.key : null,
	);
	const ref = Object.prototype.hasOwnProperty.call(props, 'ref') ? props.ref : null;
	const dynamicChildren = Object.prototype.hasOwnProperty.call(props, 'children')
		? props.children
		: undefined;
	delete props.ref;
	delete props.key;
	delete props.children;
	let events: Map<string, BlueprintEvent> | null = null;
	let lifecycles: Map<string, BlueprintHostCallback> | null = null;
	let localCallbacks: Map<string, BlueprintHostCallback> | null = null;
	for (const name of Object.keys(props)) {
		const handler = props[name];
		const lifecycle = currentAttempt().root.classifyLifecycle(name, handler);
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
		const local = currentAttempt().root.classifyLocalCallback(name, handler);
		if (local !== null) {
			delete props[name];
			if (currentAttempt().root.driverCapabilities().localHostCallbacks !== true) {
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
		const definition = currentAttempt().root.classifyEvent(name);
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
		props[name] = currentAttempt().root.encodeHostProp(node.type, name, handler);
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
	const nodes = materializeNode(value.plan.root, value.values, expectedRenderer, [...path, 'plan']);
	if (value.key === null) return nodes;
	if (nodes.length === 1) {
		nodes[0].key = value.key;
		return nodes;
	}
	return [{ kind: 'range', key: value.key, children: nodes }];
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
		props: {},
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

function shallowPropsEqual(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
	rightCountHint = -1,
): boolean {
	let leftCount = 0;
	for (const key in left) {
		if (!Object.prototype.hasOwnProperty.call(left, key)) continue;
		leftCount++;
		if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.is(left[key], right[key])) {
			return false;
		}
	}
	if (rightCountHint >= 0) return leftCount === rightCountHint;
	let rightCount = 0;
	for (const key in right) {
		if (Object.prototype.hasOwnProperty.call(right, key)) rightCount++;
	}
	return leftCount === rightCount;
}

function physicalRecords(records: readonly LogicalRecord[]): LogicalRecord[] {
	const output: LogicalRecord[] = [];
	for (const record of records) {
		if (record.kind === 'host') output.push(record);
		else if (record.kind === 'range') output.push(...physicalRecords(record.children));
	}
	return output;
}

function physicalDrafts(records: readonly DraftRecord[]): DraftRecord[] {
	const output: DraftRecord[] = [];
	for (const record of records) {
		if (record.record.kind === 'host') output.push(record);
		else if (record.record.kind === 'range') output.push(...physicalDrafts(record.children));
	}
	return output;
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
		runWithUniversalStateWriteContextSuspended(() => {
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
		});
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

function withUniversalSlotPath<T>(
	slot: unknown,
	fn: (...args: any[]) => T,
	args: any[],
	receiver?: unknown,
): T {
	UNIVERSAL_SLOT_STACK.push(slot);
	try {
		return receiver === undefined ? fn(...args) : fn.apply(receiver, args);
	} finally {
		UNIVERSAL_SLOT_STACK.pop();
	}
}

export function withSlot<T>(slot: unknown, fn: (...args: any[]) => T, ...args: any[]): T {
	const replaceSource = STATE_WRITE_CONTEXT.active && STATE_WRITE_CONTEXT.depth !== 0;
	const previousModel = STATE_WRITE_CONTEXT.sourceModel;
	const previousSource = STATE_WRITE_CONTEXT.source;
	if (replaceSource) {
		STATE_WRITE_CONTEXT.sourceModel = stateModelOf(fn);
		STATE_WRITE_CONTEXT.source = fn;
	}
	try {
		return withUniversalSlotPath(slot, fn, args);
	} finally {
		if (replaceSource) {
			STATE_WRITE_CONTEXT.sourceModel = previousModel;
			STATE_WRITE_CONTEXT.source = previousSource;
		}
	}
}

/** Compiler helper for method-style custom hooks; preserves the authored receiver. */
export function withMethodSlot<T>(
	slot: unknown,
	receiver: unknown,
	keyOrLookup: PropertyKey | (() => (...args: any[]) => T),
	argsFactory: () => any[],
): T {
	UNIVERSAL_SLOT_STACK.push(slot);
	try {
		const fn =
			typeof keyOrLookup === 'function'
				? keyOrLookup()
				: (receiver as Record<PropertyKey, (...args: any[]) => T>)[keyOrLookup];
		const args = argsFactory();
		const replaceSource = STATE_WRITE_CONTEXT.active && STATE_WRITE_CONTEXT.depth !== 0;
		const previousModel = STATE_WRITE_CONTEXT.sourceModel;
		const previousSource = STATE_WRITE_CONTEXT.source;
		if (replaceSource) {
			STATE_WRITE_CONTEXT.sourceModel = stateModelOf(fn);
			STATE_WRITE_CONTEXT.source = fn;
		}
		try {
			return fn.apply(receiver, args);
		} finally {
			if (replaceSource) {
				STATE_WRITE_CONTEXT.sourceModel = previousModel;
				STATE_WRITE_CONTEXT.source = previousSource;
			}
		}
	} finally {
		UNIVERSAL_SLOT_STACK.pop();
	}
}

function scheduleOwner(owner: UniversalOwnerRecord, slot?: unknown): void {
	if (owner.disposed) return;
	__profileSchedule(
		owner,
		'state',
		typeof slot === 'symbol' || typeof slot === 'number' ? slot : undefined,
	);
	owner.root.schedule();
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

function applyStateUpdates<T>(
	value: T,
	updates: readonly unknown[],
	model: RuntimeStateModel,
	owner: UniversalOwnerRecord,
): T {
	let next = value;
	for (const update of updates) {
		if (typeof update === 'function') {
			const previous = next;
			next = evaluateUniversalState(model, UNIVERSAL_STATE_PHASE_UPDATER, owner, () =>
				(update as (previous: T) => T)(previous),
			);
		} else {
			next = update as T;
		}
	}
	return next;
}

function cloneStateHook<T>(owner: DraftOwner, slot: unknown): StateHook<T> | undefined {
	let hook = owner.hooks.get(slot) as StateHook<T> | undefined;
	if (hook?.kind !== 'state') return undefined;
	if (!owner.clonedHooks.has(slot)) {
		hook = { ...hook };
		owner.hooks.set(slot, hook);
		owner.clonedHooks.add(slot);
		const updates = owner.record.updates.get(slot);
		if (updates !== undefined && updates.length > 0) {
			hook.value = applyStateUpdates(hook.value, updates, hook.model, owner.record);
			owner.appliedUpdates.set(slot, updates.length);
		}
	}
	return hook;
}

function projectedStateValue<T>(
	record: UniversalOwnerRecord,
	slot: unknown,
	fallback: T,
	model: RuntimeStateModel,
): T {
	const draft = findDraftOwner(record);
	const draftHook = draft?.hooks.get(slot) as StateHook<T> | undefined;
	if (draftHook?.kind === 'state') return draftHook.value;
	const hook = record.hooks.get(slot) as StateHook<T> | undefined;
	const value = hook?.kind === 'state' ? hook.value : fallback;
	return applyStateUpdates(value, record.updates.get(slot) ?? [], model, record);
}

export function useState<T>(
	initial: T | (() => T),
	slot?: unknown,
	stateModel?: unknown,
): [T, (value: T | ((previous: T) => T)) => void, () => T] {
	if (stateModel === undefined && slot === undefined && typeof initial === 'symbol') {
		slot = initial;
		initial = undefined as T;
	} else if (
		stateModel === undefined &&
		slot === STATE_MODEL_CAUSAL &&
		typeof initial === 'symbol'
	) {
		stateModel = slot;
		slot = initial;
		initial = undefined as T;
	}
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	const requestedModel = normalizeRuntimeStateModel(stateModel);
	let hook = cloneStateHook<T>(owner, resolved);
	if (hook?.kind !== 'state') {
		const record = owner.record;
		const initialValue =
			typeof initial === 'function'
				? evaluateUniversalState(
						requestedModel,
						UNIVERSAL_STATE_PHASE_INITIALIZER,
						record,
						initial as () => T,
					)
				: initial;
		hook = {
			kind: 'state',
			value: initialValue,
			model: requestedModel,
			set(value) {
				assertUniversalCausalStateWriteAllowed(requestedModel, record);
				if (record.disposed) return;
				const draft = findDraftOwner(record);
				if (draft !== null) {
					const live = cloneStateHook<T>(draft, resolved);
					if (live === undefined) return;
					const next =
						typeof value === 'function'
							? evaluateUniversalState(requestedModel, UNIVERSAL_STATE_PHASE_UPDATER, record, () =>
									(value as (previous: T) => T)(live.value),
								)
							: value;
					if (Object.is(next, live.value)) return;
					live.value = next;
					draft.needsRender = true;
					return;
				}
				const previous = projectedStateValue(record, resolved, initialValue, requestedModel);
				const next =
					typeof value === 'function'
						? evaluateUniversalState(requestedModel, UNIVERSAL_STATE_PHASE_UPDATER, record, () =>
								(value as (previous: T) => T)(previous),
							)
						: value;
				if (Object.is(next, previous)) return;
				const updates = record.updates.get(resolved) ?? [];
				updates.push(value);
				record.updates.set(resolved, updates);
				scheduleOwner(record, resolved);
			},
			get() {
				return projectedStateValue(record, resolved, initialValue, requestedModel);
			},
		};
		owner.hooks.set(resolved, hook as UniversalHook);
		owner.clonedHooks.add(resolved);
	}
	return [hook.value, hook.set, hook.get];
}

export const __useStateWithGetter = useState;

export function useReducer<S, A, I = S>(
	reducer: (state: S, action: A) => S,
	initialArg: I,
	initOrSlot?: ((value: I) => S) | unknown,
	maybeSlot?: unknown,
	stateModel?: unknown,
): [S, (action: A) => void, () => S] {
	if (
		stateModel === undefined &&
		typeof initOrSlot === 'symbol' &&
		maybeSlot === STATE_MODEL_CAUSAL
	) {
		stateModel = maybeSlot;
		maybeSlot = initOrSlot;
	}
	const init = typeof initOrSlot === 'function' ? (initOrSlot as (value: I) => S) : null;
	const slot = maybeSlot ?? (init === null ? initOrSlot : undefined);
	const owner = currentDraftOwner();
	const resolved = resolveHookSlot(slot);
	const requestedModel = normalizeRuntimeStateModel(stateModel);
	let hook = owner.hooks.get(resolved) as ReducerHook<S, A> | undefined;
	if (hook?.kind !== 'reducer') {
		const record = owner.record;
		const initialValue =
			init === null
				? (initialArg as unknown as S)
				: evaluateUniversalState(requestedModel, UNIVERSAL_STATE_PHASE_INITIALIZER, record, () =>
						init(initialArg),
					);
		hook = {
			kind: 'reducer',
			value: initialValue,
			model: requestedModel,
			reducer,
			dispatch(action) {
				assertUniversalCausalStateWriteAllowed(requestedModel, record);
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
					const next = evaluateUniversalState(
						requestedModel,
						UNIVERSAL_STATE_PHASE_REDUCER,
						record,
						() => live.reducer(live.value, action),
					);
					if (Object.is(next, live.value)) return;
					live.value = next;
					draft.needsRender = true;
					return;
				}
				const updates = record.updates.get(resolved) ?? [];
				updates.push(action);
				record.updates.set(resolved, updates);
				scheduleOwner(record, resolved);
			},
			get() {
				const draft = findDraftOwner(record);
				const draftHook = draft?.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				if (draftHook?.kind === 'reducer') return draftHook.value;
				const committed = record.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				let value = committed?.kind === 'reducer' ? committed.value : initialValue;
				for (const update of record.updates.get(resolved) ?? []) {
					const previous = value;
					value = evaluateUniversalState(
						requestedModel,
						UNIVERSAL_STATE_PHASE_REDUCER,
						record,
						() => (committed?.reducer ?? reducer)(previous, update as A),
					);
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
			const updates = owner.record.updates.get(resolved);
			if (updates !== undefined && updates.length > 0) {
				for (const action of updates) {
					const previous = hook.value;
					hook.value = evaluateUniversalState(
						hook.model,
						UNIVERSAL_STATE_PHASE_REDUCER,
						owner.record,
						() => reducer(previous, action as A),
					);
				}
				owner.appliedUpdates.set(resolved, updates.length);
			}
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
	_stateModel?: unknown,
): void {
	enqueueUniversalEffect('insertion', create, deps, slot);
}

export function useLayoutEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
	_stateModel?: unknown,
): void {
	enqueueUniversalEffect('layout', create, deps, slot);
}

export function useEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
	_stateModel?: unknown,
): void {
	enqueueUniversalEffect('passive', create, deps, slot);
}

export function useMemo<T>(
	compute: () => T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
	stateModel?: unknown,
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
			? evaluateUniversalState(
					normalizeRuntimeStateModel(stateModel),
					UNIVERSAL_STATE_PHASE_MEMO,
					owner.record,
					() => (compute as (...args: unknown[]) => T)(...(normalized ?? [])),
				)
			: (warmed as T);
	owner.hooks.set(resolved, { kind: 'memo', value, deps: normalized });
	owner.clonedHooks.add(resolved);
	return value;
}

export function useCallback<T extends (...args: any[]) => any>(
	callback: T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): T {
	return useMemo(() => callback, deps, slot);
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
					| RefHook<T>
					| undefined;
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
	return withUniversalSlotPath(base, () => {
		const snapshot = getSnapshot();
		const [, invalidate] = useState(0, 'state');
		useLayoutEffect(
			() => {
				let current = snapshot;
				const check = () => {
					const next = getSnapshot();
					if (Object.is(current, next)) return;
					current = next;
					invalidate((value) => value + 1);
				};
				const unsubscribe = subscribe(check);
				check();
				return unsubscribe;
			},
			[subscribe, getSnapshot, snapshot],
			'subscribe',
		);
		return snapshot;
	}, []);
}

export function useDeferredValue<T>(value: T, _initialValue?: T, _slot?: unknown): T {
	return value;
}

export function useTransition(_slot?: unknown): [boolean, typeof startTransition] {
	return [false, startTransition];
}

export function useActionState<State, Payload>(
	action: (previousState: State, payload: Payload) => State | Promise<State>,
	initialState: State,
	_permalinkOrSlot?: string | unknown,
	maybeSlot?: unknown,
	stateModel?: unknown,
): [State, (payload: Payload) => void, boolean] {
	if (
		stateModel === undefined &&
		typeof _permalinkOrSlot === 'symbol' &&
		maybeSlot === STATE_MODEL_CAUSAL
	) {
		stateModel = maybeSlot;
		maybeSlot = _permalinkOrSlot;
	}
	const slot = maybeSlot ?? (typeof _permalinkOrSlot === 'string' ? undefined : _permalinkOrSlot);
	const base = resolveHookSlot(slot);
	const record = currentDraftOwner().record;
	const root = record.root;
	const model = normalizeRuntimeStateModel(stateModel);
	return withUniversalSlotPath(base, () => {
		const [state, setState, getState] = useState(initialState, 'state', model);
		const [pending, setPending] = useState(false, 'pending', model);
		const dispatch = useCallback(
			(payload: Payload) => {
				assertUniversalCausalStateWriteAllowed(model, record);
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
	}, []);
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
	let stateModel: unknown;
	if (
		reducerAndSlot[reducerAndSlot.length - 1] === STATE_MODEL_CAUSAL &&
		(reducerAndSlot.length >= 3 ||
			(reducerAndSlot.length === 2 &&
				(typeof reducerAndSlot[0] === 'symbol' || typeof reducerAndSlot[0] === 'number')))
	) {
		stateModel = reducerAndSlot.pop();
	}
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
	const [optimistic, dispatch] = (useReducer as any)(
		reducer,
		passthrough,
		undefined,
		slot,
		stateModel,
	) as [State, (action: Action) => void];
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
	_stateModel?: unknown,
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
	void fn();
}

export function requestFormReset(): void {
	// Universal renderers have no intrinsic form ownership. Form bindings may
	// layer reset behavior above this host-neutral no-op.
}

export function memo<P>(
	component: UniversalComponent<P>,
	_compare?: (previous: Readonly<P>, next: Readonly<P>) => boolean,
): UniversalComponent<P>;
export function memo<P>(
	component: UniversalComponent<P>,
	_compare?: (previous: Readonly<P>, next: Readonly<P>) => boolean,
	_stateModel?: unknown,
): UniversalComponent<P> {
	// Preserve the universal renderer's historical identity fast path. Causal
	// compilation opts into a wrapper that can carry independent provenance.
	if (arguments.length < 3 || arguments[arguments.length - 1] !== STATE_MODEL_CAUSAL) {
		return component;
	}
	const wrapper = ((props: P, context: UniversalRenderContext): UniversalRenderable => {
		if (!STATE_WRITE_CONTEXT.active || isStateModelTransparent(component)) {
			return component(props, context);
		}
		const previousModel = STATE_WRITE_CONTEXT.sourceModel;
		const previousSource = STATE_WRITE_CONTEXT.source;
		STATE_WRITE_CONTEXT.sourceModel = stateModelOf(component);
		STATE_WRITE_CONTEXT.source = component;
		try {
			return component(props, context);
		} finally {
			STATE_WRITE_CONTEXT.sourceModel = previousModel;
			STATE_WRITE_CONTEXT.source = previousSource;
		}
	}) as UniversalComponent<P>;
	Object.defineProperty(wrapper, UNIVERSAL_COMPONENT, {
		configurable: true,
		get: () => component[UNIVERSAL_COMPONENT],
	});
	return markStateModel(wrapper, STATE_MODEL_CAUSAL);
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

function routeUniversalOwnerError(owner: UniversalOwnerRecord, error: unknown): boolean {
	for (let current = owner.parent; current !== null; current = current.parent) {
		if (!current.isBoundary || current.disposed) continue;
		current.boundaryThenable = null;
		current.boundaryError = error;
		current.hasBoundaryError = true;
		current.root.schedule();
		return true;
	}
	return false;
}

function routeUniversalOwnerSuspense(
	owner: UniversalOwnerRecord,
	thenable: PromiseLike<unknown>,
): boolean {
	for (let current = owner.parent; current !== null; current = current.parent) {
		if (!current.isBoundary || !current.canHandleSuspense || current.disposed) continue;
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
		if (!routeUniversalOwnerError(hook.owner, error)) throw error;
	}
}

function runOwnedEffectCleanup(hook: EffectHook): void {
	try {
		runEffectCleanup(hook);
	} catch (error) {
		if (!routeUniversalOwnerError(hook.owner, error)) throw error;
	}
}

function runOwnedCommit(owner: UniversalOwnerRecord | null, work: () => void): void {
	try {
		work();
	} catch (error) {
		if (owner === null || !routeUniversalOwnerError(owner, error)) throw error;
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
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
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

class UniversalRootImpl<Container, PublicInstance> implements UniversalRoot<any> {
	readonly renderer: string;
	private readonly rootRecord: LogicalRecord;
	private readonly universalIdRoot = NEXT_UNIVERSAL_ID_ROOT++;
	private readonly resourceRoot = NEXT_RESOURCE_ROOT++;
	private readonly portalRoot = NEXT_PORTAL_ROOT++;
	private readonly transportRoot = NEXT_TRANSPORT_ROOT++;
	private readonly portalHandles = new Map<string | number, UniversalPortalTargetHandle>();
	private owner: UniversalOwnerRecord | null = null;
	private bridge: BoundaryOwner | null = null;
	private unmounted = false;
	private unmounting = false;
	private unmountPromise: Promise<void> | null = null;
	private asyncWork: Promise<void> = Promise.resolve();
	private asyncWorkError: unknown = NO_PENDING_PASSIVE_ERROR;
	private nextId = 1;
	private nextUniversalId = 1;
	private nextListener = NEXT_EVENT_ROOT++ * 1_000_000;
	private nextBatchVersion = 1;
	private acceptedBatchVersion = 0;
	private treeFeatures = 0;
	private handlers = new Map<number, CommittedEvent>();
	private localCallbacks = new Map<number, CommittedHostCallback>();
	private readonly publishedListeners = new Set<number>();
	private pending: UniversalTransactionImpl<Container, PublicInstance> | null = null;
	private suspended: UniversalSuspendedAttemptImpl | null = null;
	private awaitingReplay: SuspendedMemoReplay | null = null;
	private queuedReplay: SuspendedMemoReplay | null = null;
	private rootRetryAttempt: UniversalSuspendedAttemptImpl | null = null;
	private lastComponent: UniversalComponent<any> | null = null;
	private lastProps: any;
	private scheduled = false;
	private eventScopeDepth = 0;
	private eventScopePriority: UniversalEventPriority | null = null;
	private eventScopeHandlers: ReadonlyMap<number, CommittedEvent> | null = null;
	private passiveScheduled = false;
	private readonly passiveTasks: (() => void)[] = [];
	private hostAttachments: UniversalHostAttachmentState | null = null;

	constructor(
		private readonly container: Container,
		private readonly driver: UniversalHostDriver<Container, PublicInstance>,
		private readonly transport:
			| UniversalCommitTransport<Container>
			| UniversalAsyncCommitTransport<Container>
			| null,
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
		if (this.hostAttachments?.registration == null || this.unmounted) return;
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
					record.visibility === 'suspense-hidden' ||
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
		if (this.bridge === null) return context.defaultValue;
		return this.bridge.readContext(context);
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
		return this.driver.events?.classify(name) ?? null;
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

	private createPortalTargetHandle(id: string | number): UniversalPortalTargetHandle {
		if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length === 0) {
			throw new TypeError(
				'A universal portal target handle ID must be a non-empty string or number.',
			);
		}
		const previous = this.portalHandles.get(id);
		if (previous !== undefined) return previous;
		const handle = Object.freeze({
			$$kind: 'octane.universal.portal-target' as const,
			renderer: this.renderer,
			root: this.portalRoot,
			id,
		});
		this.portalHandles.set(id, handle);
		return handle;
	}

	private preparePortalTarget(target: unknown): UniversalPortalTargetRegistration {
		const capability = this.driver.portals;
		if (capability === undefined) {
			throw new Error(
				`Universal renderer ${JSON.stringify(this.renderer)} does not declare the portal capability.`,
			);
		}
		const registration = capability.prepareTarget({
			container: this.container,
			renderer: this.renderer,
			target,
			transported: this.transport !== null,
			createPortalTargetHandle: (id) => this.createPortalTargetHandle(id),
		});
		const release =
			registration !== null &&
			typeof registration === 'object' &&
			typeof registration.release === 'function'
				? registration.release.bind(registration)
				: null;
		try {
			if (registration === null || typeof registration !== 'object' || release === null) {
				throw new TypeError(
					'A universal portal capability must return a valid target registration.',
				);
			}
			const handle = registration.handle;
			if (
				handle?.$$kind !== 'octane.universal.portal-target' ||
				handle.renderer !== this.renderer ||
				handle.root !== this.portalRoot ||
				(typeof handle.id !== 'string' && typeof handle.id !== 'number') ||
				this.portalHandles.get(handle.id) !== handle
			) {
				throw new Error(
					`Universal portal target handle does not belong to renderer ${JSON.stringify(this.renderer)} and this root.`,
				);
			}
			let released = false;
			return Object.freeze({
				handle,
				release() {
					if (released) return;
					released = true;
					release();
				},
			});
		} catch (error) {
			try {
				release?.();
			} catch {
				// Preserve the capability-contract diagnostic that invalidated the registration.
			}
			throw error;
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
		try {
			return run();
		} finally {
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
				const component = this.lastComponent;
				if (component === null) return;
				await this.renderAsync(component, this.lastProps);
			});
		} else {
			this.render(this.lastComponent, this.lastProps);
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

	schedule(): void {
		if (this.unmounted || this.owner?.disposed || this.lastComponent === null || this.scheduled)
			return;
		this.scheduled = true;
		SCHEDULED_UNIVERSAL_ROOTS.add(this);
		if (this.eventScopeDepth === 0 && UNIVERSAL_SYNC_DEPTH === 0) this.queueScheduledWork();
	}

	private cancelSuspendedReplays(): void {
		if (this.awaitingReplay !== null) this.awaitingReplay.active = false;
		if (this.queuedReplay !== null) this.queuedReplay.active = false;
		this.awaitingReplay = null;
		this.queuedReplay = null;
		this.rootRetryAttempt = null;
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
					const attempt = this.prepareWithReplay(replay.component, replay.props, replay.entries);
					if (attempt.status === 'prepared') await attempt.commitAsync();
				} finally {
					replay.asyncWorkQueued = false;
				}
			});
			return;
		}
		this.queuedReplay = null;
		replay.active = false;
		this.rootRetryAttempt = null;
		const attempt = this.prepareWithReplay(replay.component, replay.props, replay.entries);
		if (attempt.status === 'prepared') attempt.commit();
	}

	private queueReplay(replay: SuspendedMemoReplay): void {
		if (!replay.active || this.unmounted) return;
		if (this.awaitingReplay === replay) this.awaitingReplay = null;
		if (this.queuedReplay === replay) return;
		if (this.queuedReplay !== null) this.queuedReplay.active = false;
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
	): UniversalSuspendedAttempt {
		const attempt = new UniversalSuspendedAttemptImpl(
			this,
			thenable,
			component,
			props,
			replayEntries,
		);
		this.suspended = attempt;
		return attempt;
	}

	finishSuspension(attempt: UniversalSuspendedAttemptImpl, schedule: boolean): void {
		if (this.suspended === attempt) this.suspended = null;
		else if (this.rootRetryAttempt !== attempt) return;
		if (!schedule || this.unmounted) {
			if (this.rootRetryAttempt === attempt) {
				this.rootRetryAttempt = null;
				if (this.queuedReplay !== null) this.queuedReplay.active = false;
				this.queuedReplay = null;
			}
			return;
		}
		this.rootRetryAttempt = attempt;
		this.queueReplay({
			entries: attempt.replayEntries,
			component: attempt.component,
			props: attempt.props,
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
			for (const hook of draft.hooks.values()) {
				if (hook.kind === 'effect-event') hook.cell.active = false;
			}
		}
	}

	prepare(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		const bridgeReplay = this.bridge === null ? null : this.queuedReplay;
		if (bridgeReplay !== null && bridgeReplay.component === component && bridgeReplay.active) {
			this.queuedReplay = null;
			bridgeReplay.active = false;
			this.rootRetryAttempt = null;
			return this.prepareWithReplay(component, props, bridgeReplay.entries);
		}
		this.suspended?.abort();
		this.cancelSuspendedReplays();
		// A fresh render is a new suspension episode. Keep consumed warm entries
		// across automatic retries, but never let their tombstones suppress a later
		// update or remount that returns to the same dependency values.
		UNIVERSAL_WARM_CACHES.delete(this);
		return this.prepareWithReplay(component, props, []);
	}

	private prepareWithReplay(
		component: UniversalComponent<any>,
		props: any,
		replayEntries: readonly SuspendedMemoEntry[],
	): UniversalPreparedAttempt {
		if (this.unmounted || this.unmounting) {
			throw new Error('Cannot render an unmounted universal root.');
		}
		// Match Octane's DOM runtime: a previous commit's passive work becomes
		// observable before the next render attempt starts. This also prevents two
		// synchronous universal commits from collapsing the first commit's effects.
		this.flushPassivesBeforeRender();
		const metadata = getComponentMetadata(component);
		if (metadata.id !== this.renderer) {
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
		const previousAttempt = CURRENT_ATTEMPT;
		const previousOwner = CURRENT_OWNER;
		const previousWarm = CURRENT_UNIVERSAL_WARM;
		const previousWarmClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
		const previousWarmPlans = ACTIVE_UNIVERSAL_WARM_PLANS.slice();
		const attempt: RenderAttempt = {
			root: this,
			owner,
			owners: [owner],
			treeFeatures: 0,
			replayEntries,
			retryThenables: new Set(),
			nextUniversalId: this.nextUniversalId,
			implicitSlot: 0,
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
				return materializeValue(value, this.renderer, null, ['root-output']);
			});
		} catch (error) {
			const suspendedMemos = collectSuspendedMemos(attempt);
			this.discardDraftOwners(attempt.owners);
			if (error instanceof UniversalSuspense) {
				return this.suspend(error.thenable, component, props, suspendedMemos);
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
			const rootBlueprint: BlueprintRange = { kind: 'range', key: null, children: nodes };
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
			if (list === undefined) {
				this.expandCompactLeafLists(child);
				if (expanded !== null) expanded.push(child);
				continue;
			}

			expanded ??= node.children.slice(0, index);
			const hosts: BlueprintHost[] = [];
			if (list.host !== null) {
				const host = list.host;
				for (let leafIndex = 0; leafIndex < list.keys.length; leafIndex++) {
					hosts.push({
						kind: 'host',
						key: list.keys[leafIndex],
						type: host.type,
						props: this.compactLeafProps(list, leafIndex),
						ref: null,
						owner: list.owners?.[leafIndex] ?? list.owner,
						events: EMPTY_BLUEPRINT_EVENTS,
						lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
						localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
						visibility: list.visibility,
						children: [],
					});
				}
			}
			if (child.key === null) expanded.push(...hosts);
			else expanded.push({ kind: 'range', key: child.key, children: hosts });
		}
		if (expanded !== null) node.children = expanded;
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
			attempt.retryThenables.size !== 0 ||
			!this.stableAttemptOwnersEqual(attempt)
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
		if (!pairChildren(this.rootRecord.children, blueprint.children) || !sawCompactList) {
			return null;
		}

		for (const { list } of matches) {
			for (let index = 0; index < list.keys.length; index++) this.compactLeafProps(list, index);
		}
		const commands: UniversalHostCommand[] = [];
		for (const { list, records, start } of matches) {
			const host = list.host!;
			for (let index = 0; index < list.keys.length; index++) {
				const record = records[start + index];
				const hostProps = list.props[index]!;
				if (shallowPropsEqual(record.props, hostProps, list.propCount)) continue;
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
		if (
			preparedHost === null ||
			typeof preparedHost !== 'object' ||
			typeof preparedHost.apply !== 'function' ||
			typeof preparedHost.abort !== 'function' ||
			(preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== 'function')
		) {
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
				for (const draft of attempt.owners) {
					const record = draft.record;
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
				this.nextUniversalId = attempt.nextUniversalId;
				this.treeFeatures = 0;
			},
			() => preparedHost.afterAccept?.(),
			() => {},
			() => {},
			() => {},
			null,
			() => preparedHost.abort(),
			() => this.discardDraftOwners(attempt.owners),
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
		if (
			preparedHost === null ||
			typeof preparedHost !== 'object' ||
			typeof preparedHost.apply !== 'function' ||
			typeof preparedHost.abort !== 'function' ||
			(preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== 'function')
		) {
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
				for (const draft of attempt.owners) {
					const record = draft.record;
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
				this.nextUniversalId = attempt.nextUniversalId;
				this.treeFeatures = 0;
			},
			() => preparedHost.afterAccept?.(),
			() => {},
			() => {},
			() => {},
			null,
			() => preparedHost.abort(),
			() => this.discardDraftOwners(attempt.owners),
		);
		return transaction;
	}

	private createTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> {
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
	): UniversalTransactionImpl<Container, PublicInstance> {
		let nextId = this.nextId;
		const treeFeatures = this.treeFeatures | attempt.treeFeatures;
		const used = new Set<LogicalRecord>([this.rootRecord]);
		let topologyChanged = false;
		const reconcileChildren = (
			oldChildren: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): DraftRecord[] => {
			if (
				(treeFeatures & UNIVERSAL_TREE_PORTAL) === 0 &&
				oldChildren.length === blueprints.length &&
				oldChildren.every((record, index) => sameRecordShape(record, blueprints[index]))
			) {
				return oldChildren.map((record, index) => {
					used.add(record);
					const blueprint = blueprints[index];
					return {
						record,
						blueprint,
						children: reconcileChildren(record.children, blueprint.children),
						isNew: false,
						hostUpdate: null,
					};
				});
			}
			const keyed = new Map<UniversalKey, LogicalRecord>();
			for (const old of oldChildren) if (old.key !== null) keyed.set(old.key, old);
			const claimed = new Set<LogicalRecord>();
			const nextKeys = new Set<UniversalKey>();
			const output: DraftRecord[] = [];
			for (let childIndex = 0; childIndex < blueprints.length; childIndex++) {
				const child = blueprints[childIndex];
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
				record ??= createLogicalRecord(nextId++, child);
				claimed.add(record);
				used.add(record);
				output.push({
					record,
					blueprint: child,
					children: reconcileChildren(record.children, child.children),
					isNew,
					hostUpdate: null,
				});
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
			record: this.rootRecord,
			blueprint,
			children: reconcileChildren(this.rootRecord.children, blueprint.children),
			isNew: false,
			hostUpdate: null,
		};
		const removedRoots: LogicalRecord[] = [];
		const findRemoved = (parent: LogicalRecord) => {
			for (const child of parent.children) {
				if (!used.has(child)) removedRoots.push(child);
				else findRemoved(child);
			}
		};
		if (topologyChanged) findRemoved(this.rootRecord);
		const previousPortalRegistrations = new Set<UniversalPortalTargetRegistration>();
		const nextPortalRegistrations = new Set<UniversalPortalTargetRegistration>();
		if ((treeFeatures & UNIVERSAL_TREE_PORTAL) !== 0) {
			for (const child of this.rootRecord.children) {
				walkLogical(child, (record) => {
					if (record.kind === 'portal' && record.portalRegistration !== null) {
						previousPortalRegistrations.add(record.portalRegistration);
					}
				});
			}
			walkDraft(draftRoot, (draft) => {
				if (draft.blueprint.kind !== 'portal') return;
				const registration = draft.blueprint.registration;
				if (registration === null) {
					throw new Error('A universal portal target was not prepared before reconciliation.');
				}
				nextPortalRegistrations.add(registration);
			});
		}

		const previousRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
		const stagedRegionBridges: {
			next: UniversalRendererRegionOwnerBridge;
			previous: UniversalRendererRegionOwnerBridge | null;
		}[] = [];
		const nextRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
		if ((treeFeatures & UNIVERSAL_TREE_REGION) !== 0) {
			for (const child of this.rootRecord.children) {
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
		walkDraft(draftRoot, (draft) => {
			if (draft.record.kind !== 'host') return;
			hostDrafts.push(draft);
			const blueprintHost = draft.blueprint as BlueprintHost;
			const props = Object.freeze({ ...blueprintHost.props });
			if (draft.isNew) {
				creates.push({
					op: 'create',
					id: draft.record.id,
					type: blueprintHost.type,
					props,
				});
			} else if (!shallowPropsEqual(draft.record.props, blueprintHost.props)) {
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
		const planPlacements = (
			parentId: UniversalHostParent,
			oldRecords: readonly LogicalRecord[],
			newDrafts: readonly DraftRecord[],
			sourceParentId: UniversalHostParent = parentId,
			forceMove = false,
		) => {
			const oldPhysical = physicalRecords(oldRecords);
			const newPhysical = physicalDrafts(newDrafts);
			const desiredIds = new Set(newPhysical.map((entry) => entry.record.id));
			for (const old of oldPhysical) {
				if (!desiredIds.has(old.id)) {
					removes.push({ op: 'remove', parent: sourceParentId, id: old.id });
				}
			}
			const previousIds = new Set(oldPhysical.map((entry) => entry.id));
			const current = forceMove
				? []
				: oldPhysical.filter((entry) => desiredIds.has(entry.id)).map((entry) => entry.id);
			for (let index = 0; index < newPhysical.length; index++) {
				const draft = newPhysical[index];
				const id = draft.record.id;
				if (current[index] === id) continue;
				const currentIndex = current.indexOf(id);
				const before = current[index] ?? null;
				if (currentIndex === -1) {
					placements.push({
						op: forceMove && previousIds.has(id) ? 'move' : 'insert',
						parent: parentId,
						id,
						before,
					});
				} else {
					current.splice(currentIndex, 1);
					placements.push({ op: 'move', parent: parentId, id, before });
				}
				current.splice(index, 0, id);
			}
		};
		if (topologyChanged) {
			walkDraftPostOrder(draftRoot, (draft) => {
				if (draft.record === this.rootRecord) {
					planPlacements(null, this.rootRecord.children, draft.children);
				} else if (draft.record.kind === 'host') {
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
						previousRegistration !== null && !retainedTarget,
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
			walkDraft(draftRoot, (draft) => {
				if (draft.record.kind !== 'host') return;
				const blueprintHost = draft.blueprint as BlueprintHost;
				const blueprintEvents = blueprintHost.events;
				const wasVisible = draft.record.visibility === 'visible';
				const isVisible = blueprintHost.visibility === 'visible';
				if (isVisible) stagedVisibleEventRecords.add(draft.record);
				const nextEvents = new Map<string, CommittedEvent>();
				for (const [type, event] of blueprintEvents) {
					const previous = draft.record.events.get(type);
					const listener = previous?.listener ?? nextListener++;
					const committed = { ...event, listener };
					nextEvents.set(type, committed);
					const changed =
						previous === undefined ||
						previous.handler !== event.handler ||
						previous.priority !== event.priority ||
						previous.owner !== event.owner;
					if (isVisible && (!wasVisible || changed)) {
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
			});
			for (const record of removedHosts) {
				if (record.visibility !== 'visible') continue;
				for (const [type] of record.events) {
					eventCommands.push({ op: 'event', id: record.id, type, listener: null });
				}
			}
		}
		const stageHostCallbacks = (
			op: 'lifecycle' | 'local-callback',
			readBlueprint: (host: BlueprintHost) => Map<string, BlueprintHostCallback>,
			readCommitted: (record: LogicalRecord) => Map<string, CommittedHostCallback>,
		) => {
			const commands: UniversalHostCommand[] = [];
			const staged = new Map<LogicalRecord, Map<string, CommittedHostCallback>>();
			const feature = op === 'lifecycle' ? UNIVERSAL_TREE_LIFECYCLE : UNIVERSAL_TREE_LOCAL_CALLBACK;
			if ((treeFeatures & feature) === 0) return { commands, staged };
			walkDraft(draftRoot, (draft) => {
				if (draft.record.kind !== 'host') return;
				const blueprintCallbacks = readBlueprint(draft.blueprint as BlueprintHost);
				const previousCallbacks = readCommitted(draft.record);
				const nextCallbacks = new Map<string, CommittedHostCallback>();
				for (const [type, callback] of blueprintCallbacks) {
					const previous = previousCallbacks.get(type);
					const listener = previous?.listener ?? nextListener++;
					nextCallbacks.set(type, { ...callback, listener });
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
			});
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
		const destroys: UniversalHostCommand[] = removedHosts.map((record) => ({
			op: 'destroy',
			id: record.id,
		}));
		const commands: UniversalHostCommand[] = [
			...creates,
			...updates,
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
		const hostDraftsById = new Map<number, DraftRecord>();
		const lifecycleDrafts = new Set<DraftRecord>();
		if ((treeFeatures & UNIVERSAL_TREE_LIFECYCLE) !== 0) {
			walkDraft(draftRoot, (draft) => {
				if (draft.record.kind !== 'host') return;
				hostDraftsById.set(draft.record.id, draft);
				if (draft.isNew || draft.hostUpdate !== null) lifecycleDrafts.add(draft);
			});
			for (const placement of placements) {
				if (placement.op !== 'move') continue;
				const draft = hostDraftsById.get(placement.id);
				if (draft !== undefined) lifecycleDrafts.add(draft);
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
				const suspenseHide =
					draft.record.visibility !== 'suspense-hidden' &&
					blueprintHost.visibility === 'suspense-hidden';
				const suspenseReveal =
					draft.record.visibility === 'suspense-hidden' &&
					blueprintHost.visibility !== 'suspense-hidden';
				if (
					!draft.isNew &&
					draft.record.refAttached &&
					(recreated.has(draft.record) || suspenseHide || !Object.is(draft.record.ref, nextRef))
				) {
					refDetaches.push({
						record: draft.record,
						ref: draft.record.ref,
						cleanup: draft.record.refCleanup,
					});
				}
				if (
					nextRef != null &&
					blueprintHost.visibility !== 'suspense-hidden' &&
					(draft.isNew ||
						recreated.has(draft.record) ||
						suspenseReveal ||
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
		const committedOwnersParentFirst: UniversalOwnerRecord[] = [];
		const walkCommittedOwners = (owner: UniversalOwnerRecord | null) => {
			if (owner === null) return;
			committedOwnersParentFirst.push(owner);
			for (const child of owner.children) walkCommittedOwners(child);
		};
		walkCommittedOwners(this.owner);
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
			const apply = (draft: DraftRecord, parent: LogicalRecord | null) => {
				const record = draft.record;
				record.parent = parent;
				record.key = draft.blueprint.key;
				if (record.kind === 'host') {
					applyHost(draft);
				} else if (record.kind === 'portal') {
					record.portalRegistration = (draft.blueprint as BlueprintPortal).registration;
				}
				record.children = draft.children.map((child) => child.record);
				for (const child of draft.children) apply(child, record);
			};
			if (topologyChanged) apply(draftRoot, null);
			else for (const draft of hostDrafts) applyHost(draft);
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
		const lifecycleOrder: DraftRecord[] = [];
		if (lifecycleDrafts.size !== 0) {
			walkDraftPostOrder(draftRoot, (draft) => {
				if (lifecycleDrafts.has(draft)) lifecycleOrder.push(draft);
			});
		}
		const hasPassiveWork =
			removedEffectEventCells.length !== 0 ||
			orderedEffectCleanups.some((cleanup) => cleanup.phase === 'passive') ||
			effectChanges.some(({ next, changed }) => changed && next.phase === 'passive');
		const prepareHost = (value: UniversalHostBatch) =>
			this.driver.prepareBatch(this.container, value, {
				invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
			});
		const identity = this.transportIdentity(batch.version);
		let preparedHost: UniversalPreparedHostBatch | null = null;
		let preparedAsyncHost: UniversalAsyncPreparedHostBatch | null = null;
		if (this.transport?.mode === 'async') {
			preparedAsyncHost = this.transport.prepareBatch(this.container, batch, identity);
			if (
				preparedAsyncHost === null ||
				typeof preparedAsyncHost !== 'object' ||
				typeof preparedAsyncHost.apply !== 'function' ||
				typeof preparedAsyncHost.abort !== 'function' ||
				(preparedAsyncHost.afterAccept !== undefined &&
					typeof preparedAsyncHost.afterAccept !== 'function')
			) {
				throw new TypeError(
					'A universal async transport must return a valid prepared batch token.',
				);
			}
		} else {
			preparedHost =
				this.transport === null
					? prepareHost(batch)
					: this.transport.prepareBatch(this.container, batch, prepareHost);
			if (
				preparedHost === null ||
				typeof preparedHost !== 'object' ||
				typeof preparedHost.apply !== 'function' ||
				typeof preparedHost.abort !== 'function' ||
				(preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== 'function')
			) {
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
				if (this.hostAttachments !== null) {
					for (const record of removedHosts) this.hostAttachments.records.delete(record.id);
					for (const draft of hostDrafts) {
						this.hostAttachments.records.set(draft.record.id, draft.record);
					}
				}
				if ((treeFeatures & UNIVERSAL_TREE_EVENT) !== 0) {
					for (const listener of this.publishedListeners) EVENT_DISPATCHERS.delete(listener);
					this.publishedListeners.clear();
					const handlers = new Map<number, CommittedEvent>();
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
					this.handlers = handlers;
				}
				if ((treeFeatures & UNIVERSAL_TREE_LOCAL_CALLBACK) !== 0) {
					const localCallbacks = new Map<number, CommittedHostCallback>();
					for (const callbacks of localCallbackStage.staged.values()) {
						for (const callback of callbacks.values()) {
							localCallbacks.set(callback.listener, callback);
						}
					}
					this.localCallbacks = localCallbacks;
				}
				for (const owner of removedOwners) {
					owner.disposed = true;
					owner.mounted = false;
				}
				for (const draft of draftOwnersParentFirst) {
					const record = draft.record;
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
					for (const [slot, count] of draft.appliedUpdates) {
						const updates = record.updates.get(slot);
						if (updates === undefined) continue;
						updates.splice(0, count);
						if (updates.length === 0) record.updates.delete(slot);
					}
					for (const hook of record.hooks.values()) {
						if (hook.kind === 'effect-event') {
							hook.cell.impl = hook.next;
							hook.cell.active = true;
						}
					}
				}
				this.owner = attempt.owner.record;
				this.lastComponent = component;
				this.lastProps = props;
				if (retryThenables.length > 0) {
					this.publishLocalReplay(retryThenables, retryMemos, component, props);
				}
				this.nextId = nextId;
				this.nextUniversalId = attempt.nextUniversalId;
				this.nextListener = nextListener;
				this.treeFeatures = attempt.treeFeatures;
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
				for (const draft of lifecycleOrder) {
					const record = draft.record;
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
		);
		return transaction;
	}

	finish(transaction: UniversalTransactionImpl<Container, PublicInstance>): void {
		if (this.pending === transaction) {
			this.pending = null;
			if (this.hostAttachments !== null) this.queueHostAttachmentFlush();
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
		if (
			prepared === null ||
			typeof prepared !== 'object' ||
			typeof prepared.apply !== 'function' ||
			typeof prepared.abort !== 'function' ||
			(prepared.afterAccept !== undefined && typeof prepared.afterAccept !== 'function')
		) {
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
		const owners: UniversalOwnerRecord[] = [];
		const collectOwners = (owner: UniversalOwnerRecord | null) => {
			if (owner === null) return;
			owners.push(owner);
			for (const child of owner.children) collectOwners(child);
		};
		collectOwners(this.owner);
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
							[...record.events.keys()].map(
								(type): UniversalHostCommand => ({
									op: 'event',
									id: record.id,
									type,
									listener: null,
								}),
							),
						),
						...removedHosts.flatMap((record) =>
							[...record.lifecycles.keys()].map(
								(type): UniversalHostCommand => ({
									op: 'lifecycle',
									id: record.id,
									type,
									listener: null,
								}),
							),
						),
						...removedHosts.flatMap((record) =>
							[...record.localCallbacks.keys()].map(
								(type): UniversalHostCommand => ({
									op: 'local-callback',
									id: record.id,
									type,
									listener: null,
								}),
							),
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
				SCHEDULED_UNIVERSAL_ROOTS.delete(this);
				this.suspended?.abort();
				this.cancelSuspendedReplays();
				let attachmentUnsubscribeError: unknown = NO_PENDING_PASSIVE_ERROR;
				if (this.hostAttachments !== null) {
					try {
						this.disposeHostAttachments();
					} catch (error) {
						attachmentUnsubscribeError = error;
					}
				}
				this.rootRecord.children = [];
				let portalReleaseError: unknown = NO_PENDING_PASSIVE_ERROR;
				for (const registration of portalRegistrations) {
					try {
						registration.release();
					} catch (error) {
						if (portalReleaseError === NO_PENDING_PASSIVE_ERROR) portalReleaseError = error;
					}
				}
				for (const listener of this.publishedListeners) EVENT_DISPATCHERS.delete(listener);
				this.publishedListeners.clear();
				this.handlers = new Map();
				this.localCallbacks = new Map();
				for (const owner of owners) {
					owner.disposed = true;
					owner.mounted = false;
				}
				const deactivatedRegionCells = new Set<RendererRegionBridgeCell>();
				for (const bridge of regionBridges) {
					const cell = bridge.lifecycle();
					if (cell === null || deactivatedRegionCells.has(cell)) continue;
					deactivatedRegionCells.add(cell);
					bridge.deactivate();
				}
				this.owner = null;
				this.treeFeatures = 0;
				this.unmounted = true;
				this.unmounting = false;
				this.lastComponent = null;
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
			| ((acknowledge: (message: UniversalTransportAcknowledgement) => void) => Promise<void>)
			| null,
		private readonly transportIdentity: UniversalTransportIdentity,
		private readonly publishHost: () => void,
		private readonly afterHostAccept: () => void,
		private readonly afterMutation: () => void,
		private readonly lifecycle: () => void,
		private readonly layout: () => void,
		private readonly passive: (() => void) | null,
		private readonly abortHost: () => void,
		private readonly onAbort: () => void,
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
	return new UniversalRootImpl(container, driver, options.transport ?? null, scheduleMicrotask);
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
			const simulated = new Map<
				number,
				{
					type: string;
					props: Readonly<Record<string, unknown>>;
					visible: boolean;
					children: number[];
					events: Map<string, UniversalEventListenerDescriptor>;
					lifecycles: Map<string, UniversalListenerDescriptor>;
					localCallbacks: Map<string, UniversalListenerDescriptor>;
				}
			>();
			for (const [id, instance] of state.instances) {
				simulated.set(id, {
					type: instance.type,
					props: instance.props,
					visible: instance.visible,
					children: instance.children.map((child) => child.id),
					events: new Map(state.events.get(id)),
					lifecycles: new Map(state.lifecycles.get(id)),
					localCallbacks: new Map(state.localCallbacks.get(id)),
				});
			}
			const stagedInstances = new Map<number, ObjectHostInstance>();
			const cleanupKeys = new Set<string>();
			const invokeKeys = new Set<string>();
			const keyFor = (id: number, type: string) => `${id}:${type}`;
			const parseKey = (key: string): [number, string] => {
				const separator = key.indexOf(':');
				return [Number(key.slice(0, separator)), key.slice(separator + 1)];
			};
			const rootChildren = container.children.map((child) => child.id);
			const simulatedChildren = (parent: number | null) => {
				if (parent === null) return rootChildren;
				const value = simulated.get(parent);
				if (value === undefined) throw new Error(`Object driver: unknown parent ${parent}.`);
				return value.children;
			};
			for (const command of batch.commands) {
				if (command.op === 'create') {
					if (simulated.has(command.id))
						throw new Error(`Object driver: duplicate id ${command.id}.`);
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
					const value = simulated.get(command.id);
					if (value === undefined) throw new Error(`Object driver: unknown update ${command.id}.`);
					value.props = command.props;
				} else if (command.op === 'recreate') {
					const value = simulated.get(command.id);
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
					const value = simulated.get(command.id);
					if (value === undefined) {
						throw new Error(`Object driver: unknown visibility target ${command.id}.`);
					}
					value.visible = command.state === 'visible';
				} else if (command.op === 'event') {
					const value = simulated.get(command.id);
					if (value === undefined)
						throw new Error(`Object driver: unknown event target ${command.id}.`);
					if (command.listener === null) value.events.delete(command.type);
					else value.events.set(command.type, command.listener);
				} else if (command.op === 'lifecycle') {
					const value = simulated.get(command.id);
					if (value === undefined)
						throw new Error(`Object driver: unknown lifecycle target ${command.id}.`);
					if (command.listener === null) value.lifecycles.delete(command.type);
					else value.lifecycles.set(command.type, command.listener);
				} else if (command.op === 'local-callback') {
					const value = simulated.get(command.id);
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
					if (!simulated.has(command.id))
						throw new Error(`Object driver: unknown child ${command.id}.`);
					for (const value of [
						rootChildren,
						...[...simulated.values()].map((entry) => entry.children),
					]) {
						const old = value.indexOf(command.id);
						if (old !== -1) value.splice(old, 1);
					}
					const children = simulatedChildren(command.parent);
					const before =
						command.before === null ? children.length : children.indexOf(command.before);
					if (before === -1) throw new Error(`Object driver: unknown before id ${command.before}.`);
					children.splice(before, 0, command.id);
					if (command.op === 'move') {
						for (const type of simulated.get(command.id)!.localCallbacks.keys()) {
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
					for (const type of simulated.get(command.id)!.localCallbacks.keys()) {
						cleanupKeys.add(keyFor(command.id, type));
					}
				} else if (command.op === 'destroy') {
					const instance = simulated.get(command.id);
					if (instance === undefined)
						throw new Error(`Object driver: unknown destroy ${command.id}.`);
					for (const value of [
						rootChildren,
						...[...simulated.values()].map((entry) => entry.children),
					]) {
						const attached = value.indexOf(command.id);
						if (attached !== -1) value.splice(attached, 1);
					}
					instance.children.length = 0;
					simulated.delete(command.id);
				}
			}
			for (const [id, instance] of stagedInstances) {
				const staged = simulated.get(id);
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
								state.instances.set(command.id, stagedInstances.get(command.id)!);
								state.events.set(command.id, new Map());
								state.lifecycles.set(command.id, new Map());
								state.localCallbacks.set(command.id, new Map());
								state.localCleanups.set(command.id, new Map());
							} else if (command.op === 'update') {
								state.instances.get(command.id)!.props = command.props;
							} else if (command.op === 'recreate') {
								const previous = state.instances.get(command.id)!;
								const replacement = stagedInstances.get(command.id)!;
								for (const parent of [
									container.children,
									...[...state.instances.values()].map((entry) => entry.children),
								]) {
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
								for (const parent of [
									container.children,
									...[...state.instances.values()].map((entry) => entry.children),
								]) {
									const old = parent.indexOf(instance);
									if (old !== -1) parent.splice(old, 1);
								}
								const children = objectChildren(container, command.parent, state.instances);
								const before =
									command.before === null
										? children.length
										: children.indexOf(state.instances.get(command.before)!);
								children.splice(before, 0, instance);
							} else if (command.op === 'remove') {
								if (command.parent !== null && typeof command.parent !== 'number') {
									throw new Error('Object driver does not support portal target parents.');
								}
								const children = objectChildren(container, command.parent, state.instances);
								children.splice(children.indexOf(state.instances.get(command.id)!), 1);
							} else if (command.op === 'destroy') {
								const instance = state.instances.get(command.id)!;
								for (const parent of [
									container.children,
									...[...state.instances.values()].map((entry) => entry.children),
								]) {
									const attached = parent.indexOf(instance);
									if (attached !== -1) parent.splice(attached, 1);
								}
								instance.children.length = 0;
								state.instances.delete(command.id);
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
							let parent: ObjectHostInstance | null = null;
							for (const candidate of state.instances.values()) {
								if (candidate.children.includes(instance)) {
									parent = candidate;
									break;
								}
							}
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
