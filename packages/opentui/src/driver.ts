import {
	ImageRenderable,
	RootRenderable,
	TextNodeRenderable,
	type BaseRenderable,
	type CliRenderer,
} from '@opentui/core';
import type {
	UniversalEventPriority,
	UniversalHostBatch,
	UniversalHostDriver,
	UniversalHostParent,
	UniversalPortalTargetHandle,
	UniversalPreparedHostBatch,
} from 'octane/universal';
import { getComponentCatalogue } from './components.js';
import { OPENTUI_RENDERER_ID } from './config.js';
import {
	materializeOpenTUIProps,
	setInitialProperties,
	updateProperties,
	type CallbackEnvironment,
} from './props.js';
import { textNodeKeys } from './text.js';

const OPENTUI_DRIVER_STATE = Symbol('octane.opentui.driver.state');

type ParentId = UniversalHostParent | undefined;

interface OpenTUIHostRecord {
	readonly id: number;
	readonly type: string;
	instance: BaseRenderable;
	props: Readonly<Record<string, unknown>>;
	appliedProps: Readonly<Record<string, unknown>>;
	parent: ParentId;
	readonly children: number[];
	visible: boolean;
}

interface SimulatedRecord {
	readonly type: string;
	props: Readonly<Record<string, unknown>>;
	parent: ParentId;
	readonly children: number[];
	visible: boolean;
}

interface PortalTargetEntry {
	readonly handle: UniversalPortalTargetHandle;
	readonly target: RootRenderable;
	refCount: number;
}

interface OpenTUIDriverState {
	readonly instances: Map<number, OpenTUIHostRecord>;
	readonly rootChildren: number[];
	readonly portalChildren: Map<string | number, number[]>;
	readonly portalTargets: Map<string | number, PortalTargetEntry>;
	readonly targetsByRoot: WeakMap<RootRenderable, PortalTargetEntry>;
	nextPortalTarget: number;
}

export interface OpenTUIHostEnvironment extends CallbackEnvironment {
	eventScope<T>(priority: UniversalEventPriority, run: () => T): T;
}

export interface OpenTUIHostContainer {
	readonly renderer: typeof OPENTUI_RENDERER_ID;
	readonly cliRenderer: CliRenderer;
	readonly root: RootRenderable;
	readonly environment: OpenTUIHostEnvironment;
	readonly commits: readonly UniversalHostBatch[];
	readonly instanceCount: number;
	readonly [OPENTUI_DRIVER_STATE]: OpenTUIDriverState;
}

export function createOpenTUIContainer(
	cliRenderer: CliRenderer,
	environment: OpenTUIHostEnvironment,
): OpenTUIHostContainer {
	const state: OpenTUIDriverState = {
		instances: new Map(),
		rootChildren: [],
		portalChildren: new Map(),
		portalTargets: new Map(),
		targetsByRoot: new WeakMap(),
		nextPortalTarget: 1,
	};
	const commits: UniversalHostBatch[] = [];
	return {
		renderer: OPENTUI_RENDERER_ID,
		cliRenderer,
		root: cliRenderer.root,
		environment,
		commits,
		get instanceCount() {
			return state.instances.size;
		},
		[OPENTUI_DRIVER_STATE]: state,
	};
}

function sameParent(left: ParentId, right: ParentId): boolean {
	if (left === right) return true;
	if (left == null || right == null || typeof left === 'number' || typeof right === 'number') {
		return false;
	}
	return left.id === right.id && left.root === right.root && left.renderer === right.renderer;
}

function childrenFor(
	state: OpenTUIDriverState,
	parent: UniversalHostParent,
	instances: Map<number, { children: number[] }>,
	rootChildren: number[] = state.rootChildren,
	portalState: Map<string | number, number[]> = state.portalChildren,
): number[] {
	if (parent === null) return rootChildren;
	if (typeof parent === 'number') {
		const record = instances.get(parent);
		if (record === undefined) throw new Error(`@octanejs/opentui: Unknown parent ${parent}.`);
		return record.children;
	}
	const entry = state.portalTargets.get(parent.id);
	if (entry === undefined || entry.handle !== parent) {
		throw new Error('@octanejs/opentui: Unknown or stale portal target.');
	}
	let children = portalState.get(parent.id);
	if (children === undefined) {
		children = [];
		portalState.set(parent.id, children);
	}
	return children;
}

function physicalParent(
	container: OpenTUIHostContainer,
	parent: UniversalHostParent,
): BaseRenderable {
	if (parent === null) return container.root;
	const state = container[OPENTUI_DRIVER_STATE];
	if (typeof parent === 'number') {
		const record = state.instances.get(parent);
		if (record === undefined) throw new Error(`@octanejs/opentui: Unknown parent ${parent}.`);
		return record.instance;
	}
	const entry = state.portalTargets.get(parent.id);
	if (entry === undefined || entry.handle !== parent) {
		throw new Error('@octanejs/opentui: Unknown or stale portal target.');
	}
	return entry.target;
}

