import type {
	UniversalHostAttachmentBatch,
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalHostPropCodecContext,
	UniversalPortalTargetContext,
	UniversalPortalTargetRegistration,
	UniversalSerializableValue,
	UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxPublicHandleDelta,
	type LynxHostAttachmentChange,
} from './protocol.js';
import { planLynxHostPropPatch } from './host-props.js';
import { parseLynxNativeEventProp } from './native-events.js';
import { isLynxNativeResource } from '../resource.js';
import {
	getThreadFunctionDescriptor,
	isLynxMainThreadWorkletDescriptor,
	type LynxBackgroundFunctionRegistry,
	type LynxWorkletValue,
} from './worklets.js';
import {
	createLynxNodesRef,
	createLynxNodesRefSelector,
	type LynxCreateSelectorQuery,
	type LynxMeasureOptions,
	type LynxMeasureResult,
	type LynxNodesRefBinding,
	type LynxNodesRefFieldsOptions,
	type LynxNodesRefFieldsResult,
	type LynxNodesRefPathResult,
} from './nodes-ref.js';
import { encodeLynxPortalTargetId } from './portal.js';

export interface LynxPublicHandle {
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly active: boolean;
	/** Physical Element presence; false while a native list cell is recycled. */
	readonly attached: boolean;
	readonly snapshot: UniversalSerializableValue;
	invoke<Result extends UniversalSerializableValue = UniversalSerializableValue>(
		method: string,
		params?: Readonly<Record<string, UniversalSerializableValue>>,
	): Promise<Result>;
	measure(options?: LynxMeasureOptions): Promise<LynxMeasureResult>;
	fields(options: LynxNodesRefFieldsOptions): Promise<LynxNodesRefFieldsResult>;
	path(): Promise<LynxNodesRefPathResult | null>;
	setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>): Promise<void>;
}

/**
 * The background's record of one accepted host node.
 *
 * A mount acknowledges one of these per node, so the entry is the shape the
 * whole subsystem is tuned around: a single monomorphic object holding
 * identity plus mutable acknowledgement state, allocated once and mutated in
 * place. Everything a consumer can *observe* about a node — the frozen
 * `LynxPublicHandle` facade, its `NodesRef` query binding, and the defensive
 * snapshot clone — is built on first use instead. Refs, queries, and portals
 * reach a handful of nodes in a real screen; eagerly building three objects
 * and a WeakMap entry for all of them charged every mount for a feature
 * almost none of its nodes use.
 */
interface LynxHandleEntry {
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly createSelectorQuery: LynxCreateSelectorQuery;
	active: boolean;
	attached: boolean;
	listDescendant: boolean;
	attachmentEpoch: number;
	/** Acknowledged snapshot, still owned by the inbound message. */
	rawSnapshot: UniversalSerializableValue;
	/** Cached defensive clone handed to consumers; built on first read. */
	clonedSnapshot: UniversalSerializableValue | undefined;
	facade: LynxPublicHandle | null;
	binding: LynxNodesRefBinding | null;
	/** Sticky invalidation recorded while `binding` was still unmaterialized. */
	invalidation: { readonly reason: unknown } | null;
}

/** The mutable half of an entry, captured so a rejected acknowledgement can roll back. */
interface LynxHandleStateSnapshot {
	readonly active: boolean;
	readonly attached: boolean;
	readonly listDescendant: boolean;
	readonly attachmentEpoch: number;
	readonly rawSnapshot: UniversalSerializableValue;
	readonly clonedSnapshot: UniversalSerializableValue | undefined;
}

/** Reverse lookup for the few facades that were actually handed out. */
const FACADE_ENTRY = new WeakMap<LynxPublicHandle, LynxHandleEntry>();

function captureHandleState(entry: LynxHandleEntry): LynxHandleStateSnapshot {
	return {
		active: entry.active,
		attached: entry.attached,
		listDescendant: entry.listDescendant,
		attachmentEpoch: entry.attachmentEpoch,
		rawSnapshot: entry.rawSnapshot,
		clonedSnapshot: entry.clonedSnapshot,
	};
}

function restoreHandleState(
	entry: LynxHandleEntry,
	state: LynxHandleStateSnapshot,
	attachmentEpoch = state.attachmentEpoch,
): void {
	entry.active = state.active;
	entry.attached = state.attached;
	entry.listDescendant = state.listDescendant;
	entry.attachmentEpoch = attachmentEpoch;
	entry.rawSnapshot = state.rawSnapshot;
	entry.clonedSnapshot = state.clonedSnapshot;
}

