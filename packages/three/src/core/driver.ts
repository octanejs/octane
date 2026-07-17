/**
 * Octane universal-host driver for real Three objects.
 *
 * Physical placement, reconstruction, and disposal behavior follows React
 * Three Fiber v9.6.1's public host semantics while keeping Octane's universal
 * commit protocol transactional:
 * https://github.com/pmndrs/react-three-fiber/blob/2a528745e9aa7c9e6cca41e404b59d45cf0d0cc7/packages/fiber/src/core/reconciler.tsx#L218-L448
 */
import * as THREE from 'three';
import type {
	UniversalEventListenerDescriptor,
	UniversalEventPriority,
	UniversalHostBatch,
	UniversalHostCommand,
	UniversalHostDriver,
	UniversalListenerDescriptor,
	UniversalPortalTargetHandle,
	UniversalPreparedHostBatch,
} from 'octane/universal';
import {
	getInitialRootStore,
	getRootObjectStore,
	removeInteractivity,
	swapInteractivity,
	type RootStore,
} from './store.js';
import {
	createThreeObject,
	registerThreeNamespace,
	resolveThreeConstructor,
	THREE_RENDERER_ID,
} from './catalogue.js';
import {
	attachString,
	detachAttachment,
	getEffectiveAttachment,
	validateStringAttachment,
	type AttachmentState,
} from './attach.js';
import { applyThreeProps, diffThreeProps } from './props.js';

const THREE_DRIVER_STATE = Symbol('octane.three.driver.state');
const OBJECT_INSTANCES = new WeakMap<object, ThreeHostInstance>();
const PUBLIC_INSTANCES = new WeakMap<ThreeHostInstance, Instance>();
const STORE_CONTAINERS = new WeakMap<RootStore, ThreeHostContainer>();
const ACTIVE_EVENT_SCOPES = new WeakSet<RootStore>();
const THREE_PORTAL_TARGET = Symbol('octane.three.portal-target');
const EXTERNAL_PORTAL_TARGET_LEASES = new WeakMap<THREE.Object3D, ExternalTargetLease>();
const EMPTY_THREE_EVENTS = new Map<string, UniversalEventListenerDescriptor>();
const EMPTY_THREE_CALLBACKS = new Map<string, UniversalListenerDescriptor>();
const THREE_VECTOR3_FROM_ARRAY = THREE.Vector3.prototype.fromArray;

const THREE_EVENT_PRIORITIES: Readonly<Record<string, UniversalEventPriority>> = Object.freeze({
	onClick: 'discrete',
	onContextMenu: 'discrete',
	onDoubleClick: 'discrete',
	onPointerDown: 'discrete',
	onPointerUp: 'discrete',
	onPointerCancel: 'discrete',
	onPointerMissed: 'discrete',
	onLostPointerCapture: 'discrete',
	onWheel: 'continuous',
	onPointerMove: 'continuous',
	onPointerOver: 'continuous',
	onPointerOut: 'continuous',
	onPointerEnter: 'continuous',
	onPointerLeave: 'continuous',
});

/** Canonical priority lookup shared by host descriptors and native dispatch. */
export function getThreeHostEventPriority(name: string): UniversalEventPriority | undefined {
	return Object.prototype.hasOwnProperty.call(THREE_EVENT_PRIORITIES, name)
		? THREE_EVENT_PRIORITIES[name]
		: undefined;
}

type ParentId = number | UniversalPortalTargetHandle | null | undefined;

interface ThreePortalTargetInput {
	readonly [THREE_PORTAL_TARGET]: true;
	readonly object: THREE.Object3D;
	readonly store: RootStore;
	readonly binding: ThreePortalTargetBinding;
}

export interface ThreePortalTargetBinding {
	current: THREE.Object3D;
}

interface ExternalTargetLease {
	readonly container: ThreeHostContainer;
	count: number;
}

interface ThreePortalTargetDomain {
	readonly handle: UniversalPortalTargetHandle;
	readonly store: RootStore;
	readonly binding: ThreePortalTargetBinding;
	readonly source:
		| { readonly kind: 'managed'; readonly id: number }
		| { readonly kind: 'external'; readonly object: THREE.Object3D };
	refCount: number;
}

type PhysicalPlacement =
	| {
			readonly kind: 'object3d';
			readonly object: THREE.Object3D;
			readonly parent: THREE.Object3D;
	  }
	| {
			readonly kind: 'attachment';
			readonly object: unknown;
			readonly parent: object;
			readonly path: string;
			readonly state: AttachmentState;
	  };

/** Stable, read-only logical descriptor for a managed Three host object. */
export interface Instance<O = any> {
	readonly object: O;
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly parent: Instance | null;
	readonly children: readonly Instance[];
	readonly root: ThreeHostContainer;
}

interface ThreeHostInstance {
	readonly id: number;
	readonly container: ThreeHostContainer;
	type: string;
	object: any;
	props: Readonly<Record<string, unknown>>;
	parent: ParentId;
	readonly children: number[];
	owned: boolean;
	visible: boolean;
	events: Map<string, UniversalEventListenerDescriptor>;
	lifecycles: Map<string, UniversalListenerDescriptor>;
	localCallbacks: Map<string, UniversalListenerDescriptor>;
	readonly localCleanups: Map<string, () => void>;
	store: RootStore | undefined;
	physical: PhysicalPlacement | null;
	directLeaf: boolean;
}

interface SimulatedInstance {
	type: string;
	props: Readonly<Record<string, unknown>>;
	parent: ParentId;
	children: number[];
	visible: boolean;
	events: Map<string, UniversalEventListenerDescriptor>;
	lifecycles: Map<string, UniversalListenerDescriptor>;
	localCallbacks: Map<string, UniversalListenerDescriptor>;
}

interface StagedObject {
	readonly object: any;
	readonly owned: boolean;
	readonly type: string;
	readonly propsApplied: boolean;
}

interface ThreeDriverState {
	readonly instances: Map<number, ThreeHostInstance>;
	readonly rootChildren: number[];
	directInstances: readonly ThreeHostInstance[] | null;
	readonly portalChildren: Map<string | number, number[]>;
	readonly portalTargets: Map<string | number, ThreePortalTargetDomain>;
	readonly portalTargetCache: WeakMap<RootStore, WeakMap<THREE.Object3D, ThreePortalTargetDomain>>;
	readonly disposalQueue: Array<() => void>;
	nextPortalTarget: number;
	disposalScheduled: boolean;
}

interface InteractionSnapshot {
	readonly object: THREE.Object3D;
	readonly store: RootStore;
	readonly live: boolean;
	readonly eligible: boolean;
}

interface LogicalInteractionInstance {
	readonly parent: ParentId;
	readonly visible: boolean;
}

/** Package-private adapter consumed by the universal portal target capability. */
export function createThreePortalTargetBinding(object: THREE.Object3D): ThreePortalTargetBinding {
	return { current: object };
}

/** Package-private adapter consumed by the universal portal target capability. */
export function createThreePortalTarget(
	object: THREE.Object3D,
	store: RootStore,
	binding: ThreePortalTargetBinding,
): ThreePortalTargetInput {
	return Object.freeze({ [THREE_PORTAL_TARGET]: true as const, object, store, binding });
}

export interface ThreeHostEnvironment {
	/** Called once after an accepted host batch, without requiring WebGL. */
	invalidate?(): void;
	/** Set false to omit accepted batches from the public diagnostic history. */
	recordCommits?: boolean;
	/** Root state associated with a configured managed scene. */
	readonly store?: RootStore;
	/** Run all Three handlers from one platform event in one universal scope. */
	eventScope?<T>(priority: UniversalEventPriority, run: () => T): T;
	/** Dispatch a committed Three listener through its universal owner. */
	dispatchEvent?(listener: number, payload: unknown): unknown;
	/** Disable the default managed-root sRGB texture conversion. */
	linear?: boolean;
	/** Schedule accepted-object disposal after refs and layout cleanup. */
	scheduleDispose?(flush: () => void): void;
}

