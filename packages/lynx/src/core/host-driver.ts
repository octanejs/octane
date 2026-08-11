import type {
	UniversalEventListenerDescriptor,
	UniversalHostBatch,
	UniversalHostCommitContext,
	UniversalHostDriver,
	UniversalHostTemplateProgram,
	UniversalHostTemplateProgramBinding,
	UniversalHostTemplateProgramValue,
	UniversalPreparedHostBatch,
	UniversalPortalTargetHandle,
	UniversalSerializableValue,
} from 'octane/universal/native';
import {
	decodeLynxNativeEventToken,
	encodeLynxNativeEventToken,
	encodePrevalidatedLynxNativeEventToken,
	parseLynxMainThreadEventProp,
	parseLynxNativeEventProp,
	type LynxMainThreadEventBinding,
	type LynxNativeEventBinding,
	type LynxNativeEventToken,
} from './native-events.js';
import { hasCrossRealmPlainPrototype } from './plain-object.js';
import {
	createLynxFirstTree,
	LYNX_FIRST_TREE_STATE,
	LynxFirstTreeMismatchError,
	type CaptureLynxFirstTreeOptions,
	type LynxFirstTree,
	type LynxFirstTreeEventSnapshot,
	type LynxFirstTreeNodeSnapshot,
	type LynxFirstTreeSnapshot,
	type LynxResolvedFirstTreeEvent,
} from './first-screen.js';
import {
	LYNX_CSS_SCOPE_PROP,
	planLynxHostPropPatch,
	type LynxHostPropPatch,
	type LynxMainThreadRefDescriptor,
	type LynxMainThreadWorkletDescriptor,
} from './host-props.js';
import {
	createLynxListItemDescriptor,
	lynxListReuseKey,
	planLynxListUpdate,
	type LynxListItemDescriptor,
	type LynxListUpdateInfo,
} from './list.js';
import { createLynxNodesRefSelector } from './nodes-ref.js';
import type {
	LynxElementEventListener,
	LynxElementPAPI,
	LynxElementRef,
	LynxListComponentAtIndex,
	LynxListComponentAtIndexes,
	LynxListEnqueueComponent,
} from './papi.js';
import {
	getThreadFunctionDescriptor,
	type LynxActivatedMainThreadWorklet,
	type LynxMainThreadWorkletRegistry,
} from './worklets.js';
import {
	decodeLynxPortalTargetId,
	isLynxPortalTargetHandle,
	lynxPortalTargetKey,
} from './portal.js';
import { LYNX_RENDERER_ID } from './renderer-id.js';

const LYNX_HOST_STATE: unique symbol = Symbol('octane.lynx.host-state');

interface LynxPortalParent {
	readonly kind: 'portal';
	readonly key: string;
	readonly universalRoot: number;
	readonly target: number;
	readonly generation: number;
}

type LynxAttachedHostParent = number | null | LynxPortalParent;
type LynxHostParent = LynxAttachedHostParent | undefined;

interface LynxPortalChildren {
	readonly parent: LynxPortalParent;
	children: number[];
}

export interface LynxHostHandle {
	readonly $$kind: 'octane.lynx.element';
	readonly renderer: typeof LYNX_RENDERER_ID;
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly selector: string;
}

export type LynxHostHandleDelta =
	| {
			readonly op: 'create' | 'recreate';
			readonly handle: LynxHostHandle;
	  }
	| {
			readonly op: 'destroy';
			readonly renderer: typeof LYNX_RENDERER_ID;
			readonly root: number;
			readonly id: number;
			readonly generation: number;
	  };

/** Physical attachment transition emitted by native list enter/leave callbacks. */
export interface LynxHostAttachmentDelta {
	readonly id: number;
	readonly generation: number;
	readonly attached: boolean;
}

interface LynxHostRecord<Node extends LynxElementRef> {
	node: Node | null;
	type: string;
	props: Readonly<Record<string, unknown>>;
	visible: boolean;
	parent: LynxHostParent;
	children: number[];
	events: Map<string, UniversalEventListenerDescriptor>;
	handle: LynxHostHandle;
	selectorInstalled: boolean;
}

interface LynxHostRecordStore<Node extends LynxElementRef> extends Iterable<
	[number, LynxHostRecord<Node>]
> {
	readonly size: number;
	get(id: number): LynxHostRecord<Node> | undefined;
	has(id: number): boolean;
	set(id: number, record: LynxHostRecord<Node>): unknown;
	delete(id: number): boolean;
	clear(): void;
	keys(): IterableIterator<number>;
}

interface LynxPhysicalTree<Node extends LynxElementRef> {
	node: Node;
	type: string;
	props: Readonly<Record<string, unknown>>;
	visible: boolean;
	logicalId: number;
	children: LynxPhysicalTree<Node>[];
}

interface LynxPhysicalListCell<Node extends LynxElementRef> {
	sign: number;
	tree: LynxPhysicalTree<Node>;
	item: LynxListItemDescriptor;
	logicalItemId: number | null;
	/** The logical item moved before native delivered the old sign's enqueue callback. */
	awaitingEnqueue: boolean;
}

interface LynxListMaterialization<Node extends LynxElementRef> {
	readonly sign: number;
	readonly tree: LynxPhysicalTree<Node>;
	readonly item: LynxListItemDescriptor;
	/** True only when a physical cell crosses logical item ownership. */
	readonly reuseNotification: boolean;
	readonly detachments: LynxHostAttachmentDelta[];
	readonly attachments: LynxHostAttachmentDelta[];
}

interface LynxNativeListState<Node extends LynxElementRef> {
	readonly hostId: number;
	readonly node: Node;
	readonly componentAtIndex: LynxListComponentAtIndex<Node>;
	readonly componentAtIndexes: LynxListComponentAtIndexes<Node>;
	readonly enqueueComponent: LynxListEnqueueComponent<Node>;
	items: readonly LynxListItemDescriptor[];
	readonly cellsBySign: Map<number, LynxPhysicalListCell<Node>>;
	readonly attachedByItem: Map<number, LynxPhysicalListCell<Node>>;
	readonly retainedByItem: Map<number, LynxPhysicalListCell<Node>>;
	readonly recyclePools: Map<string, LynxPhysicalListCell<Node>[]>;
	createdCells: number;
	reusedCells: number;
	enterCount: number;
	leaveCount: number;
	disposed: boolean;
}

interface LynxHostState<Node extends LynxElementRef> {
	readonly papi: LynxElementPAPI<Node>;
	readonly worklets?: LynxMainThreadWorkletRegistry;
	records: LynxHostRecordStore<Node>;
	rootChildren: number[];
	generations: Map<number, number>;
	/** Compact first mounts derive live generation-one entries from their records. */
	implicitInitialGenerations: boolean;
	/** Ordinary pure template runs may retain compact metadata solely for certified teardown. */
	teardownRecords: LynxDenseHostRecordStore<Node> | null;
	/** Universal root provenance is fixed by the first accepted portal handle. */
	portalRoot: number | null;
	/** Portal children stay separate from ordinary authored host children. */
	portalChildren: Map<string, LynxPortalChildren>;
	readonly ownedNodes: Set<Node>;
	readonly ownedPageRoots: Set<Node>;
	/** Physical listener journal retained until native removal succeeds. */
	readonly nativeEvents: Map<Node, Map<string, LynxNativeEventRegistration>>;
	/** Main-thread refs retained until their native node is cleared successfully. */
	readonly mainThreadRefs: Map<Node, LynxMainThreadRefDescriptor>;
	readonly mainThreadRefOwners: Map<string, Node>;
	readonly lists: Map<number, LynxNativeListState<Node>>;
	readonly onAttachments?: (version: number, deltas: readonly LynxHostAttachmentDelta[]) => void;
	readonly onCallbackFault?: (version: number, error: unknown) => void;
	/** Monotonic: ordinary trees never need direct-worklet connectivity walks. */
	hasMainThreadProps: boolean;
	/** Monotonic: ordinary trees never need native-list ancestry bookkeeping. */
	hasNativeListTopology: boolean;
	acceptedVersion: number;
	disposed: boolean;
	disposing: boolean;
	faulted: boolean;
	applying: boolean;
	cleanupNeedsFlush: boolean;
	firstTree: LynxFirstTree<Node> | null;
}

type LynxNativeEventRegistration =
	| {
			readonly source: 'background';
			readonly binding: LynxNativeEventBinding;
			readonly listener: LynxNativeEventToken;
	  }
	| {
			readonly source: 'main-thread';
			readonly binding: LynxMainThreadEventBinding;
			readonly listener: Exclude<LynxElementEventListener, string | undefined>;
			readonly descriptor: LynxMainThreadWorkletDescriptor;
	  };

export interface LynxHostContainer<Node extends LynxElementRef = LynxElementRef> {
	readonly renderer: typeof LYNX_RENDERER_ID;
	readonly root: number;
	readonly page: Node;
	readonly pageComponentUniqueId: number;
	readonly acceptedVersion: number;
	readonly instanceCount: number;
	readonly disposed: boolean;
	readonly [LYNX_HOST_STATE]: LynxHostState<Node>;
}

export interface CreateLynxHostContainerOptions<Node extends LynxElementRef = LynxElementRef> {
	readonly root: number;
	readonly componentId?: string;
	readonly cssId?: number;
	readonly page?: Node;
	/** Main-local execution and ref lifetime registry shared across first-screen adoption. */
	readonly worklets?: LynxMainThreadWorkletRegistry;
	/** Main-thread bridge for callback-driven list ref/query attachment state. */
	readonly onAttachments?: (version: number, deltas: readonly LynxHostAttachmentDelta[]) => void;
	/** Accepted-root fault bridge for native callbacks that run after a commit settles. */
	readonly onCallbackFault?: (version: number, error: unknown) => void;
}

export interface LynxPreparedHostBatch extends UniversalPreparedHostBatch {
	/** True once the accepted physical application boundary has been crossed. */
	readonly mutationStarted: boolean;
	/** Clone-safe public-handle changes that must be published before acknowledgement. */
	readonly handleDelta: readonly LynxHostHandleDelta[];
	/** Fresh, attached host count when the caller negotiated a compact first ACK. */
	readonly compactHostCount?: number;
	/** Retained handles whose native-list ancestry changed without changing identity. */
	readonly listAncestryDelta: readonly LynxHostListAncestryDelta[];
	/** First-screen path selected during clone-safe preparation. */
	readonly firstTreeAction: 'none' | 'adopt' | 'repair';
}

export interface LynxHostListAncestryDelta {
	readonly id: number;
	readonly generation: number;
	readonly listDescendant: boolean;
}

export interface PrepareLynxHostBatchOptions<Node extends LynxElementRef> {
	readonly firstTree?: LynxFirstTree<Node>;
	readonly onMismatch?: (error: LynxFirstTreeMismatchError) => void;
	/** Trusted transport may defer per-host legacy ACK deltas for a fresh root. */
	readonly compact?: boolean;
	/** Trusted adopted roots may append one compact generation-one host segment. */
	readonly incrementalCompact?: boolean;
	/** Negotiated safe program mounts install private ref selectors on demand. */
	readonly lazyPublicInstances?: boolean;
}

export interface LynxHostDriver<
	Node extends LynxElementRef = LynxElementRef,
> extends UniversalHostDriver<LynxHostContainer<Node>, LynxHostHandle> {
	readonly id: typeof LYNX_RENDERER_ID;
	prepareBatch(
		container: LynxHostContainer<Node>,
		batch: UniversalHostBatch,
		context: UniversalHostCommitContext,
	): LynxPreparedHostBatch;
}

export interface LynxHostCleanupResult {
	/** True only when every owned page root is detached and the cleanup flush succeeds. */
	readonly complete: boolean;
	readonly removedRoots: number;
	/** Roots whose parentage could not yet be cleared or proven detached. */
	readonly remainingRoots: number;
	readonly flushed: boolean;
	readonly errors: readonly Error[];
}

interface LynxPreparedListUpdate {
	readonly hostId: number;
	readonly previous: readonly LynxListItemDescriptor[];
	readonly next: readonly LynxListItemDescriptor[];
	readonly update: LynxListUpdateInfo;
}

type LynxApplyOperation<Node extends LynxElementRef> =
	| {
			readonly op: 'mount-template';
			readonly id: number;
			readonly parent: LynxAttachedHostParent;
			readonly before: number | null;
			readonly records: readonly LynxHostRecord<Node>[];
			readonly patches: readonly LynxHostPropPatch[];
			readonly parents: readonly number[];
			readonly count?: number;
			readonly dense?: LynxDenseHostRecordStore<Node>;
			readonly teardownDense?: LynxDenseHostRecordStore<Node>;
			/** Present only when a compact range owns contiguous lazy host identities. */
			readonly firstId?: number;
			readonly program?: LynxPreparedTemplateProgram;
			readonly firstListenerId?: number | null;
			readonly lazyPublicInstances?: true;
	  }
	| {
			readonly op: 'create';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
			readonly patch: LynxHostPropPatch;
			readonly handle: LynxHostHandle;
			readonly record: LynxHostRecord<Node>;
			readonly visible: boolean;
	  }
	| {
			readonly op: 'update';
			readonly id: number;
			readonly type: string;
			readonly previous: Readonly<Record<string, unknown>>;
			readonly next: Readonly<Record<string, unknown>>;
			readonly patch: LynxHostPropPatch;
			readonly visible: boolean;
	  }
	| {
			readonly op: 'recreate';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
			readonly parent: LynxHostParent;
			readonly children: readonly number[];
			readonly portalChildren: readonly number[];
			readonly visible: boolean;
			readonly events: ReadonlyMap<string, UniversalEventListenerDescriptor>;
			readonly generation: number;
			readonly patch: LynxHostPropPatch;
			readonly handle: LynxHostHandle;
			readonly record: LynxHostRecord<Node>;
	  }
	| {
			readonly op: 'insert' | 'move';
			readonly id: number;
			readonly parent: LynxAttachedHostParent;
			readonly before: number | null;
			readonly previousParent: LynxHostParent;
			readonly wasConnected: boolean;
			readonly willBeConnected: boolean;
	  }
	| {
			readonly op: 'remove';
			readonly id: number;
			readonly parent: LynxAttachedHostParent;
	  }
	| {
			readonly op: 'visibility';
			readonly id: number;
			readonly state: 'hidden' | 'visible';
			readonly authoredHidden: unknown;
			readonly events: ReadonlyMap<string, UniversalEventListenerDescriptor>;
			readonly generation: number;
	  }
	| {
			readonly op: 'destroy';
			readonly id: number;
			readonly events: ReadonlyMap<string, UniversalEventListenerDescriptor>;
	  }
	| {
			readonly op: 'ensure-public-instance';
			readonly id: number;
	  }
	| {
			readonly op: 'event';
			readonly id: number;
			readonly type: string;
			readonly previous: UniversalEventListenerDescriptor | null;
			readonly next: UniversalEventListenerDescriptor | null;
			readonly generation: number;
			readonly visible: boolean;
	  };

function hostError(message: string): Error {
	return new Error(`Octane Lynx host: ${message}`);
}

function assertSafeId(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw hostError(`${label} must be a positive safe integer.`);
	}
}

function assertHostType(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw hostError(`${label} must be a non-empty string.`);
	}
}

function cloneHostValue(value: unknown, clones: WeakMap<object, object>): unknown {
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
		throw hostError(`host props contain unsupported value ${String(value)}.`);
	}
	const existing = clones.get(value);
	if (existing !== undefined) {
		if (!Object.isFrozen(existing)) throw hostError('host props cannot contain cycles.');
		return existing;
	}
	let clone: unknown[] | Record<string, unknown>;
	if (Array.isArray(value)) {
		clone = [];
	} else {
		// Host props arrive from the background thread, a distinct realm in
		// production, so their prototype is that realm's Object.prototype.
		if (!hasCrossRealmPlainPrototype(value)) {
			throw hostError(
				`host props require plain objects, received ${Object.prototype.toString.call(value)}.`,
			);
		}
		clone = Object.create(null) as Record<string, unknown>;
	}
	clones.set(value, clone);
	if (Array.isArray(value)) {
		const output = clone as unknown[];
		output.length = value.length;
		for (let index = 0; index < value.length; index++) {
			if (!(index in value)) continue;
			output[index] = cloneHostValue(value[index], clones);
		}
	} else {
		const output = clone as Record<string, unknown>;
		for (const name of Object.keys(value)) {
			// Null-prototype objects have no __proto__ setter, so assignment keeps
			// that field as ordinary data without a per-property descriptor object.
			output[name] = cloneHostValue((value as Record<string, unknown>)[name], clones);
		}
	}
	return Object.freeze(clone);
}

const EMPTY_HOST_PROPS: Readonly<Record<string, unknown>> = Object.freeze(Object.create(null));
// Most physical hosts are leaves. This private sentinel is replaced before any
// topology write, avoiding a separate empty array for every template host.
const EMPTY_HOST_CHILDREN: number[] = [];
// Most hosts never own a background event. Keep the shared map private and
// replace it before the first write so ordinary hosts allocate no event table.
const EMPTY_HOST_EVENTS = new Map<string, UniversalEventListenerDescriptor>();
// Raw text is initialized by __CreateRawText itself. Its synthetic `value`
// attribute is never forwarded, so an unscoped creation needs no prop diff.
const EMPTY_RAW_TEXT_CREATE_PATCH: LynxHostPropPatch = Object.freeze({
	attributes: Object.freeze([]),
	mainThreadEvents: Object.freeze([]),
	requiresRecreate: false,
});

/**
 * A compact ACK reconstructs host identities on the background thread, so the
 * main thread need not allocate 90,000 frozen public snapshots up front. Keep
 * the full own-data-property snapshot lazy while hot range loops use primitives.
 */
class LynxCompactHostRecord<Node extends LynxElementRef> implements LynxHostRecord<Node> {
	node: Node | null = null;
	visible = true;
	children = EMPTY_HOST_CHILDREN;
	selectorInstalled = false;
	private eventTable = EMPTY_HOST_EVENTS;
	private cachedHandle: LynxHostHandle | null = null;

	constructor(
		private readonly root: number,
		readonly id: number,
		readonly generation: number,
		public type: string,
		public props: Readonly<Record<string, unknown>>,
		public parent: LynxHostParent,
	) {}

	get handle(): LynxHostHandle {
		return (this.cachedHandle ??= createHandle(this.root, this.id, this.type, this.generation));
	}

	set handle(handle: LynxHostHandle) {
		this.cachedHandle = handle;
	}

	get events(): Map<string, UniversalEventListenerDescriptor> {
		return this.eventTable;
	}

	set events(events: Map<string, UniversalEventListenerDescriptor>) {
		this.eventTable = events;
	}
}

interface LynxPreparedStaticHostProps {
	readonly props: Readonly<Record<string, unknown>>;
	readonly patch: LynxHostPropPatch;
}

// A compiler-hoisted scalar class bag is immutable and shared by every row.
// Host type remains part of the key because prop channels differ by element.
const PREPARED_STATIC_HOST_PROPS = new WeakMap<object, Map<string, LynxPreparedStaticHostProps>>();

interface LynxPreparedTemplateShape {
	readonly types: readonly string[];
	readonly parents: readonly number[];
}

interface LynxPreparedTemplateProgramEvent {
	readonly node: number;
	readonly index: number;
	readonly type: string;
	readonly priority: UniversalEventListenerDescriptor['priority'];
	readonly binding: LynxNativeEventBinding;
}

/** Logical event maps are needed only when a compact host is later observed. */
class LynxCompactEventHostRecord<Node extends LynxElementRef> extends LynxCompactHostRecord<Node> {
	constructor(
		root: number,
		id: number,
		generation: number,
		type: string,
		props: Readonly<Record<string, unknown>>,
		parent: LynxHostParent,
		private readonly sites: readonly LynxPreparedTemplateProgramEvent[],
		private readonly firstListenerId: number,
	) {
		super(root, id, generation, type, props, parent);
	}

	override get events(): Map<string, UniversalEventListenerDescriptor> {
		const current = super.events;
		if (current !== EMPTY_HOST_EVENTS) return current;
		const events = new Map<string, UniversalEventListenerDescriptor>();
		for (const site of this.sites) {
			events.set(
				site.type,
				Object.freeze({ id: this.firstListenerId + site.index, priority: site.priority }),
			);
		}
		super.events = events;
		return events;
	}

	override set events(events: Map<string, UniversalEventListenerDescriptor>) {
		super.events = events;
	}
}

interface LynxPreparedTemplateProgram {
	readonly shape: LynxPreparedTemplateShape;
	readonly props: readonly Readonly<Record<string, unknown>>[];
	readonly patches: readonly (LynxHostPropPatch | undefined)[];
	readonly bindings: readonly (readonly UniversalHostTemplateProgramBinding[] | undefined)[];
	/** Cached scalar-only creation routes: 0 generic, 1 raw text, 2 class/id. */
	readonly dynamicRoutes: readonly (0 | 1 | 2)[];
	readonly events: readonly (readonly LynxPreparedTemplateProgramEvent[] | undefined)[];
	readonly eventSites: readonly LynxPreparedTemplateProgramEvent[];
	readonly eventCount: number;
	readonly valueCount: number;
}

interface LynxDenseTeardownPlan<Node extends LynxElementRef> {
	readonly store: LynxDenseHostRecordStore<Node>;
	readonly records: Map<number, LynxHostRecord<Node>>;
	readonly rootChildren: number[];
	readonly acceptedChildren: readonly number[];
	readonly parent: number | null;
	readonly eventCommands: number;
	readonly firstId: number;
	readonly hostCount: number;
}

/**
 * A compact run already describes every host by a frozen program and identity
 * stride. Keep only physical nodes eagerly; materialize logical records,
 * topology, props, events, and public snapshots when one host is observed.
 */
class LynxDenseHostRecordStore<Node extends LynxElementRef> implements LynxHostRecordStore<Node> {
	readonly nodes: (Node | undefined)[];
	private readonly materialized = new Map<number, LynxHostRecord<Node>>();
	private readonly appended = new Map<number, LynxHostRecord<Node>>();
	private removed: Set<number> | null = null;
	private live: number;
	private cleared = false;

	constructor(
		private readonly prefix: Map<number, LynxHostRecord<Node>>,
		private readonly root: number,
		readonly program: LynxPreparedTemplateProgram,
		readonly firstId: number,
		readonly count: number,
		readonly parent: LynxAttachedHostParent,
		readonly values: readonly UniversalHostTemplateProgramValue[],
		readonly firstListenerId: number | null,
		readonly hostGenerations: readonly number[] | null = null,
	) {
		this.live = count * program.shape.types.length;
		this.nodes = new Array(this.live);
	}

	generationAt(offset: number): number {
		return this.hostGenerations?.[offset] ?? 1;
	}

	get size(): number {
		return this.prefix.size + this.live + this.appended.size;
	}

	setNode(offset: number, node: Node): void {
		this.nodes[offset] = node;
		if (this.materialized.size !== 0) {
			const record = this.materialized.get(offset);
			if (record !== undefined) record.node = node;
		}
	}

	private isRunRoot(id: number): boolean {
		const offset = id - this.firstId;
		return (
			Number.isSafeInteger(offset) &&
			offset >= 0 &&
			offset < this.nodes.length &&
			offset % this.program.shape.types.length === 0
		);
	}