function isTextContainer(type: string): boolean {
	return type === 'text' || textNodeKeys.includes(type as (typeof textNodeKeys)[number]);
}

function validatePlacement(
	instances: Map<number, SimulatedRecord>,
	childId: number,
	parent: UniversalHostParent,
): void {
	const child = instances.get(childId)!;
	if (child.type !== '#text' && !textNodeKeys.includes(child.type as any)) return;
	if (typeof parent !== 'number' || !isTextContainer(instances.get(parent)?.type ?? '')) {
		const label = child.type === '#text' ? 'Text' : `Component ${JSON.stringify(child.type)}`;
		throw new Error(`@octanejs/opentui: ${label} must be created inside a text node.`);
	}
}

function assertNoCycle(
	instances: Map<number, SimulatedRecord>,
	childId: number,
	parent: UniversalHostParent,
): void {
	let candidate: ParentId = parent;
	while (typeof candidate === 'number') {
		if (candidate === childId) {
			throw new Error(`@octanejs/opentui: Cannot place ${childId} below itself.`);
		}
		candidate = instances.get(candidate)?.parent;
	}
}

function materializeProps(
	container: OpenTUIHostContainer,
	props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
	return materializeOpenTUIProps(container.environment, props);
}

function createRecord(
	container: OpenTUIHostContainer,
	id: number,
	type: string,
	props: Readonly<Record<string, unknown>>,
): OpenTUIHostRecord {
	const appliedProps = materializeProps(container, props);
	let instance: BaseRenderable;
	if (type === '#text') {
		if (typeof props.value !== 'string') {
			throw new TypeError('@octanejs/opentui: #text hosts require a string value.');
		}
		instance = TextNodeRenderable.fromString(props.value);
	} else {
		const Constructor = getComponentCatalogue()[type];
		if (Constructor === undefined) {
			throw new Error(`@octanejs/opentui: Unknown component type ${JSON.stringify(type)}.`);
		}
		const initialProps =
			type === 'image' && appliedProps.source !== undefined
				? { ...appliedProps, source: undefined }
				: appliedProps;
		instance = new Constructor(container.root.ctx, {
			id: `${type}-${id}`,
			...initialProps,
		});
		setInitialProperties(instance, initialProps);
	}
	return {
		id,
		type,
		instance,
		props,
		appliedProps,
		parent: undefined,
		children: [],
		visible: true,
	};
}

function applyDeferredImageSource(record: OpenTUIHostRecord): void {
	if (record.instance instanceof ImageRenderable && record.appliedProps.source !== undefined) {
		record.instance.source = record.appliedProps.source as ImageRenderable['source'];
	}
}

function safeDestroy(instance: BaseRenderable): void {
	try {
		if (instance.parent !== null) instance.parent.remove(instance);
	} finally {
		instance.destroyRecursively();
	}
}

function insertPhysical(
	parent: BaseRenderable,
	child: BaseRenderable,
	before: BaseRenderable | null,
): void {
	if (before === null) parent.add(child);
	else parent.insertBefore(child, before);
}

function removeFromCurrentParent(state: OpenTUIDriverState, record: OpenTUIHostRecord): void {
	if (record.parent === undefined) return;
	const siblings = childrenFor(state, record.parent, state.instances);
	const index = siblings.indexOf(record.id);
	if (index !== -1) siblings.splice(index, 1);
	record.parent = undefined;
}

function applyPlacement(
	container: OpenTUIHostContainer,
	parent: UniversalHostParent,
	id: number,
	before: number | null,
): void {
	const state = container[OPENTUI_DRIVER_STATE];
	const record = state.instances.get(id)!;
	removeFromCurrentParent(state, record);
	const siblings = childrenFor(state, parent, state.instances);
	const index = before === null ? siblings.length : siblings.indexOf(before);
	if (index === -1) throw new Error(`@octanejs/opentui: Unknown before target ${before}.`);
	const beforeInstance = before === null ? null : state.instances.get(before)!.instance;
	insertPhysical(physicalParent(container, parent), record.instance, beforeInstance);
	siblings.splice(index, 0, id);
	record.parent = parent;
}