export interface ThreeHostContainer {
	readonly renderer: string;
	readonly scene: THREE.Scene;
	readonly commits: UniversalHostBatch[];
	readonly environment: ThreeHostEnvironment;
	readonly instanceCount: number;
	/** Deterministic test/headless drain for accepted disposal work. */
	flushDisposals(): void;
	readonly [THREE_DRIVER_STATE]: ThreeDriverState;
}

export interface CreateThreeContainerOptions {
	renderer?: string;
	scene?: THREE.Scene;
	environment?: ThreeHostEnvironment;
}

function runAll(tasks: Iterable<() => void>): void {
	let failed = false;
	let firstError: unknown;
	for (const task of tasks) {
		try {
			task();
		} catch (error) {
			if (!failed) {
				failed = true;
				firstError = error;
			}
		}
	}
	if (failed) throw firstError;
}

function disposeOwnedNow(object: any): void {
	if (object?.type === 'Scene' || typeof object?.dispose !== 'function') return;
	try {
		object.dispose();
	} catch {
		// R3F intentionally treats user/Three disposal faults as best-effort cleanup.
	}
}

function defaultScheduleDispose(flush: () => void): void {
	setTimeout(flush, 0);
}

export function createThreeContainer(
	options: CreateThreeContainerOptions = {},
): ThreeHostContainer {
	const renderer = options.renderer ?? THREE_RENDERER_ID;
	const state: ThreeDriverState = {
		instances: new Map(),
		rootChildren: [],
		directInstances: null,
		portalChildren: new Map(),
		portalTargets: new Map(),
		portalTargetCache: new WeakMap(),
		disposalQueue: [],
		nextPortalTarget: 1,
		disposalScheduled: false,
	};
	const environment = options.environment ?? {};
	const container: ThreeHostContainer = {
		renderer,
		scene: options.scene ?? new THREE.Scene(),
		commits: [],
		environment,
		get instanceCount() {
			return state.instances.size;
		},
		flushDisposals() {
			state.disposalScheduled = false;
			const queue = state.disposalQueue.splice(0);
			runAll(queue);
		},
		[THREE_DRIVER_STATE]: state,
	};
	if (environment.store !== undefined) STORE_CONTAINERS.set(environment.store, container);
	return container;
}

function enqueueDisposal(container: ThreeHostContainer, object: any): void {
	const state = container[THREE_DRIVER_STATE];
	state.disposalQueue.push(() => disposeOwnedNow(object));
	if (state.disposalScheduled) return;
	state.disposalScheduled = true;
	const schedule = container.environment.scheduleDispose ?? defaultScheduleDispose;
	schedule(() => container.flushDisposals());
}

function cloneSimulation(state: ThreeDriverState): Map<number, SimulatedInstance> {
	const simulation = new Map<number, SimulatedInstance>();
	for (const [id, instance] of state.instances) {
		simulation.set(id, {
			type: instance.type,
			props: instance.props,
			parent: instance.parent,
			children: [...instance.children],
			visible: instance.visible,
			events: new Map(instance.events),
			lifecycles: new Map(instance.lifecycles),
			localCallbacks: new Map(instance.localCallbacks),
		});
	}
	return simulation;
}

/**
 * Retained prop patches do not change the logical or physical Three graph. Keep
 * them transactional by validating every target up front, but avoid cloning and
 * republishing the entire scene merely to apply ordinary object properties.
 *
 * String attachments are deliberately excluded: a parent prop patch can replace
 * any segment of an attached child's path, which requires the general shadow
 * validation and physical synchronization below. Interactive targets are also
 * excluded because changing `raycast` can alter their root-store membership.
 */
interface DirectMeshProps extends Readonly<Record<string, unknown>> {
	readonly name: string;
	readonly position: readonly [number, number, number];
}

function isDirectMeshProps(props: Readonly<Record<string, unknown>>): props is DirectMeshProps {
	let nextName = 'name';
	for (const name in props) {
		if (!Object.prototype.hasOwnProperty.call(props, name)) continue;
		if (name !== nextName) return false;
		nextName = name === 'name' ? 'position' : '';
	}
	const position = props.position;
	// Eligibility must not read authored array indices: the general driver does
	// not observe those values until an accepted batch is applied.
	return nextName === '' && typeof props.name === 'string' && Array.isArray(position);
}

