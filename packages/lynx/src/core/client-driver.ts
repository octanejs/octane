import type {
	UniversalHostAttachmentBatch,
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalHostPropCodecContext,
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

interface MutableHandleState {
	active: boolean;
	attached: boolean;
	attachmentEpoch: number;
	snapshot: UniversalSerializableValue;
	readonly binding: LynxNodesRefBinding;
}

const HANDLE_STATE = new WeakMap<LynxPublicHandle, MutableHandleState>();

function nextAttachmentEpoch(state: MutableHandleState, attached: boolean): number {
	if (state.attached === attached) return state.attachmentEpoch;
	if (state.attachmentEpoch === Number.MAX_SAFE_INTEGER) {
		throw new Error('Octane Lynx physical attachment epoch is exhausted.');
	}
	return state.attachmentEpoch + 1;
}

function createPublicHandle(
	root: number,
	id: number,
	type: string,
	generation: number,
	snapshot: UniversalSerializableValue,
	createSelectorQuery: LynxCreateSelectorQuery,
): LynxPublicHandle {
	let handle!: LynxPublicHandle;
	const selector = createLynxNodesRefSelector(root, id, generation);
	const binding = createLynxNodesRef({
		identity: { root, id, type, generation, selector },
		createSelectorQuery,
		readState() {
			const current = HANDLE_STATE.get(handle);
			if (current === undefined) return null;
			return {
				root,
				id,
				type,
				generation,
				selector,
				active: current.active && current.attached,
				attachmentEpoch: current.attachmentEpoch,
			};
		},
	});
	const facade: LynxPublicHandle = {
		renderer: LYNX_TRANSPORT_RENDERER,
		root,
		id,
		type,
		generation,
		get active(): boolean {
			return HANDLE_STATE.get(handle)!.active;
		},
		get attached(): boolean {
			return HANDLE_STATE.get(handle)!.attached;
		},
		get snapshot(): UniversalSerializableValue {
			return HANDLE_STATE.get(handle)!.snapshot;
		},
		invoke<Result extends UniversalSerializableValue = UniversalSerializableValue>(
			method: string,
			params?: Readonly<Record<string, UniversalSerializableValue>>,
		) {
			return binding.handle.invoke<Result>(method, params);
		},
		measure(options?: LynxMeasureOptions) {
			return binding.handle.measure(options);
		},
		fields(options: LynxNodesRefFieldsOptions) {
			return binding.handle.fields(options);
		},
		path() {
			return binding.handle.path();
		},
		setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>) {
			return binding.handle.setNativeProps(props);
		},
	};
	handle = Object.freeze(facade);
	HANDLE_STATE.set(handle, {
		active: false,
		attached: false,
		attachmentEpoch: 0,
		snapshot,
		binding,
	});
	return handle;
}

interface LynxClientContainerState {
	handles: Map<number, LynxPublicHandle>;
	readonly generations: Map<number, number>;
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
			return CONTAINER_STATE.get(container)!.handles.get(id) ?? null;
		},
	});
	CONTAINER_STATE.set(container, {
		handles: new Map(),
		generations: new Map(),
		createSelectorQuery,
		attachmentSubscribers: new Set(),
	});
	return container;
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
	const output: Record<string, UniversalSerializableValue> = {};
	for (const [name, child] of Object.entries(value)) {
		Object.defineProperty(output, name, {
			configurable: true,
			enumerable: true,
			value: cloneSnapshot(child),
			writable: true,
		});
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
	const value = snapshot as Record<string, UniversalSerializableValue>;
	const expected: Readonly<Record<string, UniversalSerializableValue>> = {
		$$kind: 'octane.lynx.element',
		renderer: LYNX_TRANSPORT_RENDERER,
		root: identity.root,
		id: delta.id,
		type: delta.type,
		generation: delta.generation,
		selector: createLynxNodesRefSelector(identity.root, delta.id, delta.generation),
	};
	for (const [name, expectedValue] of Object.entries(expected)) {
		if (value[name] !== expectedValue) {
			throw new Error(
				`Octane Lynx acknowledgement snapshot has foreign ${name} for handle ${delta.id}.`,
			);
		}
	}
}

export interface LynxPreparedHandleDeltas {
	apply(): void;
	rollback(): void;
}

