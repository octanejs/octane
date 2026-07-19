import type {
	UniversalEventListenerDescriptor,
	UniversalHostBatch,
	UniversalHostCommitContext,
	UniversalHostDriver,
	UniversalPreparedHostBatch,
} from 'octane/universal/native';
import { LYNX_RENDERER_ID } from '../config.js';
import {
	decodeLynxNativeEventToken,
	encodeLynxNativeEventToken,
	parseLynxNativeEventProp,
	type LynxNativeEventBinding,
	type LynxNativeEventToken,
} from './native-events.js';
import {
	LYNX_CSS_SCOPE_PROP,
	planLynxHostPropPatch,
	type LynxHostPropPatch,
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
	LynxElementPAPI,
	LynxElementRef,
	LynxListComponentAtIndex,
	LynxListComponentAtIndexes,
	LynxListEnqueueComponent,
} from './papi.js';

const LYNX_HOST_STATE: unique symbol = Symbol('octane.lynx.host-state');

type LynxHostParent = number | null | undefined;

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
	records: Map<number, LynxHostRecord<Node>>;
	rootChildren: number[];
	generations: Map<number, number>;
	readonly ownedNodes: Set<Node>;
	readonly ownedPageRoots: Set<Node>;
	/** Physical listener journal retained until native removal succeeds. */
	readonly nativeEvents: Map<Node, Map<string, LynxNativeEventRegistration>>;
	readonly lists: Map<number, LynxNativeListState<Node>>;
	readonly onAttachments?: (version: number, deltas: readonly LynxHostAttachmentDelta[]) => void;
	readonly onCallbackFault?: (version: number, error: unknown) => void;
	acceptedVersion: number;
	disposed: boolean;
	disposing: boolean;
	faulted: boolean;
	applying: boolean;
	cleanupNeedsFlush: boolean;
}

interface LynxNativeEventRegistration {
	readonly binding: LynxNativeEventBinding;
	readonly token: LynxNativeEventToken;
}

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
			readonly parent: number | null;
			readonly before: number | null;
			readonly previousParent: LynxHostParent;
	  }
	| {
			readonly op: 'remove';
			readonly id: number;
			readonly parent: number | null;
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

function cloneHostValue(value: unknown, seen: WeakSet<object>): unknown {
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
	if (seen.has(value)) throw hostError('host props cannot contain cycles.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			return Object.freeze(value.map((entry) => cloneHostValue(entry, seen)));
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw hostError(
				`host props require plain objects, received ${Object.prototype.toString.call(value)}.`,
			);
		}
		const clone = Object.create(null) as Record<string, unknown>;
		for (const [name, entry] of Object.entries(value)) {
			Object.defineProperty(clone, name, {
				configurable: true,
				enumerable: true,
				value: cloneHostValue(entry, seen),
				writable: true,
			});
		}
		return Object.freeze(clone);
	} finally {
		seen.delete(value);
	}
}

function cloneProps(value: unknown, label: string): Readonly<Record<string, unknown>> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw hostError(`${label} must be a plain object.`);
	}
	const clone = cloneHostValue(value, new WeakSet());
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

function assertParent(value: unknown, label: string): asserts value is number | null {
	if (value === null) return;
	if (typeof value === 'object') throw hostError(`${label} cannot be a portal target.`);
	assertSafeId(value, label);
}