function nextAttachmentEpoch(entry: LynxHandleEntry, attached: boolean): number {
	if (entry.attached === attached) return entry.attachmentEpoch;
	if (entry.attachmentEpoch === Number.MAX_SAFE_INTEGER) {
		throw new Error('Octane Lynx physical attachment epoch is exhausted.');
	}
	return entry.attachmentEpoch + 1;
}

/**
 * Invalidate a handle's query binding, replaying the reason if the binding has
 * not been materialized yet. An unmaterialized binding owns no pending
 * operations, so nothing observable is deferred by recording the reason here.
 */
function invalidateHandleBinding(entry: LynxHandleEntry, reason: unknown): void {
	if (entry.binding !== null) {
		entry.binding.invalidate(reason);
		return;
	}
	entry.invalidation ??= { reason };
}

/** Reject in-flight operations owned by a detached cell. Inert without a binding. */
function invalidateHandleAttachment(entry: LynxHandleEntry): void {
	entry.binding?.invalidateAttachment();
}

function handleBinding(entry: LynxHandleEntry): LynxNodesRefBinding {
	let binding = entry.binding;
	if (binding !== null) return binding;
	const { root, id, type, generation } = entry;
	const selector = createLynxNodesRefSelector(root, id, generation);
	binding = createLynxNodesRef({
		identity: { root, id, type, generation, selector },
		createSelectorQuery: entry.createSelectorQuery,
		readState() {
			return {
				root,
				id,
				type,
				generation,
				selector,
				active: entry.active && entry.attached,
				attachmentEpoch: entry.attachmentEpoch,
			};
		},
	});
	entry.binding = binding;
	if (entry.invalidation !== null) binding.invalidate(entry.invalidation.reason);
	return binding;
}

/** Build the frozen public facade for one entry, once. */
function handleFacade(entry: LynxHandleEntry): LynxPublicHandle {
	let facade = entry.facade;
	if (facade !== null) return facade;
	facade = Object.freeze({
		renderer: LYNX_TRANSPORT_RENDERER,
		root: entry.root,
		id: entry.id,
		type: entry.type,
		generation: entry.generation,
		get active(): boolean {
			return entry.active;
		},
		get attached(): boolean {
			return entry.attached;
		},
		get snapshot(): UniversalSerializableValue {
			return (entry.clonedSnapshot ??= cloneSnapshot(entry.rawSnapshot));
		},
		invoke<Result extends UniversalSerializableValue = UniversalSerializableValue>(
			method: string,
			params?: Readonly<Record<string, UniversalSerializableValue>>,
		) {
			return handleBinding(entry).handle.invoke<Result>(method, params);
		},
		measure(options?: LynxMeasureOptions) {
			return handleBinding(entry).handle.measure(options);
		},
		fields(options: LynxNodesRefFieldsOptions) {
			return handleBinding(entry).handle.fields(options);
		},
		path() {
			return handleBinding(entry).handle.path();
		},
		setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>) {
			return handleBinding(entry).handle.setNativeProps(props);
		},
	}) as LynxPublicHandle;
	entry.facade = facade;
	FACADE_ENTRY.set(facade, entry);
	return facade;
}

function createHandleEntry(
	root: number,
	id: number,
	type: string,
	generation: number,
	snapshot: UniversalSerializableValue,
	createSelectorQuery: LynxCreateSelectorQuery,
): LynxHandleEntry {
	return {
		root,
		id,
		type,
		generation,
		createSelectorQuery,
		active: false,
		attached: false,
		listDescendant: false,
		attachmentEpoch: 0,
		rawSnapshot: snapshot,
		clonedSnapshot: undefined,
		facade: null,
		binding: null,
		invalidation: null,
	};
}

interface LynxClientContainerState {
	handles: Map<number, LynxHandleEntry>;
	readonly generations: Map<number, number>;
	readonly worklets?: LynxBackgroundFunctionRegistry;
	readonly createSelectorQuery: LynxCreateSelectorQuery;
	readonly attachmentSubscribers: Set<(batch: UniversalHostAttachmentBatch) => void>;
}

const CONTAINER_STATE = new WeakMap<LynxClientContainer, LynxClientContainerState>();