	prepareFullTeardown(
		state: LynxHostState<Node>,
		batch: UniversalHostBatch,
	): LynxDenseTeardownPlan<Node> | null {
		const lastCommand = batch.commands[batch.commands.length - 1];
		if (batch.commands.length < this.nodes.length + this.count || lastCommand?.op !== 'destroy') {
			return null;
		}
		if (
			this.cleared ||
			this.appended.size !== 0 ||
			this.removed?.size ||
			this.live !== this.nodes.length ||
			this.nodes.length === 0 ||
			state.hasMainThreadProps ||
			state.hasNativeListTopology ||
			state.portalRoot !== null ||
			state.portalChildren.size !== 0 ||
			state.mainThreadRefs.size !== 0 ||
			state.mainThreadRefOwners.size !== 0 ||
			state.lists.size !== 0 ||
			!state.implicitInitialGenerations
		) {
			return null;
		}
		const parent = this.parent;
		if (isPortalParent(parent)) return null;
		const width = this.program.shape.types.length;
		if (this.nodes.length !== this.count * width) return null;
		for (const [id, generation] of state.generations) {
			if (
				id >= this.firstId &&
				id < this.firstId + this.nodes.length &&
				generation !== this.generationAt(id - this.firstId)
			) {
				return null;
			}
		}

		const parentRecord = typeof parent === 'number' ? this.prefix.get(parent) : undefined;
		if (typeof parent === 'number' && parentRecord === undefined) return null;
		const acceptedChildren = parent === null ? state.rootChildren : parentRecord!.children;
		const survivingChildren: number[] = [];
		let roots = 0;
		for (const id of acceptedChildren) {
			if (this.isRunRoot(id)) roots++;
			else survivingChildren.push(id);
		}
		if (roots !== this.count) return null;

		const postorder: number[] = [];
		const visit = (node: number): void => {
			for (let child = node + 1; child < width; child++) {
				if (this.program.shape.parents[child] === node) visit(child);
			}
			postorder.push(node);
		};
		visit(0);
		if (postorder.length !== width) return null;

		let commandIndex = 0;
		for (const rootId of acceptedChildren) {
			if (!this.isRunRoot(rootId)) continue;
			for (const node of postorder) {
				const events = this.program.events[node];
				if (events === undefined) continue;
				const physical = this.nodes[rootId - this.firstId + node];
				if (physical === undefined) return null;
				const registrations = state.nativeEvents.get(physical);
				if (registrations?.size !== events.length) return null;
				for (const event of events) {
					const command = batch.commands[commandIndex++];
					if (
						command?.op !== 'event' ||
						command.id !== rootId + node ||
						command.type !== event.type ||
						command.listener !== null ||
						!registrations.has(event.type)
					) {
						return null;
					}
				}
			}
		}
		const eventCommands = commandIndex;
		for (const rootId of acceptedChildren) {
			if (!this.isRunRoot(rootId)) continue;
			const command = batch.commands[commandIndex++];
			if (command?.op !== 'remove' || command.id !== rootId || command.parent !== parent) {
				return null;
			}
		}
		for (const rootId of acceptedChildren) {
			if (!this.isRunRoot(rootId)) continue;
			for (const node of postorder) {
				const command = batch.commands[commandIndex++];
				if (command?.op !== 'destroy' || command.id !== rootId + node) return null;
			}
		}
		if (commandIndex !== batch.commands.length) return null;

		if (state.ownedNodes.size !== this.prefix.size + this.nodes.length) return null;
		for (const record of this.prefix.values()) {
			if (record.node === null || !state.ownedNodes.has(record.node)) return null;
		}
		for (let offset = 0; offset < this.nodes.length; offset++) {
			const node = this.nodes[offset];
			if (node === undefined || !state.ownedNodes.has(node)) return null;
			const expectedEvents = this.program.events[offset % width];
			if ((state.nativeEvents.get(node)?.size ?? 0) !== (expectedEvents?.length ?? 0)) return null;
		}
		if (parent === null) {
			for (const rootId of acceptedChildren) {
				if (!this.isRunRoot(rootId)) continue;
				const node = this.nodes[rootId - this.firstId];
				if (node === undefined || !state.ownedPageRoots.has(node)) return null;
			}
		}

		const records = new Map(this.prefix);
		if (parentRecord !== undefined) {
			const nextParent = cloneRecord(parentRecord);
			nextParent.children =
				survivingChildren.length === 0 ? EMPTY_HOST_CHILDREN : survivingChildren;
			records.set(parent as number, nextParent);
		}
		return {
			store: this,
			records,
			rootChildren: parent === null ? survivingChildren : state.rootChildren,
			acceptedChildren,
			parent,
			eventCommands,
			firstId: this.firstId,
			hostCount: this.nodes.length,
		};
	}

	private offset(id: number): number {
		const offset = id - this.firstId;
		return !this.cleared &&
			Number.isSafeInteger(offset) &&
			offset >= 0 &&
			offset < this.nodes.length
			? offset
			: -1;
	}

	get(id: number): LynxHostRecord<Node> | undefined {
		const offset = this.offset(id);
		if (offset === -1) return this.prefix.get(id) ?? this.appended.get(id);
		if (this.removed?.has(offset)) return undefined;
		const previous = this.materialized.get(offset);
		if (previous !== undefined) return previous;
		const width = this.program.shape.types.length;
		const row = Math.floor(offset / width);
		const node = offset - row * width;
		const rowFirstId = this.firstId + row * width;
		const bindings = this.program.bindings[node];
		let props = this.program.props[node]!;
		if (bindings !== undefined) {
			const next = Object.create(null) as Record<string, unknown>;
			for (const name in props) next[name] = props[name];
			const valueOffset = row * this.program.valueCount;
			for (const binding of bindings)
				next[binding.name] = this.values[valueOffset + binding.valueIndex];
			props = Object.freeze(next);
		}
		const parent = node === 0 ? this.parent : rowFirstId + this.program.shape.parents[node]!;
		const events = this.program.events[node];
		const generation = this.generationAt(offset);
		const record: LynxHostRecord<Node> =
			events === undefined
				? new LynxCompactHostRecord(
						this.root,
						id,
						generation,
						this.program.shape.types[node]!,
						props,
						parent,
					)
				: new LynxCompactEventHostRecord(
						this.root,
						id,
						generation,
						this.program.shape.types[node]!,
						props,
						parent,
						events,
						this.firstListenerId! + row * this.program.eventCount,
					);
		record.node = this.nodes[offset] ?? null;
		for (let child = node + 1; child < width; child++) {
			if (this.program.shape.parents[child] === node) {
				hostChildrenForWrite(record).push(rowFirstId + child);
			}
		}
		this.materialized.set(offset, record);
		return record;
	}

	has(id: number): boolean {
		const offset = this.offset(id);
		return offset === -1
			? this.prefix.has(id) || this.appended.has(id)
			: !this.removed?.has(offset);
	}

	set(id: number, record: LynxHostRecord<Node>): this {
		const offset = this.offset(id);
		if (offset !== -1) {
			if (this.removed?.delete(offset)) this.live++;
			this.materialized.set(offset, record);
			this.nodes[offset] = record.node ?? undefined;
		} else if (this.prefix.has(id)) {
			this.prefix.set(id, record);
		} else {
			this.appended.set(id, record);
		}
		return this;
	}

	delete(id: number): boolean {
		const offset = this.offset(id);
		if (offset !== -1) {
			if (this.removed?.has(offset)) return false;
			(this.removed ??= new Set()).add(offset);
			this.materialized.delete(offset);
			this.nodes[offset] = undefined;
			this.live--;
			return true;
		}
		return this.prefix.delete(id) || this.appended.delete(id);
	}

	clear(): void {
		this.prefix.clear();
		this.appended.clear();
		this.materialized.clear();
		this.removed?.clear();
		this.nodes.length = 0;
		this.live = 0;
		this.cleared = true;
	}

	*keys(): IterableIterator<number> {
		yield* this.prefix.keys();
		if (!this.cleared) {
			for (let offset = 0; offset < this.nodes.length; offset++) {
				if (!this.removed?.has(offset)) yield this.firstId + offset;
			}
		}
		yield* this.appended.keys();
	}

	*[Symbol.iterator](): IterableIterator<[number, LynxHostRecord<Node>]> {
		yield* this.prefix;
		if (!this.cleared) {
			for (let offset = 0; offset < this.nodes.length; offset++) {
				if (this.removed?.has(offset)) continue;
				const id = this.firstId + offset;
				yield [id, this.get(id)!];
			}
		}
		yield* this.appended;
	}
}

// Compiler-hoisted immutable shapes repeat once per row. Weak ownership keeps
// validation and topology arrays alive only as long as their authored plan.
const PREPARED_TEMPLATE_SHAPES = new WeakMap<object, LynxPreparedTemplateShape>();
const PREPARED_TEMPLATE_PROGRAMS = new WeakMap<object, LynxPreparedTemplateProgram>();

function prepareTemplateShape(value: unknown, label: string): LynxPreparedTemplateShape {
	if (!Array.isArray(value) || value.length === 0) {
		throw hostError(`${label}.shape must be a non-empty array.`);
	}
	const cached = PREPARED_TEMPLATE_SHAPES.get(value);
	if (cached !== undefined) return cached;
	const types: string[] = new Array(value.length);
	const parents: number[] = new Array(value.length);
	let immutable = Object.isFrozen(value);
	for (let index = 0; index < value.length; index++) {
		const candidate: unknown = value[index];
		if (candidate === null || typeof candidate !== 'object') {
			throw hostError(`${label}.shape[${index}] must be an object.`);
		}
		const entry = candidate as { readonly type: unknown; readonly parent: unknown };
		assertHostType(entry.type, `${label}.shape[${index}].type`);
		if (entry.type === 'list' || entry.type === 'list-item') {
			throw hostError(`${label} cannot contain native-list hosts.`);
		}
		const parent = entry.parent;
		if (
			typeof parent !== 'number' ||
			!Number.isSafeInteger(parent) ||
			(index === 0 ? parent !== -1 : parent < 0 || parent >= index)
		) {
			throw hostError(
				index === 0
					? `${label}.shape[0].parent must be -1.`
					: `${label}.shape[${index}].parent must reference an earlier template node.`,
			);
		}
		if (
			index !== 0 &&
			(entry.type === '#text' || entry.type === 'raw-text') &&
			types[parent] !== 'text'
		) {
			throw hostError(
				`${entry.type} template host ${index} may only be placed directly under a text host.`,
			);
		}
		types[index] = entry.type;
		parents[index] = parent;
		immutable &&= Object.isFrozen(entry);
	}
	const prepared = Object.freeze({ types: Object.freeze(types), parents: Object.freeze(parents) });
	if (immutable) PREPARED_TEMPLATE_SHAPES.set(value, prepared);
	return prepared;
}

function cloneProps(value: unknown, label: string): Readonly<Record<string, unknown>> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw hostError(`${label} must be a plain object.`);
	}
	// The render-only main graph authors `main-thread:` event props as tagged
	// callables. Unwrap them to their plain worklet descriptors here, exactly as
	// the background client driver does before transport; an untagged function
	// still fails through cloneHostValue below.
	let source = value as Record<string, unknown>;
	const names = Object.keys(source);
	let rewritten: Record<string, unknown> | null = null;
	for (const name of names) {
		if (!name.startsWith('main-thread:') || name === 'main-thread:ref') continue;
		const item = source[name];
		if (typeof item !== 'function') continue;
		const descriptor = getThreadFunctionDescriptor(item);
		if (descriptor === null) continue;
		if (rewritten === null) rewritten = { ...source };
		rewritten[name] = descriptor;
	}
	if (rewritten !== null) source = rewritten;
	if (!hasCrossRealmPlainPrototype(source)) {
		throw hostError(
			`host props require plain objects, received ${Object.prototype.toString.call(source)}.`,
		);
	}
	if (names.length === 0) return EMPTY_HOST_PROPS;

	const clone = Object.create(null) as Record<string, unknown>;
	let clones: WeakMap<object, object> | null = null;
	for (const name of names) {
		const child = source[name];
		if (
			child === null ||
			child === undefined ||
			typeof child === 'string' ||
			typeof child === 'number' ||
			typeof child === 'bigint' ||
			typeof child === 'boolean'
		) {
			clone[name] = child;
			continue;
		}
		// Scalar-only host props account for most nodes. Seed cycle/alias tracking
		// only when the first nested value actually needs a recursive clone.
		clones ??= new WeakMap<object, object>([[source, clone]]);
		clone[name] = cloneHostValue(child, clones);
	}
	return Object.freeze(clone);
}

function prepareStaticHostProps(
	type: string,
	value: unknown,
	label: string,
): LynxPreparedStaticHostProps | undefined {
	if (type === '#text' || value === null || typeof value !== 'object') {
		return undefined;
	}
	const previous = PREPARED_STATIC_HOST_PROPS.get(value);
	const known = previous?.get(type);
	if (known !== undefined) return known;
	if (!Object.isFrozen(value)) return undefined;
	const names = Object.keys(value);
	if (
		names.length > 1 ||
		(names.length === 1 && names[0] !== 'class' && names[0] !== 'className')
	) {
		return undefined;
	}
	if (names.length !== 0) {
		const descriptor = Object.getOwnPropertyDescriptor(value, names[0]);
		if (
			descriptor === undefined ||
			!('value' in descriptor) ||
			typeof descriptor.value !== 'string'
		) {
			return undefined;
		}
	}
	const props = cloneProps(value, label);
	const prepared = Object.freeze({
		props,
		patch: planLynxHostPropPatch(type, EMPTY_HOST_PROPS, props),
	});
	if (previous === undefined) {
		PREPARED_STATIC_HOST_PROPS.set(value, new Map([[type, prepared]]));
	} else {
		previous.set(type, prepared);
	}
	return prepared;
}

function prepareTemplateProgram(value: unknown, label: string): LynxPreparedTemplateProgram {
	if (value === null || typeof value !== 'object') {
		throw hostError(`${label}.program must be an object.`);
	}
	const cached = PREPARED_TEMPLATE_PROGRAMS.get(value);
	if (cached !== undefined) return cached;
	const program = value as UniversalHostTemplateProgram;
	if (!Array.isArray(program.events)) {
		throw hostError(`${label}.program.events must be an array.`);
	}
	const shape = prepareTemplateShape(program.nodes, `${label}.program`);
	const staticProps: Readonly<Record<string, unknown>>[] = new Array(shape.types.length);
	const staticPatches: (LynxHostPropPatch | undefined)[] = new Array(shape.types.length);
	const bindings: (readonly UniversalHostTemplateProgramBinding[] | undefined)[] = new Array(
		shape.types.length,
	);
	const dynamicRoutes: (0 | 1 | 2)[] = new Array(shape.types.length).fill(0);
	const eventSites: (LynxPreparedTemplateProgramEvent[] | undefined)[] = new Array(
		shape.types.length,
	);
	const orderedEvents: LynxPreparedTemplateProgramEvent[] = new Array(program.events.length);
	let immutable =
		Object.isFrozen(value) && Object.isFrozen(program.nodes) && Object.isFrozen(program.events);
	let valueCount = 0;
	const seenValues = new Set<number>();

	for (let nodeIndex = 0; nodeIndex < shape.types.length; nodeIndex++) {
		const node = program.nodes[nodeIndex]!;
		const props = cloneProps(node.props, `${label}.program.nodes[${nodeIndex}].props`);
		for (const name in props) {
			const entry = props[name];
			if (
				entry !== null &&
				entry !== undefined &&
				typeof entry !== 'string' &&
				typeof entry !== 'number' &&
				typeof entry !== 'boolean' &&
				typeof entry !== 'bigint'
			) {
				throw hostError(`${label}.program.nodes[${nodeIndex}].props must contain only scalars.`);
			}
		}
		staticProps[nodeIndex] = props;
		immutable &&= Object.isFrozen(node) && Object.isFrozen(node.props);
		if (node.bindings !== undefined) {
			if (!Array.isArray(node.bindings) || node.bindings.length === 0) {
				throw hostError(`${label}.program.nodes[${nodeIndex}].bindings must be a non-empty array.`);
			}
			const copied: UniversalHostTemplateProgramBinding[] = new Array(node.bindings.length);
			const names = new Set<string>();
			immutable &&= Object.isFrozen(node.bindings);
			for (let bindingIndex = 0; bindingIndex < node.bindings.length; bindingIndex++) {
				const binding = node.bindings[bindingIndex];
				if (binding === null || typeof binding !== 'object') {
					throw hostError(
						`${label}.program.nodes[${nodeIndex}].bindings[${bindingIndex}] must be an object.`,
					);
				}
				assertHostType(
					binding.name,
					`${label}.program.nodes[${nodeIndex}].bindings[${bindingIndex}].name`,
				);
				if (names.has(binding.name)) {
					throw hostError(`${label}.program.nodes[${nodeIndex}] repeats binding ${binding.name}.`);
				}
				names.add(binding.name);
				if (!Number.isSafeInteger(binding.valueIndex) || binding.valueIndex < 0) {
					throw hostError(
						`${label}.program.nodes[${nodeIndex}].bindings[${bindingIndex}].valueIndex must be a non-negative safe integer.`,
					);
				}
				if (seenValues.has(binding.valueIndex)) {
					throw hostError(`${label}.program repeats scalar value index ${binding.valueIndex}.`);
				}
				seenValues.add(binding.valueIndex);
				valueCount = Math.max(valueCount, binding.valueIndex + 1);
				copied[bindingIndex] = Object.freeze({
					name: binding.name,
					valueIndex: binding.valueIndex,
				});
				immutable &&= Object.isFrozen(binding);
			}
			bindings[nodeIndex] = Object.freeze(copied);
			const type = shape.types[nodeIndex]!;
			if (
				type === '#text' &&
				Object.keys(props).every((name) => name === 'value') &&
				copied.every((binding) => binding.name === 'value')
			) {
				dynamicRoutes[nodeIndex] = 1;
			} else if (
				(type === 'view' || type === 'text') &&
				Object.keys(props).every(
					(name) => name === 'class' || name === 'className' || name === 'id',
				) &&
				copied.every(
					(binding) =>
						binding.name === 'class' || binding.name === 'className' || binding.name === 'id',
				)
			) {
				dynamicRoutes[nodeIndex] = 2;
			}
		} else {
			assertTextProps(shape.types[nodeIndex]!, props, label);
			const patch =
				shape.types[nodeIndex] === '#text' && props[LYNX_CSS_SCOPE_PROP] == null
					? EMPTY_RAW_TEXT_CREATE_PATCH
					: planLynxHostPropPatch(shape.types[nodeIndex]!, EMPTY_HOST_PROPS, props);
			if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
				throw hostError(`${label}.program.nodes[${nodeIndex}] cannot contain main-thread props.`);
			}
			staticPatches[nodeIndex] = patch;
		}
	}
	if (seenValues.size !== valueCount) {
		throw hostError(`${label}.program scalar value indices must be dense.`);
	}

	for (let eventIndex = 0; eventIndex < program.events.length; eventIndex++) {
		const event = program.events[eventIndex];
		if (event === null || typeof event !== 'object') {
			throw hostError(`${label}.program.events[${eventIndex}] must be an object.`);
		}
		if (!Number.isSafeInteger(event.node) || event.node < 0 || event.node >= shape.types.length) {
			throw hostError(`${label}.program.events[${eventIndex}].node must name a program host.`);
		}
		if (shape.types[event.node] === '#text' || shape.types[event.node] === 'raw-text') {
			throw hostError(`raw-text template host ${event.node} cannot own native events.`);
		}
		const binding = parseLynxNativeEventProp(event.type);
		if (binding === null) {
			throw hostError(`event ${JSON.stringify(event.type)} is not a Lynx event prop.`);
		}
		if (
			event.priority !== 'continuous' &&
			event.priority !== 'default' &&
			event.priority !== 'discrete'
		) {
			throw hostError(`${label}.program.events[${eventIndex}] has invalid event priority.`);
		}
		const events = (eventSites[event.node] ??= []);
		if (events.some((existing) => existing.type === event.type)) {
			throw hostError(`${label}.program host ${event.node} repeats event ${event.type}.`);
		}
		const preparedEvent = Object.freeze({
			node: event.node,
			index: eventIndex,
			type: event.type,
			priority: event.priority,
			binding,
		});
		events.push(preparedEvent);
		orderedEvents[eventIndex] = preparedEvent;
		immutable &&= Object.isFrozen(event);
	}
	for (const events of eventSites) if (events !== undefined) Object.freeze(events);
	const prepared = Object.freeze({
		shape,
		props: Object.freeze(staticProps),
		patches: Object.freeze(staticPatches),
		bindings: Object.freeze(bindings),
		dynamicRoutes: Object.freeze(dynamicRoutes),
		events: Object.freeze(eventSites),
		eventSites: Object.freeze(orderedEvents),
		eventCount: program.events.length,
		valueCount,
	});
	if (immutable) PREPARED_TEMPLATE_PROGRAMS.set(value, prepared);
	return prepared;
}

function assertTextProps(
	type: string,
	props: Readonly<Record<string, unknown>>,
	label: string,
): void {
	if (type !== '#text') return;
	if (typeof props.value !== 'string') {
		throw hostError(`${label} for #text must contain a string value and optional CSS scope.`);
	}
	for (const name in props) {
		if (name !== 'value' && name !== LYNX_CSS_SCOPE_PROP) {
			throw hostError(`${label} for #text must contain a string value and optional CSS scope.`);
		}
	}
}

function planScalarClassAndIdCreation(props: Readonly<Record<string, unknown>>): LynxHostPropPatch {
	const patch: {
		id?: { readonly value: string | null };
		classes?: { readonly value: string };
		readonly attributes: readonly never[];
		readonly mainThreadEvents: readonly never[];
		readonly requiresRecreate: false;
	} = {
		attributes: EMPTY_RAW_TEXT_CREATE_PATCH.attributes as readonly never[],
		mainThreadEvents: EMPTY_RAW_TEXT_CREATE_PATCH.mainThreadEvents as readonly never[],
		requiresRecreate: false,
	};
	const id = props.id;
	if (id !== null && id !== undefined) patch.id = Object.freeze({ value: String(id) });
	const candidate = Object.prototype.hasOwnProperty.call(props, 'className')
		? props.className
		: props.class;
	const classes =
		typeof candidate === 'string'
			? candidate
			: typeof candidate === 'number' && candidate
				? String(candidate)
				: '';
	if (classes !== '') patch.classes = Object.freeze({ value: classes });
	return Object.freeze(patch);
}

function applyDenseScalarHostProps<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	node: Node,
	props: Readonly<Record<string, unknown>>,
	bindings: readonly UniversalHostTemplateProgramBinding[],
	values: readonly UniversalHostTemplateProgramValue[],
	valueOffset: number,
): void {
	let id = props.id;
	let ordinaryClass = props.class;
	let aliasedClass = props.className;
	let hasAliasedClass = Object.prototype.hasOwnProperty.call(props, 'className');
	for (const binding of bindings) {
		const value = values[valueOffset + binding.valueIndex];
		if (binding.name === 'id') id = value;
		else if (binding.name === 'className') {
			aliasedClass = value;
			hasAliasedClass = true;
		} else {
			ordinaryClass = value;
		}
	}
	if (id !== null && id !== undefined) papi.setId(node, String(id));
	const candidate = hasAliasedClass ? aliasedClass : ordinaryClass;
	const classes =
		typeof candidate === 'string'
			? candidate
			: typeof candidate === 'number' && candidate
				? String(candidate)
				: '';
	if (classes !== '') papi.setClasses(node, classes);
}

function assertNoMainThreadEventCollision(
	props: Readonly<Record<string, unknown>>,
	events: ReadonlyMap<string, UniversalEventListenerDescriptor>,
): void {
	if (events.size === 0) return;
	for (const name of Object.keys(props)) {
		if (props[name] === null || props[name] === undefined) continue;
		const main = parseLynxMainThreadEventProp(name);
		if (main === null) continue;
		for (const type of events.keys()) {
			const ordinary = parseLynxNativeEventProp(type);
			if (ordinary?.type !== main.type || ordinary.name !== main.name) continue;
			throw hostError(
				`main-thread event ${JSON.stringify(name)} conflicts with background event ${JSON.stringify(type)} on the same native channel.`,
			);
		}
	}
}

function cloneRecord<Node extends LynxElementRef>(
	record: LynxHostRecord<Node>,
): LynxHostRecord<Node> {
	return {
		node: record.node,
		type: record.type,
		props: record.props,
		visible: record.visible,
		parent: record.parent,
		children: record.children.length === 0 ? EMPTY_HOST_CHILDREN : [...record.children],
		events: record.events.size === 0 ? EMPTY_HOST_EVENTS : new Map(record.events),
		handle: record.handle,
		selectorInstalled: record.selectorInstalled,
	};
}

function hostChildrenForWrite<Node extends LynxElementRef>(record: LynxHostRecord<Node>): number[] {
	if (record.children === EMPTY_HOST_CHILDREN) record.children = [];
	return record.children;
}

function createHandle(root: number, id: number, type: string, generation: number): LynxHostHandle {
	return Object.freeze({
		$$kind: 'octane.lynx.element',
		renderer: LYNX_RENDERER_ID,
		root,
		id,
		type,
		generation,
		selector: createLynxNodesRefSelector(root, id, generation),
	});
}

function isPortalParent(parent: LynxHostParent): parent is LynxPortalParent {
	return parent !== null && typeof parent === 'object';
}

function parentHostId(parent: LynxHostParent): number | null | undefined {
	return isPortalParent(parent) ? parent.target : parent;
}

function sameHostParent(first: LynxHostParent, second: LynxHostParent): boolean {
	if (isPortalParent(first) || isPortalParent(second)) {
		return isPortalParent(first) && isPortalParent(second) && first.key === second.key;
	}
	return first === second;
}

function assertNoCycle<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	id: number,
	parent: LynxAttachedHostParent,
): void {
	let current = parentHostId(parent);
	const visited = new Set<number>();
	while (typeof current === 'number') {
		if (current === id) throw hostError(`placement of ${id} would create a cycle.`);
		if (visited.has(current)) throw hostError(`existing topology contains a cycle at ${current}.`);
		visited.add(current);
		const record = getRecord(current);
		if (record === undefined) throw hostError(`unknown parent ${current}.`);
		if (record.parent === undefined) return;
		current = parentHostId(record.parent);
	}
}

