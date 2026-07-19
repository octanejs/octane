import type {
	UniversalEventListenerDescriptor,
	UniversalHostBatch,
	UniversalHostCommitContext,
	UniversalHostDriver,
	UniversalPreparedHostBatch,
} from 'octane/universal/native';
import { LYNX_RENDERER_ID } from '../config.js';
import type { LynxElementPAPI, LynxElementRef } from './papi.js';

const LYNX_HOST_STATE: unique symbol = Symbol('octane.lynx.host-state');

type LynxHostParent = number | null | undefined;

export interface LynxHostHandle {
	readonly $$kind: 'octane.lynx.element';
	readonly renderer: typeof LYNX_RENDERER_ID;
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
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

interface LynxHostState<Node extends LynxElementRef> {
	readonly papi: LynxElementPAPI<Node>;
	records: Map<number, LynxHostRecord<Node>>;
	rootChildren: number[];
	generations: Map<number, number>;
	readonly ownedNodes: Set<Node>;
	readonly ownedPageRoots: Set<Node>;
	acceptedVersion: number;
	disposed: boolean;
	disposing: boolean;
	faulted: boolean;
	cleanupNeedsFlush: boolean;
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

type LynxApplyOperation<Node extends LynxElementRef> =
	| {
			readonly op: 'create';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
			readonly record: LynxHostRecord<Node>;
	  }
	| {
			readonly op: 'update';
			readonly id: number;
			readonly type: string;
			readonly previous: Readonly<Record<string, unknown>>;
			readonly next: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'recreate';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
			readonly parent: LynxHostParent;
			readonly children: readonly number[];
			readonly visible: boolean;
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
	  }
	| { readonly op: 'destroy'; readonly id: number }
	| { readonly op: 'event' };

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
	if (typeof props.value !== 'string' || Object.keys(props).some((name) => name !== 'value')) {
		throw hostError(`${label} for #text must contain only a string value.`);
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

function applyProps<Node extends LynxElementRef>(
	papi: LynxElementPAPI<Node>,
	node: Node,
	type: string,
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
	creating: boolean,
): void {
	if (type === '#text') {
		if (!creating && !Object.is(previous.value, next.value)) {
			papi.setAttribute(node, 'text', next.value);
		}
		return;
	}
	const names = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const name of names) {
		const hasNext = Object.prototype.hasOwnProperty.call(next, name);
		const value = hasNext ? next[name] : undefined;
		if (hasNext && Object.prototype.hasOwnProperty.call(previous, name)) {
			if (Object.is(previous[name], value)) continue;
		} else if (!hasNext) {
			if (!Object.prototype.hasOwnProperty.call(previous, name)) continue;
		} else if (value === undefined) {
			continue;
		}
		if (name === 'id') {
			papi.setId(node, value == null ? null : String(value));
		} else {
			papi.setAttribute(node, name, value === undefined ? null : value);
		}
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
		acceptedVersion: 0,
		disposed: false,
		disposing: false,
		faulted: false,
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
			operations.push({ op: 'create', id: command.id, type: command.type, props, record });
			touchHandle(command.id);
		} else if (command.op === 'update') {
			assertSafeId(command.id, `command ${index} update.id`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown update target ${command.id}.`);
			captureInitialNode(command.id);
			const props = cloneProps(command.props, `command ${index} update.props`);
			assertTextProps(record.type, props, `command ${index} update.props`);
			operations.push({
				op: 'update',
				id: command.id,
				type: record.type,
				previous: record.props,
				next: props,
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
			operations.push({ op: 'visibility', id: command.id, state: command.state });
		} else if (command.op === 'event') {
			assertSafeId(command.id, `command ${index} event.id`);
			assertHostType(command.type, `command ${index} event.type`);
			const record = writeRecord(command.id);
			if (record === undefined) throw hostError(`unknown event target ${command.id}.`);
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
			operations.push({ op: 'event' });
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
			deleteRecord(command.id);
			operations.push({ op: 'destroy', id: command.id });
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
			mutationStarted = true;
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
				let applicationFailed = false;
				let applicationError: unknown;
				try {
					for (const operation of operations) {
						if (operation.op === 'create') {
							const node = state.papi.createElement(
								operation.type,
								container.pageComponentUniqueId,
								textValue(operation.props),
							);
							state.ownedNodes.add(node);
							activeNodes.set(operation.id, node);
							operation.record.node = node;
							applyProps(state.papi, node, operation.type, {}, operation.props, true);
						} else if (operation.op === 'update') {
							applyProps(
								state.papi,
								nodeFor(activeNodes, operation.id, 'update'),
								operation.type,
								operation.previous,
								operation.next,
								false,
							);
						} else if (operation.op === 'recreate') {
							const previous = nodeFor(activeNodes, operation.id, 'recreate');
							const replacement = state.papi.createElement(
								operation.type,
								container.pageComponentUniqueId,
								textValue(operation.props),
							);
							state.ownedNodes.add(replacement);
							activeNodes.set(operation.id, replacement);
							operation.record.node = replacement;
							applyProps(state.papi, replacement, operation.type, {}, operation.props, true);
							if (!operation.visible) state.papi.setAttribute(replacement, 'hidden', true);
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
							state.ownedNodes.delete(previous);
						} else if (operation.op === 'insert' || operation.op === 'move') {
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
							const node = nodeFor(activeNodes, operation.id, 'remove');
							const parent =
								operation.parent === null
									? container.page
									: nodeFor(activeNodes, operation.parent, 'remove parent');
							state.papi.remove(parent, node);
							if (operation.parent === null) state.ownedPageRoots.delete(node);
						} else if (operation.op === 'visibility') {
							state.papi.setAttribute(
								nodeFor(activeNodes, operation.id, 'visibility'),
								'hidden',
								operation.state === 'hidden' ? true : null,
							);
						} else if (operation.op === 'destroy') {
							const node = activeNodes.get(operation.id);
							if (node !== undefined) state.ownedNodes.delete(node);
							activeNodes.delete(operation.id);
						}
					}
				} catch (error) {
					applicationFailed = true;
					applicationError = error;
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
	const complete = state.ownedPageRoots.size === 0 && !state.cleanupNeedsFlush;
	if (complete) {
		state.ownedNodes.clear();
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