function prepareDirectLeafMountBatch(
	container: ThreeHostContainer,
	batch: UniversalHostBatch,
): UniversalPreparedHostBatch | null {
	const state = container[THREE_DRIVER_STATE];
	if (
		state.instances.size !== 0 ||
		state.rootChildren.length !== 0 ||
		state.portalTargets.size !== 0 ||
		state.portalChildren.size !== 0 ||
		container.scene.parent !== null ||
		container.scene.children.length !== 0 ||
		resolveThreeConstructor('mesh') !== THREE.Mesh
	) {
		return null;
	}

	let createCount = 0;
	while (batch.commands[createCount]?.op === 'create') createCount++;
	if (createCount === 0 || batch.commands.length !== createCount * 2) return null;
	const ids = new Set<number>();
	for (let index = 0; index < createCount; index++) {
		const create = batch.commands[index];
		const placement = batch.commands[createCount + index];
		if (
			create.op !== 'create' ||
			create.type !== 'mesh' ||
			ids.has(create.id) ||
			!isDirectMeshProps(create.props) ||
			placement.op !== 'insert' ||
			placement.id !== create.id ||
			placement.parent !== null ||
			placement.before !== null
		) {
			return null;
		}
		ids.add(create.id);
	}

	const staged: ThreeHostInstance[] = [];
	try {
		for (let index = 0; index < createCount; index++) {
			const command = batch.commands[index] as Extract<
				UniversalHostCommand,
				{ readonly op: 'create' }
			>;
			const object = new THREE.Mesh();
			staged.push(
				createHostInstance(
					container,
					command.id,
					{ object, owned: true, type: 'mesh', propsApplied: true },
					command.props,
					true,
				),
			);
			applyThreeProps(object, command.props, undefined, {
				colorSpace: container.environment.linear !== true,
			});
		}
	} catch (error) {
		for (const instance of staged) disposeOwnedNow(instance.object);
		throw error;
	}

	let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
	return {
		apply() {
			if (status !== 'prepared') return;
			status = 'applied';
			state.directInstances = staged;
			let failed = false;
			let firstError: unknown;
			for (const instance of staged) {
				instance.directLeaf = true;
				state.instances.set(instance.id, instance);
				state.rootChildren.push(instance.id);
				instance.parent = null;
				OBJECT_INSTANCES.set(instance.object, instance);
				try {
					container.scene.add(instance.object);
					instance.physical = {
						kind: 'object3d',
						object: instance.object,
						parent: container.scene,
					};
				} catch (error) {
					if (!failed) {
						failed = true;
						firstError = error;
					}
				}
			}
			if (container.environment.recordCommits !== false) {
				try {
					container.commits.push(batch);
				} catch (error) {
					if (!failed) {
						failed = true;
						firstError = error;
					}
				}
			}
			try {
				container.environment.invalidate?.();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
			if (failed) throw firstError;
		},
		abort() {
			if (status !== 'prepared') return;
			status = 'aborted';
			for (const instance of staged) disposeOwnedNow(instance.object);
		},
	};
}

function prepareUpdateOnlyBatch(
	container: ThreeHostContainer,
	batch: UniversalHostBatch,
): UniversalPreparedHostBatch | null {
	if (batch.commands.length === 0) return null;

	const state = container[THREE_DRIVER_STATE];
	const instances = state.directInstances;
	if (
		instances === null ||
		batch.commands.length !== state.rootChildren.length ||
		batch.commands.length !== instances.length ||
		state.rootChildren.length !== state.instances.size ||
		container.scene.children.length !== state.rootChildren.length ||
		container.scene.parent !== null
	) {
		return null;
	}
	for (let index = 0; index < batch.commands.length; index++) {
		const command = batch.commands[index];
		if (command.op !== 'update') return null;
		const instance = instances[index];
		if (command.id !== instance.id) return null;
		const nameDescriptor = Object.getOwnPropertyDescriptor(instance.object, 'name');
		if (
			!instance.directLeaf ||
			instance.physical?.kind !== 'object3d' ||
			instance.physical.parent !== container.scene ||
			instance.object.parent !== container.scene ||
			container.scene.children[index] !== instance.object ||
			instance.object.visible !== true ||
			nameDescriptor === undefined ||
			!('value' in nameDescriptor) ||
			nameDescriptor.writable !== true ||
			instance.object.position.fromArray !== THREE_VECTOR3_FROM_ARRAY
		) {
			return null;
		}
		if (!isDirectMeshProps(command.props)) return null;
	}

	let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
	return {
		apply() {
			if (status !== 'prepared') return;
			status = 'applied';
			let failed = false;
			let firstError: unknown;
			for (let index = 0; index < instances.length; index++) {
				try {
					const instance = instances[index];
					const previous = instance.props as DirectMeshProps;
					const next = (
						batch.commands[index] as Extract<UniversalHostCommand, { readonly op: 'update' }>
					).props as DirectMeshProps;
					instance.props = next;
					if (previous.name !== next.name) instance.object.name = next.name;
					const previousPosition = previous.position;
					const nextPosition = next.position;
					if (
						previousPosition[0] !== nextPosition[0] ||
						previousPosition[1] !== nextPosition[1] ||
						previousPosition[2] !== nextPosition[2]
					) {
						instance.object.position.fromArray(nextPosition);
					}
				} catch (error) {
					if (!failed) {
						failed = true;
						firstError = error;
					}
				}
			}
			if (container.environment.recordCommits !== false) {
				try {
					container.commits.push(batch);
				} catch (error) {
					if (!failed) {
						failed = true;
						firstError = error;
					}
				}
			}
			try {
				container.environment.invalidate?.();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
			if (failed) throw firstError;
		},
		abort() {
			if (status === 'prepared') status = 'aborted';
		},
	};
}

function isPortalParent(parent: ParentId): parent is UniversalPortalTargetHandle {
	return (
		parent !== null &&
		parent !== undefined &&
		typeof parent === 'object' &&
		parent.$$kind === 'octane.universal.portal-target'
	);
}

function sameParent(left: ParentId, right: ParentId): boolean {
	if (left === right) return true;
	return (
		isPortalParent(left) &&
		isPortalParent(right) &&
		left.renderer === right.renderer &&
		left.root === right.root &&
		Object.is(left.id, right.id)
	);
}

function clonePortalChildren(state: ThreeDriverState): Map<string | number, number[]> {
	return new Map(
		[...state.portalChildren].map(([target, children]) => [target, [...children]] as const),
	);
}

function portalRegistration(
	state: ThreeDriverState,
	handle: UniversalPortalTargetHandle,
): ThreePortalTargetDomain {
	const registration = state.portalTargets.get(handle.id);
	if (
		registration === undefined ||
		registration.refCount === 0 ||
		registration.handle.renderer !== handle.renderer ||
		registration.handle.root !== handle.root ||
		!Object.is(registration.handle.id, handle.id)
	) {
		throw new Error('@octanejs/three: Unknown, stale, or foreign portal target handle.');
	}
	return registration;
}

function simulatedChildren(
	rootChildren: number[],
	portalChildren: Map<string | number, number[]>,
	portalTargets: ReadonlyMap<string | number, ThreePortalTargetDomain>,
	simulation: Map<number, SimulatedInstance>,
	parent: Exclude<ParentId, undefined>,
): number[] {
	if (parent === null) return rootChildren;
	if (isPortalParent(parent)) {
		const registration = portalTargets.get(parent.id);
		if (
			registration === undefined ||
			registration.refCount === 0 ||
			registration.handle.renderer !== parent.renderer ||
			registration.handle.root !== parent.root
		) {
			throw new Error('@octanejs/three: Unknown, stale, or foreign portal parent.');
		}
		let children = portalChildren.get(parent.id);
		if (children === undefined) {
			children = [];
			portalChildren.set(parent.id, children);
		}
		return children;
	}
	const instance = simulation.get(parent);
	if (instance === undefined) throw new Error(`@octanejs/three: Unknown parent ${parent}.`);
	return instance.children;
}

function detachSimulatedChild(
	rootChildren: number[],
	portalChildren: Map<string | number, number[]>,
	portalTargets: ReadonlyMap<string | number, ThreePortalTargetDomain>,
	simulation: Map<number, SimulatedInstance>,
	id: number,
): void {
	const child = simulation.get(id);
	if (child === undefined) return;
	if (child.parent !== undefined) {
		const siblings = simulatedChildren(
			rootChildren,
			portalChildren,
			portalTargets,
			simulation,
			child.parent,
		);
		const index = siblings.indexOf(id);
		if (index !== -1) siblings.splice(index, 1);
	}
	child.parent = undefined;
}

function keyFor(id: number, type: string): string {
	return `${id}:${type}`;
}

function parseKey(key: string): readonly [number, string] {
	const separator = key.indexOf(':');
	return [Number(key.slice(0, separator)), key.slice(separator + 1)];
}

function isObject3D(value: unknown): value is THREE.Object3D {
	return (value as THREE.Object3D | null)?.isObject3D === true;
}

function resolvePortalDomainObject(
	state: ThreeDriverState,
	registration: ThreePortalTargetDomain,
): THREE.Object3D {
	if (registration.source.kind === 'external') return registration.source.object;
	const object = state.instances.get(registration.source.id)?.object;
	if (!isObject3D(object)) {
		throw new Error('@octanejs/three: A managed portal target is no longer mounted.');
	}
	return object;
}

function resolvePortalTargetObject(
	state: ThreeDriverState,
	handle: UniversalPortalTargetHandle,
): THREE.Object3D {
	return resolvePortalDomainObject(state, portalRegistration(state, handle));
}

function storeForInstance(
	id: number,
	instances: ReadonlyMap<number, LogicalInteractionInstance>,
	portalTargets: ReadonlyMap<string | number, ThreePortalTargetDomain>,
	rootStore: RootStore | undefined,
): RootStore | undefined {
	const seen = new Set<number>();
	let currentId = id;
	while (true) {
		if (seen.has(currentId)) return undefined;
		seen.add(currentId);
		const instance = instances.get(currentId);
		if (instance === undefined) return undefined;
		if (instance.parent === null) return rootStore;
		if (instance.parent === undefined) return undefined;
		if (isPortalParent(instance.parent)) {
			return portalTargets.get(instance.parent.id)?.store;
		}
		currentId = instance.parent;
	}
}

function hasLiveRootConnection(
	id: number,
	instances: ReadonlyMap<number, LogicalInteractionInstance>,
	portalTargets: ReadonlyMap<string | number, ThreePortalTargetDomain>,
): boolean {
	const seen = new Set<number>();
	let currentId = id;
	while (true) {
		if (seen.has(currentId)) return false;
		seen.add(currentId);
		const instance = instances.get(currentId);
		if (instance === undefined || !instance.visible) return false;
		if (instance.parent === null) return true;
		if (instance.parent === undefined) return false;
		if (isPortalParent(instance.parent)) {
			const target = portalTargets.get(instance.parent.id);
			if (target === undefined || target.refCount === 0) return false;
			if (target.source.kind === 'managed') {
				currentId = target.source.id;
				continue;
			}
			let ancestor: THREE.Object3D | null = target.source.object;
			while (ancestor !== null) {
				const managed = OBJECT_INSTANCES.get(ancestor);
				if (managed !== undefined) {
					return hasLiveRootConnection(managed.id, instances, portalTargets);
				}
				ancestor = ancestor.parent;
			}
			return true;
		}
		currentId = instance.parent;
	}
}

function interactionSnapshot(
	id: number,
	object: unknown,
	eventCount: number,
	instances: ReadonlyMap<number, LogicalInteractionInstance>,
	portalTargets: ReadonlyMap<string | number, ThreePortalTargetDomain>,
	rootStore: RootStore | undefined,
): InteractionSnapshot | undefined {
	if (!isObject3D(object)) return undefined;
	const store = storeForInstance(id, instances, portalTargets, rootStore);
	if (store === undefined) return undefined;
	const live = hasLiveRootConnection(id, instances, portalTargets);
	return {
		object,
		store,
		live,
		eligible: eventCount > 0 && object.raycast !== null && live,
	};
}

function appendInteractivity(store: RootStore, object: THREE.Object3D): void {
	const interaction = store.getState().internal.interaction;
	if (!interaction.includes(object)) interaction.push(object);
}

function removeInteractionMembership(store: RootStore, object: THREE.Object3D): void {
	const internal = store.getState().internal;
	internal.interaction = internal.interaction.filter((candidate) => candidate !== object);
}

function reconcileInteractivity(
	previous: InteractionSnapshot | undefined,
	next: InteractionSnapshot | undefined,
	replacement: boolean,
): void {
	const previousStore = previous === undefined ? undefined : getInitialRootStore(previous.store);
	const nextStore = next === undefined ? undefined : getInitialRootStore(next.store);
	const store = nextStore ?? previousStore;
	if (store === undefined) return;
	if (
		previous !== undefined &&
		next !== undefined &&
		previousStore !== undefined &&
		nextStore !== undefined &&
		previousStore !== nextStore
	) {
		removeInteractivity(previousStore, previous.object);
		if (next.eligible) appendInteractivity(nextStore, next.object);
		return;
	}
	const interaction = store.getState().internal.interaction;
	const wasTracked = previous !== undefined && interaction.includes(previous.object);
	const preservesPosition = wasTracked && previous.eligible && next?.eligible === true;
	const transfersIdentity =
		replacement &&
		previous !== undefined &&
		next !== undefined &&
		next.live &&
		previous.object !== next.object;
	if (transfersIdentity) swapInteractivity(store, previous.object, next.object);

	if (preservesPosition) {
		appendInteractivity(store, next.object);
		return;
	}
	if (previous !== undefined) {
		const previousObject = transfersIdentity ? next!.object : previous.object;
		const lostEligibility = previous.eligible && next?.live === true && !next.eligible;
		if (next?.live === true && !lostEligibility) {
			removeInteractionMembership(store, previousObject);
		} else {
			removeInteractivity(store, previousObject);
		}
	}
	if (next?.eligible === true) appendInteractivity(store, next.object);
}

function objectForParent(
	container: ThreeHostContainer,
	state: ThreeDriverState,
	parent: Exclude<ParentId, undefined>,
): any {
	if (parent === null) return container.scene;
	if (isPortalParent(parent)) return resolvePortalTargetObject(state, parent);
	return state.instances.get(parent)?.object;
}

function desiredAttachment(
	container: ThreeHostContainer,
	state: ThreeDriverState,
	instance: ThreeHostInstance,
	destroyed: ReadonlySet<number>,
):
	| { kind: 'none' }
	| { kind: 'object3d'; parent: THREE.Object3D }
	| { kind: 'attachment'; parent: object; path: string } {
	if (destroyed.has(instance.id) || instance.parent === undefined) return { kind: 'none' };
	if (instance.localCallbacks.has('attach')) return { kind: 'none' };
	const parent = objectForParent(container, state, instance.parent);
	if (parent == null) return { kind: 'none' };
	const path = getEffectiveAttachment(
		instance.object,
		instance.props.attach as string | null | undefined,
	);
	if (typeof path === 'string') {
		return instance.visible ? { kind: 'attachment', parent, path } : { kind: 'none' };
	}
	if (isObject3D(parent) && isObject3D(instance.object)) {
		return { kind: 'object3d', parent };
	}
	return { kind: 'none' };
}

function placementMatches(
	placement: PhysicalPlacement,
	desired:
		| { kind: 'none' }
		| { kind: 'object3d'; parent: THREE.Object3D }
		| { kind: 'attachment'; parent: object; path: string },
	object: unknown,
): boolean {
	if (desired.kind === 'none') return false;
	if (placement.object !== object || placement.parent !== desired.parent) return false;
	if (placement.kind === 'object3d') return desired.kind === 'object3d';
	return desired.kind === 'attachment' && placement.path === desired.path;
}

function detachPhysical(instance: ThreeHostInstance): void {
	const placement = instance.physical;
	if (placement === null) return;
	instance.physical = null;
	if (placement.kind === 'attachment') {
		detachAttachment(placement.state);
		return;
	}
	placement.parent.remove(placement.object);
}

function receivesVisibilityOverlay(instance: ThreeHostInstance, state: ThreeDriverState): boolean {
	if (instance.visible) return false;
	if (
		instance.parent === null ||
		instance.parent === undefined ||
		isPortalParent(instance.parent)
	) {
		return true;
	}
	return state.instances.get(instance.parent)?.visible !== false;
}

function reorderManagedChildren(parent: THREE.Object3D, desired: readonly THREE.Object3D[]): void {
	if (desired.length < 2) return;
	const desiredSet = new Set(desired);
	const slots: number[] = [];
	for (let index = 0; index < parent.children.length; index++) {
		if (desiredSet.has(parent.children[index])) slots.push(index);
	}
	for (let index = 0; index < slots.length; index++) parent.children[slots[index]] = desired[index];
}

function synchronizePhysicalTree(
	container: ThreeHostContainer,
	state: ThreeDriverState,
	destroyed: ReadonlySet<number>,
): void {
	for (const registration of state.portalTargets.values()) {
		if (registration.refCount === 0) continue;
		const target = resolvePortalDomainObject(state, registration);
		registration.binding.current = target;
		if (registration.store.getState().scene !== target) {
			registration.store.setState({ scene: target as THREE.Scene });
		}
	}
	const desired = new Map<
		number,
		| { kind: 'none' }
		| { kind: 'object3d'; parent: THREE.Object3D }
		| { kind: 'attachment'; parent: object; path: string }
	>();
	for (const instance of state.instances.values()) {
		desired.set(instance.id, desiredAttachment(container, state, instance, destroyed));
	}

	const detachTasks: Array<() => void> = [];
	for (const instance of state.instances.values()) {
		const placement = instance.physical;
		if (
			placement !== null &&
			!placementMatches(placement, desired.get(instance.id)!, instance.object)
		) {
			detachTasks.push(() => detachPhysical(instance));
		}
	}
	runAll(detachTasks);

	const attachTasks: Array<() => void> = [];
	for (const instance of state.instances.values()) {
		if (destroyed.has(instance.id)) continue;
		const target = desired.get(instance.id)!;
		if (target.kind === 'object3d') {
			if (instance.physical === null) {
				attachTasks.push(() => {
					target.parent.add(instance.object);
					instance.physical = {
						kind: 'object3d',
						object: instance.object,
						parent: target.parent,
					};
				});
			}
			attachTasks.push(() => {
				// React hides only the first host objects in a retained range. Their
				// descendants remain authored as-is and are culled by the hidden parent.
				// Logical visibility still remains false throughout the range so events,
				// effects, and local callbacks stay disconnected while it is retained.
				instance.object.visible =
					!receivesVisibilityOverlay(instance, state) && instance.props.visible !== false;
			});
		} else if (target.kind === 'attachment' && instance.physical === null) {
			attachTasks.push(() => {
				const attachment = attachString(target.parent, instance.object, target.path);
				instance.physical = {
					kind: 'attachment',
					object: instance.object,
					parent: target.parent,
					path: target.path,
					state: attachment,
				};
			});
		}
	}
	runAll(attachTasks);

	const orderTasks: Array<() => void> = [];
	const orderParent = (parentId: Exclude<ParentId, undefined>, children: readonly number[]) => {
		const parent = objectForParent(container, state, parentId);
		if (!isObject3D(parent)) return;
		const ordered = children.flatMap((id) => {
			const child = state.instances.get(id);
			const placement = child?.physical;
			return placement?.kind === 'object3d' && placement.parent === parent
				? [placement.object]
				: [];
		});
		orderTasks.push(() => reorderManagedChildren(parent, ordered));
	};
	orderParent(null, state.rootChildren);
	for (const instance of state.instances.values()) orderParent(instance.id, instance.children);
	for (const registration of state.portalTargets.values()) {
		if (registration.refCount === 0) continue;
		orderParent(registration.handle, state.portalChildren.get(registration.handle.id) ?? []);
	}
	runAll(orderTasks);
}

function shouldDisposeRemoved(
	instance: ThreeHostInstance,
	state: ThreeDriverState,
	destroyed: ReadonlySet<number>,
): boolean {
	if (!instance.owned || instance.type === 'primitive' || instance.object?.type === 'Scene') {
		return false;
	}
	let current: ThreeHostInstance | undefined = instance;
	while (current !== undefined && destroyed.has(current.id)) {
		if (current.props.dispose === null) return false;
		current =
			current.parent === null || current.parent === undefined || isPortalParent(current.parent)
				? undefined
				: state.instances.get(current.parent);
	}
	return true;
}

function createHostInstance(
	container: ThreeHostContainer,
	id: number,
	staged: StagedObject,
	props: Readonly<Record<string, unknown>>,
	directLeaf = false,
): ThreeHostInstance {
	return {
		id,
		container,
		type: staged.type,
		object: staged.object,
		props,
		parent: undefined,
		children: [],
		owned: staged.owned,
		visible: true,
		events: directLeaf ? EMPTY_THREE_EVENTS : new Map(),
		lifecycles: directLeaf ? EMPTY_THREE_CALLBACKS : new Map(),
		localCallbacks: directLeaf ? EMPTY_THREE_CALLBACKS : new Map(),
		localCleanups: new Map(),
		store: container.environment.store,
		physical: null,
		directLeaf,
	};
}

function stageObject(
	container: ThreeHostContainer,
	type: string,
	props: Readonly<Record<string, unknown>>,
): StagedObject {
	const created = createThreeObject(type, props);
	try {
		if (created.owned) {
			applyThreeProps(created.object, props, undefined, {
				colorSpace: container.environment.linear !== true,
			});
		}
	} catch (error) {
		if (created.owned) disposeOwnedNow(created.object);
		throw error;
	}
	return { ...created, propsApplied: created.owned };
}

function getPublicInstance<O = any>(instance: ThreeHostInstance): Instance<O> {
	let descriptor = PUBLIC_INSTANCES.get(instance);
	if (descriptor !== undefined) return descriptor as Instance<O>;

	let propsSource: Readonly<Record<string, unknown>> | undefined;
	let publicProps: Readonly<Record<string, unknown>> = Object.freeze({});
	descriptor = Object.freeze({
		get object() {
			return instance.object;
		},
		get type() {
			return instance.type;
		},
		get props() {
			if (propsSource !== instance.props) {
				propsSource = instance.props;
				publicProps = Object.freeze({ ...instance.props });
			}
			return publicProps;
		},
		get parent() {
			if (
				instance.parent === null ||
				instance.parent === undefined ||
				isPortalParent(instance.parent)
			) {
				return null;
			}
			const parent = instance.container[THREE_DRIVER_STATE].instances.get(instance.parent);
			return parent === undefined ? null : getPublicInstance(parent);
		},
		get children() {
			const state = instance.container[THREE_DRIVER_STATE];
			return Object.freeze(
				instance.children.flatMap((id) => {
					const child = state.instances.get(id);
					return child === undefined ? [] : [getPublicInstance(child)];
				}),
			);
		},
		root: instance.container,
	}) as Instance;
	PUBLIC_INSTANCES.set(instance, descriptor);
	return descriptor as Instance<O>;
}

export function getThreeInstance<O extends object>(object: O): Instance<O> | null {
	const instance = OBJECT_INSTANCES.get(object);
	return instance === undefined ? null : getPublicInstance<O>(instance);
}

/** Return the committed universal listener descriptor for a managed Three object. */
export function getThreeEventListener(
	object: object,
	type: string,
): UniversalEventListenerDescriptor | undefined {
	return OBJECT_INSTANCES.get(object)?.events.get(type);
}

/** Test whether a managed Three object has any, or any selected, event listeners. */
export function hasThreeEventListeners(object: object, types?: readonly string[]): boolean {
	const events = OBJECT_INSTANCES.get(object)?.events;
	if (events === undefined) return false;
	if (types === undefined) return events.size > 0;
	return types.some((type) => events.has(type));
}

/** Return the configured root store that owns a managed Three object. */
export function getThreeEventStore(object: object): RootStore | undefined {
	return OBJECT_INSTANCES.get(object)?.store;
}

/** Whether a raycast hit is connected through a visible managed Three path. */
export function isThreeEventHitLive(object: THREE.Object3D): boolean {
	let candidate: THREE.Object3D | null = object;
	while (candidate !== null) {
		const instance = OBJECT_INSTANCES.get(candidate);
		if (instance !== undefined) {
			const state = instance.container[THREE_DRIVER_STATE];
			return hasLiveRootConnection(instance.id, state.instances, state.portalTargets);
		}
		candidate = candidate.parent;
	}
	return true;
}

/** Keep all Three handlers for one platform event in one universal event scope. */
export function runThreeEventScope<T>(
	store: RootStore,
	priority: UniversalEventPriority,
	run: () => T,
): T {
	const initialStore = getInitialRootStore(store);
	if (ACTIVE_EVENT_SCOPES.has(initialStore)) return run();
	const eventScope = STORE_CONTAINERS.get(initialStore)?.environment.eventScope;
	if (eventScope === undefined) {
		throw new Error('@octanejs/three: The configured root has no universal event scope.');
	}
	ACTIVE_EVENT_SCOPES.add(initialStore);
	try {
		return eventScope(priority, run);
	} finally {
		ACTIVE_EVENT_SCOPES.delete(initialStore);
	}
}

/** Dispatch a committed Three listener through its universal owner and scheduler. */
export function dispatchThreeEvent(store: RootStore, listener: number, payload: unknown): unknown {
	const dispatchEvent = STORE_CONTAINERS.get(getInitialRootStore(store))?.environment.dispatchEvent;
	if (dispatchEvent === undefined) {
		throw new Error('@octanejs/three: The configured root has no universal event dispatcher.');
	}
	return dispatchEvent(listener, payload);
}

/** Apply imperative Three props and invalidate the owning root when managed. */
export function applyProps<T extends object>(
	object: T,
	props: Readonly<Record<string, unknown>>,
): T {
	const instance = OBJECT_INSTANCES.get(object);
	const result = applyThreeProps(object, props, undefined, {
		colorSpace: instance !== undefined && instance.container.environment.linear !== true,
	});
	instance?.container.environment.invalidate?.();
	return result;
}

export function createThreeDriver(
	renderer = THREE_RENDERER_ID,
): UniversalHostDriver<ThreeHostContainer, object> {
	registerThreeNamespace();
	return {
		id: renderer,
		capabilities: {
			text: 'ignore',
			localHostCallbacks: true,
			visibility: true,
			compilerLeafProps: true,
		},
		events: {
			classify(name) {
				const priority = getThreeHostEventPriority(name);
				return priority === undefined ? null : { type: name, priority };
			},
		},
		lifecycles: {
			classify(name) {
				return name === 'onUpdate' ? { type: 'update' } : null;
			},
		},
		localCallbacks: {
			classify(name, value) {
				// Keep null/undefined in the ordinary prop snapshot: explicit null
				// suppresses geometry/material auto-attachment, while an omitted value
				// enables it. Only functions need the post-accept callback channel.
				return name === 'attach' && typeof value === 'function' ? { type: 'attach' } : null;
			},
		},
		updates: {
			classify(type, previous, next) {
				if (type === 'primitive' && previous.object !== next.object) return 'recreate';
				const oldArgs = previous.args as readonly unknown[] | undefined;
				const newArgs = next.args as readonly unknown[] | undefined;
				if (oldArgs?.length !== newArgs?.length) return 'recreate';
				if (newArgs?.some((value, index) => value !== oldArgs?.[index])) return 'recreate';
				return 'update';
			},
		},
		portals: {
			prepareTarget(context) {
				if (context.transported) {
					throw new Error(
						'@octanejs/three: Local Object3D portal targets cannot cross a commit transport.',
					);
				}
				const target = context.target as Partial<ThreePortalTargetInput> | null;
				if (target?.[THREE_PORTAL_TARGET] !== true || !isObject3D(target.object)) {
					throw new TypeError('@octanejs/three: createPortal target must be a Three Object3D.');
				}
				if (target.store === undefined || typeof target.store.getState !== 'function') {
					throw new TypeError('@octanejs/three: Portal target is missing its state enclave.');
				}
				if (
					target.binding === undefined ||
					target.binding === null ||
					!isObject3D(target.binding.current)
				) {
					throw new TypeError('@octanejs/three: Portal target is missing its physical binding.');
				}
				const rootStore = context.container.environment.store;
				if (rootStore === undefined || getInitialRootStore(target.store) !== rootStore) {
					throw new Error('@octanejs/three: Portal target store belongs to another root.');
				}

				const state = context.container[THREE_DRIVER_STATE];
				let byObject = state.portalTargetCache.get(target.store);
				if (byObject === undefined) {
					byObject = new WeakMap();
					state.portalTargetCache.set(target.store, byObject);
				}
				let domain = byObject.get(target.object);
				if (domain !== undefined && domain.binding !== target.binding) {
					throw new Error(
						'@octanejs/three: Portal target binding does not match its state enclave.',
					);
				}
				const effectiveTarget =
					domain === undefined ? target.object : resolvePortalDomainObject(state, domain);

				const assertTargetScope = (object: THREE.Object3D) => {
					const instance = OBJECT_INSTANCES.get(object);
					if (instance !== undefined && instance.container !== context.container) {
						throw new Error('@octanejs/three: Cannot portal into an object owned by another root.');
					}
					const objectRootStore = getRootObjectStore(object);
					if (objectRootStore !== undefined && getInitialRootStore(objectRootStore) !== rootStore) {
						throw new Error('@octanejs/three: Cannot portal into a scene owned by another root.');
					}
					const objectLease = EXTERNAL_PORTAL_TARGET_LEASES.get(object);
					if (objectLease !== undefined && objectLease.container !== context.container) {
						throw new Error(
							'@octanejs/three: External portal target is already leased by another root.',
						);
					}
				};

				const targetAncestors = new Set<THREE.Object3D>();
				for (
					let ancestor: THREE.Object3D | null = effectiveTarget;
					ancestor !== null;
					ancestor = ancestor.parent
				) {
					if (targetAncestors.has(ancestor)) {
						throw new Error('@octanejs/three: Portal target has cyclic Object3D ancestry.');
					}
					targetAncestors.add(ancestor);
					assertTargetScope(ancestor);
				}
				const descendants = [...effectiveTarget.children];
				const visited = new Set<THREE.Object3D>([effectiveTarget]);
				while (descendants.length > 0) {
					const descendant = descendants.pop()!;
					if (visited.has(descendant)) continue;
					visited.add(descendant);
					assertTargetScope(descendant);
					descendants.push(...descendant.children);
				}
				if (domain === undefined) {
					const managed = OBJECT_INSTANCES.get(target.object);
					const id = state.nextPortalTarget++;
					domain = {
						handle: context.createPortalTargetHandle(id),
						store: target.store,
						binding: target.binding,
						source:
							managed === undefined
								? { kind: 'external', object: target.object }
								: { kind: 'managed', id: managed.id },
						refCount: 0,
					};
					byObject.set(target.object, domain);
					state.portalTargets.set(id, domain);
				}

				let lease: ExternalTargetLease | undefined;
				if (domain.source.kind === 'external') {
					const externalObject = domain.source.object;
					lease = EXTERNAL_PORTAL_TARGET_LEASES.get(externalObject);
					if (lease !== undefined && lease.container !== context.container) {
						throw new Error(
							'@octanejs/three: External portal target is already leased by another root.',
						);
					}
					if (lease === undefined) {
						lease = { container: context.container, count: 0 };
						EXTERNAL_PORTAL_TARGET_LEASES.set(externalObject, lease);
					}
					lease.count++;
				}
				domain.refCount++;
				let released = false;
				return {
					handle: domain.handle,
					release() {
						if (released) return;
						released = true;
						domain!.refCount--;
						if (domain!.source.kind === 'external') {
							const activeLease = EXTERNAL_PORTAL_TARGET_LEASES.get(domain!.source.object);
							if (activeLease !== undefined && activeLease === lease) {
								activeLease.count--;
								if (activeLease.count === 0) {
									EXTERNAL_PORTAL_TARGET_LEASES.delete(domain!.source.object);
								}
							}
						}
						if (domain!.refCount === 0) {
							state.portalTargets.delete(domain!.handle.id);
							state.portalChildren.delete(domain!.handle.id);
							byObject!.delete(target.object!);
						}
					},
				};
			},
		},
		prepareBatch(container, batch, context) {
			if (container.renderer !== renderer || batch.renderer !== renderer) {
				throw new Error(
					`@octanejs/three: Renderer mismatch between driver ${JSON.stringify(renderer)}, container ${JSON.stringify(container.renderer)}, and batch ${JSON.stringify(batch.renderer)}.`,
				);
			}
			const state = container[THREE_DRIVER_STATE];
			const directLeafMount = prepareDirectLeafMountBatch(container, batch);
			if (directLeafMount !== null) return directLeafMount;
			const updateOnly = prepareUpdateOnlyBatch(container, batch);
			if (updateOnly !== null) return updateOnly;
			const simulation = cloneSimulation(state);
			const rootChildren = [...state.rootChildren];
			const portalChildren = clonePortalChildren(state);
			const stagedCreates = new Map<
				number,
				{ instance: ThreeHostInstance; staged: StagedObject }
			>();
			const stagedReplacements = new Map<number, StagedObject>();
			const unpublishedOwned = new Set<any>();
			const cleanupKeys = new Set<string>();
			const invokeKeys = new Set<string>();
			const destroyed = new Set<number>();

			try {
				for (const command of batch.commands) {
					if (command.op === 'create') {
						if (simulation.has(command.id)) {
							throw new Error(`@octanejs/three: Duplicate instance id ${command.id}.`);
						}
						const staged = stageObject(container, command.type, command.props);
						if (staged.owned) unpublishedOwned.add(staged.object);
						const instance = createHostInstance(container, command.id, staged, command.props);
						stagedCreates.set(command.id, { instance, staged });
						simulation.set(command.id, {
							type: staged.type,
							props: command.props,
							parent: undefined,
							children: [],
							visible: true,
							events: new Map(),
							lifecycles: new Map(),
							localCallbacks: new Map(),
						});
					} else if (command.op === 'update') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown update target ${command.id}.`);
						}
						instance.props = command.props;
					} else if (command.op === 'recreate') {
						const instance = simulation.get(command.id);
						if (instance === undefined || !state.instances.has(command.id)) {
							throw new Error(`@octanejs/three: Unknown recreate target ${command.id}.`);
						}
						const staged = stageObject(container, command.type, command.props);
						if (staged.owned) unpublishedOwned.add(staged.object);
						if (staged.type !== instance.type) {
							throw new Error(`@octanejs/three: Recreate type mismatch for ${command.id}.`);
						}
						stagedReplacements.set(command.id, staged);
						instance.props = command.props;
						for (const type of instance.localCallbacks.keys()) {
							const callbackKey = keyFor(command.id, type);
							cleanupKeys.add(callbackKey);
							if (instance.visible) invokeKeys.add(callbackKey);
							else invokeKeys.delete(callbackKey);
						}
					} else if (command.op === 'event') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown event target ${command.id}.`);
						}
						if (command.listener === null) instance.events.delete(command.type);
						else instance.events.set(command.type, command.listener);
					} else if (command.op === 'lifecycle') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown lifecycle target ${command.id}.`);
						}
						if (command.listener === null) instance.lifecycles.delete(command.type);
						else instance.lifecycles.set(command.type, command.listener);
					} else if (command.op === 'local-callback') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown local callback target ${command.id}.`);
						}
						const callbackKey = keyFor(command.id, command.type);
						cleanupKeys.add(callbackKey);
						if (command.listener === null) {
							instance.localCallbacks.delete(command.type);
							invokeKeys.delete(callbackKey);
						} else {
							instance.localCallbacks.set(command.type, command.listener);
							if (instance.visible) invokeKeys.add(callbackKey);
							else invokeKeys.delete(callbackKey);
						}
					} else if (command.op === 'remove') {
						const instance = simulation.get(command.id);
						if (instance === undefined || !sameParent(instance.parent, command.parent)) {
							throw new Error(`@octanejs/three: Instance ${command.id} is not attached there.`);
						}
						detachSimulatedChild(
							rootChildren,
							portalChildren,
							state.portalTargets,
							simulation,
							command.id,
						);
						for (const type of instance.localCallbacks.keys()) {
							cleanupKeys.add(keyFor(command.id, type));
						}
					} else if (command.op === 'insert' || command.op === 'move') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown placement target ${command.id}.`);
						}
						detachSimulatedChild(
							rootChildren,
							portalChildren,
							state.portalTargets,
							simulation,
							command.id,
						);
						const siblings = simulatedChildren(
							rootChildren,
							portalChildren,
							state.portalTargets,
							simulation,
							command.parent,
						);
						const before =
							command.before === null ? siblings.length : siblings.indexOf(command.before);
						if (before === -1) {
							throw new Error(`@octanejs/three: Unknown before target ${command.before}.`);
						}
						siblings.splice(before, 0, command.id);
						instance.parent = command.parent;
						if (command.op === 'move') {
							for (const type of instance.localCallbacks.keys()) {
								const callbackKey = keyFor(command.id, type);
								cleanupKeys.add(callbackKey);
								if (instance.visible) invokeKeys.add(callbackKey);
								else invokeKeys.delete(callbackKey);
							}
						}
					} else if (command.op === 'visibility') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown visibility target ${command.id}.`);
						}
						instance.visible = command.state === 'visible';
						for (const type of instance.localCallbacks.keys()) {
							const callbackKey = keyFor(command.id, type);
							cleanupKeys.add(callbackKey);
							if (instance.visible) invokeKeys.add(callbackKey);
							else invokeKeys.delete(callbackKey);
						}
					} else if (command.op === 'destroy') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown destroy target ${command.id}.`);
						}
						detachSimulatedChild(
							rootChildren,
							portalChildren,
							state.portalTargets,
							simulation,
							command.id,
						);
						instance.children.length = 0;
						simulation.delete(command.id);
						destroyed.add(command.id);
					}
				}

				const finalObject = (id: number): any => {
					const created = stagedCreates.get(id)?.staged;
					if (created !== undefined) return created.object;
					const replacement = stagedReplacements.get(id);
					if (replacement !== undefined) return replacement.object;
					const committed = state.instances.get(id);
					if (committed === undefined) {
						throw new Error(`@octanejs/three: Unknown final instance ${id}.`);
					}
					return committed.object;
				};
				const finalPortalObject = (handle: UniversalPortalTargetHandle): THREE.Object3D => {
					const registration = portalRegistration(state, handle);
					if (registration.source.kind === 'external') return registration.source.object;
					if (!simulation.has(registration.source.id)) {
						throw new Error(
							'@octanejs/three: Cannot retain a portal whose managed target is unmounting.',
						);
					}
					const object = finalObject(registration.source.id);
					if (!isObject3D(object)) {
						throw new Error('@octanejs/three: Managed portal target is not an Object3D.');
					}
					return object;
				};

				const finalObjectParents = new Map<THREE.Object3D, THREE.Object3D>();
				for (const [id, instance] of simulation) {
					if (instance.parent === undefined || instance.localCallbacks.has('attach')) continue;
					const object = finalObject(id);
					if (!isObject3D(object)) continue;
					const path = getEffectiveAttachment(
						object,
						instance.props.attach as string | null | undefined,
					);
					if (typeof path === 'string') continue;

					const parent =
						instance.parent === null
							? container.scene
							: isPortalParent(instance.parent)
								? finalPortalObject(instance.parent)
								: finalObject(instance.parent);
					if (isObject3D(parent)) finalObjectParents.set(object, parent);
				}
				for (const [object, parent] of finalObjectParents) {
					const seen = new Set<THREE.Object3D>([object]);
					let ancestor: THREE.Object3D | null = parent;
					while (ancestor !== null) {
						if (seen.has(ancestor)) {
							throw new Error('@octanejs/three: Portal placement would create an Object3D cycle.');
						}
						seen.add(ancestor);
						ancestor = finalObjectParents.get(ancestor) ?? ancestor.parent;
					}
				}

				// String attachments are physical mutations, so validate their final
				// parent path while the batch is still rejectable. Parent prop patches
				// are modeled as a pure overlay instead of touching committed objects.
				for (const [id, instance] of simulation) {
					if (instance.parent === undefined || instance.localCallbacks.has('attach')) continue;
					const object = finalObject(id);
					const path = getEffectiveAttachment(
						object,
						instance.props.attach as string | null | undefined,
					);
					if (typeof path !== 'string') continue;

					let parent: object;
					let overrides: Readonly<Record<string, unknown>> = {};
					if (instance.parent === null) {
						parent = container.scene;
					} else if (isPortalParent(instance.parent)) {
						parent = finalPortalObject(instance.parent);
					} else {
						const parentId = instance.parent;
						const parentSimulation = simulation.get(parentId);
						if (parentSimulation === undefined) {
							throw new Error(`@octanejs/three: Unknown final parent ${parentId}.`);
						}
						parent = finalObject(parentId);
						const stagedParent =
							stagedCreates.get(parentId)?.staged ?? stagedReplacements.get(parentId);
						if (stagedParent?.propsApplied !== true) {
							const previous =
								stagedParent === undefined ? (state.instances.get(parentId)?.props ?? {}) : {};
							overrides = diffThreeProps(parent, parentSimulation.props, previous);
						}
					}
					validateStringAttachment(parent, path, overrides);
				}
			} catch (error) {
				for (const object of unpublishedOwned) disposeOwnedNow(object);
				throw error;
			}
			const previousInteractions = new Map<number, InteractionSnapshot | undefined>();
			for (const [id, instance] of state.instances) {
				previousInteractions.set(
					id,
					interactionSnapshot(
						id,
						instance.object,
						instance.events.size,
						state.instances,
						state.portalTargets,
						container.environment.store,
					),
				);
			}

			let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
			let callbacksRan = false;
			return {
				apply() {
					if (status !== 'prepared') return;
					status = 'applied';
					const tasks: Array<() => void> = [];

					for (const callbackKey of cleanupKeys) {
						const [id, type] = parseKey(callbackKey);
						tasks.push(() => {
							const cleanups = state.instances.get(id)?.localCleanups;
							const cleanup = cleanups?.get(type);
							if (cleanup === undefined) return;
							cleanups!.delete(type);
							cleanup();
						});
					}

					for (const [id, { instance, staged }] of stagedCreates) {
						tasks.push(() => {
							state.instances.set(id, instance);
							OBJECT_INSTANCES.set(instance.object, instance);
							unpublishedOwned.delete(staged.object);
							if (!staged.propsApplied) {
								applyThreeProps(instance.object, instance.props, undefined, {
									colorSpace: container.environment.linear !== true,
								});
							}
						});
					}

					for (const command of batch.commands) {
						if (command.op === 'update') {
							tasks.push(() => {
								const instance = state.instances.get(command.id)!;
								const previous = instance.props;
								instance.props = command.props;
								applyThreeProps(instance.object, command.props, previous, {
									colorSpace: container.environment.linear !== true,
								});
							});
						} else if (command.op === 'recreate') {
							const replacement = stagedReplacements.get(command.id)!;
							if (!replacement.propsApplied) {
								tasks.push(() => {
									applyThreeProps(replacement.object, command.props, undefined, {
										colorSpace: container.environment.linear !== true,
									});
								});
							}
							tasks.push(() => {
								const previous = previousInteractions.get(command.id);
								const simulated = simulation.get(command.id);
								const next =
									simulated === undefined
										? undefined
										: interactionSnapshot(
												command.id,
												replacement.object,
												simulated.events.size,
												simulation,
												state.portalTargets,
												container.environment.store,
											);
								reconcileInteractivity(previous, next, true);
							});
							tasks.push(() => {
								const instance = state.instances.get(command.id)!;
								const previousObject = instance.object;
								const previousOwned = instance.owned;
								const previousProps = instance.props;
								OBJECT_INSTANCES.delete(previousObject);
								instance.object = replacement.object;
								instance.owned = replacement.owned;
								instance.props = command.props;
								instance.type = replacement.type;
								OBJECT_INSTANCES.set(instance.object, instance);
								unpublishedOwned.delete(replacement.object);
								if (isObject3D(previousObject)) {
									previousObject.visible = previousProps.visible !== false;
								}
								if (previousOwned && instance.type !== 'primitive') {
									enqueueDisposal(container, previousObject);
								}
							});
						}
					}

					tasks.push(() => {
						state.directInstances = null;
						state.rootChildren.splice(0, state.rootChildren.length, ...rootChildren);
						state.portalChildren.clear();
						for (const [target, children] of portalChildren) {
							state.portalChildren.set(target, [...children]);
						}
						for (const [id, simulated] of simulation) {
							const instance = state.instances.get(id)!;
							instance.type = simulated.type;
							instance.props = simulated.props;
							instance.parent = simulated.parent;
							instance.children.splice(0, instance.children.length, ...simulated.children);
							instance.visible = simulated.visible;
							if (instance.directLeaf) {
								instance.events = new Map(simulated.events);
								instance.lifecycles = new Map(simulated.lifecycles);
								instance.localCallbacks = new Map(simulated.localCallbacks);
							} else {
								instance.events.clear();
								for (const entry of simulated.events) instance.events.set(...entry);
								instance.lifecycles.clear();
								for (const entry of simulated.lifecycles) instance.lifecycles.set(...entry);
								instance.localCallbacks.clear();
								for (const entry of simulated.localCallbacks) instance.localCallbacks.set(...entry);
							}
							instance.directLeaf = false;
							instance.store = storeForInstance(
								id,
								simulation,
								state.portalTargets,
								container.environment.store,
							);
						}
					});

					tasks.push(() => {
						for (const [id, simulated] of simulation) {
							if (stagedReplacements.has(id)) continue;
							const instance = state.instances.get(id)!;
							const interaction = interactionSnapshot(
								id,
								instance.object,
								simulated.events.size,
								simulation,
								state.portalTargets,
								container.environment.store,
							);
							reconcileInteractivity(previousInteractions.get(id), interaction, false);
						}
					});

					tasks.push(() => synchronizePhysicalTree(container, state, destroyed));

					for (const id of destroyed) {
						tasks.push(() => {
							const instance = state.instances.get(id);
							if (instance === undefined) return;
							if (instance.store !== undefined && isObject3D(instance.object)) {
								removeInteractivity(getInitialRootStore(instance.store), instance.object);
							}
							// Visibility is a renderer-owned retention overlay. Do not leak a
							// suspense/activity-hidden flag onto an object after ownership ends;
							// restore the authored value before refs and consumers can observe it.
							if (isObject3D(instance.object)) {
								instance.object.visible = instance.props.visible !== false;
							}
							if (shouldDisposeRemoved(instance, state, destroyed)) {
								enqueueDisposal(container, instance.object);
							}
							OBJECT_INSTANCES.delete(instance.object);
							instance.localCleanups.clear();
							instance.events.clear();
							instance.lifecycles.clear();
							instance.localCallbacks.clear();
							instance.store = undefined;
							instance.parent = undefined;
							instance.children.length = 0;
							state.instances.delete(id);
						});
					}

					if (container.environment.recordCommits !== false) {
						tasks.push(() => container.commits.push(batch));
					}
					tasks.push(() => container.environment.invalidate?.());
					runAll(tasks);
				},
				afterAccept() {
					if (status !== 'applied' || callbacksRan) return;
					callbacksRan = true;
					const tasks: Array<() => void> = [];
					for (const callbackKey of invokeKeys) {
						const [id, type] = parseKey(callbackKey);
						tasks.push(() => {
							const instance = state.instances.get(id);
							const listener = instance?.localCallbacks.get(type);
							if (
								instance === undefined ||
								listener === undefined ||
								instance.parent === undefined ||
								!instance.visible
							) {
								return;
							}
							const parent = objectForParent(container, state, instance.parent);
							const cleanup = context.invokeLocalCallback(listener.id, [parent, instance.object]);
							if (cleanup == null) return;
							if (typeof cleanup !== 'function') {
								throw new TypeError(
									'@octanejs/three: A function attachment must return a cleanup or nothing.',
								);
							}
							instance.localCleanups.set(type, cleanup as () => void);
						});
					}
					runAll(tasks);
				},
				abort() {
					if (status !== 'prepared') return;
					status = 'aborted';
					for (const object of unpublishedOwned) disposeOwnedNow(object);
					unpublishedOwned.clear();
				},
			};
		},
		getPublicInstance(container, id) {
			return container[THREE_DRIVER_STATE].instances.get(id)?.object ?? null;
		},
	};
}