function isRootConnected<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	id: number,
): boolean {
	let current: number | null | undefined = id;
	const visited = new Set<number>();
	while (typeof current === 'number') {
		if (visited.has(current)) throw hostError(`existing topology contains a cycle at ${current}.`);
		visited.add(current);
		const record = getRecord(current);
		if (record === undefined) throw hostError(`topology references unknown host ${current}.`);
		current = parentHostId(record.parent);
	}
	return current === null;
}

function isAcceptedHostConnected<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	id: number,
): boolean {
	let current: number | null | undefined = id;
	const visited = new Set<number>();
	while (typeof current === 'number') {
		if (visited.has(current)) throw hostError(`existing topology contains a cycle at ${current}.`);
		visited.add(current);
		const record = state.records.get(current);
		if (record === undefined) return false;
		current = parentHostId(record.parent);
	}
	return current === null;
}

function nodeFor<Node extends LynxElementRef>(
	nodes: Map<number, Node>,
	id: number,
	label: string,
): Node {
	const node = nodes.get(id);
	if (node === undefined) throw hostError(`${label} references unavailable host ${id}.`);
	return node;
}

function physicalNodeForParent<Node extends LynxElementRef>(
	nodes: Map<number, Node>,
	page: Node,
	parent: LynxAttachedHostParent,
	label: string,
): Node {
	if (parent === null) return page;
	return nodeFor(nodes, isPortalParent(parent) ? parent.target : parent, label);
}

function firstPortalChildNode<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	nodes: Map<number, Node>,
	target: number,
): Node | null {
	const targetNode = nodes.get(target);
	if (targetNode === undefined) return null;
	for (const entry of state.portalChildren.values()) {
		if (entry.parent.target !== target) continue;
		for (const child of entry.children) {
			const node = nodes.get(child);
			// Logical portal state is published before PAPI operations run. During a
			// same-batch retarget, the final destination therefore sees this child
			// before the physical move has happened; it is not a legal `before` node
			// until PAPI confirms that it already belongs to the destination.
			if (node !== undefined && state.papi.isChild(targetNode, node)) return node;
		}
	}
	return null;
}

function textValue(props: Readonly<Record<string, unknown>>): string {
	return typeof props.value === 'string'
		? props.value
		: typeof props.text === 'string'
			? props.text
			: '';
}

function authoredHiddenValue(props: Readonly<Record<string, unknown>>): unknown {
	return props.hidden === null || props.hidden === undefined ? null : props.hidden;
}

function effectiveHiddenValue(visible: boolean, props: Readonly<Record<string, unknown>>): unknown {
	return visible ? authoredHiddenValue(props) : true;
}

function applyProps<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	type: string,
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
	patch: LynxHostPropPatch,
	creating: boolean,
	visible: boolean,
	interactive: boolean,
): void {
	const papi = state.papi;
	if (patch.cssScope !== undefined) {
		papi.setCssId(node, patch.cssScope.value.cssId, patch.cssScope.value.entryName);
	}
	if (type === '#text') {
		if (!creating && !Object.is(previous.value, next.value)) {
			papi.setAttribute(node, 'text', next.value);
		}
		return;
	}
	if (patch.id !== undefined) papi.setId(node, patch.id.value);
	if (patch.classes !== undefined) papi.setClasses(node, patch.classes.value);
	if (patch.inlineStyles !== undefined) papi.setInlineStyles(node, patch.inlineStyles.value);
	if (patch.dataset !== undefined) papi.setDataset(node, patch.dataset.value);
	for (const event of patch.mainThreadEvents) {
		removeNativeEvent(state, node, event.binding.prop);
		if (interactive && event.value !== null) {
			installMainThreadEvent(state, node, event.binding, event.value);
		}
	}
	if (patch.mainThreadRef !== undefined) {
		removeMainThreadRef(state, node);
		if (interactive && patch.mainThreadRef.value !== null) {
			installMainThreadRef(state, node, patch.mainThreadRef.value);
		}
	}
	for (const attribute of patch.attributes) {
		papi.setAttribute(
			node,
			attribute.name,
			attribute.name === 'hidden' ? effectiveHiddenValue(visible, next) : attribute.value,
		);
	}
}

function installNodesRefSelector<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	node: Node,
	handle: LynxHostHandle,
): void {
	// Raw text has no CSS-selectable Element surface. It still receives a cloned
	// identity handle for ref ordering, but query methods fail with node-not-found.
	if (handle.type === '#text' || handle.type === 'raw-text') return;
	papi.setRefSelector(node, `r${handle.root}-h${handle.id}-g${handle.generation}`);
}

function ensureNodesRefSelector<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	record: LynxHostRecord<Node>,
): void {
	if (record.selectorInstalled || record.node === null) return;
	installNodesRefSelector(state.papi, record.node, record.handle);
	record.selectorInstalled = true;
}

function nativeEventMap<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
): Map<string, LynxNativeEventRegistration> {
	let events = state.nativeEvents.get(node);
	if (events === undefined) {
		events = new Map();
		state.nativeEvents.set(node, events);
	}
	return events;
}

function requireWorkletRegistry<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
): LynxMainThreadWorkletRegistry {
	if (state.worklets === undefined) {
		throw hostError('main-thread props require a main-thread worklet registry.');
	}
	return state.worklets;
}

function removeNativeEvent<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	type: string,
): void {
	const events = state.nativeEvents.get(node);
	const registration = events?.get(type);
	if (registration === undefined) return;
	if (registration.source === 'main-thread') {
		// Invalidate before native unbind so an engine-retained callback cannot
		// execute after its host lifetime ends. release() is idempotent for retry.
		requireWorkletRegistry(state).release(
			registration.listener.value as LynxActivatedMainThreadWorklet,
		);
	}
	let replacement: LynxNativeEventRegistration | undefined;
	for (const [candidateType, candidate] of events!) {
		if (
			candidateType !== type &&
			candidate.binding.type === registration.binding.type &&
			candidate.binding.name === registration.binding.name
		) {
			replacement = candidate;
			break;
		}
	}
	// A single universal commit can transfer one PAPI tuple between the ordinary
	// background channel and a direct main-thread prop. Those semantic commands
	// are intentionally journaled separately, so removing the superseded entry
	// must preserve the already-installed replacement instead of unbinding it.
	state.papi.setEvent(
		node,
		registration.binding.type,
		registration.binding.name,
		replacement?.listener,
	);
	events!.delete(type);
	if (events!.size === 0) state.nativeEvents.delete(node);
}

function installNativeEvent<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	root: number,
	id: number,
	generation: number,
	type: string,
	listener: UniversalEventListenerDescriptor,
): void {
	const binding = parseLynxNativeEventProp(type);
	if (binding === null) throw hostError(`event ${JSON.stringify(type)} is not a Lynx event prop.`);
	const token = encodeLynxNativeEventToken({
		root,
		id,
		generation,
		listener: listener.id,
		priority: listener.priority,
	});
	const events = nativeEventMap(state, node);
	const current = events.get(type);
	if (current?.source === 'background' && current.listener === token) return;
	// Journal the intended token before entering PAPI. If native replacement
	// mutates and then throws, terminal cleanup still knows which tuple to clear.
	events.set(type, Object.freeze({ source: 'background', binding, listener: token }));
	state.papi.setEvent(node, binding.type, binding.name, token);
}

function installPreparedNativeEvent<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	root: number,
	id: number,
	firstListenerId: number,
	site: LynxPreparedTemplateProgramEvent,
): void {
	const token = encodePrevalidatedLynxNativeEventToken(
		root,
		id,
		1,
		firstListenerId + site.index,
		site.priority,
	);
	let events = state.nativeEvents.get(node);
	if (events === undefined) {
		events = new Map();
		state.nativeEvents.set(node, events);
	}
	// Fresh compact hosts have no earlier binding. Journal before entering PAPI
	// so a mutate-then-throw native failure remains completely disposable.
	events.set(
		site.type,
		Object.freeze({ source: 'background', binding: site.binding, listener: token }),
	);
	state.papi.setEvent(node, site.binding.type, site.binding.name, token);
}

function installMainThreadEvent<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	binding: LynxMainThreadEventBinding,
	worklet: LynxMainThreadWorkletDescriptor,
): void {
	let events = state.nativeEvents.get(node);
	const current = events?.get(binding.prop);
	if (current?.source === 'main-thread' && sameSnapshotValue(current.descriptor, worklet)) {
		return;
	}
	const registry = requireWorkletRegistry(state);
	const active = registry.activate(worklet);
	const listener = Object.freeze({ type: 'worklet' as const, value: active });
	// The direct callback has no background resolver to reject stale identities.
	// Unbind the accepted listener before publishing its replacement.
	if (current !== undefined) {
		try {
			removeNativeEvent(state, node, binding.prop);
		} catch (error) {
			registry.release(active);
			throw error;
		}
		events = nativeEventMap(state, node);
	} else if (events === undefined) {
		events = nativeEventMap(state, node);
	}
	events.set(
		binding.prop,
		Object.freeze({ source: 'main-thread', binding, listener, descriptor: worklet }),
	);
	state.papi.setEvent(node, binding.type, binding.name, listener);
}

function removeMainThreadEvents<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
): void {
	const events = state.nativeEvents.get(node);
	if (events === undefined) return;
	for (const [type, registration] of [...events]) {
		if (registration.source === 'main-thread') removeNativeEvent(state, node, type);
	}
}

function removeMainThreadRef<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
): void {
	const ref = state.mainThreadRefs.get(node);
	if (ref === undefined) return;
	const registry = requireWorkletRegistry(state);
	registry.updateRef(ref, null);
	registry.releaseRef(ref);
	state.mainThreadRefs.delete(node);
	if (state.mainThreadRefOwners.get(ref._wvid) === node) {
		state.mainThreadRefOwners.delete(ref._wvid);
	}
}

function invalidateMainThreadLifetimesAfterFault<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
): void {
	const registry = state.worklets;
	if (registry === undefined) return;
	// An accepted host fault is terminal. Background listener tokens are rejected
	// through state.faulted, but direct PAPI worklets bypass that resolver and must
	// be invalidated explicitly. Keep physical event journals so terminal disposal
	// can retry native unbinding; refs have no PAPI binding and can be released now.
	for (const events of state.nativeEvents.values()) {
		for (const registration of events.values()) {
			if (registration.source !== 'main-thread') continue;
			try {
				registry.release(registration.listener.value as LynxActivatedMainThreadWorklet);
			} catch {
				// Preserve the accepted application error. The retained journal retries
				// release during terminal disposal and reports any persistent failure.
			}
		}
	}
	for (const node of [...state.mainThreadRefs.keys()]) {
		try {
			removeMainThreadRef(state, node);
		} catch {
			// A partially failed registry update retains its journal for disposal.
		}
	}
}

function installMainThreadRef<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	ref: LynxMainThreadRefDescriptor,
): void {
	const current = state.mainThreadRefs.get(node);
	if (current !== undefined && sameSnapshotValue(current, ref)) return;
	const owner = state.mainThreadRefOwners.get(ref._wvid);
	if (owner !== undefined && owner !== node) {
		let ownerIsInteractive = false;
		for (const [id, record] of state.records) {
			if (record.node !== owner) continue;
			const authored = record.props['main-thread:ref'] as
				LynxMainThreadRefDescriptor | null | undefined;
			ownerIsInteractive =
				record.visible && authored?._wvid === ref._wvid && isAcceptedHostConnected(state, id);
			break;
		}
		if (ownerIsInteractive) {
			throw hostError(`main-thread ref ${JSON.stringify(ref._wvid)} is already mounted.`);
		}
		removeMainThreadRef(state, owner);
	}
	if (current !== undefined) removeMainThreadRef(state, node);
	const registry = requireWorkletRegistry(state);
	registry.retainRef(ref, null);
	// Journal first: a native update may mutate and then throw, in which case
	// terminal cleanup must still clear the ref identity.
	state.mainThreadRefs.set(node, ref);
	state.mainThreadRefOwners.set(ref._wvid, node);
	registry.updateRef(ref, node);
}

function installMainThreadProps<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	type: string,
	props: Readonly<Record<string, unknown>>,
): void {
	const patch = planLynxHostPropPatch(type, {}, props);
	for (const event of patch.mainThreadEvents) {
		if (event.value !== null) installMainThreadEvent(state, node, event.binding, event.value);
	}
	if (patch.mainThreadRef?.value !== null && patch.mainThreadRef?.value !== undefined) {
		installMainThreadRef(state, node, patch.mainThreadRef.value);
	}
}

function deactivateMainThreadSubtree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	id: number,
): void {
	const record = state.records.get(id);
	if (record === undefined) return;
	for (const child of record.children) deactivateMainThreadSubtree(state, child);
	if (record.node === null) return;
	removeMainThreadEvents(state, record.node);
	removeMainThreadRef(state, record.node);
}

function activateMainThreadSubtree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	id: number,
): void {
	const record = state.records.get(id);
	if (record === undefined || !record.visible || !isAcceptedHostConnected(state, id)) return;
	if (record.node !== null) installMainThreadProps(state, record.node, record.type, record.props);
	for (const child of record.children) activateMainThreadSubtree(state, child);
}

function removeAllNativeEvents<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
): void {
	const events = state.nativeEvents.get(node);
	if (events === undefined) return;
	for (const type of [...events.keys()]) removeNativeEvent(state, node, type);
}

function installNativeEvents<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	root: number,
	id: number,
	generation: number,
	events: ReadonlyMap<string, UniversalEventListenerDescriptor>,
): void {
	for (const [type, listener] of events) {
		installNativeEvent(state, node, root, id, generation, type, listener);
	}
}

function hasListUpdate(update: LynxListUpdateInfo): boolean {
	return (
		update.insertAction.length !== 0 ||
		update.removeAction.length !== 0 ||
		update.updateAction.length !== 0
	);
}

function sameListItems(
	first: readonly LynxListItemDescriptor[],
	second: readonly LynxListItemDescriptor[],
): boolean {
	if (first.length !== second.length) return false;
	for (let index = 0; index < first.length; index++) {
		const a = first[index]!;
		const b = second[index]!;
		if (
			a.id !== b.id ||
			a.itemKey !== b.itemKey ||
			a.reuseIdentifier !== b.reuseIdentifier ||
			a.recyclable !== b.recyclable ||
			a.defer !== b.defer
		) {
			return false;
		}
	}
	return true;
}

function directListItem<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	id: number,
): { readonly listId: number; readonly itemId: number } | null {
	let current = getRecord(id);
	const visited = new Set<number>();
	while (current !== undefined) {
		if (visited.has(current.handle.id)) throw hostError('list ancestry contains a cycle.');
		visited.add(current.handle.id);
		const parentId = parentHostId(current.parent);
		if (typeof parentId !== 'number') return null;
		const parent = getRecord(parentId);
		if (parent === undefined) return null;
		if (parent.type === 'list') {
			return current.type === 'list-item'
				? Object.freeze({ listId: parent.handle.id, itemId: current.handle.id })
				: null;
		}
		current = parent;
	}
	return null;
}

function cachedListDescendant<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	id: number,
	cache: Map<number, boolean>,
): boolean {
	const cached = cache.get(id);
	if (cached !== undefined) return cached;
	const path: number[] = [];
	let currentId: number | null | undefined = id;
	let result = false;
	while (typeof currentId === 'number') {
		const known = cache.get(currentId);
		if (known !== undefined) {
			result = known;
			break;
		}
		const current = getRecord(currentId);
		if (current === undefined) break;
		path.push(currentId);
		const parentId = parentHostId(current.parent);
		if (typeof parentId !== 'number') break;
		const parent = getRecord(parentId);
		if (parent === undefined) break;
		if (parent.type === 'list') {
			result = current.type === 'list-item';
			break;
		}
		currentId = parentId;
	}
	for (const pathId of path) cache.set(pathId, result);
	return result;
}

function listItems<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	listId: number,
): readonly LynxListItemDescriptor[] {
	const list = getRecord(listId);
	if (list === undefined || list.type !== 'list') return Object.freeze([]);
	const items = list.children.map((id) => {
		const record = getRecord(id);
		if (record === undefined) throw hostError(`<list> ${listId} references unknown child ${id}.`);
		return createLynxListItemDescriptor(id, record.type, record.props);
	});
	// The planner owns native item-key uniqueness validation.
	planLynxListUpdate([], items);
	return Object.freeze(items);
}

function emitAttachments<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	deltas: LynxHostAttachmentDelta[],
	version = state.acceptedVersion,
): void {
	if (deltas.length === 0 || state.disposed || state.disposing) return;
	// Keep one transition per logical host in this phase. Detach and attach
	// phases are emitted separately so NodesRef observes an attachment epoch.
	const seen = new Set<number>();
	const normalized: LynxHostAttachmentDelta[] = [];
	for (let index = deltas.length - 1; index >= 0; index--) {
		const delta = deltas[index]!;
		if (seen.has(delta.id)) continue;
		seen.add(delta.id);
		normalized.push(delta);
	}
	normalized.reverse();
	state.onAttachments?.(version, Object.freeze(normalized));
}

function physicalChildren<Node extends LynxElementRef>(
	record: LynxHostRecord<Node>,
): readonly number[] {
	// Native lists own their direct cells through callbacks rather than ordinary
	// Element PAPI insertion. Descendants inside each cell remain ordinary hosts.
	return record.type === 'list' ? [] : record.children;
}

function createPhysicalTree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	container: LynxHostContainer<Node>,
	id: number,
): LynxPhysicalTree<Node> {
	const record = state.records.get(id);
	if (record === undefined) throw hostError(`native list requested missing host ${id}.`);
	const node =
		record.type === 'list'
			? createNativeListNode(state, container, record)
			: state.papi.createElement(
					record.type,
					container.pageComponentUniqueId,
					textValue(record.props),
				);
	state.ownedNodes.add(node);
	record.node = node;
	record.selectorInstalled = false;
	ensureNodesRefSelector(state, record);
	applyProps(
		state,
		node,
		record.type,
		{},
		record.props,
		planLynxHostPropPatch(record.type, {}, record.props),
		true,
		record.visible,
		record.visible && isAcceptedHostConnected(state, id),
	);
	if (record.visible) {
		installNativeEvents(state, node, container.root, id, record.handle.generation, record.events);
	}
	const children: LynxPhysicalTree<Node>[] = [];
	for (const childId of physicalChildren(record)) {
		const child = createPhysicalTree(state, container, childId);
		state.papi.insertBefore(node, child.node, null);
		children.push(child);
	}
	return {
		node,
		type: record.type,
		props: record.props,
		visible: record.visible,
		logicalId: id,
		children,
	};
}

function disposeNativeListState<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	hostId: number,
): void {
	const list = state.lists.get(hostId);
	if (list === undefined || list.disposed) return;
	const listPAPI = state.papi.list;
	if (listPAPI !== undefined) {
		listPAPI.updateCallbacks(
			list.node,
			() => -1,
			() => {},
			() => {},
		);
	}
	list.disposed = true;
	state.lists.delete(hostId);
	for (const cell of list.cellsBySign.values()) disposePhysicalTree(state, cell.tree);
	list.cellsBySign.clear();
	list.attachedByItem.clear();
	list.retainedByItem.clear();
	list.recyclePools.clear();
}

function disposePhysicalTree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	tree: LynxPhysicalTree<Node>,
): void {
	for (const child of tree.children) disposePhysicalTree(state, child);
	if (tree.type === 'list') disposeNativeListState(state, tree.logicalId);
	removeAllNativeEvents(state, tree.node);
	removeMainThreadRef(state, tree.node);
	const record = state.records.get(tree.logicalId);
	if (record?.node === tree.node) record.node = null;
	state.ownedNodes.delete(tree.node);
}

function capturePhysicalTree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	id: number,
): LynxPhysicalTree<Node> {
	const record = state.records.get(id);
	if (record === undefined || record.node === null) {
		throw hostError(`attached native list cell lost logical host ${id}.`);
	}
	return {
		node: record.node,
		type: record.type,
		props: record.props,
		visible: record.visible,
		logicalId: id,
		children: physicalChildren(record).map((childId) => capturePhysicalTree(state, childId)),
	};
}

function clearPhysicalTreeAttachment<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	tree: LynxPhysicalTree<Node>,
	deltas: LynxHostAttachmentDelta[],
): void {
	const record = state.records.get(tree.logicalId);
	if (record !== undefined) {
		deltas.push(
			Object.freeze({
				id: tree.logicalId,
				generation: record.handle.generation,
				attached: false,
			}),
		);
	}
	removeAllNativeEvents(state, tree.node);
	removeMainThreadRef(state, tree.node);
	if (tree.type !== '#text' && tree.type !== 'raw-text') state.papi.setRefSelector(tree.node, '');
	if (record?.node === tree.node) {
		record.node = null;
		record.selectorInstalled = false;
	}
	for (const child of tree.children) clearPhysicalTreeAttachment(state, child, deltas);
}

function collectPhysicalTreeAttachment<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	tree: LynxPhysicalTree<Node>,
	deltas: LynxHostAttachmentDelta[],
): void {
	for (const child of tree.children) collectPhysicalTreeAttachment(state, child, deltas);
	const record = state.records.get(tree.logicalId);
	if (record === undefined) return;
	deltas.push(
		Object.freeze({
			id: tree.logicalId,
			generation: record.handle.generation,
			attached: true,
		}),
	);
}

function collectPhysicalTreeIds<Node extends LynxElementRef>(
	tree: LynxPhysicalTree<Node>,
	output: Set<number>,
): void {
	output.add(tree.logicalId);
	for (const child of tree.children) collectPhysicalTreeIds(child, output);
}

function rebindPhysicalTree<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	container: LynxHostContainer<Node>,
	tree: LynxPhysicalTree<Node>,
	desiredId: number,
): LynxPhysicalTree<Node> {
	const desired = state.records.get(desiredId);
	if (desired === undefined) throw hostError(`native list requested missing host ${desiredId}.`);
	const patch = planLynxHostPropPatch(desired.type, tree.props, desired.props);
	if (
		tree.type !== desired.type ||
		patch.requiresRecreate ||
		(tree.type === 'list' && tree.logicalId !== desiredId)
	) {
		const replacement = createPhysicalTree(state, container, desiredId);
		state.papi.replace(replacement.node, tree.node);
		disposePhysicalTree(state, tree);
		return replacement;
	}

	const previousRecord = state.records.get(tree.logicalId);
	if (previousRecord?.node === tree.node && tree.logicalId !== desiredId)
		previousRecord.node = null;
	removeAllNativeEvents(state, tree.node);
	removeMainThreadRef(state, tree.node);
	desired.node = tree.node;
	desired.selectorInstalled = false;
	ensureNodesRefSelector(state, desired);
	applyProps(
		state,
		tree.node,
		desired.type,
		tree.props,
		desired.props,
		patch,
		false,
		desired.visible,
		desired.visible && isAcceptedHostConnected(state, desiredId),
	);
	if (!desired.visible) state.papi.setAttribute(tree.node, 'hidden', true);
	else {
		const interactive = isAcceptedHostConnected(state, desiredId);
		if (interactive) installMainThreadProps(state, tree.node, desired.type, desired.props);
		installNativeEvents(
			state,
			tree.node,
			container.root,
			desiredId,
			desired.handle.generation,
			desired.events,
		);
	}

	const desiredChildren = physicalChildren(desired);
	const common = Math.min(tree.children.length, desiredChildren.length);
	for (let index = 0; index < common; index++) {
		tree.children[index] = rebindPhysicalTree(
			state,
			container,
			tree.children[index]!,
			desiredChildren[index]!,
		);
	}
	while (tree.children.length > desiredChildren.length) {
		const child = tree.children.pop()!;
		state.papi.remove(tree.node, child.node);
		disposePhysicalTree(state, child);
	}
	for (let index = common; index < desiredChildren.length; index++) {
		const child = createPhysicalTree(state, container, desiredChildren[index]!);
		state.papi.insertBefore(tree.node, child.node, null);
		tree.children.push(child);
	}
	tree.type = desired.type;
	tree.props = desired.props;
	tree.visible = desired.visible;
	tree.logicalId = desiredId;
	return tree;
}

function poolListCell<Node extends LynxElementRef>(
	list: LynxNativeListState<Node>,
	cell: LynxPhysicalListCell<Node>,
): void {
	cell.awaitingEnqueue = false;
	const key = lynxListReuseKey(cell.item);
	let pool = list.recyclePools.get(key);
	if (pool === undefined) list.recyclePools.set(key, (pool = []));
	pool.push(cell);
}

function destroyListCell<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	list: LynxNativeListState<Node>,
	cell: LynxPhysicalListCell<Node>,
): void {
	if (state.papi.isChild(list.node, cell.tree.node)) {
		state.papi.remove(list.node, cell.tree.node);
	}
	list.cellsBySign.delete(cell.sign);
	cell.awaitingEnqueue = false;
	disposePhysicalTree(state, cell.tree);
}