function applyRecreation(
	container: OpenTUIHostContainer,
	id: number,
	replacement: OpenTUIHostRecord,
): void {
	const state = container[OPENTUI_DRIVER_STATE];
	const current = state.instances.get(id)!;
	const parent = current.parent;
	if (parent !== undefined) {
		insertPhysical(physicalParent(container, parent), replacement.instance, current.instance);
	}
	for (const childId of current.children) {
		replacement.instance.add(state.instances.get(childId)!.instance);
	}
	replacement.parent = current.parent;
	replacement.children.splice(0, replacement.children.length, ...current.children);
	replacement.visible = current.visible;
	replacement.instance.visible = current.visible;
	state.instances.set(id, replacement);
	current.parent = undefined;
	current.children.length = 0;
	safeDestroy(current.instance);
}

function clonePortalChildren(state: OpenTUIDriverState): Map<string | number, number[]> {
	return new Map([...state.portalChildren].map(([id, children]) => [id, [...children]]));
}

function prepareOpenTUIBatch(
	container: OpenTUIHostContainer,
	batch: UniversalHostBatch,
): UniversalPreparedHostBatch {
	if (batch.renderer !== OPENTUI_RENDERER_ID) {
		throw new Error(
			`@octanejs/opentui: Renderer mismatch for batch ${JSON.stringify(batch.renderer)}.`,
		);
	}
	const state = container[OPENTUI_DRIVER_STATE];
	const simulated = new Map<number, SimulatedRecord>();
	for (const [id, record] of state.instances) {
		simulated.set(id, {
			type: record.type,
			props: record.props,
			parent: record.parent,
			children: [...record.children],
			visible: record.visible,
		});
	}
	const rootChildren = [...state.rootChildren];
	const portals = clonePortalChildren(state);
	const stagedCreates = new Map<number, OpenTUIHostRecord>();
	const stagedReplacements = new Map<number, OpenTUIHostRecord>();
	const stagedAppliedProps = new WeakMap<object, Readonly<Record<string, unknown>>>();

	const detachSimulated = (id: number): void => {
		const record = simulated.get(id)!;
		if (record.parent === undefined) return;
		const siblings = childrenFor(state, record.parent, simulated, rootChildren, portals);
		const index = siblings.indexOf(id);
		if (index !== -1) siblings.splice(index, 1);
		record.parent = undefined;
	};

	try {
		for (const command of batch.commands) {
			if (command.op === 'create') {
				if (simulated.has(command.id)) {
					throw new Error(`@octanejs/opentui: Duplicate instance id ${command.id}.`);
				}
				const record = createRecord(container, command.id, command.type, command.props);
				stagedCreates.set(command.id, record);
				simulated.set(command.id, {
					type: command.type,
					props: command.props,
					parent: undefined,
					children: [],
					visible: true,
				});
			} else if (command.op === 'update') {
				const record = simulated.get(command.id);
				if (record === undefined) {
					throw new Error(`@octanejs/opentui: Unknown update target ${command.id}.`);
				}
				record.props = command.props;
				stagedAppliedProps.set(command, materializeProps(container, command.props));
			} else if (command.op === 'recreate') {
				const record = simulated.get(command.id);
				if (record === undefined || !state.instances.has(command.id)) {
					throw new Error(`@octanejs/opentui: Unknown recreate target ${command.id}.`);
				}
				if (record.type !== command.type) {
					throw new Error(`@octanejs/opentui: Recreate type mismatch for ${command.id}.`);
				}
				const replacement = createRecord(container, command.id, command.type, command.props);
				stagedReplacements.set(command.id, replacement);
				record.props = command.props;
			} else if (command.op === 'visibility') {
				const record = simulated.get(command.id);
				if (record === undefined) {
					throw new Error(`@octanejs/opentui: Unknown visibility target ${command.id}.`);
				}
				record.visible = command.state === 'visible';
			} else if (command.op === 'insert' || command.op === 'move') {
				const record = simulated.get(command.id);
				if (record === undefined) {
					throw new Error(`@octanejs/opentui: Unknown placement target ${command.id}.`);
				}
				assertNoCycle(simulated, command.id, command.parent);
				validatePlacement(simulated, command.id, command.parent);
				detachSimulated(command.id);
				const siblings = childrenFor(state, command.parent, simulated, rootChildren, portals);
				const index = command.before === null ? siblings.length : siblings.indexOf(command.before);
				if (index === -1) {
					throw new Error(`@octanejs/opentui: Unknown before target ${command.before}.`);
				}
				siblings.splice(index, 0, command.id);
				record.parent = command.parent;
			} else if (command.op === 'remove') {
				const record = simulated.get(command.id);
				if (record === undefined || !sameParent(record.parent, command.parent)) {
					throw new Error(`@octanejs/opentui: Instance ${command.id} is not attached there.`);
				}
				detachSimulated(command.id);
			} else if (command.op === 'destroy') {
				const record = simulated.get(command.id);
				if (record === undefined) {
					throw new Error(`@octanejs/opentui: Unknown destroy target ${command.id}.`);
				}
				detachSimulated(command.id);
				for (const child of record.children) simulated.get(child)!.parent = undefined;
				record.children.length = 0;
				simulated.delete(command.id);
			} else {
				throw new Error(`@octanejs/opentui: Unsupported host command ${command.op}.`);
			}
		}
	} catch (error) {
		for (const record of [...stagedCreates.values(), ...stagedReplacements.values()]) {
			safeDestroy(record.instance);
		}
		throw error;
	}

	let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
	return {
		apply() {
			if (status !== 'prepared') return;
			status = 'applied';
			for (const command of batch.commands) {
				if (command.op === 'create') {
					state.instances.set(command.id, stagedCreates.get(command.id)!);
				} else if (command.op === 'update') {
					const record = state.instances.get(command.id)!;
					const applied = stagedAppliedProps.get(command)!;
					if (record.type === '#text') {
						if (typeof command.props.value !== 'string') {
							throw new TypeError('@octanejs/opentui: #text hosts require a string value.');
						}
						(record.instance as TextNodeRenderable).children = [command.props.value];
					} else {
						updateProperties(record.instance, record.appliedProps, applied);
					}
					record.props = command.props;
					record.appliedProps = applied;
				} else if (command.op === 'recreate') {
					applyRecreation(container, command.id, stagedReplacements.get(command.id)!);
				} else if (command.op === 'visibility') {
					const record = state.instances.get(command.id)!;
					record.visible = command.state === 'visible';
					record.instance.visible = record.visible;
				} else if (command.op === 'insert' || command.op === 'move') {
					applyPlacement(container, command.parent, command.id, command.before);
				} else if (command.op === 'remove') {
					const record = state.instances.get(command.id)!;
					removeFromCurrentParent(state, record);
					if (record.instance.parent !== null) record.instance.parent.remove(record.instance);
				} else if (command.op === 'destroy') {
					const record = state.instances.get(command.id)!;
					removeFromCurrentParent(state, record);
					state.instances.delete(command.id);
					safeDestroy(record.instance);
				}
			}
			for (const record of stagedCreates.values()) {
				if (state.instances.get(record.id) === record) applyDeferredImageSource(record);
			}
			for (const record of stagedReplacements.values()) {
				if (state.instances.get(record.id) === record) applyDeferredImageSource(record);
			}
			(container.commits as UniversalHostBatch[]).push(batch);
			container.cliRenderer.requestRender();
		},
		abort() {
			if (status !== 'prepared') return;
			status = 'aborted';
			for (const record of [...stagedCreates.values(), ...stagedReplacements.values()]) {
				safeDestroy(record.instance);
			}
			stagedCreates.clear();
			stagedReplacements.clear();
		},
	};
}

