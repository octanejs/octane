import type {
	UniversalEventListenerDescriptor,
	UniversalHostBatch,
	UniversalHostCommitContext,
	UniversalHostDriver,
	UniversalPreparedHostBatch,
	UniversalPortalTargetHandle,
	UniversalSerializableValue,
} from 'octane/universal/native';
import {
	decodeLynxNativeEventToken,
	encodeLynxNativeEventToken,
	parseLynxMainThreadEventProp,
	parseLynxNativeEventProp,
	type LynxMainThreadEventBinding,
	type LynxNativeEventBinding,
	type LynxNativeEventToken,
} from './native-events.js';
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
import type { LynxActivatedMainThreadWorklet, LynxMainThreadWorkletRegistry } from './worklets.js';
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
	records: Map<number, LynxHostRecord<Node>>;
	rootChildren: number[];
	generations: Map<number, number>;
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
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
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
			Object.defineProperty(output, index, {
				configurable: true,
				enumerable: true,
				value: cloneHostValue(value[index], clones),
				writable: true,
			});
		}
	} else {
		for (const [name, item] of Object.entries(value)) {
			Object.defineProperty(clone, name, {
				configurable: true,
				enumerable: true,
				value: cloneHostValue(item, clones),
				writable: true,
			});
		}
	}
	return Object.freeze(clone);
}

function cloneProps(value: unknown, label: string): Readonly<Record<string, unknown>> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw hostError(`${label} must be a plain object.`);
	}
	const clone = cloneHostValue(value, new WeakMap());
	if (clone === null || typeof clone !== 'object' || Array.isArray(clone)) {
		throw hostError(`${label} must be a plain object.`);
	}
	return clone as Readonly<Record<string, unknown>>;
}

function assertTextProps(
	type: string,
	props: Readonly<Record<string, unknown>>,
	label: string,
): void {
	if (type !== '#text') return;
	if (
		typeof props.value !== 'string' ||
		Object.keys(props).some((name) => name !== 'value' && name !== LYNX_CSS_SCOPE_PROP)
	) {
		throw hostError(`${label} for #text must contain a string value and optional CSS scope.`);
	}
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
		children: [...record.children],
		events: new Map(record.events),
		handle: record.handle,
	};
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
	const token = encodeLynxNativeEventToken({ root, id, generation, listener: listener.id });
	const events = nativeEventMap(state, node);
	const current = events.get(type);
	if (current?.source === 'background' && current.listener === token) return;
	// Journal the intended token before entering PAPI. If native replacement
	// mutates and then throws, terminal cleanup still knows which tuple to clear.
	events.set(type, Object.freeze({ source: 'background', binding, listener: token }));
	state.papi.setEvent(node, binding.type, binding.name, token);
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
	installNodesRefSelector(state.papi, node, record.handle);
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
	if (record?.node === tree.node) record.node = null;
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
	installNodesRefSelector(state.papi, tree.node, desired.handle);
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
		throw hostError(
			'<list> requires __CreateList, __UpdateListCallbacks, and __UpdateListComponents.',
		);
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
	listPAPI.updateComponents(
		node,
		Object.freeze(initialItems.map((item) => `${item.type}:${item.reuseIdentifier}`)),
	);
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
	const nextById = new Map(update.next.map((item) => [item.id, item]));
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
	listPAPI.updateComponents(
		list.node,
		Object.freeze(update.next.map((item) => `${item.type}:${item.reuseIdentifier}`)),
	);
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
 */