function detachListCell<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	list: LynxNativeListState<Node>,
	cell: LynxPhysicalListCell<Node>,
	mode: 'await-enqueue' | 'destroy' | 'retain' | 'reuse',
	version?: number,
	attachmentDeltas?: LynxHostAttachmentDelta[],
): void {
	const itemId = cell.logicalItemId;
	if (itemId === null) return;
	list.leaveCount += 1;
	cell.tree = capturePhysicalTree(state, itemId);
	const deltas = attachmentDeltas ?? [];
	clearPhysicalTreeAttachment(state, cell.tree, deltas);
	if (list.attachedByItem.get(itemId) === cell) list.attachedByItem.delete(itemId);
	cell.logicalItemId = null;
	if (mode === 'await-enqueue') cell.awaitingEnqueue = true;
	else if (mode === 'retain') {
		cell.awaitingEnqueue = false;
		list.retainedByItem.set(itemId, cell);
	} else if (mode === 'reuse') poolListCell(list, cell);
	else destroyListCell(state, list, cell);
	if (attachmentDeltas === undefined) emitAttachments(state, deltas, version);
}

function materializeListItem<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	container: LynxHostContainer<Node>,
	list: LynxNativeListState<Node>,
	index: number,
): LynxListMaterialization<Node> {
	const item = list.items[index];
	if (item === undefined) throw hostError(`native list requested out-of-range item ${index}.`);
	const detachments: LynxHostAttachmentDelta[] = [];
	const attachments: LynxHostAttachmentDelta[] = [];
	const attached = list.attachedByItem.get(item.id);
	if (attached !== undefined) {
		// Lynx may ask for the moved logical item before enqueueing its old
		// physical sign. Keep that old tree alive until enqueue, but move logical
		// ownership to a different physical cell immediately.
		detachListCell(state, list, attached, 'await-enqueue', undefined, detachments);
	}
	list.enterCount += 1;

	let cell = list.retainedByItem.get(item.id);
	let reuseNotification = false;
	if (cell !== undefined) list.retainedByItem.delete(item.id);
	if (cell === undefined && item.recyclable) {
		const reuseKey = lynxListReuseKey(item);
		const pool = list.recyclePools.get(reuseKey);
		cell = pool?.pop();
		if (pool?.length === 0) list.recyclePools.delete(reuseKey);
		reuseNotification = cell !== undefined && cell.item.id !== item.id;
	}
	if (cell === undefined) {
		const tree = createPhysicalTree(state, container, item.id);
		state.papi.insertBefore(list.node, tree.node, null);
		const sign = state.papi.getUniqueId(tree.node);
		if (!Number.isSafeInteger(sign) || sign <= 0 || list.cellsBySign.has(sign)) {
			throw hostError('Element PAPI returned an invalid or duplicate native list cell sign.');
		}
		cell = { sign, tree, item, logicalItemId: item.id, awaitingEnqueue: false };
		list.cellsBySign.set(sign, cell);
		list.createdCells += 1;
	} else {
		const previousSign = cell.sign;
		cell.tree = rebindPhysicalTree(state, container, cell.tree, item.id);
		const nextSign = state.papi.getUniqueId(cell.tree.node);
		if (!Number.isSafeInteger(nextSign) || nextSign <= 0) {
			throw hostError('Element PAPI returned an invalid native list cell sign after reuse.');
		}
		if (nextSign !== previousSign) {
			if (list.cellsBySign.has(nextSign)) {
				throw hostError('Element PAPI returned a duplicate native list cell sign after reuse.');
			}
			list.cellsBySign.delete(previousSign);
			list.cellsBySign.set(nextSign, cell);
			cell.sign = nextSign;
		}
		cell.item = item;
		cell.logicalItemId = item.id;
		cell.awaitingEnqueue = false;
		list.reusedCells += 1;
	}
	list.attachedByItem.set(item.id, cell);
	collectPhysicalTreeAttachment(state, cell.tree, attachments);
	return {
		sign: cell.sign,
		tree: cell.tree,
		item,
		reuseNotification,
		detachments,
		attachments,
	};
}

function invokeNativeListCallback<Node extends LynxElementRef, Result>(
	state: LynxHostState<Node>,
	fallback: Result,
	callback: () => Result,
): Result {
	if (state.disposed || state.disposing || state.faulted) return fallback;
	try {
		const result = callback();
		return state.disposed || state.disposing || state.faulted ? fallback : result;
	} catch (error) {
		// Reentrant native callbacks during apply belong to the accepted commit
		// boundary, whose caller publishes the ordinary ACK + fault sequence.
		if (state.applying) throw error;
		if (!state.disposed && !state.disposing && !state.faulted) {
			state.faulted = true;
			invalidateMainThreadLifetimesAfterFault(state);
			state.cleanupNeedsFlush = true;
			try {
				state.onCallbackFault?.(state.acceptedVersion, error);
			} catch {
				// The owner is responsible for diagnosing delivery failures. The host
				// must remain fail-stop even if that diagnostic path itself fails.
			}
		}
		return fallback;
	}
}

function createNativeListNode<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	container: LynxHostContainer<Node>,
	record: LynxHostRecord<Node>,
): Node {
	const listPAPI = state.papi.list;
	if (listPAPI === undefined) {
		throw hostError('<list> requires __CreateList and __UpdateListCallbacks.');
	}
	let listState: LynxNativeListState<Node> | undefined;
	const componentAtIndex: LynxListComponentAtIndex<Node> = (
		_list,
		_listId,
		index,
		operationId,
		enableReuseNotification,
	) =>
		invokeNativeListCallback(state, -1, () => {
			if (listState === undefined || listState.disposed) return -1;
			const result = materializeListItem(state, container, listState, index);
			state.papi.flush(result.tree.node, {
				triggerLayout: true,
				...(operationId === undefined ? null : { operationID: operationId }),
				elementID: result.sign,
				listID: state.papi.getUniqueId(listState.node),
				...(result.reuseNotification && enableReuseNotification
					? {
							listReuseNotification: {
								listElement: listState.node,
								itemKey: result.item.itemKey,
							},
						}
					: null),
			});
			emitAttachments(state, result.detachments);
			emitAttachments(state, result.attachments);
			return result.sign;
		});
	const enqueueComponent: LynxListEnqueueComponent<Node> = (_list, _listId, sign) => {
		invokeNativeListCallback(state, undefined, () => {
			if (listState === undefined || listState.disposed) return;
			const cell = listState.cellsBySign.get(sign);
			if (cell === undefined) return;
			if (cell.awaitingEnqueue) {
				if (cell.item.recyclable) poolListCell(listState, cell);
				else destroyListCell(state, listState, cell);
				return;
			}
			if (cell.logicalItemId === null) return;
			detachListCell(state, listState, cell, cell.item.recyclable ? 'reuse' : 'retain');
		});
	};
	const componentAtIndexes: LynxListComponentAtIndexes<Node> = (
		_list,
		_listId,
		indexes,
		operationIds,
		enableReuseNotification,
		asyncFlush,
	) => {
		invokeNativeListCallback(state, undefined, () => {
			if (listState === undefined || listState.disposed) return;
			const results = indexes.map((index) =>
				materializeListItem(state, container, listState!, index),
			);
			if (asyncFlush) {
				for (const result of results) {
					state.papi.flush(result.tree.node, {
						asyncFlush: true,
						...(result.reuseNotification && enableReuseNotification
							? {
									listReuseNotification: {
										listElement: listState.node,
										itemKey: result.item.itemKey,
									},
								}
							: null),
					});
				}
			}
			state.papi.flush(listState.node, {
				triggerLayout: true,
				operationIDs: operationIds,
				elementIDs: results.map((result) => result.sign),
				listID: state.papi.getUniqueId(listState.node),
			});
			const detachments: LynxHostAttachmentDelta[] = [];
			const attachments: LynxHostAttachmentDelta[] = [];
			for (const result of results) {
				detachments.push(...result.detachments);
				attachments.push(...result.attachments);
			}
			emitAttachments(state, detachments);
			emitAttachments(state, attachments);
		});
	};
	const node = listPAPI.create(
		container.pageComponentUniqueId,
		componentAtIndex,
		enqueueComponent,
		componentAtIndexes,
	);
	listState = {
		hostId: record.handle.id,
		node,
		componentAtIndex,
		componentAtIndexes,
		enqueueComponent,
		items: Object.freeze([]),
		cellsBySign: new Map(),
		attachedByItem: new Map(),
		retainedByItem: new Map(),
		recyclePools: new Map(),
		createdCells: 0,
		reusedCells: 0,
		enterCount: 0,
		leaveCount: 0,
		disposed: false,
	};
	state.lists.set(record.handle.id, listState);
	const initialItems = listItems((id) => state.records.get(id), record.handle.id);
	listState.items = initialItems;
	const initialUpdate = planLynxListUpdate([], initialItems);
	if (hasListUpdate(initialUpdate))
		state.papi.setAttribute(node, 'update-list-info', initialUpdate);
	return node;
}

function applyListUpdate<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	update: LynxPreparedListUpdate,
): void {
	const list = state.lists.get(update.hostId);
	if (list === undefined) {
		if (!state.records.has(update.hostId) || state.records.get(update.hostId)?.node === null)
			return;
		throw hostError(`<list> ${update.hostId} has no native list state.`);
	}
	if (sameListItems(list.items, update.next)) return;
	list.items = update.next;
	const nextById = new Map<number, LynxListItemDescriptor>();
	for (const item of update.next) nextById.set(item.id, item);
	for (const cell of list.attachedByItem.values()) {
		const item = cell.logicalItemId === null ? undefined : nextById.get(cell.logicalItemId);
		if (item !== undefined) cell.item = item;
	}
	for (const [itemId, cell] of list.retainedByItem) {
		const item = nextById.get(itemId);
		if (item !== undefined) cell.item = item;
	}
	for (const cell of list.cellsBySign.values()) {
		if (!cell.awaitingEnqueue) continue;
		const item = nextById.get(cell.tree.logicalId);
		if (item !== undefined) cell.item = item;
		else destroyListCell(state, list, cell);
	}
	// Pooled cells retain the metadata that selected their partition. Rekey
	// cells whose logical item is still live, and destroy cells whose item was
	// removed or became explicitly non-recyclable.
	const pooledCells: LynxPhysicalListCell<Node>[] = [];
	for (const pool of list.recyclePools.values()) pooledCells.push(...pool);
	list.recyclePools.clear();
	for (const cell of pooledCells) {
		const item = nextById.get(cell.tree.logicalId);
		if (item === undefined) {
			destroyListCell(state, list, cell);
			continue;
		}
		cell.item = item;
		if (cell.item.recyclable) poolListCell(list, cell);
		else destroyListCell(state, list, cell);
	}
	const listPAPI = state.papi.list!;
	listPAPI.updateCallbacks(
		list.node,
		list.componentAtIndex,
		list.enqueueComponent,
		list.componentAtIndexes,
	);
	if (hasListUpdate(update.update)) {
		state.papi.setAttribute(list.node, 'update-list-info', update.update);
	}
}

export function createLynxHostContainer<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	options: CreateLynxHostContainerOptions<Node>,
): LynxHostContainer<Node> {
	assertSafeId(options.root, 'root');
	const componentId = options.componentId ?? String(options.root);
	if (componentId.length === 0) throw hostError('componentId must be a non-empty string.');
	const cssId = options.cssId ?? 0;
	if (!Number.isSafeInteger(cssId)) throw hostError('cssId must be a safe integer.');
	const page = options.page ?? papi.createPage(componentId, cssId);
	const pageComponentUniqueId = papi.getUniqueId(page);
	if (!Number.isSafeInteger(pageComponentUniqueId)) {
		throw hostError('Element PAPI returned an invalid page component unique ID.');
	}
	const state: LynxHostState<Node> = {
		papi,
		worklets: options.worklets,
		records: new Map(),
		rootChildren: [],
		generations: new Map(),
		implicitInitialGenerations: false,
		teardownRecords: null,
		portalRoot: null,
		portalChildren: new Map(),
		ownedNodes: new Set(),
		ownedPageRoots: new Set(),
		nativeEvents: new Map(),
		mainThreadRefs: new Map(),
		mainThreadRefOwners: new Map(),
		lists: new Map(),
		onAttachments: options.onAttachments,
		onCallbackFault: options.onCallbackFault,
		hasMainThreadProps: false,
		hasNativeListTopology: false,
		acceptedVersion: 0,
		disposed: false,
		disposing: false,
		faulted: false,
		applying: false,
		cleanupNeedsFlush: false,
		firstTree: null,
	};
	return Object.freeze({
		renderer: LYNX_RENDERER_ID,
		root: options.root,
		page,
		pageComponentUniqueId,
		get acceptedVersion() {
			return state.acceptedVersion;
		},
		get instanceCount() {
			return state.records.size;
		},
		get disposed() {
			return state.disposed;
		},
		[LYNX_HOST_STATE]: state,
	});
}

interface SnapshotValuePairs {
	readonly firstToSecond: WeakMap<object, object>;
	readonly secondToFirst: WeakMap<object, object>;
}

function sameSnapshotValueWithPairs(
	first: unknown,
	second: unknown,
	pairs: SnapshotValuePairs,
): boolean {
	if (Object.is(first, second)) return true;
	if (Array.isArray(first)) {
		if (!Array.isArray(second) || first.length !== second.length) return false;
		const pairedSecond = pairs.firstToSecond.get(first);
		if (pairedSecond !== undefined) return pairedSecond === second;
		const pairedFirst = pairs.secondToFirst.get(second);
		if (pairedFirst !== undefined) return pairedFirst === first;
		pairs.firstToSecond.set(first, second);
		pairs.secondToFirst.set(second, first);
		for (let index = 0; index < first.length; index++) {
			if (!sameSnapshotValueWithPairs(first[index], second[index], pairs)) return false;
		}
		return true;
	}
	if (
		first === null ||
		second === null ||
		typeof first !== 'object' ||
		typeof second !== 'object' ||
		Array.isArray(second)
	) {
		return false;
	}
	const pairedSecond = pairs.firstToSecond.get(first);
	if (pairedSecond !== undefined) return pairedSecond === second;
	const pairedFirst = pairs.secondToFirst.get(second);
	if (pairedFirst !== undefined) return pairedFirst === first;
	pairs.firstToSecond.set(first, second);
	pairs.secondToFirst.set(second, first);
	const firstKeys = Object.keys(first).sort();
	const secondKeys = Object.keys(second).sort();
	if (firstKeys.length !== secondKeys.length) return false;
	for (let index = 0; index < firstKeys.length; index++) {
		const key = firstKeys[index]!;
		if (
			key !== secondKeys[index] ||
			!sameSnapshotValueWithPairs(
				(first as Record<string, unknown>)[key],
				(second as Record<string, unknown>)[key],
				pairs,
			)
		) {
			return false;
		}
	}
	return true;
}

function sameSnapshotValue(first: unknown, second: unknown): boolean {
	if (Object.is(first, second)) return true;
	return sameSnapshotValueWithPairs(first, second, {
		firstToSecond: new WeakMap(),
		secondToFirst: new WeakMap(),
	});
}

/** First-screen and background graphs assign different local execution tokens. */
function sameAdoptableSnapshotValueWithPairs(
	first: unknown,
	second: unknown,
	pairs: SnapshotValuePairs,
): boolean {
	if (Object.is(first, second)) return true;
	if (
		first === null ||
		second === null ||
		typeof first !== 'object' ||
		typeof second !== 'object'
	) {
		return false;
	}
	const pairedSecond = pairs.firstToSecond.get(first);
	if (pairedSecond !== undefined) return pairedSecond === second;
	const pairedFirst = pairs.secondToFirst.get(second);
	if (pairedFirst !== undefined) return pairedFirst === first;
	pairs.firstToSecond.set(first, second);
	pairs.secondToFirst.set(second, first);
	if (Array.isArray(first) || Array.isArray(second)) {
		if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length)
			return false;
		for (let index = 0; index < first.length; index++) {
			if (!sameAdoptableSnapshotValueWithPairs(first[index], second[index], pairs)) return false;
		}
		return true;
	}
	const firstRecord = first as Record<string, unknown>;
	const secondRecord = second as Record<string, unknown>;
	const backgroundHandle =
		typeof firstRecord._jsFnId === 'string' && typeof secondRecord._jsFnId === 'string';
	const firstNames = Object.keys(firstRecord)
		.filter((name) => !backgroundHandle || name !== '_execId')
		.sort();
	const secondNames = Object.keys(secondRecord)
		.filter((name) => !backgroundHandle || name !== '_execId')
		.sort();
	if (firstNames.length !== secondNames.length) return false;
	for (let index = 0; index < firstNames.length; index++) {
		const name = firstNames[index]!;
		if (
			name !== secondNames[index] ||
			!sameAdoptableSnapshotValueWithPairs(firstRecord[name], secondRecord[name], pairs)
		) {
			return false;
		}
	}
	return true;
}

function sameAdoptableSnapshotValue(first: unknown, second: unknown): boolean {
	if (Object.is(first, second)) return true;
	return sameAdoptableSnapshotValueWithPairs(first, second, {
		firstToSecond: new WeakMap(),
		secondToFirst: new WeakMap(),
	});
}

function sameIds(first: readonly number[], second: readonly number[]): boolean {
	if (first.length !== second.length) return false;
	for (let index = 0; index < first.length; index++) {
		if (first[index] !== second[index]) return false;
	}
	return true;
}

interface FirstTreeSnapshotCloneState {
	readonly active: Set<object>;
	readonly clones: Map<object, UniversalSerializableValue>;
}

function snapshotFirstTreeValue(
	value: UniversalSerializableValue,
	state: FirstTreeSnapshotCloneState,
): UniversalSerializableValue {
	if (value === null || typeof value !== 'object') return value;
	if (state.active.has(value)) throw hostError('first-tree props cannot contain cycles.');
	const existing = state.clones.get(value);
	if (existing !== undefined) return existing;
	state.active.add(value);
	try {
		if (Array.isArray(value)) {
			const output: UniversalSerializableValue[] = [];
			state.clones.set(value, output);
			for (const entry of value) output.push(snapshotFirstTreeValue(entry, state));
			return Object.freeze(output);
		}
		const output: Record<string, UniversalSerializableValue> = {};
		state.clones.set(value, output);
		for (const key of Object.keys(value)) {
			const entry = snapshotFirstTreeValue(
				(value as Readonly<Record<string, UniversalSerializableValue>>)[key]!,
				state,
			);
			if (key === '__proto__') {
				Object.defineProperty(output, key, {
					configurable: false,
					enumerable: true,
					value: entry,
					writable: false,
				});
			} else {
				output[key] = entry;
			}
		}
		return Object.freeze(output);
	} finally {
		state.active.delete(value);
	}
}

function snapshotFirstTreeProps(
	props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, UniversalSerializableValue>> {
	return snapshotFirstTreeValue(props as Readonly<Record<string, UniversalSerializableValue>>, {
		active: new Set(),
		clones: new Map(),
	}) as Readonly<Record<string, UniversalSerializableValue>>;
}

function mismatch(
	firstTree: LynxFirstTree,
	path: string,
	message: string,
): LynxFirstTreeMismatchError {
	return new LynxFirstTreeMismatchError(path, message, firstTree.snapshot.plan);
}

function firstTreeOwner<Node extends LynxElementRef>(
	firstTree: LynxFirstTree<Node>,
): LynxHostContainer<Node> {
	if (firstTree === null || typeof firstTree !== 'object') {
		throw hostError('firstTree must be a captured Lynx first tree.');
	}
	const journal = firstTree[LYNX_FIRST_TREE_STATE];
	if (journal === undefined || journal.status !== 'available') {
		throw hostError('firstTree is no longer available for adoption.');
	}
	const owner = journal.owner;
	if (
		owner === null ||
		typeof owner !== 'object' ||
		!(LYNX_HOST_STATE in owner) ||
		(owner as LynxHostContainer<Node>).renderer !== LYNX_RENDERER_ID
	) {
		throw hostError('firstTree has no valid Lynx host owner.');
	}
	const source = owner as LynxHostContainer<Node>;
	if (source[LYNX_HOST_STATE].firstTree !== firstTree) {
		throw hostError('firstTree is not the current journal for its Lynx host owner.');
	}
	return source;
}

/**
 * Freeze the accepted main-runtime tree into a clone-safe description while
 * retaining PAPI references in a single-consumer, main-local journal.
 *
 * Returns `null` when the tree is well-formed but holds a composition the
 * background cannot adopt, which is a property of the rendered page rather than
 * a defect in the host. Every genuine capture fault still throws, so a caller
 * can retire an unadoptable first screen quietly and still surface a broken
 * host. A native `<list>` is the one such composition today: the platform
 * materializes its rows through the `componentAtIndex`/`enqueueComponent`
 * callbacks created for `listPAPI.create`, and it owns the resulting cell state.
 * Those callbacks are per-instance closures with no cross-thread handle space, so
 * a described tree has nothing to hand over. That is a limit of this design, not
 * an inherent one — a list can cross such a boundary when the callbacks stay
 * host-local and only a descriptor keyed by a stable id travels.
 *
 * The portal guards below keep throwing rather than joining this channel because
 * they are unreachable from the first-screen path: the main renderer rejects a
 * portal while rendering, long before a host container exists. They defend only
 * a direct call to this function, where a fault is the right report.
 */
export function captureLynxFirstTree<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	options: CaptureLynxFirstTreeOptions = {},
): LynxFirstTree<Node> | null {
	const state = container[LYNX_HOST_STATE];
	if (state.disposed || state.disposing || state.faulted || state.applying) {
		throw hostError('first tree can only be captured from a stable accepted root.');
	}
	if (state.firstTree !== null) throw hostError('the root already owns a first-tree journal.');
	if (state.acceptedVersion === 0)
		throw hostError('cannot capture a first tree before a batch is accepted.');
	if (
		options.plan !== undefined &&
		(typeof options.plan !== 'string' || options.plan.length === 0)
	) {
		throw hostError('first-tree plan must be a non-empty string when provided.');
	}
	if (state.lists.size !== 0) return null;
	if (state.portalChildren.size !== 0) {
		throw hostError('portals cannot be captured before background adoption.');
	}
	const eventsByToken = new Map<string, LynxResolvedFirstTreeEvent>();
	const nodes: LynxFirstTreeNodeSnapshot[] = [];
	const ids = [...state.records.keys()].sort((first, second) => first - second);
	for (const id of ids) {
		const record = state.records.get(id)!;
		if (record.node === null || record.parent === undefined) {
			throw hostError(`first-tree host ${id} must own an attached physical node.`);
		}
		if (isPortalParent(record.parent)) {
			throw hostError('portals cannot be captured before background adoption.');
		}
		// A `<list>` whose native state was never materialized is still a list the
		// background cannot adopt.
		if (record.type === 'list') return null;
		if (!state.ownedNodes.has(record.node)) {
			throw hostError(`first-tree host ${id} is missing from the physical ownership journal.`);
		}
		const nativeId = state.papi.getUniqueId(record.node);
		assertSafeId(nativeId, `first-tree host ${id} native ID`);
		const events: LynxFirstTreeEventSnapshot[] = [];
		const eventEntries = [...record.events].sort(([first], [second]) =>
			first < second ? -1 : first > second ? 1 : 0,
		);
		for (const [type, descriptor] of eventEntries) {
			const event = Object.freeze({
				host: id,
				generation: record.handle.generation,
				type,
				listener: descriptor.id,
				priority: descriptor.priority,
			});
			events.push(event);
			const registration = state.nativeEvents.get(record.node)?.get(type);
			if (record.visible) {
				if (registration?.source !== 'background') {
					throw hostError(`first-tree host ${id} is missing native event ${JSON.stringify(type)}.`);
				}
				eventsByToken.set(registration.listener, event);
			} else if (registration !== undefined) {
				throw hostError(
					`hidden first-tree host ${id} retains native event ${JSON.stringify(type)}.`,
				);
			}
		}
		const mainThreadPatch = planLynxHostPropPatch(record.type, {}, record.props);
		for (const event of mainThreadPatch.mainThreadEvents) {
			if (event.value === null) continue;
			const registration = state.nativeEvents.get(record.node)?.get(event.binding.prop);
			if (
				record.visible &&
				(registration?.source !== 'main-thread' ||
					!sameSnapshotValue(registration.descriptor, event.value))
			) {
				throw hostError(
					`first-tree host ${id} is missing main-thread event ${JSON.stringify(event.binding.prop)}.`,
				);
			}
			if (!record.visible && registration !== undefined) {
				throw hostError(
					`hidden first-tree host ${id} retains main-thread event ${JSON.stringify(event.binding.prop)}.`,
				);
			}
		}
		const expectedRef = mainThreadPatch.mainThreadRef?.value ?? null;
		const mountedRef = state.mainThreadRefs.get(record.node) ?? null;
		if (
			(record.visible && !sameSnapshotValue(expectedRef, mountedRef)) ||
			(!record.visible && mountedRef !== null)
		) {
			throw hostError(`first-tree host ${id} has inconsistent main-thread ref ownership.`);
		}
		nodes.push(
			Object.freeze({
				id,
				nativeId,
				type: record.type,
				generation: record.handle.generation,
				parent: record.parent,
				children: Object.freeze([...record.children]),
				props: snapshotFirstTreeProps(record.props),
				visible: record.visible,
				events: Object.freeze(events),
			}),
		);
	}
	if (state.ownedNodes.size !== state.records.size) {
		throw hostError('first-tree physical ownership contains untracked nodes.');
	}
	if (state.ownedPageRoots.size !== state.rootChildren.length) {
		throw hostError('first-tree page-root ownership does not match logical roots.');
	}
	for (const id of state.rootChildren) {
		const node = state.records.get(id)?.node;
		if (node === null || node === undefined || !state.ownedPageRoots.has(node)) {
			throw hostError(`first-tree root ${id} is missing from page-root ownership.`);
		}
	}
	const snapshot: LynxFirstTreeSnapshot = Object.freeze({
		format: 1,
		renderer: LYNX_RENDERER_ID,
		root: container.root,
		version: state.acceptedVersion,
		plan: options.plan ?? null,
		roots: Object.freeze([...state.rootChildren]),
		nodes: Object.freeze(nodes),
	});
	const firstTree = createLynxFirstTree<Node>(snapshot, container, eventsByToken);
	state.firstTree = firstTree;
	return firstTree;
}