export function createOpenTUIDriver(): UniversalHostDriver<OpenTUIHostContainer, BaseRenderable> {
	return {
		id: OPENTUI_RENDERER_ID,
		capabilities: { text: 'host', visibility: true },
		portals: {
			prepareTarget(context) {
				if (!(context.target instanceof RootRenderable)) {
					throw new TypeError(
						'@octanejs/opentui: Portal targets must be RootRenderable instances.',
					);
				}
				if (context.target === context.container.root) {
					throw new Error('@octanejs/opentui: The primary root cannot also be a portal target.');
				}
				if (context.target.ctx !== context.container.root.ctx) {
					throw new Error('@octanejs/opentui: Portal targets must belong to the same CliRenderer.');
				}
				const state = context.container[OPENTUI_DRIVER_STATE];
				let entry = state.targetsByRoot.get(context.target);
				if (entry === undefined) {
					const handle = context.createPortalTargetHandle(state.nextPortalTarget++);
					entry = { handle, target: context.target, refCount: 0 };
					state.targetsByRoot.set(context.target, entry);
					state.portalTargets.set(handle.id, entry);
					state.portalChildren.set(handle.id, []);
				}
				entry.refCount++;
				let released = false;
				return {
					handle: entry.handle,
					release() {
						if (released) return;
						released = true;
						entry!.refCount--;
						if (entry!.refCount !== 0) return;
						if ((state.portalChildren.get(entry!.handle.id)?.length ?? 0) !== 0) {
							throw new Error('@octanejs/opentui: Cannot release a portal target with children.');
						}
						state.portalChildren.delete(entry!.handle.id);
						state.portalTargets.delete(entry!.handle.id);
						state.targetsByRoot.delete(entry!.target);
					},
				};
			},
		},
		prepareBatch(container, batch) {
			return prepareOpenTUIBatch(container, batch);
		},
		getPublicInstance(container, id) {
			return container[OPENTUI_DRIVER_STATE].instances.get(id)?.instance ?? null;
		},
	};
}
