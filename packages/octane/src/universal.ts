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
	type Context,
	type RendererRegionOwnerBridge,
	type Scope,
	createContext as createDomContext,
	readContextFromScope,
	useInsertionEffect as useDomInsertionEffect,
	useLayoutEffect as useDomLayoutEffect,
	useRendererThenable as useDomRendererThenable,
	useState as useDomState,
} from './runtime.js';
import {
	__profileBeginRender,
	__profileComponentSource,
	__profileEndRender,
	__profileSchedule,
	__profileTrackComponent,
} from './profiling.js';

const UNIVERSAL_PLAN = Symbol.for('octane.universal.plan');
const UNIVERSAL_VALUE = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST = Symbol.for('octane.universal.list');
const UNIVERSAL_COMPONENT = Symbol.for('octane.universal.component');
const UNIVERSAL_BOUNDARY = Symbol.for('octane.universal.boundary');
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
const UNIVERSAL_RENDERER_REGION = Symbol.for('octane.universal.renderer-region');
const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');

const NO_CHILDREN = Symbol('octane.universal.no-children');
const NO_KEY = Symbol('octane.universal.no-key');
const NO_PENDING_PASSIVE_ERROR = Symbol('octane.universal.no-pending-passive-error');

export type UniversalKey = string | number | symbol | bigint;

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

export type UniversalRenderable =
	| UniversalPlanValue
	| UniversalListValue
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
}

export interface UniversalTryValue {
	readonly $$kind: typeof UNIVERSAL_TRY;
	readonly body: () => UniversalRenderable;
	readonly pending: (() => UniversalRenderable) | null;
	readonly catch: ((error: unknown, reset: () => void) => UniversalRenderable) | null;
}

export interface UniversalContextValue {
	readonly $$kind: typeof UNIVERSAL_CONTEXT;
	readonly context: Context<any>;
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
	readContext<T>(context: Context<T>): T;
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
}

export interface UniversalResourceHandle {
	readonly $$kind: 'octane.universal.resource';
	readonly renderer: string;
	readonly root: number;
	readonly id: string | number;
}

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
			readonly parent: number | null;
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
	| { readonly op: 'remove'; readonly parent: number | null; readonly id: number }
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

export interface UniversalHostDriver<Container = unknown, PublicInstance = unknown> {
	readonly id: string;
	readonly capabilities?: UniversalHostCapabilities;
	readonly events?: UniversalEventCapability;
	readonly lifecycles?: UniversalHostCallbackCapability;
	readonly localCallbacks?: UniversalHostCallbackCapability;
	readonly props?: UniversalHostPropCodec<Container>;
	readonly updates?: UniversalHostUpdateCapability;
	/** Validate and stage a batch without mutating the public host. */
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		context: UniversalHostCommitContext,
	): UniversalPreparedHostBatch;
	getPublicInstance(container: Container, id: number): PublicInstance | null;
}

export interface UniversalCommitTransport<Container = unknown> {
	prepareBatch(
		container: Container,
		batch: UniversalHostBatch,
		prepare: (batch: UniversalHostBatch) => UniversalPreparedHostBatch,
	): UniversalPreparedHostBatch;
}

export interface UniversalRootOptions<Container> {
	transport?: UniversalCommitTransport<Container>;
}

export interface UniversalTransaction {
	readonly status: 'prepared' | 'committed' | 'aborted';
	readonly batch: UniversalHostBatch;
	commit(): void;
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
	eventScope<T>(priority: UniversalEventPriority, run: () => T): T;
	dispatchEvent(listener: number, payload: unknown): unknown;
	unmount(): void;
}

interface BlueprintRange {
	kind: 'range';
	key: UniversalKey | null;
	children: BlueprintNode[];
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

type BlueprintNode = BlueprintRange | BlueprintHost;

interface LogicalRecord {
	id: number;
	kind: 'range' | 'host';
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
	parent: LogicalRecord | null;
	children: LogicalRecord[];
}

interface CommittedEvent extends BlueprintEvent {
	readonly listener: number;
}

interface CommittedHostCallback extends BlueprintHostCallback {
	readonly listener: number;
}

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
	set: (value: T | ((previous: T) => T)) => void;
	get: () => T;
}

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
	contextValues: Map<Context<any>, unknown> | null;
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
	readContext<T>(context: Context<T>): T;
	invalidate(): void;
}

interface RenderAttempt {
	root: UniversalRootImpl<any, any>;
	owner: DraftOwner;
	owners: DraftOwner[];
	replayEntries: readonly SuspendedMemoEntry[];
	retryThenables: Set<PromiseLike<unknown>>;
	nextUniversalId: number;
	implicitSlot: number;
}

interface DraftOwner {
	record: UniversalOwnerRecord;
	parent: DraftOwner | null;
	replayPath: readonly SuspendedOwnerSegment[];
	hooks: Map<unknown, UniversalHook>;
	clonedHooks: Set<unknown>;
	seenEffects: EffectHook[];
	children: DraftOwner[];
	claimedChildren: Set<UniversalOwnerRecord>;
	contextValues: Map<Context<any>, unknown> | null;
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
}