function compareFirstTree<Node extends LynxElementRef>(
	target: LynxHostContainer<Node>,
	batch: UniversalHostBatch,
	firstTree: LynxFirstTree<Node>,
	source: LynxHostContainer<Node>,
	finalIds: ReadonlySet<number>,
	finalRoots: readonly number[],
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	operations: readonly LynxApplyOperation<Node>[],
	listUpdates: readonly LynxPreparedListUpdate[],
): LynxFirstTreeMismatchError | null {
	const snapshot = firstTree.snapshot;
	const targetState = target[LYNX_HOST_STATE];
	const sourceState = source[LYNX_HOST_STATE];
	if (snapshot.format !== 1 || snapshot.renderer !== LYNX_RENDERER_ID) {
		return mismatch(
			firstTree,
			'snapshot.format',
			'the snapshot format or renderer is unsupported.',
		);
	}
	if (snapshot.root !== target.root || source.root !== target.root) {
		return mismatch(firstTree, 'snapshot.root', 'the captured and background root IDs differ.');
	}
	if (source.page !== target.page) {
		return mismatch(
			firstTree,
			'snapshot.page',
			'the captured and background page references differ.',
		);
	}
	let sourceHasMainThreadEvents = false;
	for (const events of sourceState.nativeEvents.values()) {
		if ([...events.values()].some((registration) => registration.source === 'main-thread')) {
			sourceHasMainThreadEvents = true;
			break;
		}
	}
	if (
		(sourceHasMainThreadEvents || sourceState.mainThreadRefs.size !== 0) &&
		sourceState.worklets !== targetState.worklets
	) {
		return mismatch(
			firstTree,
			'snapshot.worklets',
			'the captured and background roots use different main-thread worklet registries.',
		);
	}
	if (snapshot.version !== batch.version || sourceState.acceptedVersion !== snapshot.version) {
		return mismatch(
			firstTree,
			'snapshot.version',
			'the captured and background batch versions differ.',
		);
	}
	if (
		sourceState.disposed ||
		sourceState.disposing ||
		sourceState.faulted ||
		sourceState.applying
	) {
		return mismatch(firstTree, 'snapshot.owner', 'the captured host owner is not stable.');
	}
	if (sourceState.lists.size !== 0 || listUpdates.length !== 0) {
		return mismatch(firstTree, 'snapshot.nodes', 'native list materializations require repair.');
	}
	for (let index = 0; index < operations.length; index++) {
		const operation = operations[index]!;
		if (
			operation.op !== 'create' &&
			operation.op !== 'mount-template' &&
			operation.op !== 'insert' &&
			operation.op !== 'event' &&
			operation.op !== 'visibility'
		) {
			return mismatch(
				firstTree,
				`batch.operations[${index}]`,
				`initial adoption cannot replay a ${operation.op} operation.`,
			);
		}
	}
	if (snapshot.nodes.length !== finalIds.size || sourceState.records.size !== finalIds.size) {
		return mismatch(firstTree, 'snapshot.nodes', 'the host counts differ.');
	}
	if (!sameIds(snapshot.roots, finalRoots)) {
		return mismatch(firstTree, 'snapshot.roots', 'the root child order differs.');
	}
	const snapshotsById = new Map(snapshot.nodes.map((node) => [node.id, node]));
	for (const id of [...finalIds].sort((first, second) => first - second)) {
		const captured = snapshotsById.get(id);
		const next = getRecord(id);
		const sourceRecord = sourceState.records.get(id);
		if (captured === undefined || next === undefined || sourceRecord === undefined) {
			return mismatch(firstTree, `snapshot.nodes[${id}]`, 'the logical host identity differs.');
		}
		if (captured.type !== next.type || sourceRecord.type !== captured.type) {
			return mismatch(firstTree, `snapshot.nodes[${id}].type`, 'the host type differs.');
		}
		if (
			captured.generation !== next.handle.generation ||
			sourceRecord.handle.generation !== captured.generation
		) {
			return mismatch(
				firstTree,
				`snapshot.nodes[${id}].generation`,
				'the host generation differs.',
			);
		}
		if (captured.parent !== next.parent || sourceRecord.parent !== captured.parent) {
			return mismatch(firstTree, `snapshot.nodes[${id}].parent`, 'the host parent differs.');
		}
		if (
			!sameIds(captured.children, next.children) ||
			!sameIds(captured.children, sourceRecord.children)
		) {
			return mismatch(firstTree, `snapshot.nodes[${id}].children`, 'the child order differs.');
		}
		if (captured.visible !== next.visible || sourceRecord.visible !== captured.visible) {
			return mismatch(firstTree, `snapshot.nodes[${id}].visible`, 'the visibility state differs.');
		}
		if (
			!sameAdoptableSnapshotValue(captured.props, next.props) ||
			!sameSnapshotValue(captured.props, sourceRecord.props)
		) {
			return mismatch(firstTree, `snapshot.nodes[${id}].props`, 'the host props differ.');
		}
		if (
			sourceRecord.node === null ||
			sourceState.papi.getUniqueId(sourceRecord.node) !== captured.nativeId
		) {
			return mismatch(
				firstTree,
				`snapshot.nodes[${id}].nativeId`,
				'the physical node identity changed.',
			);
		}
		const physicalParent =
			captured.parent === null ? source.page : sourceState.records.get(captured.parent)?.node;
		if (physicalParent == null || !sourceState.papi.isChild(physicalParent, sourceRecord.node)) {
			return mismatch(firstTree, `snapshot.nodes[${id}].parent`, 'the physical parent changed.');
		}
		const nextEvents = [...next.events].sort(([first], [second]) =>
			first < second ? -1 : first > second ? 1 : 0,
		);
		const sourceEvents = [...sourceRecord.events].sort(([first], [second]) =>
			first < second ? -1 : first > second ? 1 : 0,
		);
		if (
			captured.events.length !== nextEvents.length ||
			captured.events.length !== sourceEvents.length
		) {
			return mismatch(
				firstTree,
				`snapshot.nodes[${id}].events`,
				'the event binding count differs.',
			);
		}
		for (let index = 0; index < captured.events.length; index++) {
			const event = captured.events[index]!;
			const nextEntry = nextEvents[index]!;
			const sourceEntry = sourceEvents[index]!;
			if (
				event.host !== id ||
				event.generation !== captured.generation ||
				event.type !== nextEntry[0] ||
				event.type !== sourceEntry[0] ||
				event.priority !== nextEntry[1].priority ||
				event.listener !== sourceEntry[1].id ||
				event.priority !== sourceEntry[1].priority
			) {
				return mismatch(
					firstTree,
					`snapshot.nodes[${id}].events[${index}]`,
					'the event binding differs.',
				);
			}
		}
	}
	return null;
}

function transferFirstTree<Node extends LynxElementRef>(
	target: LynxHostContainer<Node>,
	firstTree: LynxFirstTree<Node>,
	source: LynxHostContainer<Node>,
	activeNodes: Map<number, Node>,
): void {
	const targetState = target[LYNX_HOST_STATE];
	const sourceState = source[LYNX_HOST_STATE];
	for (const [id, targetRecord] of targetState.records) {
		const sourceRecord = sourceState.records.get(id);
		if (sourceRecord?.node === null || sourceRecord?.node === undefined) {
			throw hostError(`captured first-tree host ${id} lost its physical node.`);
		}
		const node = sourceRecord.node;
		targetRecord.node = node;
		activeNodes.set(id, node);
		targetState.ownedNodes.add(node);
		if (targetRecord.parent === null) targetState.ownedPageRoots.add(node);
		const nativeEvents = sourceState.nativeEvents.get(node);
		if (nativeEvents !== undefined) targetState.nativeEvents.set(node, nativeEvents);
		const mainThreadRef = sourceState.mainThreadRefs.get(node);
		if (mainThreadRef !== undefined) {
			targetState.mainThreadRefs.set(node, mainThreadRef);
			targetState.mainThreadRefOwners.set(mainThreadRef._wvid, node);
		}
	}

	// From this point the background journal is the only disposal authority.
	// Carry every native placeholder registration into that journal before the
	// background tokens below replace them. If selector/event installation faults
	// partway through adoption, terminal cleanup must still clear registrations on
	// nodes the replacement loop did not reach.
	sourceState.ownedNodes.clear();
	sourceState.ownedPageRoots.clear();
	sourceState.nativeEvents.clear();
	sourceState.mainThreadRefs.clear();
	sourceState.mainThreadRefOwners.clear();
	sourceState.records.clear();
	sourceState.teardownRecords = null;
	sourceState.rootChildren.length = 0;
	sourceState.generations.clear();
	sourceState.portalRoot = null;
	sourceState.portalChildren.clear();
	sourceState.firstTree = null;
	sourceState.cleanupNeedsFlush = false;
	sourceState.disposing = false;
	sourceState.disposed = true;
	const journal = firstTree[LYNX_FIRST_TREE_STATE];
	journal.owner = null;
	journal.status = 'transferred';
}

function prepareDenseTeardown<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	batch: UniversalHostBatch,
	state: LynxHostState<Node>,
	plan: LynxDenseTeardownPlan<Node>,
): LynxPreparedHostBatch {
	const baseVersion = state.acceptedVersion;
	const emptyListAncestryDelta = Object.freeze([]) as readonly LynxHostListAncestryDelta[];
	let handleDelta: readonly LynxHostHandleDelta[] | null = null;
	let status: 'prepared' | 'applying' | 'applied' | 'aborted' | 'faulted' = 'prepared';
	let mutationStarted = false;
	let fault: unknown;
	const materializeHandleDelta = (): readonly LynxHostHandleDelta[] => {
		if (handleDelta !== null) return handleDelta;
		const deltas: LynxHostHandleDelta[] = new Array(plan.hostCount);
		for (let offset = 0; offset < plan.hostCount; offset++) {
			const command = batch.commands[plan.eventCommands + plan.store.count + offset]!;
			if (command.op !== 'destroy') throw hostError('certified teardown order changed.');
			deltas[offset] = Object.freeze({
				op: 'destroy',
				renderer: LYNX_RENDERER_ID,
				root: container.root,
				id: command.id,
				generation: plan.store.generationAt(command.id - plan.firstId),
			});
		}
		handleDelta = Object.freeze(deltas);
		return handleDelta;
	};
	const prepared: LynxPreparedHostBatch = {
		get mutationStarted() {
			return mutationStarted;
		},
		get handleDelta() {
			return materializeHandleDelta();
		},
		listAncestryDelta: emptyListAncestryDelta,
		firstTreeAction: 'none',
		apply() {
			if (status === 'aborted' || status === 'applied') return;
			if (status === 'faulted') throw fault;
			if (status !== 'prepared') return;
			if (state.disposed || state.disposing) {
				throw hostError('cannot apply a batch while root cleanup is pending.');
			}
			if (state.firstTree !== null) {
				throw hostError('a captured first-tree root cannot apply a prepared batch.');
			}
			if (state.acceptedVersion !== baseVersion) {
				throw hostError(
					`prepared batch ${batch.version} was superseded by version ${state.acceptedVersion}.`,
				);
			}
			status = 'applying';
			state.applying = true;
			try {
				mutationStarted = true;
				state.records = plan.records;
				state.teardownRecords = null;
				state.rootChildren = plan.rootChildren;
				for (let offset = 0; offset < plan.hostCount; offset++) {
					const id = plan.firstId + offset;
					if (!state.generations.has(id)) state.generations.set(id, 1);
				}
				state.acceptedVersion = batch.version;
				let applicationFailed = false;
				let applicationError: unknown;
				try {
					for (let index = 0; index < plan.eventCommands; index++) {
						const command = batch.commands[index]!;
						if (command.op !== 'event') throw hostError('certified teardown event changed.');
						const node = plan.store.nodes[command.id - plan.firstId];
						if (node === undefined) throw hostError('certified teardown node changed.');
						removeNativeEvent(state, node, command.type);
					}
					const parent =
						plan.parent === null ? container.page : plan.records.get(plan.parent)!.node!;
					const width = plan.store.program.shape.types.length;
					for (const id of plan.acceptedChildren) {
						const offset = id - plan.firstId;
						if (offset < 0 || offset >= plan.hostCount || offset % width !== 0) continue;
						const node = plan.store.nodes[offset]!;
						state.papi.remove(parent, node);
					}
					state.ownedNodes.clear();
					for (const record of plan.records.values()) state.ownedNodes.add(record.node!);
					if (plan.parent === null) {
						state.ownedPageRoots.clear();
						for (const record of plan.records.values()) {
							if (record.parent === null) state.ownedPageRoots.add(record.node!);
						}
					}
					plan.store.clear();
				} catch (error) {
					applicationFailed = true;
					applicationError = error;
				}
				try {
					state.papi.flush(container.page);
					state.cleanupNeedsFlush = false;
				} catch (error) {
					state.cleanupNeedsFlush = true;
					if (!applicationFailed) {
						applicationFailed = true;
						applicationError = error;
					}
				}
				if (applicationFailed) throw applicationError;
				status = 'applied';
			} catch (error) {
				state.faulted = true;
				invalidateMainThreadLifetimesAfterFault(state);
				status = 'faulted';
				fault = error;
				throw error;
			} finally {
				state.applying = false;
			}
		},
		abort() {
			if (status === 'prepared') status = 'aborted';
		},
	};
	return Object.freeze(prepared);
}