export interface LynxClientContainer {
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	getPublicHandle(id: number): LynxPublicHandle | null;
}

export interface CreateLynxClientContainerOptions {
	readonly createSelectorQuery?: LynxCreateSelectorQuery;
	/** Background-owned execution lifetimes embedded in main-thread captures. */
	readonly worklets?: LynxBackgroundFunctionRegistry;
}

export function createLynxClientContainer(
	options: CreateLynxClientContainerOptions = {},
): LynxClientContainer {
	const createSelectorQuery =
		options.createSelectorQuery ??
		(() => {
			throw new Error(
				'Octane Lynx NodesRef requires the public background-thread lynx.createSelectorQuery() API.',
			);
		});
	if (typeof createSelectorQuery !== 'function') {
		throw new TypeError('Octane Lynx createSelectorQuery must be a function when provided.');
	}
	const container: LynxClientContainer = Object.freeze({
		renderer: LYNX_TRANSPORT_RENDERER,
		getPublicHandle(id: number) {
			const entry = CONTAINER_STATE.get(container)!.handles.get(id);
			return entry === undefined ? null : handleFacade(entry);
		},
	});
	CONTAINER_STATE.set(container, {
		handles: new Map(),
		generations: new Map(),
		worklets: options.worklets,
		createSelectorQuery,
		attachmentSubscribers: new Set(),
	});
	return container;
}

function collectWorkletExecutionIds(
	value: unknown,
	output: Set<string>,
	seen = new Set<object>(),
): void {
	if (value === null || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const entry of value) collectWorkletExecutionIds(entry, output, seen);
		return;
	}
	const execution = (value as { readonly _execId?: unknown })._execId;
	if (typeof execution === 'string' && execution.length !== 0) output.add(execution);
	for (const entry of Object.values(value)) collectWorkletExecutionIds(entry, output, seen);
}

/** Bind background closures only after a complete render reaches the transport boundary. */
export function prepareLynxClientWorkletBatch(
	container: LynxClientContainer,
	batch: UniversalHostBatch,
): UniversalHostBatch {
	const worklets = containerState(container).worklets;
	if (worklets === undefined) return batch;
	const retained = new Set<string>();
	try {
		const commands = batch.commands.map((command) => {
			if (command.op !== 'create' && command.op !== 'update' && command.op !== 'recreate') {
				return command;
			}
			let changed = false;
			const props: Record<string, unknown> = { ...command.props };
			for (const name of Object.keys(props)) {
				if (!name.startsWith('main-thread:') || name === 'main-thread:ref') continue;
				const value = props[name];
				if (value === null || value === undefined) continue;
				const descriptor = getThreadFunctionDescriptor(value);
				if (!isLynxMainThreadWorkletDescriptor(descriptor)) {
					throw new TypeError(
						`Octane Lynx ${JSON.stringify(name)} requires a compiler-transformed main-thread function.`,
					);
				}
				const bound = worklets.retain(descriptor as LynxWorkletValue);
				collectWorkletExecutionIds(bound, retained);
				props[name] = bound;
				changed = true;
			}
			return changed ? Object.freeze({ ...command, props: Object.freeze(props) }) : command;
		});
		return Object.freeze({ ...batch, commands: Object.freeze(commands) });
	} catch (error) {
		for (const execution of retained) worklets.release(execution);
		throw error;
	}
}

function containerState(container: LynxClientContainer): LynxClientContainerState {
	const state = CONTAINER_STATE.get(container);
	if (state === undefined) {
		throw new TypeError('Octane Lynx client driver received a foreign container.');
	}
	return state;
}

function cloneSnapshot(value: UniversalSerializableValue): UniversalSerializableValue {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return Object.freeze(value.map(cloneSnapshot));
	const source = value as Record<string, UniversalSerializableValue>;
	const output: Record<string, UniversalSerializableValue> = {};
	// Assignment, not defineProperty: this runs once per accepted host node, and
	// a property definition per field is measurably slower. `__proto__` is the
	// one name assignment would route to the prototype setter instead of an own
	// data property, so it keeps the explicit definition.
	for (const name of Object.keys(source)) {
		const child = cloneSnapshot(source[name]!);
		if (name === '__proto__') {
			Object.defineProperty(output, name, {
				configurable: true,
				enumerable: true,
				value: child,
				writable: true,
			});
		} else {
			output[name] = child;
		}
	}
	return Object.freeze(output);
}

