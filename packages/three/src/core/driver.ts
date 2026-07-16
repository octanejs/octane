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
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalListenerDescriptor,
} from 'octane/universal';
import { createThreeObject, registerThreeNamespace, THREE_RENDERER_ID } from './catalogue.js';
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

type ParentId = number | null | undefined;

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
	readonly events: Map<string, UniversalEventListenerDescriptor>;
	readonly lifecycles: Map<string, UniversalListenerDescriptor>;
	readonly localCallbacks: Map<string, UniversalListenerDescriptor>;
	readonly localCleanups: Map<string, () => void>;
	physical: PhysicalPlacement | null;
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
	readonly disposalQueue: Array<() => void>;
	disposalScheduled: boolean;
}

export interface ThreeHostEnvironment {
	/** Called once after an accepted host batch, without requiring WebGL. */
	invalidate?(): void;
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
		disposalQueue: [],
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

function simulatedChildren(
	rootChildren: number[],
	simulation: Map<number, SimulatedInstance>,
	parent: number | null,
): number[] {
	if (parent === null) return rootChildren;
	const instance = simulation.get(parent);
	if (instance === undefined) throw new Error(`@octanejs/three: Unknown parent ${parent}.`);
	return instance.children;
}

function detachSimulatedChild(
	rootChildren: number[],
	simulation: Map<number, SimulatedInstance>,
	id: number,
): void {
	const child = simulation.get(id);
	if (child === undefined) return;
	if (child.parent !== undefined) {
		const siblings = simulatedChildren(rootChildren, simulation, child.parent);
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

function objectForParent(
	container: ThreeHostContainer,
	state: ThreeDriverState,
	parent: number | null,
): any {
	if (parent === null) return container.scene;
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
				instance.object.visible = instance.visible && instance.props.visible !== false;
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
	const orderParent = (parentId: number | null, children: readonly number[]) => {
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
			current.parent === null || current.parent === undefined
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
		events: new Map(),
		lifecycles: new Map(),
		localCallbacks: new Map(),
		localCleanups: new Map(),
		physical: null,
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
			if (instance.parent === null || instance.parent === undefined) return null;
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
		capabilities: { text: 'ignore', localHostCallbacks: true, visibility: true },
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
		prepareBatch(container, batch, context) {
			if (container.renderer !== renderer || batch.renderer !== renderer) {
				throw new Error(
					`@octanejs/three: Renderer mismatch between driver ${JSON.stringify(renderer)}, container ${JSON.stringify(container.renderer)}, and batch ${JSON.stringify(batch.renderer)}.`,
				);
			}
			const state = container[THREE_DRIVER_STATE];
			const simulation = cloneSimulation(state);
			const rootChildren = [...state.rootChildren];
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
						if (instance === undefined || instance.parent !== command.parent) {
							throw new Error(`@octanejs/three: Instance ${command.id} is not attached there.`);
						}
						detachSimulatedChild(rootChildren, simulation, command.id);
						for (const type of instance.localCallbacks.keys()) {
							cleanupKeys.add(keyFor(command.id, type));
						}
					} else if (command.op === 'insert' || command.op === 'move') {
						const instance = simulation.get(command.id);
						if (instance === undefined) {
							throw new Error(`@octanejs/three: Unknown placement target ${command.id}.`);
						}
						detachSimulatedChild(rootChildren, simulation, command.id);
						const siblings = simulatedChildren(rootChildren, simulation, command.parent);
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
						detachSimulatedChild(rootChildren, simulation, command.id);
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
							tasks.push(() => {
								const instance = state.instances.get(command.id)!;
								const replacement = stagedReplacements.get(command.id)!;
								const previousObject = instance.object;
								const previousOwned = instance.owned;
								OBJECT_INSTANCES.delete(previousObject);
								instance.object = replacement.object;
								instance.owned = replacement.owned;
								instance.props = command.props;
								instance.type = replacement.type;
								OBJECT_INSTANCES.set(instance.object, instance);
								unpublishedOwned.delete(replacement.object);
								if (!replacement.propsApplied) {
									applyThreeProps(instance.object, command.props, undefined, {
										colorSpace: container.environment.linear !== true,
									});
								}
								if (previousOwned && instance.type !== 'primitive') {
									enqueueDisposal(container, previousObject);
								}
							});
						}
					}

					tasks.push(() => {
						state.rootChildren.splice(0, state.rootChildren.length, ...rootChildren);
						for (const [id, simulated] of simulation) {
							const instance = state.instances.get(id)!;
							instance.type = simulated.type;
							instance.props = simulated.props;
							instance.parent = simulated.parent;
							instance.children.splice(0, instance.children.length, ...simulated.children);
							instance.visible = simulated.visible;
							instance.events.clear();
							for (const entry of simulated.events) instance.events.set(...entry);
							instance.lifecycles.clear();
							for (const entry of simulated.lifecycles) instance.lifecycles.set(...entry);
							instance.localCallbacks.clear();
							for (const entry of simulated.localCallbacks) instance.localCallbacks.set(...entry);
						}
					});

					tasks.push(() => synchronizePhysicalTree(container, state, destroyed));

					for (const id of destroyed) {
						tasks.push(() => {
							const instance = state.instances.get(id);
							if (instance === undefined) return;
							if (shouldDisposeRemoved(instance, state, destroyed)) {
								enqueueDisposal(container, instance.object);
							}
							OBJECT_INSTANCES.delete(instance.object);
							instance.localCleanups.clear();
							instance.events.clear();
							instance.lifecycles.clear();
							instance.localCallbacks.clear();
							instance.parent = undefined;
							instance.children.length = 0;
							state.instances.delete(id);
						});
					}

					tasks.push(() => container.commits.push(batch));
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