export function prepareLynxHostBatch<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	batch: UniversalHostBatch,
	options?: PrepareLynxHostBatchOptions<Node>,
): LynxPreparedHostBatch {
	const state = container[LYNX_HOST_STATE];
	if (state.disposed) throw hostError('cannot prepare a batch for a disposed root.');
	if (state.disposing) throw hostError('cannot prepare a batch while root cleanup is pending.');
	if (state.firstTree !== null) {
		throw hostError('a captured first-tree root cannot accept another batch.');
	}
	if (container.renderer !== LYNX_RENDERER_ID || batch.renderer !== LYNX_RENDERER_ID) {
		throw hostError(
			`renderer mismatch: expected ${JSON.stringify(LYNX_RENDERER_ID)}, received ${JSON.stringify(batch.renderer)}.`,
		);
	}
	assertSafeId(batch.version, 'batch.version');
	if (batch.version <= state.acceptedVersion) {
		throw hostError(
			`stale batch version ${batch.version}; accepted version is ${state.acceptedVersion}.`,
		);
	}
	if (!Array.isArray(batch.commands)) throw hostError('batch.commands must be an array.');
	if (options?.onMismatch !== undefined && typeof options.onMismatch !== 'function') {
		throw hostError('onMismatch must be a function when provided.');
	}
	const firstTree = options?.firstTree;
	let firstTreeSource: LynxHostContainer<Node> | null = null;
	if (firstTree !== undefined) {
		if (
			state.acceptedVersion !== 0 ||
			state.records.size !== 0 ||
			state.generations.size !== 0 ||
			state.ownedNodes.size !== 0 ||
			state.ownedPageRoots.size !== 0 ||
			state.nativeEvents.size !== 0 ||
			state.mainThreadRefs.size !== 0 ||
			state.mainThreadRefOwners.size !== 0 ||
			state.lists.size !== 0 ||
			state.portalRoot !== null ||
			state.portalChildren.size !== 0
		) {
			throw hostError('firstTree may only be prepared against an empty background root.');
		}
		firstTreeSource = firstTreeOwner(firstTree);
		if (firstTreeSource === container) {
			throw hostError('firstTree must be adopted by a different Lynx host container.');
		}
	}
	const logicalTeardown = state.faulted;
	if (
		logicalTeardown &&
		!batch.commands.every(
			(command) =>
				command !== null &&
				typeof command === 'object' &&
				(command.op === 'remove' ||
					command.op === 'destroy' ||
					(command.op === 'event' && command.listener === null)),
		)
	) {
		throw hostError(
			'after a host fault, only listener removal and remove/destroy teardown commands are accepted.',
		);
	}
	if (!logicalTeardown && firstTree === undefined) {
		const teardownStore =
			state.records instanceof LynxDenseHostRecordStore ? state.records : state.teardownRecords;
		const denseTeardown = teardownStore?.prepareFullTeardown(state, batch) ?? null;
		if (denseTeardown !== null) {
			return prepareDenseTeardown(container, batch, state, denseTeardown);
		}
	}

	const baseVersion = state.acceptedVersion;
	const initiallyEmpty = state.records.size === 0;
	// Preparation is a hot commit path. Stage only records and generation entries
	// touched by this batch; the accepted maps remain unchanged until apply().
	let stagedRecords: LynxHostRecordStore<Node> = new Map<number, LynxHostRecord<Node>>();
	let acceptedDenseRecords: LynxDenseHostRecordStore<Node> | null = null;
	let acceptedTeardownRecords: LynxDenseHostRecordStore<Node> | null = null;
	const deletedRecords = new Set<number>();
	const stagedGenerations = new Map<number, number>();
	const initiallyNoGenerations = state.generations.size === 0;
	const acceptedLazyPublicInstances =
		options?.lazyPublicInstances === true &&
		!initiallyEmpty &&
		firstTree === undefined &&
		!state.hasMainThreadProps &&
		!state.hasNativeListTopology &&
		state.portalRoot === null &&
		state.portalChildren.size === 0 &&
		batch.commands.every(
			(command) =>
				command !== null &&
				typeof command === 'object' &&
				(command.op === 'mount-template-range' || command.op === 'mount-template-run'),
		);
	const incrementalCompactCandidate =
		options?.compact === true &&
		options.incrementalCompact === true &&
		acceptedLazyPublicInstances &&
		!state.implicitInitialGenerations &&
		state.records instanceof Map &&
		batch.commands.length === 1 &&
		batch.commands[0]?.op === 'mount-template-run';
	const teardownMirrorCandidate =
		options?.compact === true &&
		options.incrementalCompact === true &&
		acceptedLazyPublicInstances &&
		state.records instanceof Map &&
		batch.commands.length === 1 &&
		batch.commands[0]?.op === 'mount-template-run';
	let compactCandidate =
		options?.compact === true &&
		firstTree === undefined &&
		!state.hasMainThreadProps &&
		!state.hasNativeListTopology &&
		((initiallyEmpty && initiallyNoGenerations) || incrementalCompactCandidate);
	let compactCreated = 0;
	let compactInserted = 0;
	let sparseCompactNodes = compactCandidate;
	let sawCompactRange = false;
	let stagedPortalChildren: Map<string, LynxPortalChildren> | null = null;
	const readStagedPortalChildren = (): Map<string, LynxPortalChildren> | null =>
		stagedPortalChildren;
	let stagedPortalRoot = state.portalRoot;
	const initialNodes = new Map<number, Node>();
	let stagedRootChildren: number[] | null = null;
	let stagedRecordCount = state.records.size;
	let hasMainThreadProps = state.hasMainThreadProps;
	let hasNativeListTopology = state.hasNativeListTopology;
	const getRecord = initiallyEmpty
		? (id: number): LynxHostRecord<Node> | undefined => stagedRecords.get(id)
		: (id: number): LynxHostRecord<Node> | undefined => {
				if (deletedRecords.has(id)) return undefined;
				return stagedRecords.get(id) ?? state.records.get(id);
			};
	const writeRecord = initiallyEmpty
		? (id: number): LynxHostRecord<Node> | undefined => stagedRecords.get(id)
		: (id: number): LynxHostRecord<Node> | undefined => {
				if (deletedRecords.has(id)) return undefined;
				const staged = stagedRecords.get(id);
				if (staged !== undefined) {
					if (acceptedDenseRecords !== null && staged === state.records.get(id)) {
						const clone = cloneRecord(staged);
						stagedRecords.set(id, clone);
						return clone;
					}
					return staged;
				}
				const accepted = state.records.get(id);
				if (accepted === undefined) return undefined;
				const clone = cloneRecord(accepted);
				stagedRecords.set(id, clone);
				return clone;
			};
	const deleteRecord = (id: number): void => {
		stagedRecordCount -= 1;
		stagedRecords.delete(id);
		deletedRecords.add(id);
	};
	const getGeneration = state.implicitInitialGenerations
		? (id: number): number | undefined =>
				stagedGenerations.get(id) ??
				state.generations.get(id) ??
				state.records.get(id)?.handle.generation
		: initiallyNoGenerations
			? (id: number): number | undefined => stagedGenerations.get(id)
			: (id: number): number | undefined => stagedGenerations.get(id) ?? state.generations.get(id);
	const setGeneration = (id: number, generation: number): void => {
		if (compactCandidate && generation === 1) return;
		stagedGenerations.set(id, generation);
	};
	const rootChildrenForWrite = (): number[] => {
		if (stagedRootChildren === null) stagedRootChildren = [...state.rootChildren];
		return stagedRootChildren;
	};
	const portalChildrenForRead = (parent: LynxPortalParent): readonly number[] =>
		stagedPortalChildren?.get(parent.key)?.children ??
		state.portalChildren.get(parent.key)?.children ??
		[];
	const portalChildrenForWrite = (parent: LynxPortalParent): number[] => {
		let entry = stagedPortalChildren?.get(parent.key);
		if (entry !== undefined) return entry.children;
		const previous = state.portalChildren.get(parent.key);
		if (
			previous !== undefined &&
			(previous.parent.target !== parent.target ||
				previous.parent.generation !== parent.generation ||
				previous.parent.universalRoot !== parent.universalRoot)
		) {
			throw hostError('portal target identity changed without a new target handle.');
		}
		entry = {
			parent,
			children: previous === undefined ? [] : [...previous.children],
		};
		(stagedPortalChildren ??= new Map()).set(parent.key, entry);
		return entry.children;
	};
	const portalChildrenForTarget = (target: number): readonly number[] => {
		const children: number[] = [];
		const keys = new Set(state.portalChildren.keys());
		if (stagedPortalChildren !== null) {
			for (const key of stagedPortalChildren.keys()) keys.add(key);
		}
		for (const key of keys) {
			const entry = stagedPortalChildren?.get(key) ?? state.portalChildren.get(key);
			if (entry?.parent.target === target) children.push(...entry.children);
		}
		return children;
	};
	const recreatedIds = new Set<number>();
	const resolveParent = (
		value: unknown,
		label: string,
		currentParent?: LynxHostParent,
	): LynxAttachedHostParent => {
		if (value === null) return null;
		if (typeof value === 'number') {
			assertSafeId(value, label);
			return value;
		}
		if (
			!isLynxPortalTargetHandle(value) ||
			Object.keys(value).length !== 4 ||
			!['$$kind', 'renderer', 'root', 'id'].every((name) =>
				Object.prototype.hasOwnProperty.call(value, name),
			)
		) {
			throw hostError(`${label} is not a valid Lynx portal target handle.`);
		}
		const handle = value as UniversalPortalTargetHandle;
		const identity = decodeLynxPortalTargetId(handle.id)!;
		if (identity.root !== container.root) {
			throw hostError(`${label} belongs to foreign root ${identity.root}.`);
		}
		if (stagedPortalRoot === null) stagedPortalRoot = handle.root;
		else if (stagedPortalRoot !== handle.root) {
			throw hostError(`${label} belongs to a foreign universal root.`);
		}
		const accepted = state.records.get(identity.id);
		const current = getRecord(identity.id);
		const key = lynxPortalTargetKey(handle);
		const removingFromRecreatedTarget =
			isPortalParent(currentParent) && currentParent.key === key && recreatedIds.has(identity.id);
		if (
			accepted === undefined ||
			current === undefined ||
			accepted.node === null ||
			accepted.handle.root !== container.root ||
			accepted.handle.generation !== identity.generation ||
			(current.handle.generation !== identity.generation && !removingFromRecreatedTarget) ||
			!isRootConnected((id) => state.records.get(id), identity.id)
		) {
			throw hostError(
				`${label} targets stale, detached, or unacknowledged host ${identity.id}:${identity.generation}.`,
			);
		}
		if (
			accepted.type === '#text' ||
			accepted.type === 'raw-text' ||
			accepted.type === 'list' ||
			directListItem((id) => state.records.get(id), identity.id) !== null
		) {
			throw hostError(`${label} targets an unsupported text or native-list host.`);
		}
		if (removingFromRecreatedTarget) return currentParent;
		return Object.freeze({
			kind: 'portal' as const,
			key,
			universalRoot: handle.root,
			target: identity.id,
			generation: identity.generation,
		});
	};
	const childrenForRead = (parent: LynxAttachedHostParent): readonly number[] => {
		if (parent === null) return stagedRootChildren ?? state.rootChildren;
		if (isPortalParent(parent)) return portalChildrenForRead(parent);
		const record = getRecord(parent);
		if (record === undefined) throw hostError(`unknown parent ${parent}.`);
		return record.children;
	};
	const childrenForWrite = (parent: LynxAttachedHostParent): number[] => {
		if (parent === null) return rootChildrenForWrite();
		if (isPortalParent(parent)) return portalChildrenForWrite(parent);
		const record = writeRecord(parent);
		if (record === undefined) throw hostError(`unknown parent ${parent}.`);
		return hostChildrenForWrite(record);
	};
	const captureInitialNode = (id: number): void => {
		if (initiallyEmpty || initialNodes.has(id)) return;
		const node = state.records.get(id)?.node;
		if (node != null) initialNodes.set(id, node);
	};
	const capturePortalChildren = (target: number): void => {
		if (state.portalChildren.size === 0) return;
		for (const entry of state.portalChildren.values()) {
			if (entry.parent.target !== target) continue;
			for (const child of entry.children) captureInitialNode(child);
		}
	};
	let destroyedIds: Set<number> | null = null;
	const operations: LynxApplyOperation<Node>[] = [];
	const handleOrder: number[] = [];
	let touchedHandles: Set<number> | null = null;
	let listAncestryRoots: Set<number> | null = null;
	const abandonCompact = () => {
		if (!compactCandidate) return;
		compactCandidate = false;
		for (const [id, record] of stagedRecords) {
			handleOrder.push(id);
			if (!stagedGenerations.has(id)) stagedGenerations.set(id, record.handle.generation);
		}
	};
	const touchHandle = (id: number, newlyCreated = false) => {
		if (compactCandidate) return;
		if (newlyCreated && touchedHandles === null) {
			handleOrder.push(id);
			return;
		}
		touchedHandles ??= new Set(handleOrder);
		if (touchedHandles.has(id)) return;
		touchedHandles.add(id);
		handleOrder.push(id);
	};

	for (let index = 0; index < batch.commands.length; index++) {
		const command = batch.commands[index];
		if (command === null || typeof command !== 'object') {
			throw hostError(`command ${index} must be an object.`);
		}
		if (
			sawCompactRange &&
			command.op !== 'mount-template-range' &&
			command.op !== 'mount-template-run'
		) {
			sparseCompactNodes = false;
		}
		if (command.op === 'mount-template-range' || command.op === 'mount-template-run') {
			const label = `command ${index} ${command.op}`;
			const program = prepareTemplateProgram(command.program, label);
			const shape = program.shape;
			const count = command.op === 'mount-template-run' ? command.count : 1;
			assertSafeId(count, `${label}.count`);
			const hostCount = count * shape.types.length;
			assertSafeId(command.firstId, `${label}.firstId`);
			if (
				!Number.isSafeInteger(hostCount) ||
				!Number.isSafeInteger(command.firstId + (hostCount - 1))
			) {
				throw hostError(`${label}.firstId exceeds the host identity range.`);
			}
			const valueCount = count * program.valueCount;
			if (
				!Number.isSafeInteger(valueCount) ||
				!Array.isArray(command.values) ||
				command.values.length !== valueCount
			) {
				throw hostError(`${label}.values must match the program's scalar binding count.`);
			}
			for (let valueIndex = 0; valueIndex < command.values.length; valueIndex++) {
				const value = command.values[valueIndex];
				if (
					value !== null &&
					value !== undefined &&
					typeof value !== 'string' &&
					typeof value !== 'number' &&
					typeof value !== 'boolean' &&
					typeof value !== 'bigint'
				) {
					throw hostError(`${label}.values[${valueIndex}] must be a scalar.`);
				}
			}
			if (program.eventCount === 0) {
				if (command.firstListenerId !== null) {
					throw hostError(`${label}.firstListenerId must be null without event sites.`);
				}
			} else {
				assertSafeId(command.firstListenerId, `${label}.firstListenerId`);
				const eventCount = count * program.eventCount;
				if (
					!Number.isSafeInteger(eventCount) ||
					!Number.isSafeInteger(command.firstListenerId + (eventCount - 1))
				) {
					throw hostError(`${label}.firstListenerId exceeds the listener identity range.`);
				}
			}
			const parent = resolveParent(command.parent, `${label}.parent`);
			if (isPortalParent(parent)) throw hostError(`${label} cannot target a portal.`);
			if (command.before !== null) assertSafeId(command.before, `${label}.before`);
			const parentRecord = typeof parent === 'number' ? getRecord(parent) : undefined;
			if (typeof parent === 'number' && parentRecord === undefined) {
				throw hostError(`${label} references unknown parent ${parent}.`);
			}
			if (
				parentRecord instanceof LynxCompactHostRecord ||
				(command.before !== null && getRecord(command.before) instanceof LynxCompactHostRecord)
			) {
				sparseCompactNodes = false;
			}
			if (
				parentRecord?.type === 'list' ||
				(hasNativeListTopology &&
					typeof parent === 'number' &&
					directListItem(getRecord, parent) !== null)
			) {
				throw hostError(`${label} cannot target a native-list host or descendant.`);
			}
			const rootType = shape.types[0]!;
			if ((rootType === '#text' || rootType === 'raw-text') && parentRecord?.type !== 'text') {
				throw hostError(`${rootType} template host may only be placed directly under a text host.`);
			}
			if (typeof parent === 'number') captureInitialNode(parent);
			if (command.before !== null) captureInitialNode(command.before);

			const siblings = childrenForWrite(parent);
			let beforeIndex = siblings.length;
			if (command.before !== null) {
				beforeIndex = siblings.indexOf(command.before);
				if (beforeIndex === -1) {
					throw hostError(`before host ${command.before} is not a child of the requested parent.`);
				}
			}
			let denseEligible =
				command.op === 'mount-template-run' &&
				compactCandidate &&
				options?.lazyPublicInstances === true &&
				Object.isFrozen(command.values) &&
				command.before === null &&
				!sawCompactRange &&
				stagedRecords instanceof Map &&
				program.bindings.every(
					(binding, node) => binding === undefined || program.dynamicRoutes[node] !== 0,
				);
			if (denseEligible) {
				const end = command.firstId + (hostCount - 1);
				if (
					incrementalCompactCandidate &&
					(typeof parent !== 'number' || !isRootConnected((id) => state.records.get(id), parent))
				) {
					denseEligible = false;
				}
				for (const id of stagedRecords.keys()) {
					if (id >= command.firstId && id <= end) {
						denseEligible = false;
						break;
					}
				}
				if (incrementalCompactCandidate) {
					for (const id of state.generations.keys()) {
						if (id >= command.firstId && id <= end) {
							denseEligible = false;
							break;
						}
					}
				}
				for (let later = index + 1; denseEligible && later < batch.commands.length; later++) {
					const next = batch.commands[later];
					if (
						next === null ||
						typeof next !== 'object' ||
						next.op !== 'insert' ||
						(next.parent !== null && typeof next.parent !== 'number') ||
						(next.id >= command.firstId && next.id <= end) ||
						(typeof next.parent === 'number' &&
							next.parent >= command.firstId &&
							next.parent <= end) ||
						(next.before !== null && next.before >= command.firstId && next.before <= end)
					) {
						denseEligible = false;
					}
				}
			}
			if (denseEligible) {
				for (let row = 0; row < count; row++) {
					const valueOffset = row * program.valueCount;
					for (let node = 0; node < shape.types.length; node++) {
						if (program.dynamicRoutes[node] !== 1) continue;
						const binding = program.bindings[node]![0]!;
						if (typeof command.values[valueOffset + binding.valueIndex] !== 'string') {
							throw hostError(
								`${label} for #text must contain a string value and optional CSS scope.`,
							);
						}
					}
				}
				let prefix = stagedRecords as Map<number, LynxHostRecord<Node>>;
				if (incrementalCompactCandidate) {
					prefix = new Map(state.records as Map<number, LynxHostRecord<Node>>);
					for (const [id, record] of stagedRecords) prefix.set(id, record);
				}
				const dense = new LynxDenseHostRecordStore(
					prefix,
					container.root,
					program,
					command.firstId,
					count,
					parent,
					command.values,
					command.firstListenerId,
				);
				if (incrementalCompactCandidate) acceptedDenseRecords = dense;
				stagedRecords = dense;
				for (let row = 0; row < count; row++) {
					siblings.push(command.firstId + row * shape.types.length);
				}
				stagedRecordCount += hostCount;
				compactCreated += hostCount;
				compactInserted += hostCount;
				sawCompactRange = true;
				operations.push({
					op: 'mount-template',
					id: command.firstId,
					parent,
					before: command.before,
					records: [],
					patches: [],
					parents: shape.parents,
					count,
					dense,
					firstId: command.firstId,
					program,
					firstListenerId: command.firstListenerId,
					lazyPublicInstances: true,
				});
				continue;
			}
			if (incrementalCompactCandidate) abandonCompact();
			const templateRecords: LynxHostRecord<Node>[] = new Array(hostCount);
			const templatePatches: LynxHostPropPatch[] = new Array(hostCount);
			for (let rowIndex = 0; rowIndex < count; rowIndex++) {
				const rowOffset = rowIndex * shape.types.length;
				const rowFirstId = command.firstId + rowOffset;
				const rowFirstListener =
					command.firstListenerId === null
						? null
						: command.firstListenerId + rowIndex * program.eventCount;
				const valueOffset = rowIndex * program.valueCount;
				for (let nodeIndex = 0; nodeIndex < shape.types.length; nodeIndex++) {
					const recordIndex = rowOffset + nodeIndex;
					const id = rowFirstId + nodeIndex;
					if (getRecord(id) !== undefined) throw hostError(`duplicate host id ${id}.`);
					const type = shape.types[nodeIndex]!;
					const bindings = program.bindings[nodeIndex];
					let props = program.props[nodeIndex]!;
					let patch = program.patches[nodeIndex];
					if (bindings !== undefined) {
						const next = Object.create(null) as Record<string, unknown>;
						for (const name in props) next[name] = props[name];
						for (const binding of bindings) {
							next[binding.name] = command.values[valueOffset + binding.valueIndex];
						}
						props = Object.freeze(next);
						const route = program.dynamicRoutes[nodeIndex]!;
						if (route === 1) {
							if (typeof props.value !== 'string') {
								throw hostError(
									`${label} for #text must contain a string value and optional CSS scope.`,
								);
							}
							patch = EMPTY_RAW_TEXT_CREATE_PATCH;
						} else if (route === 2) {
							patch = planScalarClassAndIdCreation(props);
						} else {
							assertTextProps(type, props, label);
							patch =
								type === '#text' && props[LYNX_CSS_SCOPE_PROP] == null
									? EMPTY_RAW_TEXT_CREATE_PATCH
									: planLynxHostPropPatch(type, EMPTY_HOST_PROPS, props);
							if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
								throw hostError(`${label} host ${id} cannot contain direct main-thread props.`);
							}
						}
					}
					const generation = (getGeneration(id) ?? 0) + 1;
					setGeneration(id, generation);
					const logicalParent = nodeIndex === 0 ? parent : rowFirstId + shape.parents[nodeIndex]!;
					const events = program.events[nodeIndex];
					const record: LynxHostRecord<Node> = compactCandidate
						? events === undefined
							? new LynxCompactHostRecord(
									container.root,
									id,
									generation,
									type,
									props,
									logicalParent,
								)
							: new LynxCompactEventHostRecord(
									container.root,
									id,
									generation,
									type,
									props,
									logicalParent,
									events,
									rowFirstListener!,
								)
						: {
								node: null,
								type,
								props,
								visible: true,
								parent: logicalParent,
								children: EMPTY_HOST_CHILDREN,
								events: EMPTY_HOST_EVENTS,
								handle: createHandle(container.root, id, type, generation),
								selectorInstalled: false,
							};
					if (events !== undefined && !compactCandidate) {
						record.events = new Map();
						for (const event of events) {
							record.events.set(
								event.type,
								Object.freeze({ id: rowFirstListener! + event.index, priority: event.priority }),
							);
						}
					}
					stagedRecordCount++;
					if (deletedRecords.size !== 0) deletedRecords.delete(id);
					stagedRecords.set(id, record);
					templateRecords[recordIndex] = record;
					templatePatches[recordIndex] = patch!;
					if (nodeIndex !== 0) {
						hostChildrenForWrite(templateRecords[rowOffset + shape.parents[nodeIndex]!]!).push(id);
					}
					touchHandle(id, true);
				}
				if (command.before === null) siblings.push(rowFirstId);
				else siblings.splice(beforeIndex++, 0, rowFirstId);
			}
			let teardownDense: LynxDenseHostRecordStore<Node> | undefined;
			if (
				teardownMirrorCandidate &&
				command.op === 'mount-template-run' &&
				command.before === null &&
				!isPortalParent(parent) &&
				(typeof parent !== 'number' || isRootConnected((id) => state.records.get(id), parent))
			) {
				const prefix = new Map(state.records as Map<number, LynxHostRecord<Node>>);
				const finalId = command.firstId + hostCount - 1;
				for (const [id, record] of stagedRecords) {
					if (id < command.firstId || id > finalId) prefix.set(id, record);
				}
				teardownDense = new LynxDenseHostRecordStore(
					prefix,
					container.root,
					program,
					command.firstId,
					count,
					parent,
					command.values,
					command.firstListenerId,
					templateRecords.map((record) => record.handle.generation),
				);
				acceptedTeardownRecords = teardownDense;
			}
			operations.push({
				op: 'mount-template',
				id: command.firstId,
				parent,
				before: command.before,
				records: templateRecords,
				...(teardownDense === undefined ? null : { teardownDense }),
				patches: templatePatches,
				parents: shape.parents,
				...(count === 1 ? null : { count }),
				...(compactCandidate
					? { firstId: command.firstId, program, firstListenerId: command.firstListenerId }
					: null),
				...(options?.lazyPublicInstances === true &&
				(compactCandidate || acceptedLazyPublicInstances)
					? { lazyPublicInstances: true }
					: null),
			});
			if (compactCandidate) {
				sawCompactRange = true;
				compactCreated += templateRecords.length;
				compactInserted += templateRecords.length;
			}
		} else if (command.op === 'mount-template') {
			const label = `command ${index} mount-template`;
			const shape = prepareTemplateShape(command.shape, label);
			if (!Array.isArray(command.nodes) || command.nodes.length !== shape.types.length) {
				throw hostError(`${label}.nodes must match the template shape length.`);
			}
			const parent = resolveParent(command.parent, `${label}.parent`);
			if (isPortalParent(parent)) {
				throw hostError(`${label} cannot target a portal.`);
			}
			if (command.before !== null) assertSafeId(command.before, `${label}.before`);
			const parentRecord = typeof parent === 'number' ? getRecord(parent) : undefined;
			if (typeof parent === 'number' && parentRecord === undefined) {
				throw hostError(`${label} references unknown parent ${parent}.`);
			}
			if (
				parentRecord?.type === 'list' ||
				(hasNativeListTopology &&
					typeof parent === 'number' &&
					directListItem(getRecord, parent) !== null)
			) {
				throw hostError(`${label} cannot target a native-list host or descendant.`);
			}
			const rootType = shape.types[0]!;
			if ((rootType === '#text' || rootType === 'raw-text') && parentRecord?.type !== 'text') {
				throw hostError(`${rootType} template host may only be placed directly under a text host.`);
			}
			if (typeof parent === 'number') captureInitialNode(parent);
			if (command.before !== null) captureInitialNode(command.before);

			const templateRecords: LynxHostRecord<Node>[] = new Array(shape.types.length);
			const templatePatches: LynxHostPropPatch[] = new Array(shape.types.length);
			for (let nodeIndex = 0; nodeIndex < shape.types.length; nodeIndex++) {
				const descriptor = command.nodes[nodeIndex];
				if (descriptor === null || typeof descriptor !== 'object') {
					throw hostError(`${label}.nodes[${nodeIndex}] must be an object.`);
				}
				if (!Number.isSafeInteger(descriptor.id) || descriptor.id <= 0) {
					throw hostError(`${label}.nodes[${nodeIndex}].id must be a positive safe integer.`);
				}
				if (getRecord(descriptor.id) !== undefined) {
					throw hostError(`duplicate host id ${descriptor.id}.`);
				}
				const type = shape.types[nodeIndex]!;
				const cachedProps = prepareStaticHostProps(type, descriptor.props, label);
				const props = cachedProps?.props ?? cloneProps(descriptor.props, label);
				assertTextProps(type, props, label);
				const patch =
					cachedProps?.patch ??
					(type === '#text' && props[LYNX_CSS_SCOPE_PROP] == null
						? EMPTY_RAW_TEXT_CREATE_PATCH
						: planLynxHostPropPatch(type, EMPTY_HOST_PROPS, props));
				if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
					throw hostError(`${label}.nodes[${nodeIndex}] cannot contain direct main-thread props.`);
				}
				const generation = (getGeneration(descriptor.id) ?? 0) + 1;
				const handle = createHandle(container.root, descriptor.id, type, generation);
				setGeneration(descriptor.id, generation);
				const record: LynxHostRecord<Node> = {
					node: null,
					type,
					props,
					visible: true,
					parent: nodeIndex === 0 ? parent : templateRecords[shape.parents[nodeIndex]!]!.handle.id,
					children: EMPTY_HOST_CHILDREN,
					events: EMPTY_HOST_EVENTS,
					handle,
					selectorInstalled: false,
				};
				if (descriptor.events !== undefined) {
					if (!Array.isArray(descriptor.events)) {
						throw hostError(`${label}.nodes[${nodeIndex}].events must be an array when provided.`);
					}
					if ((type === '#text' || type === 'raw-text') && descriptor.events.length !== 0) {
						throw hostError(`raw-text host ${descriptor.id} cannot own native events.`);
					}
					for (let eventIndex = 0; eventIndex < descriptor.events.length; eventIndex++) {
						const event = descriptor.events[eventIndex];
						if (event === null || typeof event !== 'object') {
							throw hostError(
								`${label}.nodes[${nodeIndex}].events[${eventIndex}] must be an object.`,
							);
						}
						if (typeof event.type !== 'string' || event.type.length === 0) {
							throw hostError(
								`${label}.nodes[${nodeIndex}].events[${eventIndex}].type must be a non-empty string.`,
							);
						}
						if (parseLynxNativeEventProp(event.type) === null) {
							throw hostError(`event ${JSON.stringify(event.type)} is not a Lynx event prop.`);
						}
						if (event.listener === null || typeof event.listener !== 'object') {
							throw hostError(
								`${label}.nodes[${nodeIndex}].events[${eventIndex}].listener must be an object.`,
							);
						}
						if (!Number.isSafeInteger(event.listener.id) || event.listener.id <= 0) {
							throw hostError(
								`${label}.nodes[${nodeIndex}].events[${eventIndex}].listener.id must be a positive safe integer.`,
							);
						}
						const priority = event.listener.priority;
						if (priority !== 'continuous' && priority !== 'default' && priority !== 'discrete') {
							throw hostError(
								`${label}.nodes[${nodeIndex}].events[${eventIndex}] has invalid event priority.`,
							);
						}
						if (record.events === EMPTY_HOST_EVENTS) record.events = new Map();
						if (record.events.has(event.type)) {
							throw hostError(
								`${label}.nodes[${nodeIndex}] repeats native event ${JSON.stringify(event.type)}.`,
							);
						}
						record.events.set(event.type, Object.freeze({ id: event.listener.id, priority }));
					}
				}
				stagedRecordCount += 1;
				if (deletedRecords.size !== 0) deletedRecords.delete(descriptor.id);
				stagedRecords.set(descriptor.id, record);
				templateRecords[nodeIndex] = record;
				templatePatches[nodeIndex] = patch;
				if (nodeIndex !== 0) {
					hostChildrenForWrite(templateRecords[shape.parents[nodeIndex]!]!).push(descriptor.id);
				}
				touchHandle(descriptor.id, true);
			}

			const rootRecord = templateRecords[0]!;
			const siblings = childrenForWrite(parent);
			let beforeIndex = siblings.length;
			if (command.before !== null) {
				beforeIndex = siblings.indexOf(command.before);
				if (beforeIndex === -1) {
					throw hostError(`before host ${command.before} is not a child of the requested parent.`);
				}
			}
			siblings.splice(beforeIndex, 0, rootRecord.handle.id);
			operations.push({
				op: 'mount-template',
				id: rootRecord.handle.id,
				parent,
				before: command.before,
				records: templateRecords,
				patches: templatePatches,
				parents: shape.parents,
			});
			if (compactCandidate) {
				compactCreated += templateRecords.length;
				compactInserted += templateRecords.length;
			}
		} else if (command.op === 'create') {
			assertSafeId(command.id, `command ${index} create.id`);
			assertHostType(command.type, `command ${index} create.type`);
			if (command.type === 'list' || command.type === 'list-item') {
				abandonCompact();
				hasNativeListTopology = true;
			}
			if (getRecord(command.id) !== undefined) throw hostError(`duplicate host id ${command.id}.`);
			const props = cloneProps(command.props, `command ${index} create.props`);
			assertTextProps(command.type, props, `command ${index} create.props`);
			const patch =
				command.type === '#text' && props[LYNX_CSS_SCOPE_PROP] == null
					? EMPTY_RAW_TEXT_CREATE_PATCH
					: planLynxHostPropPatch(command.type, EMPTY_HOST_PROPS, props);
			if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
				abandonCompact();
				hasMainThreadProps = true;
			}
			if (compactCandidate) {
				for (const name in props) {
					if (name === 'ref' || name.startsWith('main-thread:')) {
						abandonCompact();
						break;
					}
				}
			}
			const generation = (getGeneration(command.id) ?? 0) + 1;
			const handle = createHandle(container.root, command.id, command.type, generation);
			setGeneration(command.id, generation);
			const record: LynxHostRecord<Node> = {
				node: null,
				type: command.type,
				props,
				visible: true,
				parent: undefined,
				children: EMPTY_HOST_CHILDREN,
				events: EMPTY_HOST_EVENTS,
				handle,
				selectorInstalled: false,
			};
			stagedRecordCount += 1;
			if (deletedRecords.size !== 0) deletedRecords.delete(command.id);
			stagedRecords.set(command.id, record);
			operations.push({
				op: 'create',
				id: command.id,
				type: command.type,
				props,
				patch,
				handle,
				record,
				visible: record.visible,
			});
			touchHandle(command.id, true);
			if (compactCandidate) compactCreated++;
		} else if (command.op === 'update') {
			abandonCompact();
			assertSafeId(command.id, `command ${index} update.id`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown update target ${command.id}.`);
			captureInitialNode(command.id);
			const props = cloneProps(command.props, `command ${index} update.props`);
			assertTextProps(record.type, props, `command ${index} update.props`);
			const patch = planLynxHostPropPatch(record.type, record.props, props);
			if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
				hasMainThreadProps = true;
			}
			if (patch.requiresRecreate) {
				throw hostError(`update target ${command.id} requires a recreate command.`);
			}
			operations.push({
				op: 'update',
				id: command.id,
				type: record.type,
				previous: record.props,
				next: props,
				patch,
				visible: record.visible,
			});
			record.props = props;
		} else if (command.op === 'recreate') {
			abandonCompact();
			assertSafeId(command.id, `command ${index} recreate.id`);
			assertHostType(command.type, `command ${index} recreate.type`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown recreate target ${command.id}.`);
			captureInitialNode(command.id);
			if (record.type !== command.type) {
				throw hostError(`recreate type mismatch for ${command.id}.`);
			}
			const props = cloneProps(command.props, `command ${index} recreate.props`);
			assertTextProps(command.type, props, `command ${index} recreate.props`);
			const patch =
				command.type === '#text' && props[LYNX_CSS_SCOPE_PROP] == null
					? EMPTY_RAW_TEXT_CREATE_PATCH
					: planLynxHostPropPatch(command.type, EMPTY_HOST_PROPS, props);
			if (patch.mainThreadEvents.length !== 0 || patch.mainThreadRef !== undefined) {
				hasMainThreadProps = true;
			}
			const generation = (getGeneration(command.id) ?? record.handle.generation) + 1;
			const handle = createHandle(container.root, command.id, command.type, generation);
			const recreateChildren = Object.freeze([...record.children]);
			const recreatePortalChildren = Object.freeze([...portalChildrenForTarget(command.id)]);
			for (const childId of recreateChildren) captureInitialNode(childId);
			for (const childId of recreatePortalChildren) captureInitialNode(childId);
			operations.push({
				op: 'recreate',
				id: command.id,
				type: command.type,
				props,
				parent: record.parent,
				children: recreateChildren,
				portalChildren: recreatePortalChildren,
				visible: record.visible,
				events: new Map(record.events),
				generation,
				patch,
				handle,
				record,
			});
			setGeneration(command.id, generation);
			recreatedIds.add(command.id);
			record.props = props;
			record.handle = handle;
			record.selectorInstalled = false;
			touchHandle(command.id);
		} else if (command.op === 'insert' || command.op === 'move') {
			if (command.op === 'move') abandonCompact();
			assertSafeId(command.id, `command ${index} ${command.op}.id`);
			const parent = resolveParent(command.parent, `command ${index} ${command.op}.parent`);
			if (compactCandidate && isPortalParent(parent)) abandonCompact();
			if (command.before !== null) {
				assertSafeId(command.before, `command ${index} ${command.op}.before`);
			}
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown ${command.op} target ${command.id}.`);
			if (hasNativeListTopology && state.records.has(command.id)) {
				(listAncestryRoots ??= new Set()).add(command.id);
			}
			captureInitialNode(command.id);
			const physicalParentId = parentHostId(parent);
			if (typeof physicalParentId === 'number') {
				captureInitialNode(physicalParentId);
				if (!isPortalParent(parent)) capturePortalChildren(physicalParentId);
			}
			if (command.before !== null) captureInitialNode(command.before);
			if (command.op === 'insert' && record.parent !== undefined) {
				throw hostError(`insert target ${command.id} is already attached.`);
			}
			if (command.op === 'move' && record.parent === undefined) {
				throw hostError(`move target ${command.id} is detached.`);
			}
			if (record.type === '#text' || record.type === 'raw-text') {
				const parentRecord =
					typeof physicalParentId === 'number' ? getRecord(physicalParentId) : undefined;
				if (parentRecord?.type !== 'text') {
					throw hostError(
						`${record.type} host ${command.id} may only be placed directly under a text host.`,
					);
				}
			}
			if (
				record.type === 'list-item' &&
				(typeof parent !== 'number' || getRecord(parent)?.type !== 'list')
			) {
				throw hostError(`<list-item> ${command.id} must be placed directly under a <list>.`);
			}
			// A newly attached leaf cannot contain its proposed parent. Preserve
			// the explicit self-parent diagnostic and use the full ancestry walk
			// for moves, detached subtrees, and portal-owned topology.
			if (
				command.op === 'insert' &&
				record.children.length === 0 &&
				state.portalChildren.size === 0 &&
				stagedPortalChildren === null
			) {
				if (physicalParentId === command.id) {
					throw hostError(`placement of ${command.id} would create a cycle.`);
				}
			} else {
				assertNoCycle(getRecord, command.id, parent);
			}
			const wasConnected = hasMainThreadProps && isRootConnected(getRecord, command.id);
			const previousParent = record.parent;
			if (previousParent !== undefined) {
				const previousChildren = childrenForWrite(previousParent);
				const previousIndex = previousChildren.indexOf(command.id);
				if (previousIndex === -1) {
					throw hostError(`topology is missing ${command.id} from its current parent.`);
				}
				previousChildren.splice(previousIndex, 1);
			}
			const children = childrenForWrite(parent);
			let beforeIndex = children.length;
			if (command.before !== null) {
				beforeIndex = children.indexOf(command.before);
				if (beforeIndex === -1) {
					throw hostError(`before host ${command.before} is not a child of the requested parent.`);
				}
			}
			children.splice(beforeIndex, 0, command.id);
			record.parent = parent;
			const willBeConnected = hasMainThreadProps && isRootConnected(getRecord, command.id);
			operations.push({
				op: command.op,
				id: command.id,
				parent,
				before: command.before,
				previousParent,
				wasConnected,
				willBeConnected,
			});
			if (compactCandidate) compactInserted++;
		} else if (command.op === 'remove') {
			abandonCompact();
			assertSafeId(command.id, `command ${index} remove.id`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown remove target ${command.id}.`);
			if (hasNativeListTopology && state.records.has(command.id)) {
				(listAncestryRoots ??= new Set()).add(command.id);
			}
			const parent = resolveParent(command.parent, `command ${index} remove.parent`, record.parent);
			captureInitialNode(command.id);
			const physicalParentId = parentHostId(parent);
			if (typeof physicalParentId === 'number') captureInitialNode(physicalParentId);
			if (!sameHostParent(record.parent, parent)) {
				throw hostError(`remove parent does not own host ${command.id}.`);
			}
			const children = childrenForWrite(parent);
			const childIndex = children.indexOf(command.id);
			if (childIndex === -1) throw hostError(`remove target ${command.id} is not attached.`);
			children.splice(childIndex, 1);
			record.parent = undefined;
			operations.push({ op: 'remove', id: command.id, parent });
		} else if (command.op === 'ensure-public-instance') {
			abandonCompact();
			assertSafeId(command.id, `command ${index} ensure-public-instance.id`);
			if (getRecord(command.id) === undefined) {
				throw hostError(`unknown public instance target ${command.id}.`);
			}
			captureInitialNode(command.id);
			operations.push({ op: 'ensure-public-instance', id: command.id });
		} else if (command.op === 'visibility') {
			abandonCompact();
			assertSafeId(command.id, `command ${index} visibility.id`);
			if (command.state !== 'hidden' && command.state !== 'visible') {
				throw hostError(`command ${index} has invalid visibility state.`);
			}
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown visibility target ${command.id}.`);
			captureInitialNode(command.id);
			record.visible = command.state === 'visible';
			operations.push({
				op: 'visibility',
				id: command.id,
				state: command.state,
				authoredHidden: authoredHiddenValue(record.props),
				events: new Map(record.events),
				generation: record.handle.generation,
			});
		} else if (command.op === 'event') {
			assertSafeId(command.id, `command ${index} event.id`);
			assertHostType(command.type, `command ${index} event.type`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown event target ${command.id}.`);
			if (record.type === '#text' || record.type === 'raw-text') {
				throw hostError(`raw-text host ${command.id} cannot own native events.`);
			}
			if (parseLynxNativeEventProp(command.type) === null) {
				throw hostError(`event ${JSON.stringify(command.type)} is not a Lynx event prop.`);
			}
			captureInitialNode(command.id);
			const previous = record.events.get(command.type) ?? null;
			if (command.listener === null) {
				if (record.events !== EMPTY_HOST_EVENTS) record.events.delete(command.type);
			} else {
				assertSafeId(command.listener.id, `command ${index} event.listener.id`);
				if (!['continuous', 'default', 'discrete'].includes(command.listener.priority)) {
					throw hostError(`command ${index} has invalid event priority.`);
				}
				if (record.events === EMPTY_HOST_EVENTS) record.events = new Map();
				record.events.set(
					command.type,
					Object.freeze({
						id: command.listener.id,
						priority: command.listener.priority,
					}),
				);
			}
			operations.push({
				op: 'event',
				id: command.id,
				type: command.type,
				previous,
				next: record.events.get(command.type) ?? null,
				generation: record.handle.generation,
				visible: record.visible,
			});
		} else if (command.op === 'destroy') {
			abandonCompact();
			if (destroyedIds === null) {
				destroyedIds = new Set();
				for (const candidate of batch.commands) {
					if (candidate?.op !== 'destroy') continue;
					assertSafeId(candidate.id, 'destroy.id');
					destroyedIds.add(candidate.id);
				}
			}
			assertSafeId(command.id, `command ${index} destroy.id`);
			const record = getRecord(command.id);
			if (record === undefined) throw hostError(`unknown destroy target ${command.id}.`);
			captureInitialNode(command.id);
			if (record.children.length !== 0) {
				throw hostError(`destroy target ${command.id} still owns children.`);
			}
			if (isRootConnected(getRecord, command.id)) {
				throw hostError(`destroy target ${command.id} is still attached to the page.`);
			}
			if (isPortalParent(record.parent)) {
				throw hostError(
					`destroy target ${command.id} remains attached to a surviving portal target.`,
				);
			}
			if (typeof record.parent === 'number') {
				if (!destroyedIds.has(record.parent)) {
					throw hostError(
						`destroy target ${command.id} remains attached to a surviving detached parent.`,
					);
				}
				const siblings = writeRecord(record.parent)?.children;
				const childIndex = siblings?.indexOf(command.id) ?? -1;
				if (childIndex === -1) throw hostError(`destroy topology is missing ${command.id}.`);
				siblings!.splice(childIndex, 1);
			}
			if (
				state.implicitInitialGenerations &&
				!stagedGenerations.has(command.id) &&
				!state.generations.has(command.id)
			) {
				stagedGenerations.set(command.id, record.handle.generation);
			}
			const events = new Map(record.events);
			deleteRecord(command.id);
			operations.push({ op: 'destroy', id: command.id, events });
			touchHandle(command.id);
		} else if (command.op === 'lifecycle' || command.op === 'local-callback') {
			throw hostError(`${command.op} commands are not supported by the Lynx async host.`);
		} else {
			throw hostError(`unsupported command ${JSON.stringify((command as { op?: unknown }).op)}.`);
		}
	}
	if (logicalTeardown && (stagedRecordCount !== 0 || childrenForRead(null).length !== 0)) {
		throw hostError('post-fault teardown must remove every remaining host in one batch.');
	}
	if (
		compactCandidate &&
		(compactCreated === 0 ||
			compactCreated !== compactInserted ||
			compactCreated !==
				stagedRecordCount - (acceptedDenseRecords === null ? 0 : state.records.size) ||
			hasMainThreadProps ||
			hasNativeListTopology ||
			stagedPortalRoot !== null)
	) {
		abandonCompact();
	}
	const compactHostCount = compactCandidate ? compactCreated : undefined;

	const finalIds =
		firstTree !== undefined || hasMainThreadProps || hasNativeListTopology
			? new Set<number>()
			: null;
	if (finalIds !== null) {
		for (const id of state.records.keys()) {
			if (!deletedRecords.has(id)) finalIds.add(id);
		}
		for (const id of stagedRecords.keys()) {
			if (!deletedRecords.has(id)) finalIds.add(id);
		}
	}
	let finalPortalChildren: ReadonlyMap<string, LynxPortalChildren> = state.portalChildren;
	const portalChildrenChanges = readStagedPortalChildren();
	if (portalChildrenChanges !== null) {
		const nextPortalChildren = new Map(state.portalChildren);
		for (const [key, entry] of portalChildrenChanges) {
			if (entry.children.length === 0) nextPortalChildren.delete(key);
			else nextPortalChildren.set(key, entry);
		}
		finalPortalChildren = nextPortalChildren;
	}
	for (const entry of finalPortalChildren.values()) {
		const target = getRecord(entry.parent.target);
		const acceptedTarget = state.records.get(entry.parent.target);
		if (
			target === undefined ||
			acceptedTarget === undefined ||
			acceptedTarget.node === null ||
			target.handle.generation !== entry.parent.generation ||
			acceptedTarget.handle.generation !== entry.parent.generation ||
			!isRootConnected(getRecord, entry.parent.target)
		) {
			throw hostError(
				`portal target ${entry.parent.target}:${entry.parent.generation} became stale or detached in the prepared batch.`,
			);
		}
		if (
			target.type === '#text' ||
			target.type === 'raw-text' ||
			target.type === 'list' ||
			directListItem(getRecord, entry.parent.target) !== null
		) {
			throw hostError('portal targets cannot be text hosts or native-list hosts/descendants.');
		}
		for (const childId of entry.children) {
			const child = getRecord(childId);
			if (child === undefined || !sameHostParent(child.parent, entry.parent)) {
				throw hostError(`portal topology does not own child ${childId}.`);
			}
		}
	}
	const listIds = new Set<number>();
	const finalMainThreadRefOwners = new Map<string, number>();
	if (hasNativeListTopology) {
		for (const [id, record] of state.records) {
			if (record.type === 'list') listIds.add(id);
		}
	}
	for (const id of finalIds ?? []) {
		const record = getRecord(id)!;
		assertNoMainThreadEventCollision(record.props, record.events);
		const mainThreadRef = record.props['main-thread:ref'] as
			LynxMainThreadRefDescriptor | null | undefined;
		if (mainThreadRef != null && record.visible && isRootConnected(getRecord, id)) {
			const previousOwner = finalMainThreadRefOwners.get(mainThreadRef._wvid);
			if (previousOwner !== undefined && previousOwner !== id) {
				throw hostError(
					`main-thread ref ${JSON.stringify(mainThreadRef._wvid)} is assigned to hosts ${previousOwner} and ${id}.`,
				);
			}
			finalMainThreadRefOwners.set(mainThreadRef._wvid, id);
		}
		if (record.type === 'list') listIds.add(id);
		if (record.type === 'list' && directListItem(getRecord, id) !== null) {
			throw hostError('nested <list> hosts are not supported by the initial recycling contract.');
		}
		if (
			record.type === 'list-item' &&
			record.parent !== undefined &&
			(typeof record.parent !== 'number' || getRecord(record.parent)?.type !== 'list')
		) {
			throw hostError(`<list-item> ${id} must be placed directly under a <list>.`);
		}
	}
	const listAncestryDelta: LynxHostListAncestryDelta[] = [];
	if (listAncestryRoots !== null) {
		const getAcceptedRecord = (hostId: number) => state.records.get(hostId);
		const previousListDescendants = new Map<number, boolean>();
		const nextListDescendants = new Map<number, boolean>();
		const ancestrySeen = new Set<number>();
		for (const id of listAncestryRoots) {
			const previous = state.records.get(id);
			const next = getRecord(id);
			if (previous === undefined || next === undefined) continue;
			if (
				cachedListDescendant(getAcceptedRecord, id, previousListDescendants) ===
				cachedListDescendant(getRecord, id, nextListDescendants)
			) {
				continue;
			}
			const pending = [id];
			while (pending.length !== 0) {
				const descendantId = pending.pop()!;
				if (ancestrySeen.has(descendantId)) continue;
				ancestrySeen.add(descendantId);
				const previousDescendant = state.records.get(descendantId);
				const nextDescendant = getRecord(descendantId);
				if (nextDescendant === undefined) continue;
				for (let index = nextDescendant.children.length - 1; index >= 0; index--) {
					pending.push(nextDescendant.children[index]!);
				}
				if (previousDescendant === undefined) continue;
				const listDescendant = cachedListDescendant(getRecord, descendantId, nextListDescendants);
				if (
					previousDescendant.handle === nextDescendant.handle &&
					cachedListDescendant(getAcceptedRecord, descendantId, previousListDescendants) !==
						listDescendant
				) {
					listAncestryDelta.push(
						Object.freeze({
							id: descendantId,
							generation: nextDescendant.handle.generation,
							listDescendant,
						}),
					);
				}
			}
		}
	}
	Object.freeze(listAncestryDelta);
	const listUpdates: LynxPreparedListUpdate[] = [];
	for (const hostId of listIds) {
		const previous = listItems((id) => state.records.get(id), hostId);
		const next = listItems(getRecord, hostId);
		const update = planLynxListUpdate(previous, next);
		if (hasListUpdate(update) || previous.length !== next.length || !getRecord(hostId)) {
			listUpdates.push(Object.freeze({ hostId, previous, next, update }));
		}
	}

	let handleDelta: readonly LynxHostHandleDelta[] | null = null;
	const materializeHandleDelta = (): readonly LynxHostHandleDelta[] => {
		if (handleDelta !== null) return handleDelta;
		const deltas: LynxHostHandleDelta[] = [];
		if (compactHostCount !== undefined) {
			// Keep fault and legacy fallback behavior intact without allocating a
			// wrapper for every node on the successful compact-ACK path.
			for (const operation of operations) {
				if (operation.op === 'create') {
					deltas.push(Object.freeze({ op: 'create', handle: operation.handle }));
				} else if (operation.op === 'mount-template') {
					if (operation.dense !== undefined) {
						for (let offset = 0; offset < operation.dense.nodes.length; offset++) {
							const record = operation.dense.get(operation.dense.firstId + offset)!;
							deltas.push(Object.freeze({ op: 'create', handle: record.handle }));
						}
					} else {
						for (const record of operation.records) {
							deltas.push(Object.freeze({ op: 'create', handle: record.handle }));
						}
					}
				}
			}
		} else {
			for (const id of handleOrder) {
				const previous = state.records.get(id)?.handle;
				const next = getRecord(id)?.handle;
				if (previous === undefined && next !== undefined) {
					deltas.push(Object.freeze({ op: 'create', handle: next }));
				} else if (previous !== undefined && next === undefined) {
					deltas.push(
						Object.freeze({
							op: 'destroy',
							renderer: LYNX_RENDERER_ID,
							root: container.root,
							id,
							generation: previous.generation,
						}),
					);
				} else if (previous !== undefined && next !== undefined && previous !== next) {
					deltas.push(Object.freeze({ op: 'recreate', handle: next }));
				}
			}
		}
		handleDelta = Object.freeze(deltas);
		return handleDelta;
	};
	if (compactHostCount === undefined) materializeHandleDelta();
	let firstTreeAction: LynxPreparedHostBatch['firstTreeAction'] = 'none';
	let firstTreeMismatch: LynxFirstTreeMismatchError | null = null;
	if (firstTree !== undefined && firstTreeSource !== null) {
		firstTreeMismatch = compareFirstTree(
			container,
			batch,
			firstTree,
			firstTreeSource,
			finalIds!,
			childrenForRead(null),
			getRecord,
			operations,
			listUpdates,
		);
		firstTreeAction = firstTreeMismatch === null ? 'adopt' : 'repair';
		if (firstTreeMismatch !== null) options?.onMismatch?.(firstTreeMismatch);
	}
	let status: 'prepared' | 'applying' | 'applied' | 'aborted' | 'faulted' = 'prepared';
	let mutationStarted = false;
	let fault: unknown;

	const prepared: LynxPreparedHostBatch = {
		get mutationStarted() {
			return mutationStarted;
		},
		get handleDelta() {
			return materializeHandleDelta();
		},
		...(compactHostCount === undefined ? null : { compactHostCount }),
		listAncestryDelta,
		firstTreeAction,
		apply() {
			if (status === 'aborted' || status === 'applied') return;
			if (status === 'faulted') throw fault;
			if (status !== 'prepared') return;
			if (state.disposed || state.disposing) {
				throw hostError('cannot apply a batch while root cleanup is pending.');
			}
			if (state.firstTree !== null) {
				throw hostError('a captured first-tree root cannot apply a prepared batch.');
			}
			if (state.acceptedVersion !== baseVersion) {
				throw hostError(
					`prepared batch ${batch.version} was superseded by version ${state.acceptedVersion}.`,
				);
			}
			if (
				firstTree !== undefined &&
				(firstTreeSource === null || firstTreeOwner(firstTree) !== firstTreeSource)
			) {
				throw hostError('firstTree ownership changed after preparation.');
			}
			status = 'applying';
			state.applying = true;
			try {
				mutationStarted = true;
				if (firstTreeAction === 'repair') {
					const cleanup = disposeLynxFirstTree(firstTree!);
					if (!cleanup.complete) {
						const error =
							cleanup.errors[0] ?? hostError('first-tree repair cleanup did not complete.');
						state.faulted = true;
						status = 'faulted';
						fault = error;
						throw error;
					}
				}
				const retiredPhysicalIds = new Set<number>();
				let preApplicationFailed = false;
				let preApplicationError: unknown;
				if (!logicalTeardown) {
					try {
						for (const update of listUpdates) {
							const list = state.lists.get(update.hostId);
							if (list === undefined) continue;
							const nextIds = new Set(update.next.map((item) => item.id));
							for (const cell of [...list.attachedByItem.values()]) {
								if (cell.logicalItemId !== null && !nextIds.has(cell.logicalItemId)) {
									collectPhysicalTreeIds(cell.tree, retiredPhysicalIds);
									detachListCell(
										state,
										list,
										cell,
										getRecord(update.hostId) !== undefined && cell.item.recyclable
											? 'reuse'
											: 'destroy',
										batch.version,
									);
								}
							}
							for (const [itemId, cell] of [...list.retainedByItem]) {
								if (nextIds.has(itemId)) continue;
								list.retainedByItem.delete(itemId);
								if (state.papi.isChild(list.node, cell.tree.node)) {
									state.papi.remove(list.node, cell.tree.node);
								}
								list.cellsBySign.delete(cell.sign);
								disposePhysicalTree(state, cell.tree);
							}
						}
					} catch (error) {
						preApplicationFailed = true;
						preApplicationError = error;
					}
				}
				if (initiallyEmpty || (acceptedDenseRecords !== null && compactHostCount !== undefined)) {
					state.records = stagedRecords;
				} else {
					for (const id of deletedRecords) state.records.delete(id);
					for (const [id, record] of stagedRecords) state.records.set(id, record);
				}
				if (batch.commands.length !== 0) {
					state.teardownRecords = acceptedTeardownRecords;
				}
				if (stagedRootChildren !== null) state.rootChildren = stagedRootChildren;
				if (initiallyNoGenerations) {
					state.generations = stagedGenerations;
				} else {
					for (const [id, generation] of stagedGenerations) {
						state.generations.set(id, generation);
					}
				}
				if (compactHostCount !== undefined) state.implicitInitialGenerations = true;
				state.portalRoot = stagedPortalRoot;
				const portalChildrenChanges = readStagedPortalChildren();
				if (portalChildrenChanges !== null) {
					for (const [key, entry] of portalChildrenChanges) {
						if (entry.children.length === 0) state.portalChildren.delete(key);
						else state.portalChildren.set(key, entry);
					}
				}
				state.hasMainThreadProps = hasMainThreadProps;
				state.hasNativeListTopology = hasNativeListTopology;
				state.acceptedVersion = batch.version;
				if (logicalTeardown) {
					status = 'applied';
					return;
				}
				const activeNodes = new Map(initialNodes);
				try {
					let applicationFailed = preApplicationFailed;
					let applicationError: unknown = preApplicationError;
					try {
						if (applicationFailed) throw applicationError;
						if (firstTreeAction === 'adopt') {
							transferFirstTree(container, firstTree!, firstTreeSource!, activeNodes);
							for (const [id, record] of state.records) {
								const node = nodeFor(activeNodes, id, 'first-tree adoption');
								record.node = node;
								record.selectorInstalled = false;
								ensureNodesRefSelector(state, record);
								if (record.visible) {
									installNativeEvents(
										state,
										node,
										container.root,
										id,
										record.handle.generation,
										record.events,
									);
									if (hasMainThreadProps && isAcceptedHostConnected(state, id)) {
										installMainThreadProps(state, node, record.type, record.props);
									}
								}
							}
						}
						const applicationOperations = firstTreeAction === 'adopt' ? [] : operations;
						for (const operation of applicationOperations) {
							if (hasNativeListTopology && retiredPhysicalIds.has(operation.id)) continue;
							if (operation.op === 'mount-template') {
								if (operation.dense !== undefined && compactHostCount !== undefined) {
									const dense = operation.dense;
									const program = dense.program;
									const width = program.shape.types.length;
									const parent = physicalNodeForParent(
										activeNodes,
										container.page,
										dense.parent,
										'template run parent',
									);
									const append =
										state.papi.append ??
										((parent: Node, child: Node) => state.papi.insertBefore(parent, child, null));
									const intrinsics = state.papi.intrinsics;
									const intrinsicFactories =
										intrinsics === undefined
											? null
											: program.shape.types.map((type) => {
													if (type === 'view') return intrinsics.view;
													if (type === 'text') return intrinsics.text;
													if (type === '#text' || type === 'raw-text') return intrinsics.rawText;
													return undefined;
												});
									for (let row = 0; row < dense.count; row++) {
										const rowOffset = row * width;
										const valueOffset = row * program.valueCount;
										for (let index = 0; index < width; index++) {
											const offset = rowOffset + index;
											const type = program.shape.types[index]!;
											const props = program.props[index]!;
											const bindings = program.bindings[index];
											const rawText = type === '#text' || type === 'raw-text';
											let text = '';
											if (rawText) {
												text =
													bindings === undefined
														? typeof props.value === 'string'
															? props.value
															: typeof props.text === 'string'
																? props.text
																: ''
														: (dense.values[valueOffset + bindings[0]!.valueIndex] as string);
											}
											const factory = intrinsicFactories?.[index];
											const node =
												factory === undefined
													? state.papi.createElement(type, container.pageComponentUniqueId, text)
													: rawText
														? (factory as (value: string) => Node)(text)
														: (factory as (value: number) => Node)(container.pageComponentUniqueId);
											state.ownedNodes.add(node);
											dense.setNode(offset, node);
											if (bindings !== undefined) {
												if (program.dynamicRoutes[index] === 2) {
													applyDenseScalarHostProps(
														state.papi,
														node,
														props,
														bindings,
														dense.values,
														valueOffset,
													);
												}
											} else {
												const patch = program.patches[index]!;
												if (patch !== EMPTY_RAW_TEXT_CREATE_PATCH) {
													applyProps(
														state,
														node,
														type,
														EMPTY_HOST_PROPS,
														props,
														patch,
														true,
														true,
														false,
													);
												}
											}
										}
										if (dense.firstListenerId !== null) {
											const rowListener = dense.firstListenerId + row * program.eventCount;
											for (const site of program.eventSites) {
												installPreparedNativeEvent(
													state,
													dense.nodes[rowOffset + site.node]!,
													container.root,
													dense.firstId + rowOffset + site.node,
													rowListener,
													site,
												);
											}
										}
										for (let index = 1; index < width; index++) {
											append(
												dense.nodes[rowOffset + program.shape.parents[index]!]!,
												dense.nodes[rowOffset + index]!,
											);
										}
										const root = dense.nodes[rowOffset]!;
										if (dense.parent === null) state.ownedPageRoots.add(root);
										append(parent, root);
									}
									continue;
								}
								const records = operation.records;
								const firstId = compactHostCount === undefined ? undefined : operation.firstId;
								const rows = operation.count ?? 1;
								const width = operation.parents.length;
								const sparse = firstId !== undefined && sparseCompactNodes;
								for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
									const rowOffset = rowIndex * width;
									for (let nodeIndex = 0; nodeIndex < width; nodeIndex++) {
										const recordIndex = rowOffset + nodeIndex;
										const record = records[recordIndex]!;
										const node = state.papi.createElement(
											record.type,
											container.pageComponentUniqueId,
											record.type === '#text' || record.type === 'raw-text'
												? textValue(record.props)
												: '',
										);
										state.ownedNodes.add(node);
										if (!sparse || nodeIndex === 0) {
											activeNodes.set(
												firstId === undefined ? record.handle.id : firstId + recordIndex,
												node,
											);
										}
										record.node = node;
										operation.teardownDense?.setNode(recordIndex, node);
										if (
											operation.lazyPublicInstances !== true ||
											(compactHostCount === undefined && !acceptedLazyPublicInstances)
										) {
											ensureNodesRefSelector(state, record);
										}
										const patch = operation.patches[recordIndex]!;
										if (patch !== EMPTY_RAW_TEXT_CREATE_PATCH) {
											applyProps(
												state,
												node,
												record.type,
												EMPTY_HOST_PROPS,
												record.props,
												patch,
												true,
												true,
												false,
											);
										}
									}
									if (firstId !== undefined && operation.program !== undefined) {
										const listener = operation.firstListenerId;
										if (listener !== null && listener !== undefined) {
											const rowListener = listener + rowIndex * operation.program.eventCount;
											for (const site of operation.program.eventSites) {
												installPreparedNativeEvent(
													state,
													records[rowOffset + site.node]!.node!,
													container.root,
													firstId + rowOffset + site.node,
													rowListener,
													site,
												);
											}
										}
									} else {
										for (let nodeIndex = 0; nodeIndex < width; nodeIndex++) {
											const recordIndex = rowOffset + nodeIndex;
											const record = records[recordIndex]!;
											if (record.events.size === 0) continue;
											installNativeEvents(
												state,
												record.node!,
												container.root,
												firstId === undefined ? record.handle.id : firstId + recordIndex,
												firstId === undefined ? record.handle.generation : 1,
												record.events,
											);
										}
									}
									for (let nodeIndex = 1; nodeIndex < width; nodeIndex++) {
										const record = records[rowOffset + nodeIndex]!;
										state.papi.insertBefore(
											records[rowOffset + operation.parents[nodeIndex]!]!.node!,
											record.node!,
											null,
										);
									}
									const root = records[rowOffset]!.node!;
									const parent = physicalNodeForParent(
										activeNodes,
										container.page,
										operation.parent,
										'template root parent',
									);
									const before =
										operation.before === null
											? typeof operation.parent === 'number' && state.portalChildren.size !== 0
												? firstPortalChildNode(state, activeNodes, operation.parent)
												: null
											: nodeFor(activeNodes, operation.before, 'template before');
									if (operation.parent === null) state.ownedPageRoots.add(root);
									state.papi.insertBefore(parent, root, before);
								}
							} else if (operation.op === 'create') {
								const membership = hasNativeListTopology
									? directListItem((id) => state.records.get(id), operation.id)
									: null;
								if (
									membership !== null &&
									!state.lists.get(membership.listId)?.attachedByItem.has(membership.itemId)
								) {
									continue;
								}
								const node =
									operation.type === 'list'
										? createNativeListNode(state, container, operation.record)
										: state.papi.createElement(
												operation.type,
												container.pageComponentUniqueId,
												textValue(operation.props),
											);
								state.ownedNodes.add(node);
								activeNodes.set(operation.id, node);
								operation.record.node = node;
								ensureNodesRefSelector(state, operation.record);
								applyProps(
									state,
									node,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
									operation.visible &&
										hasMainThreadProps &&
										isAcceptedHostConnected(state, operation.id),
								);
							} else if (operation.op === 'update') {
								if (!activeNodes.has(operation.id)) continue;
								applyProps(
									state,
									nodeFor(activeNodes, operation.id, 'update'),
									operation.type,
									operation.previous,
									operation.next,
									operation.patch,
									false,
									operation.visible,
									operation.visible &&
										hasMainThreadProps &&
										isAcceptedHostConnected(state, operation.id),
								);
							} else if (operation.op === 'recreate') {
								if (!activeNodes.has(operation.id)) continue;
								const previous = nodeFor(activeNodes, operation.id, 'recreate');
								removeAllNativeEvents(state, previous);
								removeMainThreadRef(state, previous);
								if (operation.type === 'list') disposeNativeListState(state, operation.id);
								const replacement =
									operation.type === 'list'
										? createNativeListNode(state, container, operation.record)
										: state.papi.createElement(
												operation.type,
												container.pageComponentUniqueId,
												textValue(operation.props),
											);
								state.ownedNodes.add(replacement);
								activeNodes.set(operation.id, replacement);
								operation.record.node = replacement;
								ensureNodesRefSelector(state, operation.record);
								applyProps(
									state,
									replacement,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
									operation.visible &&
										hasMainThreadProps &&
										isAcceptedHostConnected(state, operation.id),
								);
								if (!operation.visible) state.papi.setAttribute(replacement, 'hidden', true);
								if (operation.visible) {
									installNativeEvents(
										state,
										replacement,
										container.root,
										operation.id,
										operation.generation,
										operation.events,
									);
								}
								for (const childId of operation.children) {
									state.papi.insertBefore(
										replacement,
										nodeFor(activeNodes, childId, 'recreate child'),
										null,
									);
								}
								for (const childId of operation.portalChildren) {
									state.papi.insertBefore(
										replacement,
										nodeFor(activeNodes, childId, 'recreate portal child'),
										null,
									);
								}
								if (operation.parent !== undefined) {
									if (operation.parent === null) state.ownedPageRoots.add(replacement);
									state.papi.replace(replacement, previous);
									if (operation.parent === null) state.ownedPageRoots.delete(previous);
								}
								state.ownedNodes.delete(previous);
							} else if (operation.op === 'insert' || operation.op === 'move') {
								const parentRecord =
									typeof operation.parent === 'number'
										? state.records.get(operation.parent)
										: undefined;
								if (parentRecord?.type === 'list') continue;
								if (!activeNodes.has(operation.id)) continue;
								const node = nodeFor(activeNodes, operation.id, operation.op);
								const parent = physicalNodeForParent(
									activeNodes,
									container.page,
									operation.parent,
									`${operation.op} parent`,
								);
								const before =
									operation.before === null
										? typeof operation.parent === 'number'
											? state.portalChildren.size === 0
												? null
												: firstPortalChildNode(state, activeNodes, operation.parent)
											: null
										: nodeFor(activeNodes, operation.before, `${operation.op} before`);
								if (operation.parent === null) state.ownedPageRoots.add(node);
								if (hasMainThreadProps && operation.wasConnected && !operation.willBeConnected) {
									deactivateMainThreadSubtree(state, operation.id);
								}
								state.papi.insertBefore(parent, node, before);
								if (hasMainThreadProps && !operation.wasConnected && operation.willBeConnected) {
									activateMainThreadSubtree(state, operation.id);
								}
								if (operation.previousParent === null && operation.parent !== null) {
									state.ownedPageRoots.delete(node);
								}
							} else if (operation.op === 'remove') {
								const parentRecord =
									typeof operation.parent === 'number'
										? state.records.get(operation.parent)
										: undefined;
								if (parentRecord?.type === 'list' || !activeNodes.has(operation.id)) continue;
								const node = nodeFor(activeNodes, operation.id, 'remove');
								const parent = physicalNodeForParent(
									activeNodes,
									container.page,
									operation.parent,
									'remove parent',
								);
								if (hasMainThreadProps) deactivateMainThreadSubtree(state, operation.id);
								state.papi.remove(parent, node);
								if (operation.parent === null) state.ownedPageRoots.delete(node);
							} else if (operation.op === 'ensure-public-instance') {
								const record = state.records.get(operation.id);
								if (record !== undefined) ensureNodesRefSelector(state, record);
							} else if (operation.op === 'visibility') {
								if (!activeNodes.has(operation.id)) continue;
								const record = state.records.get(operation.id)!;
								// Element PAPI cannot attach attributes to raw-text nodes. Their nearest
								// host ancestor receives the same retained-tree visibility command.
								if (record.type === '#text' || record.type === 'raw-text') continue;
								const node = nodeFor(activeNodes, operation.id, 'visibility');
								if (operation.state === 'hidden') {
									removeAllNativeEvents(state, node);
									removeMainThreadRef(state, node);
								}
								state.papi.setAttribute(
									node,
									'hidden',
									operation.state === 'hidden' ? true : operation.authoredHidden,
								);
								if (operation.state === 'visible') {
									if (hasMainThreadProps && isAcceptedHostConnected(state, operation.id)) {
										installMainThreadProps(state, node, record.type, record.props);
									}
									installNativeEvents(
										state,
										node,
										container.root,
										operation.id,
										operation.generation,
										operation.events,
									);
								}
							} else if (operation.op === 'event') {
								if (!activeNodes.has(operation.id)) continue;
								const node = nodeFor(activeNodes, operation.id, 'event');
								if (!operation.visible || operation.next === null) {
									removeNativeEvent(state, node, operation.type);
								} else {
									installNativeEvent(
										state,
										node,
										container.root,
										operation.id,
										operation.generation,
										operation.type,
										operation.next,
									);
								}
							} else if (operation.op === 'destroy') {
								const node = activeNodes.get(operation.id);
								if (node !== undefined) {
									if (state.lists.has(operation.id)) disposeNativeListState(state, operation.id);
									removeAllNativeEvents(state, node);
									removeMainThreadRef(state, node);
									state.ownedNodes.delete(node);
								}
								activeNodes.delete(operation.id);
							}
						}
						for (const update of listUpdates) {
							if (state.records.has(update.hostId)) applyListUpdate(state, update);
							else disposeNativeListState(state, update.hostId);
						}
					} catch (error) {
						if (!applicationFailed) {
							applicationFailed = true;
							applicationError = error;
						}
					}
					try {
						state.papi.flush(container.page);
						state.cleanupNeedsFlush = false;
					} catch (error) {
						// The logical batch is already accepted, including root removals and
						// destroys. Preserve the flush obligation for terminal disposal.
						state.cleanupNeedsFlush = true;
						if (!applicationFailed) {
							applicationFailed = true;
							applicationError = error;
						}
					}
					if (applicationFailed) throw applicationError;
					status = 'applied';
				} catch (error) {
					state.faulted = true;
					invalidateMainThreadLifetimesAfterFault(state);
					status = 'faulted';
					fault = error;
					throw error;
				}
			} finally {
				state.applying = false;
			}
		},
		abort() {
			if (status === 'prepared') status = 'aborted';
		},
	};
	return Object.freeze(prepared);
}