function validateSnapshotIdentity(
	snapshot: UniversalSerializableValue,
	identity: UniversalTransportIdentity,
	delta: Extract<LynxPublicHandleDelta, { readonly op: 'upsert' }>,
): void {
	if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		throw new Error(
			`Octane Lynx acknowledgement snapshot for handle ${delta.id} is not an object.`,
		);
	}
	// One acknowledged node per accepted host node runs this, so the checks are
	// written as direct comparisons: an expected-shape object plus Object.entries
	// allocated two objects and an array of pairs per node, and the selector
	// string was built even when the snapshot already carried a matching one.
	const value = snapshot as Record<string, UniversalSerializableValue>;
	const foreign = (name: string): never => {
		throw new Error(
			`Octane Lynx acknowledgement snapshot has foreign ${name} for handle ${delta.id}.`,
		);
	};
	if (value.$$kind !== 'octane.lynx.element') foreign('$$kind');
	if (value.renderer !== LYNX_TRANSPORT_RENDERER) foreign('renderer');
	if (value.root !== identity.root) foreign('root');
	if (value.id !== delta.id) foreign('id');
	if (value.type !== delta.type) foreign('type');
	if (value.generation !== delta.generation) foreign('generation');
	if (value.selector !== createLynxNodesRefSelector(identity.root, delta.id, delta.generation)) {
		foreign('selector');
	}
}

export interface LynxPreparedHandleDeltas {
	apply(): void;
	rollback(): void;
}

interface LynxHandleTransition {
	readonly initial: LynxHandleEntry | undefined;
	present: boolean;
	type: string | null;
	identityChanged: boolean;
	snapshotChanged: boolean;
}

type LynxExpectedHandleDelta = 'none' | 'create' | 'update' | 'recreate' | 'remove';

function expectedHandleDelta(transition: LynxHandleTransition): LynxExpectedHandleDelta {
	if (transition.initial === undefined) return transition.present ? 'create' : 'none';
	if (!transition.present) return 'remove';
	if (transition.identityChanged) return 'recreate';
	return transition.snapshotChanged ? 'update' : 'none';
}