let CURRENT_ATTEMPT: RenderAttempt | null = null;
let CURRENT_OWNER: DraftOwner | null = null;
let NEXT_HOOK_SLOT = 0;
let NEXT_OWNER_ID = 1;
let NEXT_UNIVERSAL_ID_ROOT = 1;
let NEXT_EVENT_ROOT = 1;
let NEXT_RESOURCE_ROOT = 1;
const EVENT_DISPATCHERS = new Map<number, (payload: unknown) => unknown>();
const UNIVERSAL_SLOT_STACK: unknown[] = [];

interface RendererRegionBridgeCell {
	active: boolean;
	disposing: boolean;
	readonly disposers: Set<() => void>;
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

	readContext<T>(context: Context<T>): T {
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

export function universalProps(
	entries: readonly UniversalPropEntry[],
	children: unknown = NO_CHILDREN,
): UniversalPropsValue {
	const props: Record<string, unknown> = {};
	for (const entry of entries) {
		if (entry[0] === 'set') {
			props[entry[1]] = entry[2];
			continue;
		}
		const spread = entry[1];
		if (spread == null) continue;
		Object.assign(props, Object(spread));
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
): UniversalForValue {
	return { $$kind: UNIVERSAL_FOR, items, key, render, empty };
}

export function universalTry(
	body: () => UniversalRenderable,
	pending: (() => UniversalRenderable) | null = null,
	catchBody: ((error: unknown, reset: () => void) => UniversalRenderable) | null = null,
): UniversalTryValue {
	return { $$kind: UNIVERSAL_TRY, body, pending, catch: catchBody };
}

export function universalContext<T>(
	context: Context<T>,
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
	if (CURRENT_OWNER !== null) {
		if (ownerRenderer !== CURRENT_OWNER.record.renderer) {
			throw new Error(
				`rendererRegion owner ${JSON.stringify(ownerRenderer)} does not match the active universal renderer ${JSON.stringify(CURRENT_OWNER.record.renderer)}.`,
			);
		}
		if ((typeof props !== 'object' && typeof props !== 'function') || props === null) {
			throw new TypeError(
				'A renderer region created by a universal component requires object props.',
			);
		}
		const bridge = new UniversalRendererRegionOwnerBridge(
			CURRENT_OWNER.record,
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
		},
	};
	const wrapper = defineUniversalComponent<P>(
		renderer,
		(props, context) => {
			if (CURRENT_OWNER !== null) owners.add(CURRENT_OWNER.record);
			return meta.component(props, context);
		},
		{ module: metadata.module },
	) as UniversalHmrComponent<P>;
	Object.defineProperty(wrapper, UNIVERSAL_HMR, { value: meta });
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
	let ordinal = 0;
	for (const child of parent.children) {
		const segment = child.replayPath[child.replayPath.length - 1];
		if (
			segment.component === component &&
			Object.is(segment.key, key) &&
			identityPathEqual(segment.identityPath, identityPath)
		) {
			ordinal++;
		}
	}
	return [...parent.replayPath, { component, identityPath, key, ordinal }];
}

function claimChildOwner(
	parent: DraftOwner,
	component: UniversalComponent<any> | null,
	identityPath: readonly unknown[],
	key: unknown,
): DraftOwner {
	const attempt = currentAttempt();
	let record: UniversalOwnerRecord | undefined;
	for (const candidate of parent.record.children) {
		if (parent.claimedChildren.has(candidate)) continue;
		if (
			candidate.component === component &&
			Object.is(candidate.key, key) &&
			identityPathEqual(candidate.identityPath, identityPath)
		) {
			record = candidate;
			break;
		}
	}
	record ??= createOwnerRecord(attempt.root, component, parent.record, identityPath, key);
	parent.claimedChildren.add(record);
	const draft = draftOwner(record, parent, childReplayPath(parent, component, identityPath, key));
	parent.children.push(draft);
	attempt.owners.push(draft);
	return draft;
}

function readOwnerContext<T>(owner: DraftOwner | null, context: Context<T>): T {
	for (let current = owner; current !== null; current = current.parent) {
		if (current.contextValues?.has(context)) return current.contextValues.get(context) as T;
	}
	return currentAttempt().root.readBridgeContext(context);
}

function executeOwner(owner: DraftOwner, build: () => BlueprintNode[]): BlueprintNode[] {
	const attempt = currentAttempt();
	let output: BlueprintNode[] = [];
	for (let renderCount = 0; ; renderCount++) {
		if (renderCount === 25) throw new Error('Too many universal render-phase updates.');
		if (renderCount > 0) resetDraftChildren(owner);
		owner.seenEffects = [];
		owner.children = [];
		owner.claimedChildren = new Set();
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
			output = build();
		} catch (error) {
			didThrow = true;
			thrown = error;
			throw error;
		} finally {
			__profileEndRender(profileFrame, didThrow, thrown);
			CURRENT_OWNER = previousOwner;
			attempt.owner = previousAttemptOwner;
		}
		if (!owner.needsRender) return output;
	}
}

function ownerRange(owner: DraftOwner, children: BlueprintNode[]): BlueprintNode[] {
	return [{ kind: 'range', key: owner.record.rangeKey, children }];
}

function componentContext(renderer: string): UniversalRenderContext {
	return {
		renderer,
		readContext: (context) => readOwnerContext(CURRENT_OWNER, context),
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
	contextValues: Map<Context<any>, unknown> | null = null,
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
}

function retainCommittedOwnerTree(owner: DraftOwner): void {
	owner.hooks = new Map(owner.record.hooks);
	owner.seenEffects = [...owner.record.effectOrder];
	owner.contextValues =
		owner.record.contextValues === null ? null : new Map(owner.record.contextValues);
	owner.children = [];
	owner.claimedChildren = new Set(owner.record.children);
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
		if (node.kind === 'host') node.visibility = 'suspense-hidden';
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
		let index = 0;
		for (const item of list.items) {
			const itemIndex = index++;
			const itemKey = list.key(item, itemIndex);
			if (keys.has(itemKey)) throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
			keys.add(itemKey);
			output.push(
				...materializeScoped(CURRENT_OWNER!, [...path, 'for'], itemKey, () =>
					list.render(item, itemIndex),
				),
			);
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
	const events = new Map<string, BlueprintEvent>();
	const lifecycles = new Map<string, BlueprintHostCallback>();
	const localCallbacks = new Map<string, BlueprintHostCallback>();
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
			lifecycles.set(lifecycle.type, {
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
			localCallbacks.set(local.type, {
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
			events.set(definition.type, {
				prop: name,
				type: definition.type,
				priority: definition.priority ?? 'default',
				handler: handler as (...args: any[]) => any,
				owner: CURRENT_OWNER!.record,
			});
			continue;
		}
		props[name] = currentAttempt().root.encodeHostProp(node.type, name, handler);
	}
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
			events,
			lifecycles,
			localCallbacks,
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
		events: new Map(),
		lifecycles: new Map(),
		localCallbacks: new Map(),
		visibility: blueprint.kind === 'host' ? blueprint.visibility : 'visible',
		parent: null,
		children: [],
	};
}

function shallowPropsEqual(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const key of leftKeys) {
		if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.is(left[key], right[key])) {
			return false;
		}
	}
	return true;
}

function physicalRecords(records: readonly LogicalRecord[]): LogicalRecord[] {
	const output: LogicalRecord[] = [];
	for (const record of records) {
		if (record.kind === 'host') output.push(record);
		else output.push(...physicalRecords(record.children));
	}
	return output;
}

function physicalDrafts(records: readonly DraftRecord[]): DraftRecord[] {
	const output: DraftRecord[] = [];
	for (const record of records) {
		if (record.record.kind === 'host') output.push(record);
		else output.push(...physicalDrafts(record.children));
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

function resolveHookSlot(slot: unknown): unknown {
	currentAttempt();
	const owner = CURRENT_OWNER;
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
	if (CURRENT_OWNER === null) {
		throw new Error('Universal hooks require an active component owner.');
	}
	return CURRENT_OWNER;
}

function findDraftOwner(record: UniversalOwnerRecord): DraftOwner | null {
	const attempt = CURRENT_ATTEMPT;
	if (attempt === null) return null;
	for (let index = attempt.owners.length - 1; index >= 0; index--) {
		if (attempt.owners[index].record === record) return attempt.owners[index];
	}
	return null;
}

function applyStateUpdates<T>(value: T, updates: readonly unknown[]): T {
	let next = value;
	for (const update of updates) {
		next = typeof update === 'function' ? (update as (previous: T) => T)(next) : (update as T);
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
			hook.value = applyStateUpdates(hook.value, updates);
			owner.appliedUpdates.set(slot, updates.length);
		}
	}
	return hook;
}

function projectedStateValue<T>(record: UniversalOwnerRecord, slot: unknown, fallback: T): T {
	const draft = findDraftOwner(record);
	const draftHook = draft?.hooks.get(slot) as StateHook<T> | undefined;
	if (draftHook?.kind === 'state') return draftHook.value;
	const hook = record.hooks.get(slot) as StateHook<T> | undefined;
	const value = hook?.kind === 'state' ? hook.value : fallback;
	return applyStateUpdates(value, record.updates.get(slot) ?? []);
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
				const previous = projectedStateValue(record, resolved, initialValue);
				const next = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value;
				if (Object.is(next, previous)) return;
				const updates = record.updates.get(resolved) ?? [];
				updates.push(value);
				record.updates.set(resolved, updates);
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
					value = (committed?.reducer ?? reducer)(value, update as A);
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
				for (const action of updates) hook.value = reducer(hook.value, action as A);
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

export function useMemo<T>(compute: () => T, deps?: readonly unknown[] | null, slot?: unknown): T {
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
			? (compute as (...args: unknown[]) => T)(...(normalized ?? []))
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
	return withSlot(base, () => {
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
	});
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
): [State, (payload: Payload) => void, boolean] {
	const slot = maybeSlot ?? (typeof _permalinkOrSlot === 'string' ? undefined : _permalinkOrSlot);
	const base = resolveHookSlot(slot);
	return withSlot(base, () => {
		const [state, setState, getState] = useState(initialState, 'state');
		const [pending, setPending] = useState(false, 'pending');
		const dispatch = useCallback(
			(payload: Payload) => {
				let result: State | Promise<State>;
				try {
					result = action(getState(), payload);
				} catch (error) {
					queueMicrotask(() => {
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
							queueMicrotask(() => {
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

export interface FormStatus {
	pending: boolean;
	data: FormData | null;
	method: string | null;
	action: string | ((formData: FormData) => void | Promise<void>) | null;
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

export function useContext<T>(context: Context<T>): T {
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
}

const UNIVERSAL_WARM_CACHES = new WeakMap<
	UniversalRootImpl<any, any>,
	Map<unknown, UniversalWarmEntry[]>
>();
let CURRENT_UNIVERSAL_WARM: Map<unknown, UniversalWarmEntry[]> | null = null;
let UNIVERSAL_WARM_DEPTH = 0;
const UNIVERSAL_WARM_DEPTH_CAP = 64;
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
		const [entry] = entries.splice(index, 1);
		if (entries.length === 0) cache!.delete(slot);
		return entry.value;
	}
	return NO_WARM_VALUE;
}

/** Compiler ABI: suspend once for all pending promises in one independent stratum. */
export function useBatch(items: any[], warm?: () => void): void {
	let pending: UniversalTrackedThenable[] | null = null;
	for (const item of items) {
		if (item == null || typeof item.then !== 'function') continue;
		const thenable = item as UniversalTrackedThenable;
		trackUniversalThenable(thenable);
		if (thenable.status === 'rejected') break;
		if (thenable.status === 'pending') (pending ??= []).push(thenable);
	}
	if (pending === null) return;
	if (warm !== undefined) {
		const root = currentAttempt().root;
		let cache = UNIVERSAL_WARM_CACHES.get(root);
		if (cache === undefined) {
			cache = new Map();
			UNIVERSAL_WARM_CACHES.set(root, cache);
		}
		const previous = CURRENT_UNIVERSAL_WARM;
		CURRENT_UNIVERSAL_WARM = cache;
		try {
			warm();
		} catch {
			// Fetch warming is speculative and cannot fail the render.
		} finally {
			CURRENT_UNIVERSAL_WARM = previous;
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

/** Compiler ABI: cache one speculative promise/value creation by hook slot and deps. */
export function warmMemo(compute: () => any, deps: readonly any[], slot: unknown): void {
	const cache = CURRENT_UNIVERSAL_WARM;
	if (cache === null) return;
	let entries = cache.get(slot);
	if (entries?.some((entry) => depsEqual(entry.deps, deps))) return;
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
	entries.push({ deps: [...deps], value });
	if (entries.length > 64) entries.shift();
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

export function use<T>(usable: Context<T> | PromiseLike<T>): T {
	if ((usable as Context<T>)?.$$kind === Symbol.for('octane.context')) {
		return useContext(usable as Context<T>);
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
	void fn();
}

export function requestFormReset(): void {
	// Universal renderers have no intrinsic form ownership. Form bindings may
	// layer reset behavior above this host-neutral no-op.
}

export function memo<P>(
	component: UniversalComponent<P>,
	_compare?: (previous: Readonly<P>, next: Readonly<P>) => boolean,
): UniversalComponent<P> {
	return component;
}

export function createPortal(): never {
	throw new Error('The active universal renderer does not declare the portal capability.');
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
	const frozenCommands = commands.map((command) => {
		if (
			(command.op === 'event' || command.op === 'lifecycle' || command.op === 'local-callback') &&
			command.listener !== null
		) {
			Object.freeze(command.listener);
		}
		return Object.freeze(command);
	});
	return Object.freeze({
		renderer,
		version,
		commands: Object.freeze(frozenCommands),
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

class UniversalRootImpl<Container, PublicInstance> implements UniversalRoot<any> {
	readonly renderer: string;
	private readonly rootRecord: LogicalRecord;
	private readonly universalIdRoot = NEXT_UNIVERSAL_ID_ROOT++;
	private readonly resourceRoot = NEXT_RESOURCE_ROOT++;
	private owner: UniversalOwnerRecord | null = null;
	private bridge: BoundaryOwner | null = null;
	private unmounted = false;
	private nextId = 1;
	private nextUniversalId = 1;
	private nextListener = NEXT_EVENT_ROOT++ * 1_000_000;
	private nextBatchVersion = 1;
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

	constructor(
		private readonly container: Container,
		private readonly driver: UniversalHostDriver<Container, PublicInstance>,
		private readonly transport: UniversalCommitTransport<Container> | null,
	) {
		assertRendererId(driver.id, 'Universal driver id');
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
			parent: null,
			children: [],
		};
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

	readBridgeContext<T>(context: Context<T>): T {
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

	encodeHostProp(hostType: string, name: string, value: unknown): unknown {
		const codec = this.driver.props;
		if (codec === undefined) return value;
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

	private flushScheduledWork(): void {
		if (!this.scheduled) return;
		this.scheduled = false;
		if (this.unmounted || this.owner?.disposed || this.lastComponent === null) return;
		if (this.bridge !== null) this.bridge.invalidate();
		else this.render(this.lastComponent, this.lastProps);
	}

	private queueScheduledWork(): void {
		if (!this.scheduled) return;
		if (this.bridge !== null) {
			this.scheduled = false;
			this.bridge.invalidate();
			return;
		}
		queueMicrotask(() => this.flushScheduledWork());
	}

	schedule(): void {
		if (this.unmounted || this.owner?.disposed || this.lastComponent === null || this.scheduled)
			return;
		this.scheduled = true;
		if (this.eventScopeDepth === 0) this.queueScheduledWork();
	}

	private cancelSuspendedReplays(): void {
		if (this.awaitingReplay !== null) this.awaitingReplay.active = false;
		if (this.queuedReplay !== null) this.queuedReplay.active = false;
		this.awaitingReplay = null;
		this.queuedReplay = null;
		this.rootRetryAttempt = null;
	}

	private runReplay(replay: SuspendedMemoReplay): void {
		if (!replay.active || this.queuedReplay !== replay || this.unmounted) return;
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
		queueMicrotask(() => this.runReplay(replay));
	}

	private publishLocalReplay(
		thenables: readonly PromiseLike<unknown>[],
		entries: readonly SuspendedMemoEntry[],
		component: UniversalComponent<any>,
		props: any,
	): void {
		if (this.awaitingReplay !== null) this.awaitingReplay.active = false;
		const replay: SuspendedMemoReplay = { entries, component, props, active: true };
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
		});
	}

	private flushPassiveTasks(): void {
		if (this.passiveTasks.length === 0) return;
		const tasks = this.passiveTasks.splice(0);
		runCommitTasks(tasks);
	}

	enqueuePassive(task: () => void): void {
		this.passiveTasks.push(task);
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		queueMicrotask(() => {
			this.passiveScheduled = false;
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
		return this.prepareWithReplay(component, props, []);
	}

	private prepareWithReplay(
		component: UniversalComponent<any>,
		props: any,
		replayEntries: readonly SuspendedMemoEntry[],
	): UniversalPreparedAttempt {
		if (this.unmounted) throw new Error('Cannot render an unmounted universal root.');
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
		const attempt: RenderAttempt = {
			root: this,
			owner,
			owners: [owner],
			replayEntries,
			retryThenables: new Set(),
			nextUniversalId: this.nextUniversalId,
			implicitSlot: 0,
		};
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
		const attempt = this.prepare(component, props);
		if (attempt.status === 'prepared') attempt.commit();
		return attempt;
	}

	private createTransaction(
		blueprint: BlueprintRange,
		attempt: RenderAttempt,
		component: UniversalComponent<any>,
		props: any,
	): UniversalTransactionImpl<Container, PublicInstance> {
		let nextId = this.nextId;
		const used = new Set<LogicalRecord>([this.rootRecord]);
		const reconcileChildren = (
			oldChildren: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): DraftRecord[] => {
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
		findRemoved(this.rootRecord);

		const previousRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
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
		const stagedRegionBridges: {
			next: UniversalRendererRegionOwnerBridge;
			previous: UniversalRendererRegionOwnerBridge | null;
		}[] = [];
		const nextRegionBridges = new Set<UniversalRendererRegionOwnerBridge>();
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

		const creates: UniversalHostCommand[] = [];
		const updates: UniversalHostCommand[] = [];
		const recreated = new Set<LogicalRecord>();
		walkDraft(draftRoot, (draft) => {
			if (draft.record.kind !== 'host') return;
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
			parentId: number | null,
			oldRecords: readonly LogicalRecord[],
			newDrafts: readonly DraftRecord[],
		) => {
			const oldPhysical = physicalRecords(oldRecords);
			const newPhysical = physicalDrafts(newDrafts);
			const desiredIds = new Set(newPhysical.map((entry) => entry.record.id));
			for (const old of oldPhysical) {
				if (!desiredIds.has(old.id)) removes.push({ op: 'remove', parent: parentId, id: old.id });
			}
			const current = oldPhysical
				.filter((entry) => desiredIds.has(entry.id))
				.map((entry) => entry.id);
			for (let index = 0; index < newPhysical.length; index++) {
				const draft = newPhysical[index];
				const id = draft.record.id;
				if (current[index] === id) continue;
				const currentIndex = current.indexOf(id);
				const before = current[index] ?? null;
				if (currentIndex === -1) {
					placements.push({ op: 'insert', parent: parentId, id, before });
				} else {
					current.splice(currentIndex, 1);
					placements.push({ op: 'move', parent: parentId, id, before });
				}
				current.splice(index, 0, id);
			}
		};
		walkDraftPostOrder(draftRoot, (draft) => {
			if (draft.record === this.rootRecord) {
				planPlacements(null, this.rootRecord.children, draft.children);
			} else if (draft.record.kind === 'host') {
				planPlacements(draft.record.id, draft.record.children, draft.children);
			}
		});
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
		walkDraftPostOrder(draftRoot, stageHiddenVisibility);
		walkDraft(draftRoot, stageVisibleVisibility);
		const visibilityCommands = [...hiddenVisibilityCommands, ...visibleVisibilityCommands];

		const removedHosts: LogicalRecord[] = [];
		for (const removed of removedRoots) collectRemovedPostOrder(removed, removedHosts);
		let nextListener = this.nextListener;
		const eventCommands: UniversalHostCommand[] = [];
		const stagedEvents = new Map<LogicalRecord, Map<string, CommittedEvent>>();
		const stagedVisibleEventRecords = new Set<LogicalRecord>();
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
		const stageHostCallbacks = (
			op: 'lifecycle' | 'local-callback',
			readBlueprint: (host: BlueprintHost) => Map<string, BlueprintHostCallback>,
			readCommitted: (record: LogicalRecord) => Map<string, CommittedHostCallback>,
		) => {
			const commands: UniversalHostCommand[] = [];
			const staged = new Map<LogicalRecord, Map<string, CommittedHostCallback>>();
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

		const draftOwnersParentFirst: DraftOwner[] = [];
		const draftOwnersPostOrder: DraftOwner[] = [];
		const walkDraftOwners = (owner: DraftOwner) => {
			draftOwnersParentFirst.push(owner);
			for (const child of owner.children) walkDraftOwners(child);
			draftOwnersPostOrder.push(owner);
		};
		walkDraftOwners(attempt.owner);
		const changedContexts = new Set<Context<any>>();
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

		const applyLogicalTopology = () => {
			const apply = (draft: DraftRecord, parent: LogicalRecord | null) => {
				const record = draft.record;
				record.parent = parent;
				record.key = draft.blueprint.key;
				if (record.kind === 'host') {
					const host = draft.blueprint as BlueprintHost;
					record.type = host.type;
					record.props = host.props;
					record.ref = host.ref;
					record.owner = host.owner;
					record.events = stagedEvents.get(record) ?? new Map();
					record.lifecycles = lifecycleStage.staged.get(record) ?? new Map();
					record.localCallbacks = localCallbackStage.staged.get(record) ?? new Map();
					record.visibility = host.visibility;
				}
				record.children = draft.children.map((child) => child.record);
				for (const child of draft.children) apply(child, record);
			};
			apply(draftRoot, null);
		};
		const lifecycleOrder: DraftRecord[] = [];
		walkDraftPostOrder(draftRoot, (draft) => {
			if (lifecycleDrafts.has(draft)) lifecycleOrder.push(draft);
		});
		const prepareHost = (value: UniversalHostBatch) =>
			this.driver.prepareBatch(this.container, value, {
				invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
			});
		const preparedHost =
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

		const transaction = new UniversalTransactionImpl(
			this,
			batch,
			() => preparedHost.apply(),
			() => {
				applyLogicalTopology();
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
				const localCallbacks = new Map<number, CommittedHostCallback>();
				for (const callbacks of localCallbackStage.staged.values()) {
					for (const callback of callbacks.values()) {
						localCallbacks.set(callback.listener, callback);
					}
				}
				this.localCallbacks = localCallbacks;
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
			},
			() => preparedHost.afterAccept?.(),
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
				for (const draft of refAttaches) {
					const record = draft.record;
					tasks.push(() =>
						runOwnedCommit(record.owner, () =>
							attachRef(record, this.driver.getPublicInstance(this.container, record.id)),
						),
					);
				}
				for (const { owner, next, changed } of effectChanges) {
					if (changed && next.phase === 'layout' && owner.visibility === 'visible') {
						tasks.push(() => runOwnedEffectCreate(next));
					}
				}
				runCommitTasks(tasks);
			},
			() => {
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
			},
			() => preparedHost.abort(),
			() => this.discardDraftOwners(draftOwnersParentFirst),
		);
		return transaction;
	}

	finish(transaction: UniversalTransactionImpl<Container, PublicInstance>): void {
		if (this.pending === transaction) this.pending = null;
	}

	unmount(): void {
		if (this.unmounted) return;
		let pendingAbortError: unknown = NO_PENDING_PASSIVE_ERROR;
		try {
			this.pending?.abort();
		} catch (error) {
			pendingAbortError = error;
		}
		this.suspended?.abort();
		this.cancelSuspendedReplays();
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
		const removedHosts: LogicalRecord[] = [];
		for (const child of this.rootRecord.children) collectRemovedPostOrder(child, removedHosts);
		let acceptedHostError: unknown = NO_PENDING_PASSIVE_ERROR;
		if (removedHosts.length > 0) {
			const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, [
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
				...physical.map((record) => ({ op: 'remove' as const, parent: null, id: record.id })),
				...removedHosts.map((record) => ({ op: 'destroy' as const, id: record.id })),
			]);
			const prepare = (value: UniversalHostBatch) =>
				this.driver.prepareBatch(this.container, value, {
					invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args),
				});
			const prepared =
				this.transport === null
					? prepare(batch)
					: this.transport.prepareBatch(this.container, batch, prepare);
			try {
				runCommitTasks([() => prepared.apply(), () => prepared.afterAccept?.()]);
			} catch (error) {
				acceptedHostError = error;
			}
		}
		this.rootRecord.children = [];
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
		this.unmounted = true;
		this.lastComponent = null;
		// Pending transaction callbacks observe `unmounted` and run only their
		// already-mounted deletion cleanups. This keeps Effect Events live for those
		// cleanups without mounting passive bodies from the now-deleted tree.
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
		if (acceptedHostError !== NO_PENDING_PASSIVE_ERROR) {
			syncTasks.unshift(() => {
				throw acceptedHostError;
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
	}
}

class UniversalTransactionImpl<Container, PublicInstance> implements UniversalTransaction {
	private state: 'prepared' | 'committed' | 'aborted' = 'prepared';
	private hostAccepted = false;
	private passiveScheduled = false;
	private passiveRan = false;

	constructor(
		private readonly root: UniversalRootImpl<Container, PublicInstance>,
		readonly batch: UniversalHostBatch,
		private readonly applyHost: () => void,
		private readonly publishHost: () => void,
		private readonly afterHostAccept: () => void,
		private readonly afterMutation: () => void,
		private readonly lifecycle: () => void,
		private readonly layout: () => void,
		private readonly passive: () => void,
		private readonly abortHost: () => void,
		private readonly onAbort: () => void,
	) {}

	get status(): 'prepared' | 'committed' | 'aborted' {
		return this.state;
	}

	commitMutation(): void {
		if (this.state !== 'prepared' || this.hostAccepted) return;
		this.hostAccepted = true;
		runCommitTasks([
			this.applyHost,
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

	private schedulePassive(): void {
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		this.root.enqueuePassive(() => {
			if (this.passiveRan) return;
			this.passiveRan = true;
			this.passive();
		});
	}

	abort(): void {
		if (this.state !== 'prepared') return;
		if (this.hostAccepted) {
			throw new Error('A universal transaction cannot be aborted after its host batch committed.');
		}
		this.state = 'aborted';
		try {
			runCommitTasks([this.abortHost, this.onAbort]);
		} finally {
			this.root.finish(this);
		}
	}
}

export function createUniversalRoot<Container, PublicInstance>(
	container: Container,
	driver: UniversalHostDriver<Container, PublicInstance>,
	options: UniversalRootOptions<Container> = {},
): UniversalRoot {
	return new UniversalRootImpl(container, driver, options.transport ?? null);
}

interface HostBoundaryProps {
	root: UniversalRoot;
	component?: UniversalComponent<any>;
	props?: any;
	/** Compiler-owned `children` form used by statically declared boundaries. */
	children?: RendererRegion;
}

interface HostBoundaryState {
	root: UniversalRootImpl<any, any>;
	owner: BoundaryOwner;
	/** The DOM owner reached layout commit; this does not imply that a host batch ran. */
	ownerCommitted: boolean;
	/** The DOM owner installed its deletion lifetime, including while Suspense-hidden. */
	lifetimeCommitted: boolean;
	pending: UniversalPreparedAttempt | null;
}

const boundaryStates = new WeakMap<Scope, HostBoundaryState>();
const BOUNDARY_INVALIDATE_SLOT = Symbol('octane.universal.boundary.invalidate');
const BOUNDARY_COMMIT_SLOT = Symbol('octane.universal.boundary.commit');
const BOUNDARY_LIFETIME_SLOT = Symbol('octane.universal.boundary.lifetime');

export function createUniversalHostBoundary(renderer: string): ((
	props: HostBoundaryProps,
	scope: Scope,
) => void) & {
	readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
} {
	assertRendererId(renderer, 'Host boundary renderer');
	const boundary = ((props: HostBoundaryProps, scope: Scope) => {
		if (props.root.renderer !== renderer) {
			throw new Error(
				`Universal boundary ${JSON.stringify(renderer)} received root ${JSON.stringify(props.root.renderer)}.`,
			);
		}
		let component = props.component;
		let componentProps = props.props;
		if (props.children !== undefined) {
			const region = props.children;
			if (!isRendererRegion(region)) {
				throw new TypeError(
					`Universal boundary ${JSON.stringify(renderer)} expected compiler-owned renderer-region children.`,
				);
			}
			if (region.ownerRenderer !== 'dom' || region.childRenderer !== renderer) {
				throw new Error(
					`Universal boundary ${JSON.stringify(renderer)} cannot mount region ${JSON.stringify(region.ownerRenderer)} -> ${JSON.stringify(region.childRenderer)}.`,
				);
			}
			if (component !== undefined) {
				throw new Error(
					'A universal boundary cannot receive both component and renderer-region children.',
				);
			}
			component = region.component as UniversalComponent<any>;
			componentProps = region.props;
		}
		if (component === undefined) {
			throw new Error(
				`Universal boundary ${JSON.stringify(renderer)} requires a component or renderer-owned children.`,
			);
		}
		let state = boundaryStates.get(scope);
		const [, invalidate] = useDomState(0, BOUNDARY_INVALIDATE_SLOT);
		if (state === undefined) {
			const owner: BoundaryOwner = {
				readContext: (context) => readContextFromScope(scope, context),
				invalidate: () => invalidate((value) => value + 1),
			};
			state = {
				root: props.root as UniversalRootImpl<any, any>,
				owner,
				ownerCommitted: false,
				lifetimeCommitted: false,
				pending: null,
			};
			boundaryStates.set(scope, state);
			state.root.setBridge(owner);
		} else if (state.root !== props.root) {
			throw new Error('Changing the root owned by a mounted universal boundary is not supported.');
		}
		let attempt: UniversalPreparedAttempt;
		try {
			attempt = state.root.prepare(component, componentProps);
		} catch (error) {
			if (!state.ownerCommitted) {
				boundaryStates.delete(scope);
				state.root.clearBridge(state.owner);
			}
			throw error;
		}
		state.pending = attempt;
		useDomLayoutEffect(
			() => {
				if (state!.pending !== attempt) return;
				try {
					if (attempt.status === 'prepared') attempt.commit();
					// Suspension commits the DOM owner's lifetime without accepting a
					// universal host batch. Retain its bridge so settlement can retry with
					// the same context and error owner.
					state!.ownerCommitted = true;
					state!.pending = null;
				} catch (error) {
					boundaryStates.delete(scope);
					state!.pending = null;
					try {
						state!.root.unmount();
					} finally {
						state!.root.clearBridge(state!.owner);
					}
					throw error;
				}
			},
			[attempt],
			BOUNDARY_COMMIT_SLOT,
		);
		// Host-root ownership must survive DOM Suspense/Activity deactivation.
		// Insertion effects stay connected while retained content is hidden and
		// still clean up on actual deletion, which is exactly this lifetime.
		useDomInsertionEffect(
			() => {
				// A boundary that completed its own render owns a deletion lifetime
				// even if a later sibling suspends before layout. A boundary that
				// itself suspended is still abandoned and released by the microtask.
				if (attempt.status === 'prepared') state!.lifetimeCommitted = true;
				return () => {
					// Resolve through the map defensively so a failed render can never
					// leave a newer owner bridge captured by this effect's first closure.
					const ownedState = boundaryStates.get(scope) ?? state!;
					boundaryStates.delete(scope);
					ownedState.lifetimeCommitted = false;
					const pending = ownedState.pending;
					ownedState.pending = null;
					runCommitTasks([
						() => pending?.abort(),
						() => ownedState.root.unmount(),
						() => ownedState.root.clearBridge(ownedState.owner),
					]);
				};
			},
			[],
			BOUNDARY_LIFETIME_SLOT,
		);
		queueMicrotask(() => {
			if (state!.pending !== attempt) return;
			state!.pending = null;
			runCommitTasks([
				() => attempt.abort(),
				() => {
					// Insertion ownership commits even when a later sibling suspends
					// before layout. Preserve that stable bridge for retry and let its
					// deletion cleanup release it. Only a render with no lifetime is
					// truly abandoned here.
					if (!state!.ownerCommitted && !state!.lifetimeCommitted) {
						if (boundaryStates.get(scope) === state) boundaryStates.delete(scope);
						state!.root.clearBridge(state!.owner);
					}
				},
			]);
		});
		// A root-level suspension has no universal @pending arm of its own. Project
		// it through the DOM owner so the nearest authored DOM @pending boundary can
		// hide the Canvas shell and render its fallback. The queued abort above
		// releases an abandoned initial attempt; a committed boundary keeps its
		// bridge and retries from the DOM boundary when the thenable settles.
		if (attempt.status === 'suspended') useDomRendererThenable(attempt.thenable);
	}) as ((props: HostBoundaryProps, scope: Scope) => void) & {
		readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
	};
	Object.defineProperty(boundary, UNIVERSAL_BOUNDARY, {
		value: Object.freeze({
			id: `dom->${renderer}`,
			ownerRenderer: 'dom',
			childRenderer: renderer,
			childrenProp: 'children',
		}),
	});
	return boundary;
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

export const createContext = createDomContext;