export function createLynxHostDriver<
	Node extends LynxElementRef = LynxElementRef,
>(): LynxHostDriver<Node> {
	const driver: LynxHostDriver<Node> = {
		id: LYNX_RENDERER_ID,
		capabilities: {
			text: 'host',
			visibility: true,
			templateMount: true,
			templateProgramMount: true,
			templateProgramRuns: true,
			lazyPublicInstances: true,
			stableStaticHostProps: true,
		},
		updates: Object.freeze({
			classify(
				type: string,
				previous: Readonly<Record<string, unknown>>,
				next: Readonly<Record<string, unknown>>,
			) {
				return planLynxHostPropPatch(type, previous, next).requiresRecreate ? 'recreate' : 'update';
			},
		}),
		prepareBatch(container, batch, _context) {
			return prepareLynxHostBatch(container, batch);
		},
		getPublicInstance(container, id) {
			const state = container[LYNX_HOST_STATE];
			const record = state.records.get(id);
			if (record === undefined) return null;
			ensureNodesRefSelector(state, record);
			return record.handle;
		},
	};
	return Object.freeze(driver);
}

export function getLynxHostEventListener<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	id: number,
	type: string,
): UniversalEventListenerDescriptor | null {
	return container[LYNX_HOST_STATE].records.get(id)?.events.get(type) ?? null;
}