export function captureLynxFirstTree<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	options: CaptureLynxFirstTreeOptions = {},
): LynxFirstTree<Node> {
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
	if (state.lists.size !== 0) {
		throw hostError('native list materializations cannot be captured as a first tree.');
	}
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
		if (record.type === 'list') {
			throw hostError('native list hosts cannot be captured as a first tree.');
		}
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

	const baseVersion = state.acceptedVersion;
	// Preparation is a hot commit path. Stage only records and generation entries
	// touched by this batch; the accepted maps remain unchanged until apply().
	const stagedRecords = new Map<number, LynxHostRecord<Node>>();
	const deletedRecords = new Set<number>();
	const stagedGenerations = new Map<number, number>();
	let stagedPortalChildren: Map<string, LynxPortalChildren> | null = null;
	const readStagedPortalChildren = (): Map<string, LynxPortalChildren> | null =>
		stagedPortalChildren;
	let stagedPortalRoot = state.portalRoot;
	const initialNodes = new Map<number, Node>();
	let stagedRootChildren: number[] | null = null;
	let stagedRecordCount = state.records.size;
	const getRecord = (id: number): LynxHostRecord<Node> | undefined => {
		if (deletedRecords.has(id)) return undefined;
		return stagedRecords.get(id) ?? state.records.get(id);
	};
	const writeRecord = (id: number): LynxHostRecord<Node> | undefined => {
		if (deletedRecords.has(id)) return undefined;
		const staged = stagedRecords.get(id);
		if (staged !== undefined) return staged;
		const accepted = state.records.get(id);
		if (accepted === undefined) return undefined;
		const clone = cloneRecord(accepted);
		stagedRecords.set(id, clone);
		return clone;
	};
	const setRecord = (id: number, record: LynxHostRecord<Node>): void => {
		if (getRecord(id) === undefined) stagedRecordCount += 1;
		deletedRecords.delete(id);
		stagedRecords.set(id, record);
	};
	const deleteRecord = (id: number): void => {
		if (getRecord(id) !== undefined) stagedRecordCount -= 1;
		stagedRecords.delete(id);
		deletedRecords.add(id);
	};
	const getGeneration = (id: number): number | undefined =>
		stagedGenerations.get(id) ?? state.generations.get(id);
	const setGeneration = (id: number, generation: number): void => {
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
		return record.children;
	};
	const captureInitialNode = (id: number): void => {
		if (initialNodes.has(id)) return;
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
	const destroyedIds = new Set<number>();
	for (const command of batch.commands) {
		if (command?.op === 'destroy') {
			assertSafeId(command.id, 'destroy.id');
			destroyedIds.add(command.id);
		}
	}
	const operations: LynxApplyOperation<Node>[] = [];
	const handleDelta: LynxHostHandleDelta[] = [];
	const handleOrder: number[] = [];
	const touchedHandles = new Set<number>();
	let listAncestryRoots: Set<number> | null = null;
	const touchHandle = (id: number) => {
		if (touchedHandles.has(id)) return;
		touchedHandles.add(id);
		handleOrder.push(id);
	};

	for (let index = 0; index < batch.commands.length; index++) {
		const command = batch.commands[index];
		if (command === null || typeof command !== 'object') {
			throw hostError(`command ${index} must be an object.`);
		}
		if (command.op === 'create') {
			assertSafeId(command.id, `command ${index} create.id`);
			assertHostType(command.type, `command ${index} create.type`);
			if (getRecord(command.id) !== undefined) throw hostError(`duplicate host id ${command.id}.`);
			const props = cloneProps(command.props, `command ${index} create.props`);
			assertTextProps(command.type, props, `command ${index} create.props`);
			const patch = planLynxHostPropPatch(command.type, {}, props);
			const generation = (getGeneration(command.id) ?? 0) + 1;
			const handle = createHandle(container.root, command.id, command.type, generation);
			setGeneration(command.id, generation);
			const record: LynxHostRecord<Node> = {
				node: null,
				type: command.type,
				props,
				visible: true,
				parent: undefined,
				children: [],
				events: new Map(),
				handle,
			};
			setRecord(command.id, record);
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
			touchHandle(command.id);
		} else if (command.op === 'update') {
			assertSafeId(command.id, `command ${index} update.id`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown update target ${command.id}.`);
			captureInitialNode(command.id);
			const props = cloneProps(command.props, `command ${index} update.props`);
			assertTextProps(record.type, props, `command ${index} update.props`);
			const patch = planLynxHostPropPatch(record.type, record.props, props);
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
			const patch = planLynxHostPropPatch(command.type, {}, props);
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
			touchHandle(command.id);
		} else if (command.op === 'insert' || command.op === 'move') {
			assertSafeId(command.id, `command ${index} ${command.op}.id`);
			const parent = resolveParent(command.parent, `command ${index} ${command.op}.parent`);
			if (command.before !== null) {
				assertSafeId(command.before, `command ${index} ${command.op}.before`);
			}
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown ${command.op} target ${command.id}.`);
			(listAncestryRoots ??= new Set()).add(command.id);
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
			assertNoCycle(getRecord, command.id, parent);
			const wasConnected = isRootConnected(getRecord, command.id);
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
			const willBeConnected = isRootConnected(getRecord, command.id);
			operations.push({
				op: command.op,
				id: command.id,
				parent,
				before: command.before,
				previousParent,
				wasConnected,
				willBeConnected,
			});
		} else if (command.op === 'remove') {
			assertSafeId(command.id, `command ${index} remove.id`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown remove target ${command.id}.`);
			(listAncestryRoots ??= new Set()).add(command.id);
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
		} else if (command.op === 'visibility') {
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
				record.events.delete(command.type);
			} else {
				assertSafeId(command.listener.id, `command ${index} event.listener.id`);
				if (!['continuous', 'default', 'discrete'].includes(command.listener.priority)) {
					throw hostError(`command ${index} has invalid event priority.`);
				}
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

	const finalIds = new Set<number>();
	for (const id of state.records.keys()) {
		if (!deletedRecords.has(id)) finalIds.add(id);
	}
	for (const id of stagedRecords.keys()) {
		if (!deletedRecords.has(id)) finalIds.add(id);
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
	for (const [id, record] of state.records) {
		if (record.type === 'list') listIds.add(id);
	}
	for (const id of finalIds) {
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

	for (const id of handleOrder) {
		const previous = state.records.get(id)?.handle;
		const next = getRecord(id)?.handle;
		if (previous === undefined && next !== undefined) {
			handleDelta.push(Object.freeze({ op: 'create', handle: next }));
		} else if (previous !== undefined && next === undefined) {
			handleDelta.push(
				Object.freeze({
					op: 'destroy',
					renderer: LYNX_RENDERER_ID,
					root: container.root,
					id,
					generation: previous.generation,
				}),
			);
		} else if (previous !== undefined && next !== undefined && previous !== next) {
			handleDelta.push(Object.freeze({ op: 'recreate', handle: next }));
		}
	}
	Object.freeze(handleDelta);
	let firstTreeAction: LynxPreparedHostBatch['firstTreeAction'] = 'none';
	let firstTreeMismatch: LynxFirstTreeMismatchError | null = null;
	if (firstTree !== undefined && firstTreeSource !== null) {
		firstTreeMismatch = compareFirstTree(
			container,
			batch,
			firstTree,
			firstTreeSource,
			finalIds,
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
		handleDelta,
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
				for (const id of deletedRecords) state.records.delete(id);
				for (const [id, record] of stagedRecords) state.records.set(id, record);
				if (stagedRootChildren !== null) state.rootChildren = stagedRootChildren;
				for (const [id, generation] of stagedGenerations) {
					state.generations.set(id, generation);
				}
				state.portalRoot = stagedPortalRoot;
				const portalChildrenChanges = readStagedPortalChildren();
				if (portalChildrenChanges !== null) {
					for (const [key, entry] of portalChildrenChanges) {
						if (entry.children.length === 0) state.portalChildren.delete(key);
						else state.portalChildren.set(key, entry);
					}
				}
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
								installNodesRefSelector(state.papi, node, record.handle);
								if (record.visible) {
									installNativeEvents(
										state,
										node,
										container.root,
										id,
										record.handle.generation,
										record.events,
									);
									if (isAcceptedHostConnected(state, id)) {
										installMainThreadProps(state, node, record.type, record.props);
									}
								}
							}
						}
						const applicationOperations = firstTreeAction === 'adopt' ? [] : operations;
						for (const operation of applicationOperations) {
							if (retiredPhysicalIds.has(operation.id)) continue;
							if (operation.op === 'create') {
								const membership = directListItem((id) => state.records.get(id), operation.id);
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
								installNodesRefSelector(state.papi, node, operation.handle);
								applyProps(
									state,
									node,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
									operation.visible && isAcceptedHostConnected(state, operation.id),
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
									operation.visible && isAcceptedHostConnected(state, operation.id),
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
								installNodesRefSelector(state.papi, replacement, operation.handle);
								applyProps(
									state,
									replacement,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
									operation.visible && isAcceptedHostConnected(state, operation.id),
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
											? firstPortalChildNode(state, activeNodes, operation.parent)
											: null
										: nodeFor(activeNodes, operation.before, `${operation.op} before`);
								if (operation.parent === null) state.ownedPageRoots.add(node);
								if (operation.wasConnected && !operation.willBeConnected) {
									deactivateMainThreadSubtree(state, operation.id);
								}
								state.papi.insertBefore(parent, node, before);
								if (!operation.wasConnected && operation.willBeConnected) {
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
								deactivateMainThreadSubtree(state, operation.id);
								state.papi.remove(parent, node);
								if (operation.parent === null) state.ownedPageRoots.delete(node);
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
									if (isAcceptedHostConnected(state, operation.id)) {
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
		capabilities: { text: 'host', visibility: true },
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
			return container[LYNX_HOST_STATE].records.get(id)?.handle ?? null;
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
