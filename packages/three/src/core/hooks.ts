/**
 * Canvas-scoped hooks and graph helpers for the Octane Three renderer.
 *
 * These hooks live in a plain TypeScript module which is intentionally excluded
 * from Octane's hook transform. Compiled callers pass their call-site symbol as
 * the final argument, so every composed universal hook receives a stable,
 * distinct sub-slot derived from that symbol.
 */
import * as THREE from 'three';
import {
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'octane/universal';
import { getThreeInstance, type Instance } from './driver.js';
import {
	getRootObjectStore,
	RootStoreContext,
	useRootStoreSelector,
	type RenderCallback,
	type RootState,
	type RootStore,
} from './store.js';

export interface ObjectMap {
	nodes: Record<string, THREE.Object3D>;
	materials: Record<string, THREE.Material>;
	meshes: Record<string, THREE.Mesh>;
}

export interface RefObject<T> {
	current: T | null;
}

type EqualityFn<T> = (previous: T, next: T) => boolean;
type Selector<T> = (state: RootState) => T;

const subSlotCache = new Map<symbol, Map<string, symbol>>();

function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	// Universal hooks allocate an owner-local implicit slot when an uncompiled
	// caller provides no symbol. Preserve that fallback; a shared tag-only symbol
	// would make two direct calls to the same composed hook collide.
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) {
		byTag = new Map();
		subSlotCache.set(slot, byTag);
	}
	let result = byTag.get(tag);
	if (result === undefined) {
		result = Symbol.for(`${slot.description ?? ''}:@octanejs/three:${tag}`);
		byTag.set(tag, result);
	}
	return result;
}

function splitSlot(args: readonly unknown[]): [readonly unknown[], symbol | undefined] {
	const tail = args.at(-1);
	return typeof tail === 'symbol' ? [args.slice(0, -1), tail] : [args, undefined];
}

const identity = <T>(value: T): T => value;

/** Returns the nearest store, or selects it through a compiler-visible hook call. */
export function useStore(): RootStore;
export function useStore<T>(selector: Selector<T>, equalityFn?: EqualityFn<T>): T;
export function useStore<T = RootStore>(...args: unknown[]): T {
	const [userArgs, slot] = splitSlot(args);
	const store = useContext(RootStoreContext);
	if (store === null) {
		throw new Error('R3F: Hooks can only be used within the Canvas component!');
	}
	if (typeof userArgs[0] !== 'function') return store as T;
	const selector = userArgs[0] as Selector<T>;
	const equalityFn = (typeof userArgs[1] === 'function' ? userArgs[1] : Object.is) as EqualityFn<T>;
	return useRootStoreSelector(store, selector, equalityFn, slot);
}

/** Selects reactive state from the nearest Three Canvas/root. */
export function useThree<T = RootState>(selector?: Selector<T>, equalityFn?: EqualityFn<T>): T;
export function useThree<T = RootState>(...args: unknown[]): T {
	const [userArgs, slot] = splitSlot(args);
	const selector = (typeof userArgs[0] === 'function' ? userArgs[0] : identity) as Selector<T>;
	const equalityFn = (typeof userArgs[1] === 'function' ? userArgs[1] : Object.is) as EqualityFn<T>;
	const store = useStore();
	const cache = useRef<
		| {
				readonly state: RootState;
				readonly selector: Selector<T>;
				readonly selection: T;
		  }
		| undefined
	>(undefined, subSlot(slot, 'useThree:cache'));

	const getSnapshot = (): T => {
		const state = store.getState();
		const previous = cache.current;
		if (
			previous !== undefined &&
			previous.selector === selector &&
			Object.is(previous.state, state)
		) {
			return previous.selection;
		}
		const selection = selector(state);
		if (previous !== undefined && equalityFn(previous.selection, selection)) {
			cache.current = { state, selector, selection: previous.selection };
			return previous.selection;
		}
		cache.current = { state, selector, selection };
		return selection;
	};

	return useSyncExternalStore(
		store.subscribe,
		getSnapshot,
		getSnapshot,
		subSlot(slot, 'useThree:store'),
	);
}

/** Runs a callback before a root renders a frame. */
export function useFrame(callback: RenderCallback, renderPriority?: number): null;
export function useFrame(callback: RenderCallback, ...args: unknown[]): null {
	const [userArgs, slot] = splitSlot(args);
	const renderPriority = typeof userArgs[0] === 'number' ? userArgs[0] : 0;
	const store = useStore();
	const callbackRef = useRef(callback, subSlot(slot, 'useFrame:callback'));

	useLayoutEffect(
		() => {
			callbackRef.current = callback;
		},
		[callback],
		subSlot(slot, 'useFrame:latest'),
	);

	const subscribe = store.getState().internal.subscribe;
	useLayoutEffect(
		() => subscribe(callbackRef, renderPriority, store),
		[renderPriority, store, subscribe],
		subSlot(slot, 'useFrame:subscribe'),
	);
	return null;
}

/** Collects named objects, meshes, and materials from a Three object graph. */
export function buildGraph(object: THREE.Object3D): ObjectMap {
	const graph: ObjectMap = { nodes: {}, materials: {}, meshes: {} };
	object?.traverse((node) => {
		if (node.name !== '') graph.nodes[node.name] = node;
		const mesh = node as THREE.Mesh;
		const material = mesh.material;
		if (
			material !== undefined &&
			!Array.isArray(material) &&
			material.name !== '' &&
			graph.materials[material.name] === undefined
		) {
			graph.materials[material.name] = material;
		}
		if (mesh.isMesh === true && node.name !== '' && graph.meshes[node.name] === undefined) {
			graph.meshes[node.name] = mesh;
		}
	});
	return graph;
}

/** Memoizes the named graph for one Three object. */
export function useGraph(object: THREE.Object3D): ObjectMap;
export function useGraph(object: THREE.Object3D, slot?: symbol): ObjectMap {
	return useMemo(() => buildGraph(object), [object], subSlot(slot, 'useGraph'));
}

/** Returns the root state which owns a managed Three object. */
export function getRootState<T extends THREE.Object3D = THREE.Object3D>(
	object: T,
): RootState | undefined {
	return (
		getThreeInstance(object)?.root.environment.store ?? getRootObjectStore(object)
	)?.getState();
}

/** Exposes the stable public instance descriptor behind a managed Three ref. */
export function useInstanceHandle<T extends object>(ref: RefObject<T>): RefObject<Instance<T>>;
export function useInstanceHandle<T extends object>(
	ref: RefObject<T>,
	slot?: symbol,
): RefObject<Instance<T>> {
	const handle = useRef<Instance<T> | null>(null, subSlot(slot, 'useInstanceHandle:ref'));
	useLayoutEffect(
		() => {
			handle.current = ref.current === null ? null : getThreeInstance(ref.current);
			return () => {
				handle.current = null;
			};
		},
		[ref],
		subSlot(slot, 'useInstanceHandle:layout'),
	);
	return handle;
}