/** True only while a logical host currently owns a physical Element PAPI node. */
export function isLynxHostAttached<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	id: number,
): boolean {
	const state = container[LYNX_HOST_STATE];
	const record = state.records.get(id);
	return (
		!state.disposed &&
		!state.disposing &&
		!state.faulted &&
		record?.node != null &&
		isRootConnected((hostId) => state.records.get(hostId), id)
	);
}

export interface LynxHostPublicState {
	readonly attached: boolean;
	readonly listDescendant: boolean;
}

/** Commit-time public state derived in one accepted-ancestry walk. */
export function getLynxHostPublicState<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	id: number,
): LynxHostPublicState {
	const state = container[LYNX_HOST_STATE];
	const record = state.records.get(id);
	if (record === undefined) return { attached: false, listDescendant: false };
	let current = record;
	let listDescendant = false;
	let connected = false;
	const visited = new Set<number>();
	while (true) {
		if (visited.has(current.handle.id)) throw hostError('host ancestry contains a cycle.');
		visited.add(current.handle.id);
		const parentId = parentHostId(current.parent);
		if (parentId === null) {
			connected = true;
			break;
		}
		if (parentId === undefined) break;
		const parent = state.records.get(parentId);
		if (parent === undefined) break;
		if (parent.type === 'list' && current.type === 'list-item') listDescendant = true;
		current = parent;
	}
	return {
		attached:
			!state.disposed && !state.disposing && !state.faulted && record.node !== null && connected,
		listDescendant,
	};
}

export interface LynxListDiagnostics {
	readonly hostId: number;
	readonly logicalItems: number;
	readonly physicalCells: number;
	readonly attachedCells: number;
	readonly pooledCells: number;
	readonly createdCells: number;
	readonly reusedCells: number;
	readonly enterCount: number;
	readonly leaveCount: number;
}

/** Deterministic source-level counters for tests and the list allocation benchmark. */
export function getLynxListDiagnostics<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	hostId: number,
): LynxListDiagnostics | null {
	const list = container[LYNX_HOST_STATE].lists.get(hostId);
	if (list === undefined || list.disposed) return null;
	let pooledCells = 0;
	for (const pool of list.recyclePools.values()) pooledCells += pool.length;
	return Object.freeze({
		hostId,
		logicalItems: list.items.length,
		physicalCells: list.cellsBySign.size,
		attachedCells: list.attachedByItem.size,
		pooledCells,
		createdCells: list.createdCells,
		reusedCells: list.reusedCells,
		enterCount: list.enterCount,
		leaveCount: list.leaveCount,
	});
}

export interface LynxResolvedNativeEvent {
	readonly listener: number;
	readonly priority: UniversalEventListenerDescriptor['priority'];
}

/** Resolve an opaque PAPI callback token against the currently accepted physical host. */
export function resolveLynxHostNativeEvent<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	token: unknown,
): LynxResolvedNativeEvent | null {
	const state = container[LYNX_HOST_STATE];
	const identity = decodeLynxNativeEventToken(token);
	if (state.disposed || state.disposing || state.faulted || identity.root !== container.root) {
		return null;
	}
	const record = state.records.get(identity.id);
	if (
		record === undefined ||
		record.node === null ||
		!record.visible ||
		record.handle.generation !== identity.generation ||
		!isRootConnected((id) => state.records.get(id), identity.id)
	) {
		return null;
	}
	const physical = state.nativeEvents.get(record.node);
	if (physical === undefined || typeof token !== 'string') return null;
	for (const [type, descriptor] of record.events) {
		const registration = physical.get(type);
		if (
			descriptor.id !== identity.listener ||
			registration?.source !== 'background' ||
			registration.listener !== token
		) {
			continue;
		}
		return Object.freeze({ listener: descriptor.id, priority: descriptor.priority });
	}
	return null;
}

function normalizeCleanupError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function indexPhysicalNodes<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	nodes: ReadonlySet<Node>,
): ReadonlyMap<number, Node> {
	const byNativeId = new Map<number, Node>();
	for (const node of nodes) {
		const nativeId = papi.getUniqueId(node);
		if (!Number.isSafeInteger(nativeId)) {
			throw hostError('cleanup native ID must be a safe integer.');
		}
		const previous = byNativeId.get(nativeId);
		if (previous !== undefined && previous !== node && !papi.isEqual(previous, node)) {
			throw hostError(`cleanup native ID ${nativeId} is not unique.`);
		}
		if (previous === undefined) byNativeId.set(nativeId, node);
	}
	return byNativeId;
}

function containsPhysicalNode<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	byNativeId: ReadonlyMap<number, Node>,
	candidate: Node,
): boolean {
	const nativeId = papi.getUniqueId(candidate);
	if (!Number.isSafeInteger(nativeId)) {
		throw hostError('cleanup parent native ID must be a safe integer.');
	}
	const owned = byNativeId.get(nativeId);
	if (owned === undefined) return false;
	// Native parent lookup may return a different opaque wrapper for the same
	// element. The unique native-ID index keeps this equality fallback O(1)
	// instead of rescanning the complete owned tree.
	return owned === candidate || papi.isEqual(owned, candidate);
}

function completedFirstTreeCleanup(): LynxHostCleanupResult {
	return Object.freeze({
		complete: true,
		removedRoots: 0,
		remainingRoots: 0,
		flushed: false,
		errors: Object.freeze([]),
	});
}

/** Dispose a captured tree unless its physical nodes were already transferred. */
export function disposeLynxFirstTree<Node extends LynxElementRef>(
	firstTree: LynxFirstTree<Node>,
): LynxHostCleanupResult {
	if (firstTree === null || typeof firstTree !== 'object') {
		throw hostError('firstTree must be a captured Lynx first tree.');
	}
	const journal = firstTree[LYNX_FIRST_TREE_STATE];
	if (journal === undefined) throw hostError('firstTree has no Lynx ownership journal.');
	if (journal.status !== 'available') return completedFirstTreeCleanup();
	const owner = firstTreeOwner(firstTree);
	return disposeLynxHostContainer(owner);
}

/**
 * Retry-safe terminal cleanup for success and post-accept fault paths.
 * Incomplete attempts retain their ownership journal and logical records so a
 * repeated dispose can finish before the caller acknowledges teardown.
 */
export function disposeLynxHostContainer<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
): LynxHostCleanupResult {
	const state = container[LYNX_HOST_STATE];
	if (state.disposed) {
		return Object.freeze({
			complete: true,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: false,
			errors: Object.freeze([]),
		});
	}
	state.disposing = true;
	const errors: Error[] = [];
	// Snapshot every physical reference before list teardown releases its ordinary
	// journals. Failed external-edge removal re-adds that node to ownedNodes so a
	// later dispose attempt can retry it.
	const cleanupNodes = new Set(state.ownedNodes);
	for (const node of state.ownedPageRoots) cleanupNodes.add(node);
	let cleanupNodeIndex: ReadonlyMap<number, Node> | null = null;
	try {
		cleanupNodeIndex = indexPhysicalNodes(state.papi, cleanupNodes);
	} catch (error) {
		errors.push(normalizeCleanupError(error));
	}
	for (const listId of [...state.lists.keys()]) {
		try {
			disposeNativeListState(state, listId);
			state.cleanupNeedsFlush = true;
		} catch (error) {
			errors.push(normalizeCleanupError(error));
		}
	}
	for (const node of [...state.mainThreadRefs.keys()]) {
		try {
			removeMainThreadRef(state, node);
		} catch (error) {
			errors.push(normalizeCleanupError(error));
		}
	}
	for (const [node, events] of [...state.nativeEvents]) {
		for (const type of [...events.keys()]) {
			try {
				removeNativeEvent(state, node, type);
				state.cleanupNeedsFlush = true;
			} catch (error) {
				errors.push(normalizeCleanupError(error));
			}
		}
	}
	let removedRoots = 0;
	let unresolvedExternalRoots = 0;
	const releaseRootOwnership = (node: Node): void => {
		if (!state.ownedPageRoots.delete(node)) return;
		state.cleanupNeedsFlush = true;
		removedRoots += 1;
	};
	const retainUnresolvedOwnership = (node: Node): void => {
		state.ownedNodes.add(node);
		// Logical page roots already remain counted in ownedPageRoots. A child
		// reparented beneath a non-owned native node is itself another physical
		// cleanup root until that external edge can be removed.
		if (!state.ownedPageRoots.has(node)) unresolvedExternalRoots += 1;
	};
	for (const node of cleanupNodes) {
		let parent: Node | null;
		try {
			parent = state.papi.getParent(node);
		} catch (error) {
			errors.push(normalizeCleanupError(error));
			retainUnresolvedOwnership(node);
			continue;
		}
		if (parent === null) {
			releaseRootOwnership(node);
			continue;
		}
		if (cleanupNodeIndex === null) {
			retainUnresolvedOwnership(node);
			continue;
		}
		let parentIsOwned: boolean;
		try {
			parentIsOwned = containsPhysicalNode(state.papi, cleanupNodeIndex, parent);
		} catch (error) {
			errors.push(normalizeCleanupError(error));
			retainUnresolvedOwnership(node);
			continue;
		}
		if (parentIsOwned) {
			// Nested ownership is released by removing the one external edge above
			// this subtree. Do not turn normal cleanup into one native removal per host.
			releaseRootOwnership(node);
			continue;
		}

		let externalEdgeRemoved = false;
		try {
			state.papi.remove(parent, node);
			externalEdgeRemoved = true;
		} catch (error) {
			try {
				// Native removal may detach and then throw. It is also safe if the node
				// ended up beneath another owned node: the remaining owned boundary edge
				// will release that complete subtree.
				const currentParent = state.papi.getParent(node);
				externalEdgeRemoved =
					currentParent === null ||
					containsPhysicalNode(state.papi, cleanupNodeIndex, currentParent);
				if (!externalEdgeRemoved) errors.push(normalizeCleanupError(error));
			} catch (inspectionError) {
				errors.push(normalizeCleanupError(error));
				errors.push(normalizeCleanupError(inspectionError));
			}
		}
		if (!externalEdgeRemoved) {
			retainUnresolvedOwnership(node);
			continue;
		}
		state.cleanupNeedsFlush = true;
		releaseRootOwnership(node);
	}
	let flushed = false;
	if (state.cleanupNeedsFlush) {
		try {
			state.papi.flush(container.page);
			state.cleanupNeedsFlush = false;
			flushed = true;
		} catch (error) {
			errors.push(normalizeCleanupError(error));
		}
	}
	const remainingRoots = state.ownedPageRoots.size + unresolvedExternalRoots;
	const complete =
		remainingRoots === 0 &&
		state.nativeEvents.size === 0 &&
		state.mainThreadRefs.size === 0 &&
		state.mainThreadRefOwners.size === 0 &&
		state.lists.size === 0 &&
		!state.cleanupNeedsFlush;
	if (complete) {
		const firstTree = state.firstTree;
		state.ownedNodes.clear();
		state.nativeEvents.clear();
		state.mainThreadRefs.clear();
		state.mainThreadRefOwners.clear();
		state.lists.clear();
		state.records.clear();
		state.teardownRecords = null;
		state.rootChildren.length = 0;
		state.generations.clear();
		state.portalRoot = null;
		state.portalChildren.clear();
		state.firstTree = null;
		state.disposing = false;
		state.disposed = true;
		if (firstTree !== null) {
			const journal = firstTree[LYNX_FIRST_TREE_STATE];
			journal.owner = null;
			journal.status = 'disposed';
		}
	}
	return Object.freeze({
		complete,
		removedRoots,
		remainingRoots,
		flushed,
		errors: Object.freeze(errors),
	});
}