interface LynxHandleTransition {
	readonly initial: LynxPublicHandle | undefined;
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
	const stagedHandles = new Map<number, LynxPublicHandle | null>();
	const finalHandle = (id: number): LynxPublicHandle | undefined => {
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
	const priorStates = new Map<LynxPublicHandle, MutableHandleState>();
	const nextStates = new Map<LynxPublicHandle, MutableHandleState>();
	const createdHandles = new Set<LynxPublicHandle>();
	const priorGenerations = new Map<number, number | undefined>();
	const nextGenerations = new Map<number, number>();
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
			priorStates.set(previous, { ...HANDLE_STATE.get(previous)! });
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
			const handle = createPublicHandle(
				identity.root,
				delta.id,
				delta.type,
				delta.generation,
				cloneSnapshot(delta.snapshot),
				state.createSelectorQuery,
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			const current = HANDLE_STATE.get(handle)!;
			nextStates.set(handle, {
				...current,
				active: true,
				attached: delta.attached,
				attachmentEpoch: nextAttachmentEpoch(current, delta.attached),
			});
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
			priorStates.set(previous, { ...HANDLE_STATE.get(previous)! });
			const handle = createPublicHandle(
				identity.root,
				delta.id,
				delta.type,
				delta.generation,
				cloneSnapshot(delta.snapshot),
				state.createSelectorQuery,
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			const current = HANDLE_STATE.get(handle)!;
			nextStates.set(handle, {
				...current,
				active: true,
				attached: delta.attached,
				attachmentEpoch: nextAttachmentEpoch(current, delta.attached),
			});
			stagedHandles.set(delta.id, handle);
			continue;
		}
		if (delta.type !== finalType || delta.generation !== previous.generation) {
			throw new Error(`Octane Lynx acknowledgement changes retained handle ${delta.id}.`);
		}
		const current = HANDLE_STATE.get(previous)!;
		priorStates.set(previous, { ...current });
		nextStates.set(previous, {
			...current,
			active: true,
			attached: delta.attached,
			attachmentEpoch: nextAttachmentEpoch(current, delta.attached),
			snapshot: cloneSnapshot(delta.snapshot),
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
					const current = HANDLE_STATE.get(handle)!;
					current.active = false;
					current.attached = false;
					current.binding.invalidate(
						new Error(`Octane Lynx handle ${handle.id}:${handle.generation} was replaced.`),
					);
				}
			}
			for (const [handle, next] of nextStates) {
				const current = HANDLE_STATE.get(handle)!;
				const detached = current.attached && !next.attached;
				Object.assign(current, next);
				if (detached) current.binding.invalidateAttachment();
			}
			for (const [id, handle] of stagedHandles) {
				if (handle === null) originalHandles.delete(id);
				else originalHandles.set(id, handle);
			}
			for (const [id, generation] of nextGenerations) state.generations.set(id, generation);
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
				const current = HANDLE_STATE.get(handle)!;
				const detached = current.attached && !previous.attached;
				const attachmentEpoch = nextAttachmentEpoch(current, previous.attached);
				Object.assign(current, previous, { attachmentEpoch });
				if (detached) current.binding.invalidateAttachment();
			}
			for (const handle of createdHandles) {
				const current = HANDLE_STATE.get(handle)!;
				current.active = false;
				current.attached = false;
				current.binding.invalidate(
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
		const current = HANDLE_STATE.get(handle);
		if (current === undefined) {
			if (!hasError) {
				hasError = true;
				firstError = new Error(
					`Octane Lynx handle ${handle.id}:${handle.generation} lost its client state.`,
				);
			}
			continue;
		}
		if (current.active && current.attached) {
			capture(() => {
				current.attachmentEpoch = nextAttachmentEpoch(current, false);
			});
			current.attached = false;
			detached.push(handle.id);
			capture(() => current.binding.invalidateAttachment());
		}
		current.active = false;
		current.attached = false;
		capture(() =>
			current.binding.invalidate(
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
		readonly handle: LynxPublicHandle;
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
		const current = HANDLE_STATE.get(handle)!;
		if (current.attached !== change.attached) {
			staged.push({
				handle,
				attached: change.attached,
				attachmentEpoch: nextAttachmentEpoch(current, change.attached),
			});
		}
	}
	const detached: number[] = [];
	const attached: number[] = [];
	for (const change of staged) {
		const current = HANDLE_STATE.get(change.handle)!;
		current.attached = change.attached;
		current.attachmentEpoch = change.attachmentEpoch;
		if (!change.attached) current.binding.invalidateAttachment();
		(change.attached ? attached : detached).push(change.handle.id);
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
			return containerState(container).handles.get(id) ?? null;
		},
	};
	return Object.freeze(driver);
}
