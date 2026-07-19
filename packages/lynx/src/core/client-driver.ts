import type {
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalSerializableValue,
	UniversalTransportIdentity,
} from 'octane/universal/native';
import {
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxPublicHandleDelta,
} from './protocol.js';

export interface LynxPublicHandle {
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly active: boolean;
	readonly snapshot: UniversalSerializableValue;
}

interface MutableHandleState {
	active: boolean;
	snapshot: UniversalSerializableValue;
}

const HANDLE_STATE = new WeakMap<LynxPublicHandle, MutableHandleState>();

function createPublicHandle(
	root: number,
	id: number,
	type: string,
	generation: number,
	snapshot: UniversalSerializableValue,
): LynxPublicHandle {
	let handle!: LynxPublicHandle;
	handle = Object.freeze({
		renderer: LYNX_TRANSPORT_RENDERER,
		root,
		id,
		type,
		generation,
		get active(): boolean {
			return HANDLE_STATE.get(handle)!.active;
		},
		get snapshot(): UniversalSerializableValue {
			return HANDLE_STATE.get(handle)!.snapshot;
		},
	});
	HANDLE_STATE.set(handle, { active: false, snapshot });
	return handle;
}

interface LynxClientContainerState {
	handles: Map<number, LynxPublicHandle>;
	readonly generations: Map<number, number>;
}

const CONTAINER_STATE = new WeakMap<LynxClientContainer, LynxClientContainerState>();

export interface LynxClientContainer {
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	getPublicHandle(id: number): LynxPublicHandle | null;
}

export function createLynxClientContainer(): LynxClientContainer {
	const container: LynxClientContainer = Object.freeze({
		renderer: LYNX_TRANSPORT_RENDERER,
		getPublicHandle(id: number) {
			return CONTAINER_STATE.get(container)!.handles.get(id) ?? null;
		},
	});
	CONTAINER_STATE.set(container, { handles: new Map(), generations: new Map() });
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
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			nextStates.set(handle, { active: true, snapshot: handle.snapshot });
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
			);
			createdHandles.add(handle);
			stageGeneration(delta.id, delta.generation);
			nextStates.set(handle, { active: true, snapshot: handle.snapshot });
			stagedHandles.set(delta.id, handle);
			continue;
		}
		if (delta.type !== finalType || delta.generation !== previous.generation) {
			throw new Error(`Octane Lynx acknowledgement changes retained handle ${delta.id}.`);
		}
		priorStates.set(previous, { ...HANDLE_STATE.get(previous)! });
		nextStates.set(previous, {
			active: true,
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
				if (finalHandle(handle.id) !== handle) HANDLE_STATE.get(handle)!.active = false;
			}
			for (const [handle, next] of nextStates) Object.assign(HANDLE_STATE.get(handle)!, next);
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
				Object.assign(HANDLE_STATE.get(handle)!, previous);
			}
			for (const handle of createdHandles) HANDLE_STATE.get(handle)!.active = false;
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
	for (const handle of state.handles.values()) HANDLE_STATE.get(handle)!.active = false;
	state.handles = new Map();
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
const LYNX_EVENT = /^(capture-bind|capture-catch|global-bind|bind|catch)(.+)$/;

export function createLynxClientDriver(): UniversalHostDriver<
	LynxClientContainer,
	LynxPublicHandle
> {
	const driver: UniversalHostDriver<LynxClientContainer, LynxPublicHandle> = {
		id: LYNX_TRANSPORT_RENDERER,
		capabilities: Object.freeze({ text: 'host' as const, visibility: true }),
		events: Object.freeze({
			classify(name: string) {
				const match = LYNX_EVENT.exec(name);
				if (match === null) return null;
				const nativeName = match[2];
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