/** @internal Used by the background transport immediately before core ACK. */
export function prepareLynxHandleDeltas(
	container: LynxClientContainer,
	batch: UniversalHostBatch,
	deltas: readonly LynxPublicHandleDelta[],
	identity: UniversalTransportIdentity,
): LynxPreparedHandleDeltas {
	const state = containerState(container);
	if (
		identity.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION ||
		identity.renderer !== LYNX_TRANSPORT_RENDERER ||
		batch.renderer !== LYNX_TRANSPORT_RENDERER ||
		identity.version !== batch.version ||
		!Number.isSafeInteger(identity.root) ||
		identity.root <= 0
	) {
		throw new Error('Octane Lynx acknowledgement has a foreign transport identity.');
	}
	const originalHandles = state.handles;
	const stagedHandles = new Map<number, LynxHandleEntry | null>();
	const finalHandle = (id: number): LynxHandleEntry | undefined => {
		if (!stagedHandles.has(id)) return originalHandles.get(id);
		return stagedHandles.get(id) ?? undefined;
	};
	const transitions = new Map<number, LynxHandleTransition>();
	const transitionFor = (id: number): LynxHandleTransition => {
		let transition = transitions.get(id);
		if (transition !== undefined) return transition;
		const initial = originalHandles.get(id);
		transition = {
			initial,
			present: initial !== undefined,
			type: initial?.type ?? null,
			identityChanged: false,
			snapshotChanged: false,
		};
		transitions.set(id, transition);
		return transition;
	};
	for (const command of batch.commands) {
		if (
			command.op !== 'create' &&
			command.op !== 'update' &&
			command.op !== 'recreate' &&
			command.op !== 'destroy'
		) {
			continue;
		}
		const transition = transitionFor(command.id);
		if (command.op === 'create') {
			if (transition.present) {
				throw new Error(`Octane Lynx batch creates existing handle ${command.id}.`);
			}
			transition.present = true;
			transition.type = command.type;
			transition.snapshotChanged = true;
		} else if (command.op === 'update') {
			if (!transition.present) {
				throw new Error(`Octane Lynx batch updates missing handle ${command.id}.`);
			}
			transition.snapshotChanged = true;
		} else if (command.op === 'recreate') {
			if (!transition.present || transition.type !== command.type) {
				throw new Error(`Octane Lynx batch recreates invalid handle ${command.id}.`);
			}
			transition.identityChanged = true;
			transition.snapshotChanged = true;
		} else {
			if (!transition.present) {
				throw new Error(`Octane Lynx batch destroys missing handle ${command.id}.`);
			}
			transition.present = false;
			transition.type = null;
			transition.identityChanged = true;
		}
	}

	const seen = new Set<number>();
	const priorStates = new Map<LynxHandleEntry, LynxHandleStateSnapshot>();
	const nextStates = new Map<LynxHandleEntry, LynxHandleStateSnapshot>();
	const createdHandles = new Set<LynxHandleEntry>();
	const priorGenerations = new Map<number, number | undefined>();
	const nextGenerations = new Map<number, number>();
	// Main owns the accepted host topology and publishes this derived bit. The
	// command gate prevents ancestry state from changing on a non-structural ACK;
	// identity, generation, transition, and change checks guard its lifecycle.
	const hasTopologyMutation = batch.commands.some(
		(command) => command.op === 'insert' || command.op === 'move' || command.op === 'remove',
	);
	const stageGeneration = (id: number, generation: number) => {
		if (!priorGenerations.has(id)) priorGenerations.set(id, state.generations.get(id));
		nextGenerations.set(id, generation);
	};
	for (const delta of deltas) {
		if (seen.has(delta.id)) {
			throw new Error(`Octane Lynx acknowledgement repeats handle ${delta.id}.`);
		}
		seen.add(delta.id);
		const transition = transitions.get(delta.id);
		const expected = transition === undefined ? 'none' : expectedHandleDelta(transition);
		if (delta.op === 'list-ancestry') {
			const handle = originalHandles.get(delta.id);
			if (
				!hasTopologyMutation ||
				expected !== 'none' ||
				handle === undefined ||
				!handle.active ||
				handle.root !== identity.root ||
				handle.generation !== delta.generation
			) {
				throw new Error(
					`Octane Lynx acknowledgement changes list ancestry for stale or transitioning handle ${delta.id}:${delta.generation}.`,
				);
			}
			if (handle.listDescendant === delta.listDescendant) {
				throw new Error(
					`Octane Lynx acknowledgement publishes unchanged list ancestry for handle ${delta.id}.`,
				);
			}
			priorStates.set(handle, captureHandleState(handle));
			nextStates.set(handle, {
				...captureHandleState(handle),
				listDescendant: delta.listDescendant,
			});
			continue;
		}
		if (transition === undefined || expected === 'none') {
			throw new Error(`Octane Lynx acknowledgement publishes unchanged handle ${delta.id}.`);
		}
		if (delta.op === 'remove') {
			if (expected !== 'remove') {
				throw new Error(`Octane Lynx acknowledgement removes non-destroyed handle ${delta.id}.`);
			}
			const previous = transition.initial!;
			if (previous.generation !== delta.generation) {
				throw new Error(
					`Octane Lynx acknowledgement removes stale handle ${delta.id}:${delta.generation}.`,
				);
			}
			priorStates.set(previous, captureHandleState(previous));
			stagedHandles.set(delta.id, null);
			continue;
		}

		if (expected === 'remove') {
			throw new Error(`Octane Lynx acknowledgement retains destroyed handle ${delta.id}.`);
		}
		validateSnapshotIdentity(delta.snapshot, identity, delta);
		const finalType = transition.type!;
		if (expected === 'create') {
			const previousGeneration = state.generations.get(delta.id) ?? 0;
			if (delta.type !== finalType || delta.generation <= previousGeneration) {
				throw new Error(`Octane Lynx acknowledgement has invalid created handle ${delta.id}.`);
			}
			const handle = createHandleEntry(
				identity.root,
				delta.id,
				delta.type,
				delta.generation,
				delta.snapshot,
				state.createSelectorQuery,
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			// A handle this preparation just built is unreachable until apply()
			// publishes it into `state.handles`, so its state is written directly
			// rather than staged. Rollback drops the handle outright, so there is
			// no prior state to restore. This keeps a mount from allocating two
			// state clones and two map entries per accepted node.
			handle.active = true;
			handle.attachmentEpoch = nextAttachmentEpoch(handle, delta.attached);
			handle.attached = delta.attached;
			handle.listDescendant = delta.listDescendant;
			stagedHandles.set(delta.id, handle);
			continue;
		}
		const previous = transition.initial!;
		if (previous.root !== identity.root) {
			throw new Error(`Octane Lynx acknowledgement changes root for retained handle ${delta.id}.`);
		}
		if (expected === 'recreate') {
			const previousGeneration = state.generations.get(delta.id) ?? previous.generation;
			if (
				delta.type !== finalType ||
				delta.generation <= previous.generation ||
				delta.generation <= previousGeneration
			) {
				throw new Error(`Octane Lynx acknowledgement has stale recreated handle ${delta.id}.`);
			}
			priorStates.set(previous, captureHandleState(previous));
			const handle = createHandleEntry(
				identity.root,
				delta.id,
				delta.type,
				delta.generation,
				delta.snapshot,
				state.createSelectorQuery,
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			// A handle this preparation just built is unreachable until apply()
			// publishes it into `state.handles`, so its state is written directly
			// rather than staged. Rollback drops the handle outright, so there is
			// no prior state to restore. This keeps a mount from allocating two
			// state clones and two map entries per accepted node.
			handle.active = true;
			handle.attachmentEpoch = nextAttachmentEpoch(handle, delta.attached);
			handle.attached = delta.attached;
			handle.listDescendant = delta.listDescendant;
			stagedHandles.set(delta.id, handle);
			continue;
		}
		if (delta.type !== finalType || delta.generation !== previous.generation) {
			throw new Error(`Octane Lynx acknowledgement changes retained handle ${delta.id}.`);
		}
		priorStates.set(previous, captureHandleState(previous));
		nextStates.set(previous, {
			active: true,
			attached: delta.attached,
			listDescendant: delta.listDescendant,
			attachmentEpoch: nextAttachmentEpoch(previous, delta.attached),
			rawSnapshot: delta.snapshot,
			clonedSnapshot: undefined,
		});
	}

	for (const [id, transition] of transitions) {
		if (seen.has(id)) continue;
		const expected = expectedHandleDelta(transition);
		if (expected !== 'none') {
			throw new Error(`Octane Lynx acknowledgement omits ${expected}d handle ${id}.`);
		}
	}

	let applied = false;
	let rolledBack = false;
	return {
		apply() {
			if (applied || rolledBack) return;
			applied = true;
			for (const handle of priorStates.keys()) {
				if (finalHandle(handle.id) !== handle) {
					handle.active = false;
					handle.attached = false;
					invalidateHandleBinding(
						handle,
						new Error(`Octane Lynx handle ${handle.id}:${handle.generation} was replaced.`),
					);
				}
			}
			for (const [handle, next] of nextStates) {
				const detached = handle.attached && !next.attached;
				restoreHandleState(handle, next);
				if (detached) invalidateHandleAttachment(handle);
			}
			// forEach, not for-of destructuring: Map iteration allocates an iterator
			// result and a two-element entry array per step, and a mount walks one
			// entry per accepted node.
			stagedHandles.forEach((handle, id) => {
				if (handle === null) originalHandles.delete(id);
				else originalHandles.set(id, handle);
			});
			nextGenerations.forEach((generation, id) => state.generations.set(id, generation));
		},
		rollback() {
			if (!applied || rolledBack) return;
			rolledBack = true;
			for (const id of stagedHandles.keys()) {
				const previous = transitions.get(id)?.initial;
				if (previous === undefined) originalHandles.delete(id);
				else originalHandles.set(id, previous);
			}
			for (const [handle, previous] of priorStates) {
				const detached = handle.attached && !previous.attached;
				restoreHandleState(handle, previous, nextAttachmentEpoch(handle, previous.attached));
				if (detached) invalidateHandleAttachment(handle);
			}
			for (const handle of createdHandles) {
				handle.active = false;
				handle.attached = false;
				invalidateHandleBinding(
					handle,
					new Error(`Octane Lynx handle ${handle.id}:${handle.generation} was rolled back.`),
				);
			}
			for (const [id, previous] of priorGenerations) {
				if (previous === undefined) state.generations.delete(id);
				else state.generations.set(id, previous);
			}
		},
	};
}

/**
 * @internal Whether a decoded native event token still names a live, physically
 * attached host of this container.
 *
 * The engine delivers a background `bind*` event straight to this thread, so
 * this is the background's own staleness gate: it stands in for the main-thread
 * host-tree check that a main-delivered event would get.
 */
export function isLynxClientEventTarget(
	container: LynxClientContainer,
	root: number,
	id: number,
	generation: number,
): boolean {
	const entry = containerState(container).handles.get(id);
	return (
		entry !== undefined &&
		entry.active &&
		entry.attached &&
		entry.root === root &&
		entry.generation === generation
	);
}

/** @internal Releases query handles when their background transport closes. */
export function invalidateLynxClientContainer(container: LynxClientContainer): void {
	const state = containerState(container);
	const handles = [...state.handles.values()];
	const subscribers = [...state.attachmentSubscribers];
	const detached: number[] = [];
	let hasError = false;
	let firstError: unknown;
	const capture = (work: () => void) => {
		try {
			work();
		} catch (error) {
			if (!hasError) {
				hasError = true;
				firstError = error;
			}
		}
	};
	for (const handle of handles) {
		if (handle.active && handle.attached) {
			capture(() => {
				handle.attachmentEpoch = nextAttachmentEpoch(handle, false);
			});
			handle.attached = false;
			detached.push(handle.id);
			capture(() => invalidateHandleAttachment(handle));
		}
		handle.active = false;
		handle.attached = false;
		capture(() =>
			invalidateHandleBinding(
				handle,
				new Error(`Octane Lynx handle ${handle.id}:${handle.generation} was disposed.`),
			),
		);
	}
	state.handles = new Map();
	try {
		if (detached.length !== 0) {
			const batch = Object.freeze({
				detached: Object.freeze(detached),
				attached: Object.freeze([] as number[]),
			});
			for (const subscriber of subscribers) capture(() => subscriber(batch));
		}
	} finally {
		state.attachmentSubscribers.clear();
	}
	if (hasError) throw firstError;
}

/** Apply one generation-gated native list attachment message and notify refs. */
export function applyLynxHostAttachments(
	container: LynxClientContainer,
	changes: readonly LynxHostAttachmentChange[],
): UniversalHostAttachmentBatch {
	if (!Array.isArray(changes)) {
		throw new TypeError('Octane Lynx host attachment changes must be an array.');
	}
	const state = containerState(container);
	const staged: Array<{
		readonly handle: LynxHandleEntry;
		readonly attached: boolean;
		readonly attachmentEpoch: number;
	}> = [];
	const seen = new Set<number>();
	for (const change of changes) {
		if (change === null || typeof change !== 'object' || Array.isArray(change)) {
			throw new TypeError('Octane Lynx host attachment change must be an object.');
		}
		if (seen.has(change.id)) {
			throw new Error(`Octane Lynx host attachment repeats handle ${change.id}.`);
		}
		seen.add(change.id);
		const handle = state.handles.get(change.id);
		if (
			handle === undefined ||
			!handle.active ||
			handle.generation !== change.generation ||
			typeof change.attached !== 'boolean'
		) {
			throw new Error(
				`Octane Lynx host attachment targets stale or invalid handle ${change.id}:${change.generation}.`,
			);
		}
		if (handle.attached !== change.attached) {
			staged.push({
				handle,
				attached: change.attached,
				attachmentEpoch: nextAttachmentEpoch(handle, change.attached),
			});
		}
	}
	const detached: number[] = [];
	const attached: number[] = [];
	for (const change of staged) {
		const entry = change.handle;
		entry.attached = change.attached;
		entry.attachmentEpoch = change.attachmentEpoch;
		if (!change.attached) invalidateHandleAttachment(entry);
		(change.attached ? attached : detached).push(entry.id);
	}
	const batch = Object.freeze({
		detached: Object.freeze(detached),
		attached: Object.freeze(attached),
	});
	if (detached.length !== 0 || attached.length !== 0) {
		for (const subscriber of [...state.attachmentSubscribers]) subscriber(batch);
	}
	return batch;
}

const DISCRETE_EVENTS = new Set([
	'blur',
	'change',
	'focus',
	'input',
	'longpress',
	'longtap',
	'tap',
	'touchend',
	'touchstart',
]);
const CONTINUOUS_EVENTS = new Set(['layoutchange', 'scroll', 'touchmove', 'wheel']);
export function createLynxClientDriver(): UniversalHostDriver<
	LynxClientContainer,
	LynxPublicHandle
> {
	const driver: UniversalHostDriver<LynxClientContainer, LynxPublicHandle> = {
		id: LYNX_TRANSPORT_RENDERER,
		capabilities: Object.freeze({ text: 'host' as const, visibility: true }),
		portals: Object.freeze({
			prepareTarget({
				container,
				target,
				transported,
				createPortalTargetHandle,
			}: UniversalPortalTargetContext<LynxClientContainer>): UniversalPortalTargetRegistration {
				const state = containerState(container);
				const entry =
					target !== null && typeof target === 'object'
						? FACADE_ENTRY.get(target as LynxPublicHandle)
						: undefined;
				const handle = target as LynxPublicHandle;
				if (
					!transported ||
					entry === undefined ||
					state.handles.get(entry.id) !== entry ||
					!entry.active
				) {
					throw new TypeError(
						'Octane Lynx portals require a current, active LynxPublicHandle from this root. Initial portals must wait for the target ref acknowledgement.',
					);
				}
				if (!entry.attached) {
					throw new Error(
						`Octane Lynx portal target ${handle.id}:${handle.generation} is not physically attached.`,
					);
				}
				if (
					handle.type === '#text' ||
					handle.type === 'raw-text' ||
					handle.type === 'list' ||
					handle.type === 'list-item'
				) {
					throw new Error(
						`Octane Lynx portal target type ${JSON.stringify(handle.type)} is not supported.`,
					);
				}
				if (entry.listDescendant) {
					throw new Error(
						`Octane Lynx portal target ${handle.id}:${handle.generation} is a native-list descendant.`,
					);
				}
				const portalHandle = createPortalTargetHandle(
					encodeLynxPortalTargetId({
						root: handle.root,
						id: handle.id,
						generation: handle.generation,
					}),
				);
				return Object.freeze({
					handle: portalHandle,
					release() {},
				});
			},
		}),
		attachments: Object.freeze({
			subscribe(
				container: LynxClientContainer,
				onChange: (batch: UniversalHostAttachmentBatch) => void,
			) {
				if (typeof onChange !== 'function') {
					throw new TypeError('Octane Lynx host attachment subscriber must be a function.');
				}
				const state = containerState(container);
				state.attachmentSubscribers.add(onChange);
				let active = true;
				return Object.freeze({
					isAttached(id: number) {
						return state.handles.get(id)?.attached ?? false;
					},
					unsubscribe() {
						if (!active) return;
						active = false;
						state.attachmentSubscribers.delete(onChange);
					},
				});
			},
		}),
		props: Object.freeze({
			encode(context: UniversalHostPropCodecContext<LynxClientContainer>) {
				if (isLynxNativeResource(context.value)) {
					return {
						kind: 'resource' as const,
						handle: context.createResourceHandle(context.value.id),
					};
				}
				if (context.name.startsWith('main-thread:') && context.name !== 'main-thread:ref') {
					if (context.value === null || context.value === undefined) {
						return { kind: 'value' as const, value: context.value };
					}
					const descriptor = getThreadFunctionDescriptor(context.value);
					if (!isLynxMainThreadWorkletDescriptor(descriptor)) {
						throw new TypeError(
							`Octane Lynx ${JSON.stringify(context.name)} requires a compiler-transformed main-thread function.`,
						);
					}
					return {
						kind: 'value' as const,
						value: descriptor as never,
					};
				}
				return { kind: 'value' as const, value: context.value as never };
			},
		}),
		events: Object.freeze({
			classify(name: string) {
				const binding = parseLynxNativeEventProp(name);
				if (binding === null) return null;
				const nativeName = binding.name;
				return {
					type: name,
					priority: DISCRETE_EVENTS.has(nativeName)
						? ('discrete' as const)
						: CONTINUOUS_EVENTS.has(nativeName)
							? ('continuous' as const)
							: ('default' as const),
				};
			},
		}),
		updates: Object.freeze({
			classify(
				type: string,
				previous: Readonly<Record<string, unknown>>,
				next: Readonly<Record<string, unknown>>,
			) {
				return planLynxHostPropPatch(type, previous, next).requiresRecreate ? 'recreate' : 'update';
			},
		}),
		prepareBatch() {
			throw new Error(
				'Octane Lynx client driver cannot mutate the main-thread host; use the async transport.',
			);
		},
		getPublicInstance(container: LynxClientContainer, id: number) {
			const entry = containerState(container).handles.get(id);
			return entry === undefined ? null : handleFacade(entry);
		},
	};
	return Object.freeze(driver);
}