function assertNoCycle<Node extends LynxElementRef>(
	getRecord: (id: number) => LynxHostRecord<Node> | undefined,
	id: number,
	parent: number | null,
): void {
	let current = parent;
	const visited = new Set<number>();
	while (current !== null) {
		if (current === id) throw hostError(`placement of ${id} would create a cycle.`);
		if (visited.has(current)) throw hostError(`existing topology contains a cycle at ${current}.`);
		visited.add(current);
		const record = getRecord(current);
		if (record === undefined) throw hostError(`unknown parent ${current}.`);
		if (record.parent === undefined) return;
		current = record.parent;
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
		current = record.parent;
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
	papi: LynxElementPAPI<Node>,
	node: Node,
	type: string,
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
	patch: LynxHostPropPatch,
	creating: boolean,
	visible: boolean,
): void {
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

function removeNativeEvent<Node extends LynxElementRef>(
	state: LynxHostState<Node>,
	node: Node,
	type: string,
): void {
	const events = state.nativeEvents.get(node);
	const registration = events?.get(type);
	if (registration === undefined) return;
	state.papi.setEvent(node, registration.binding.type, registration.binding.name, undefined);
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
	if (events.get(type)?.token === token) return;
	// Journal the intended token before entering PAPI. If native replacement
	// mutates and then throws, terminal cleanup still knows which tuple to clear.
	events.set(type, Object.freeze({ binding, token }));
	state.papi.setEvent(node, binding.type, binding.name, token);
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
	while (current !== undefined && typeof current.parent === 'number') {
		if (visited.has(current.handle.id)) throw hostError('list ancestry contains a cycle.');
		visited.add(current.handle.id);
		const parent = getRecord(current.parent);
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
		state.papi,
		node,
		record.type,
		{},
		record.props,
		planLynxHostPropPatch(record.type, {}, record.props),
		true,
		record.visible,
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
	desired.node = tree.node;
	installNodesRefSelector(state.papi, tree.node, desired.handle);
	applyProps(
		state.papi,
		tree.node,
		desired.type,
		tree.props,
		desired.props,
		patch,
		false,
		desired.visible,
	);
	if (!desired.visible) state.papi.setAttribute(tree.node, 'hidden', true);
	else {
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
		records: new Map(),
		rootChildren: [],
		generations: new Map(),
		ownedNodes: new Set(),
		ownedPageRoots: new Set(),
		nativeEvents: new Map(),
		lists: new Map(),
		onAttachments: options.onAttachments,
		onCallbackFault: options.onCallbackFault,
		acceptedVersion: 0,
		disposed: false,
		disposing: false,
		faulted: false,
		applying: false,
		cleanupNeedsFlush: false,
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

export function prepareLynxHostBatch<Node extends LynxElementRef>(
	container: LynxHostContainer<Node>,
	batch: UniversalHostBatch,
): LynxPreparedHostBatch {
	const state = container[LYNX_HOST_STATE];
	if (state.disposed) throw hostError('cannot prepare a batch for a disposed root.');
	if (state.disposing) throw hostError('cannot prepare a batch while root cleanup is pending.');
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
	const childrenForRead = (parent: number | null): readonly number[] => {
		if (parent === null) return stagedRootChildren ?? state.rootChildren;
		const record = getRecord(parent);
		if (record === undefined) throw hostError(`unknown parent ${parent}.`);
		return record.children;
	};
	const childrenForWrite = (parent: number | null): number[] => {
		if (parent === null) return rootChildrenForWrite();
		const record = writeRecord(parent);
		if (record === undefined) throw hostError(`unknown parent ${parent}.`);
		return record.children;
	};
	const captureInitialNode = (id: number): void => {
		if (initialNodes.has(id)) return;
		const node = state.records.get(id)?.node;
		if (node != null) initialNodes.set(id, node);
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
			for (const childId of recreateChildren) captureInitialNode(childId);
			operations.push({
				op: 'recreate',
				id: command.id,
				type: command.type,
				props,
				parent: record.parent,
				children: recreateChildren,
				visible: record.visible,
				events: new Map(record.events),
				generation,
				patch,
				handle,
				record,
			});
			setGeneration(command.id, generation);
			record.props = props;
			record.handle = handle;
			touchHandle(command.id);
		} else if (command.op === 'insert' || command.op === 'move') {
			assertSafeId(command.id, `command ${index} ${command.op}.id`);
			assertParent(command.parent, `command ${index} ${command.op}.parent`);
			if (command.before !== null) {
				assertSafeId(command.before, `command ${index} ${command.op}.before`);
			}
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown ${command.op} target ${command.id}.`);
			captureInitialNode(command.id);
			if (typeof command.parent === 'number') captureInitialNode(command.parent);
			if (command.before !== null) captureInitialNode(command.before);
			if (command.op === 'insert' && record.parent !== undefined) {
				throw hostError(`insert target ${command.id} is already attached.`);
			}
			if (command.op === 'move' && record.parent === undefined) {
				throw hostError(`move target ${command.id} is detached.`);
			}
			if (record.type === '#text' || record.type === 'raw-text') {
				const parentRecord =
					typeof command.parent === 'number' ? getRecord(command.parent) : undefined;
				if (parentRecord?.type !== 'text') {
					throw hostError(
						`${record.type} host ${command.id} may only be placed directly under a text host.`,
					);
				}
			}
			assertNoCycle(getRecord, command.id, command.parent);
			const previousParent = record.parent;
			if (previousParent !== undefined) {
				const previousChildren = childrenForWrite(previousParent);
				const previousIndex = previousChildren.indexOf(command.id);
				if (previousIndex === -1) {
					throw hostError(`topology is missing ${command.id} from its current parent.`);
				}
				previousChildren.splice(previousIndex, 1);
			}
			const children = childrenForWrite(command.parent);
			let beforeIndex = children.length;
			if (command.before !== null) {
				beforeIndex = children.indexOf(command.before);
				if (beforeIndex === -1) {
					throw hostError(`before host ${command.before} is not a child of the requested parent.`);
				}
			}
			children.splice(beforeIndex, 0, command.id);
			record.parent = command.parent;
			operations.push({
				op: command.op,
				id: command.id,
				parent: command.parent,
				before: command.before,
				previousParent,
			});
		} else if (command.op === 'remove') {
			assertSafeId(command.id, `command ${index} remove.id`);
			assertParent(command.parent, `command ${index} remove.parent`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown remove target ${command.id}.`);
			captureInitialNode(command.id);
			if (typeof command.parent === 'number') captureInitialNode(command.parent);
			if (record.parent !== command.parent) {
				throw hostError(`remove parent does not own host ${command.id}.`);
			}
			const children = childrenForWrite(command.parent);
			const childIndex = children.indexOf(command.id);
			if (childIndex === -1) throw hostError(`remove target ${command.id} is not attached.`);
			children.splice(childIndex, 1);
			record.parent = undefined;
			operations.push({ op: 'remove', id: command.id, parent: command.parent });
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
	const listIds = new Set<number>();
	for (const [id, record] of state.records) {
		if (record.type === 'list') listIds.add(id);
	}
	for (const id of finalIds) {
		const record = getRecord(id)!;
		if (record.type === 'list') listIds.add(id);
		if (record.type === 'list' && directListItem(getRecord, id) !== null) {
			throw hostError('nested <list> hosts are not supported by the initial recycling contract.');
		}
		if (record.type === 'list-item' && typeof record.parent === 'number') {
			const parent = getRecord(record.parent);
			if (parent?.type !== 'list') {
				throw hostError(`<list-item> ${id} must be placed directly under a <list>.`);
			}
		}
	}
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
	let status: 'prepared' | 'applying' | 'applied' | 'aborted' | 'faulted' = 'prepared';
	let mutationStarted = false;
	let fault: unknown;

	const prepared: LynxPreparedHostBatch = {
		get mutationStarted() {
			return mutationStarted;
		},
		handleDelta,
		apply() {
			if (status === 'aborted' || status === 'applied') return;
			if (status === 'faulted') throw fault;
			if (status !== 'prepared') return;
			if (state.disposed || state.disposing) {
				throw hostError('cannot apply a batch while root cleanup is pending.');
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
						for (const operation of operations) {
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
									state.papi,
									node,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
								);
							} else if (operation.op === 'update') {
								if (!activeNodes.has(operation.id)) continue;
								applyProps(
									state.papi,
									nodeFor(activeNodes, operation.id, 'update'),
									operation.type,
									operation.previous,
									operation.next,
									operation.patch,
									false,
									operation.visible,
								);
							} else if (operation.op === 'recreate') {
								if (!activeNodes.has(operation.id)) continue;
								const previous = nodeFor(activeNodes, operation.id, 'recreate');
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
									state.papi,
									replacement,
									operation.type,
									{},
									operation.props,
									operation.patch,
									true,
									operation.visible,
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
								if (operation.parent !== undefined) {
									if (operation.parent === null) state.ownedPageRoots.add(replacement);
									state.papi.replace(replacement, previous);
									if (operation.parent === null) state.ownedPageRoots.delete(previous);
								}
								removeAllNativeEvents(state, previous);
								state.ownedNodes.delete(previous);
							} else if (operation.op === 'insert' || operation.op === 'move') {
								const parentRecord =
									typeof operation.parent === 'number'
										? state.records.get(operation.parent)
										: undefined;
								if (parentRecord?.type === 'list') continue;
								if (!activeNodes.has(operation.id)) continue;
								const node = nodeFor(activeNodes, operation.id, operation.op);
								const parent =
									operation.parent === null
										? container.page
										: nodeFor(activeNodes, operation.parent, `${operation.op} parent`);
								const before =
									operation.before === null
										? null
										: nodeFor(activeNodes, operation.before, `${operation.op} before`);
								if (operation.parent === null) state.ownedPageRoots.add(node);
								state.papi.insertBefore(parent, node, before);
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
								const parent =
									operation.parent === null
										? container.page
										: nodeFor(activeNodes, operation.parent, 'remove parent');
								state.papi.remove(parent, node);
								if (operation.parent === null) state.ownedPageRoots.delete(node);
							} else if (operation.op === 'visibility') {
								if (!activeNodes.has(operation.id)) continue;
								const node = nodeFor(activeNodes, operation.id, 'visibility');
								if (operation.state === 'hidden') removeAllNativeEvents(state, node);
								state.papi.setAttribute(
									node,
									'hidden',
									operation.state === 'hidden' ? true : operation.authoredHidden,
								);
								if (operation.state === 'visible') {
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
		if (descriptor.id !== identity.listener || physical.get(type)?.token !== token) continue;
		return Object.freeze({ listener: descriptor.id, priority: descriptor.priority });
	}
	return null;
}

function normalizeCleanupError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
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
	const roots = [...state.ownedPageRoots];
	const errors: Error[] = [];
	for (const listId of [...state.lists.keys()]) {
		try {
			disposeNativeListState(state, listId);
			state.cleanupNeedsFlush = true;
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
	for (const node of roots) {
		let attached: boolean;
		try {
			attached = state.papi.isChild(container.page, node);
		} catch (error) {
			errors.push(normalizeCleanupError(error));
			continue;
		}
		if (attached) {
			try {
				state.papi.remove(container.page, node);
			} catch (error) {
				try {
					// Native removal may detach and then throw. Forget ownership only
					// when public parent inspection proves the mutation completed.
					if (state.papi.isChild(container.page, node)) {
						errors.push(normalizeCleanupError(error));
						continue;
					}
				} catch (inspectionError) {
					errors.push(normalizeCleanupError(error));
					errors.push(normalizeCleanupError(inspectionError));
					continue;
				}
			}
		}
		state.ownedPageRoots.delete(node);
		state.cleanupNeedsFlush = true;
		removedRoots += 1;
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
	const complete =
		state.ownedPageRoots.size === 0 &&
		state.nativeEvents.size === 0 &&
		state.lists.size === 0 &&
		!state.cleanupNeedsFlush;
	if (complete) {
		state.ownedNodes.clear();
		state.nativeEvents.clear();
		state.lists.clear();
		state.records.clear();
		state.rootChildren.length = 0;
		state.generations.clear();
		state.disposing = false;
		state.disposed = true;
	}
	return Object.freeze({
		complete,
		removedRoots,
		remainingRoots: state.ownedPageRoots.size,
		flushed,
		errors: Object.freeze(errors),
	});
}
