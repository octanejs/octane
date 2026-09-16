import {
	type __adoptBindings,
	__claimBinding,
	__createBindingStyleRestoration,
	__normalizeBinding,
	__releaseBinding,
	__writeBinding,
	type BindingHandle,
	type BindingOperation,
	type BindingOptions,
	type BindingSource,
	type BindingValue,
	type CompiledBindings,
} from './dom-bindings.js';
import { encodeBindingKey, parseBindingMarker, type BindingKey } from './dom-binding-protocol.js';
import { moveNativeNodeBefore } from './dom-focused-move.js';
import { rendererRangeClose } from './stream-protocol.js';
import {
	BINDING_HANDOFF,
	registerBindingEvent,
	markBindingEvent,
	type BindingHandoff,
	type BindingHandoffRange,
	type BindingHandoffView,
	type BindingHandoffRest,
} from './dom-binding-handoff.js';
import type { createBindingClassGroup, BindingClassGroup } from './dom-binding-classes.js';
import type { __createBindingSignals, BindingSignalConnection } from './dom-binding-signals.js';
import type { __createBindingStyles } from './dom-binding-styles.js';
import type {
	__createBindingProjections,
	BindingProjectionConnection,
	BindingProjectionGroup,
} from './dom-binding-projections.js';
import type {
	__createBindingControls,
	BindingControlLease,
	BindingControlPrepared,
} from './dom-binding-controls.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import type { BindingControlPreview } from './signals/control-binding.js';
import {
	NATIVE_TRANSITION_CONSUMER,
	forwardNativeTransitionConsumer,
	type NativeTransitionNotify,
	type NativeTransitionPresentation,
} from './signals/read-protocol.js';

export { __methodDep } from './method-dep.js';

/** @internal A compiler-proven logical preorder. Regions consume one paired range. */
export type BindingProgramNode =
	| readonly [
			parent: number,
			kind: 'element',
			tag: string,
			namespace: 0 | 1,
			children: number | null,
	  ]
	| readonly [parent: number, kind: 'text', text: string]
	| readonly [parent: number, kind: 'region', site: string];

export interface BindingRange {
	readonly start: Comment;
	readonly end: Comment;
}

export interface BindingMountTarget {
	readonly parent: Node;
	readonly before?: Node | null;
}

export interface BindingActivationContext {
	readonly signal: AbortSignal;
	getEnvironment(): readonly unknown[];
}

export type BindingAdapter =
	| {
			readonly node: number;
			readonly kind: 'event';
			readonly name: string;
			readonly capture?: true;
			read(environment: readonly unknown[]): unknown;
	  }
	| {
			readonly node: number;
			readonly kind: 'ref';
			readonly stable?: true;
			dependencies?(environment: readonly unknown[]): readonly unknown[];
			read(environment: readonly unknown[]): unknown;
	  };

type BindingActivationCleanup = (() => void) & {
	prepare?(environment: readonly unknown[]): () => void;
};

/** @internal Native adapters are installed once for an authored fragment lifetime. */
export function __activateBindingAdapters(
	nodes: readonly Node[],
	context: BindingActivationContext,
	definitions: readonly BindingAdapter[],
): BindingActivationCleanup {
	const cleanups: Array<() => void> = [];
	const refs: Array<{
		definition: Extract<BindingAdapter, { kind: 'ref' }>;
		node: Element;
		value: unknown;
		dependencies?: readonly unknown[];
		cleanup?: () => void;
	}> = [];
	let disposed = false;
	let cleaned = false;
	const drain = (callbacks: Array<() => void>): void => {
		let failed = false;
		let failure: unknown;
		for (const cleanup of callbacks) {
			try {
				cleanup();
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		callbacks.length = 0;
		if (failed) throw failure;
	};
	// The fragment aborts first, then invokes the returned cleanup directly.
	// Close event delivery immediately, but run fallible application ref cleanup
	// through that direct call rather than through EventTarget error reporting.
	const abort = (): void => {
		disposed = true;
	};
	const dispose = (): void => {
		if (cleaned) return;
		cleaned = true;
		disposed = true;
		context.signal.removeEventListener('abort', abort);
		for (const ref of refs) {
			if (ref.cleanup) cleanups.push(ref.cleanup);
			ref.cleanup = undefined;
		}
		drain(cleanups);
	};
	const own = (cleanup: () => void): void => {
		if (disposed) cleanup();
		else cleanups.push(cleanup);
	};
	const attachRef = (
		value: unknown,
		node: Element,
		ownRef: (cleanup: () => void) => void,
	): void => {
		if (value == null || disposed) return;
		if (Array.isArray(value)) {
			for (const ref of value) attachRef(ref, node, ownRef);
		} else if (typeof value === 'function') {
			const cleanup = value(node);
			ownRef(typeof cleanup === 'function' ? cleanup : () => value(null));
		} else if (typeof value === 'object') {
			const ref = value as { current: Element | null };
			ref.current = node;
			ownRef(() => {
				if (ref.current === node) ref.current = null;
			});
		} else throw new TypeError('A DOM presentation ref must be a callback, object, or ref array.');
	};
	const replaceRef = (ref: (typeof refs)[number], value: unknown): void => {
		const cleanup = ref.cleanup;
		ref.cleanup = undefined;
		ref.value = value;
		cleanup?.();
		if (disposed || value == null) return;
		const attached: Array<() => void> = [];
		let detached = false;
		ref.cleanup = () => {
			if (detached) return;
			detached = true;
			drain(attached);
		};
		attachRef(value, ref.node, (stop) => {
			if (disposed || detached) stop();
			else attached.push(stop);
		});
	};
	const handle: BindingActivationCleanup = dispose;
	if (context.signal.aborted) {
		dispose();
		return handle;
	}
	context.signal.addEventListener('abort', abort, { once: true });
	try {
		for (const definition of definitions) {
			if (disposed) break;
			const node = nodes[definition.node];
			if (node?.nodeType !== 1) mismatch();
			if (definition.kind === 'ref') {
				const ref = {
					definition,
					node: node as Element,
					value: undefined,
					dependencies: definition.dependencies?.(context.getEnvironment()),
				};
				refs.push(ref);
				replaceRef(ref, definition.read(context.getEnvironment()));
			} else {
				const listener = (event: Event): void => {
					if (disposed) return;
					const handler = definition.read(context.getEnvironment());
					if (handler == null || handler === false) return;
					if (typeof handler !== 'function')
						throw new TypeError('A native event binding must resolve to a function.');
					markBindingEvent(event, node, !!definition.capture);
					handler.call(node, event);
				};
				node.addEventListener(definition.name, listener, !!definition.capture);
				own(registerBindingEvent(node, definition.name));
				own(() => node.removeEventListener(definition.name, listener, !!definition.capture));
			}
		}
		if (refs.some((ref) => !ref.definition.stable))
			handle.prepare = (environment) => {
				const next = refs.map((ref) => {
					const dependencies = ref.definition.dependencies?.(environment);
					const unchanged =
						ref.definition.stable ||
						(dependencies !== undefined &&
							ref.dependencies !== undefined &&
							dependencies.length === ref.dependencies.length &&
							dependencies.every((value, index) => Object.is(value, ref.dependencies![index])));
					return { value: unchanged ? ref.value : ref.definition.read(environment), dependencies };
				});
				return () => {
					for (let index = 0; index < refs.length && !disposed; index++) {
						const ref = refs[index]!;
						ref.dependencies = next[index]!.dependencies;
						if (!Object.is(ref.value, next[index]!.value)) replaceRef(ref, next[index]!.value);
					}
				};
			};
		return handle;
	} catch (error) {
		try {
			dispose();
		} catch {
			/* The failed attachment remains primary. */
		}
		throw error;
	}
}

export type BindingInitializer =
	| BindingOperation
	| readonly [
			node: number,
			kind:
				'value' | 'checked' | 'defaultValue' | 'defaultChecked' | 'selected' | 'classGroupInitial',
			name: string,
	  ];

/** @internal Generated expressions take the lexical environment, never a renderer scope. */
export interface BindingFragment {
	readonly createHandoff?: typeof __createStructuralBindingHandoff;
	/** Compiler proof that the authored scoped view has a fixed native hydration boundary. */
	readonly handoff?: boolean | 'structural';
	readonly closedProps?: readonly string[];
	readonly conditionalRest?: true;
	readonly restSites?: readonly {
		readonly site: number;
		readonly node: number;
		readonly spread: number;
		readonly keys: readonly string[];
	}[];
	readonly html: string;
	readonly ns?: 0 | 1;
	readonly nodes: readonly BindingProgramNode[];
	readonly bindings: readonly BindingOperation[];
	readonly createClassGroup?: typeof createBindingClassGroup;
	readonly signalIndices?: readonly number[];
	readonly styleIndices?: readonly number[];
	readonly projectionGroups?: readonly BindingProjectionGroup[];
	project(environment: readonly unknown[]): readonly unknown[];
	readonly regions: readonly BindingRegion[];
	readonly constructible?: false;
	readonly constructionError?: string;
	readonly initializers?: readonly BindingInitializer[];
	initialize?(environment: readonly unknown[]): readonly unknown[];
	activate?(
		nodes: readonly Node[],
		context: BindingActivationContext,
	): void | BindingActivationCleanup;
}

const bindingSlot = Symbol('octane.compiled-binding-slot');

/** @internal Only the compiler supplies a hoisted fragment and its lexical values. */
export interface BindingSlot {
	readonly [bindingSlot]: true;
	readonly id: string;
	readonly fragment: BindingFragment;
	readonly environment: readonly unknown[];
	readonly site?: number;
}

/** @internal A child presentation slot is data, never an application render callback. */
export function __bindingSlot(
	id: string,
	fragment: BindingFragment,
	environment: readonly unknown[],
	site?: number,
): BindingSlot {
	return {
		[bindingSlot]: true,
		id,
		fragment,
		environment,
		...(site === undefined ? {} : { site }),
	};
}

export type BindingRegion = { readonly node: number } & (
	| {
			readonly kind: 'if';
			select(environment: readonly unknown[]): number;
			readonly arms: readonly BindingFragment[];
			readonly armRange?: true;
	  }
	| {
			readonly kind: 'for';
			items(environment: readonly unknown[]): Iterable<unknown>;
			key(item: unknown, index: number, environment: readonly unknown[]): BindingKey;
			readonly item: BindingFragment;
			readonly empty?: BindingFragment;
	  }
	| {
			readonly kind: 'view';
			readonly view: Pick<CompiledBindingProgram<unknown>, 'id' | 'root' | 'prepareProps'>;
			props(environment: readonly unknown[]): unknown;
	  }
	| { readonly kind: 'slot'; read(environment: readonly unknown[]): unknown }
	| {
			readonly kind: 'text';
			readonly signal?: true;
			readonly generic?: true;
			read(environment: readonly unknown[]): unknown;
	  }
	| { readonly kind: 'opaque' }
);

/** @internal Imported only by query artifacts which contain structural presentation. */
export interface CompiledBindingProgram<Props> {
	readonly id: string;
	readonly root: BindingFragment;
	prepareProps?(props: Props): readonly unknown[];
	readonly scalar?: CompiledBindings<Props>;
	readonly adoptScalar?: typeof __adoptBindings;
	readonly connectSignal?: typeof __createBindingSignals;
	readonly connectStyle?: typeof __createBindingStyles;
	readonly connectProjection?: typeof __createBindingProjections;
	readonly createControls?: typeof __createBindingControls;
	readonly list?: BindingListCapability;
	readonly hostOperations?: BindingProgramHostOperations;
	readonly adopt: typeof __adoptLeanBindingProgram<Props> & {
		readonly list?: BindingListCapability;
		readonly hostOperations?: BindingProgramHostOperations;
	};
	readonly mount: typeof __mountBindingProgram<Props>;
}

interface RegionInstance {
	definition: BindingRegion;
	range: BindingRange;
	site: string;
	arm: number;
	child: FragmentInstance | null;
	items: Map<string, FragmentInstance> | null;
	text: Text | null;
	signal?: BindingSignalConnection;
	signalPlan?: RegionPlan;
	signalFrame?: number;
	unresolvedSlot?: boolean;
	slot?: string;
}

interface FragmentInstance {
	id: string;
	definition: BindingFragment;
	range: BindingRange;
	nodes: Node[];
	regions: RegionInstance[];
	owned: Array<readonly [Element, string]>;
	previous: Array<BindingValue | undefined>;
	groups: Map<number, BindingClassGroup>;
	styles?: Map<number, ReturnType<typeof __createBindingStyleRestoration>>;
	signals?: Map<number, BindingSignalConnection>;
	projections?: Map<number, BindingProjectionConnection>;
	controls?: Map<number, BindingControlLease>;
	signalPlan?: FragmentPlan;
	signalFrame?: number;
	environment: readonly unknown[];
	fresh: boolean;
	disposed: boolean;
	activated: boolean;
	controller?: AbortController;
	cleanup?: BindingActivationCleanup;
	updateAdapters?: () => void;
}

interface FragmentPlan {
	instance: FragmentInstance;
	environment: readonly unknown[];
	values: BindingValue[];
	initial: Array<string | boolean | readonly string[] | null> | null;
	regions: RegionPlan[];
	groups: Map<number, { commit(): void }>;
	controls?: Map<number, BindingControlPrepared>;
	adapters?: () => void;
}

interface RegionPlan {
	instance: RegionInstance;
	arm: number;
	child: FragmentPlan | null;
	items: Map<string, FragmentPlan> | null;
	text: string | null;
	slot?: string;
}

interface Transaction {
	disposed: boolean;
	all: Set<FragmentInstance>;
	candidates: Set<FragmentInstance>;
	focused: Element | null;
	contentEditable: boolean;
	restoreStyles: boolean;
	preservePresentation?: boolean;
	signals?: ReturnType<typeof __createBindingSignals>;
	styles?: ReturnType<typeof __createBindingStyles>;
	projections?: ReturnType<typeof __createBindingProjections>;
	controls?: ReturnType<typeof __createBindingControls>;
	hostOperations?: BindingProgramHostOperations;
	list?: BindingListCapability;
	notifySignal?(prepare: () => () => void): void;
	preparing?: boolean;
	frame: number;
	published?: () => void;
	preview?: BindingPreview;
	consumer?: NativeTransitionNotify;
}

interface BindingPreview {
	receipts: NativeTransitionPresentation[];
	controls: BindingControlPreview[];
	fragments: Set<FragmentInstance>;
	signals: Map<FragmentInstance, Map<number, BindingSignalConnection>>;
	projections: Map<FragmentInstance, Map<number, BindingProjectionConnection>>;
	text: Map<RegionInstance, BindingSignalConnection>;
	disposals: Array<() => void>;
}

/** @internal Imported only by an artifact carrying the structural takeover proof. */
export function __createStructuralBindingHandoff(
	instance: FragmentInstance,
	transaction: Transaction,
	dispose: (disposal?: { preserveDOM?: boolean }, publish?: () => void) => void,
	ready: () => boolean,
): BindingHandoff {
	let revision = 0;
	let rangeRevision = -1;
	let ranges: Map<Node, BindingHandoffRange> | undefined;
	let views: Map<Node, BindingHandoffView> | undefined;
	let rest: Map<Element, Map<number, BindingHandoffRest>> | undefined;
	let retries: Set<() => void> | undefined;
	const currentRanges = (): ReadonlyMap<Node, BindingHandoffRange> => {
		if (rangeRevision === revision && ranges !== undefined) return ranges;
		const next = new Map<Node, BindingHandoffRange>();
		let nextViews: Map<Node, BindingHandoffView> | undefined;
		let nextRest: Map<Element, Map<number, BindingHandoffRest>> | undefined;
		const collect = (current: FragmentInstance, closed = false): void => {
			if (current.definition.conditionalRest === true) {
				if (current.definition.closedProps === undefined)
					throw new Error('Conditional hydration requires a compiler-proven caller shape.');
				(nextViews ??= new Map()).set(current.range.start, {
					id: current.id,
					closedProps: current.definition.closedProps,
				});
				closed = true;
			}
			if (
				current.definition.constructible === false ||
				current.definition.bindings.some((binding) => binding[1] === 'control') ||
				current.definition.nodes.some((node) => node[1] === 'element' && node[4] === null)
			)
				throw new Error('Structural hydration leases require compiler-owned native nodes.');
			for (const site of current.definition.restSites ?? []) {
				const element = current.nodes[site.node];
				if (!closed || element?.nodeType !== 1)
					throw new Error('Native rest hydration requires an eligible closed child view.');
				const sites = (nextRest ??= new Map()).get(element as Element) ?? new Map();
				sites.set(site.site, {
					id: current.id,
					node: site.node,
					spread: site.spread,
					keys: site.keys,
				});
				nextRest.set(element as Element, sites);
			}
			for (const region of current.regions) {
				const definition = region.definition;
				if (definition.kind === 'for' || definition.kind === 'opaque')
					throw new Error('Structural hydration leases do not support lists or opaque regions.');
				if (definition.kind === 'text' && definition.generic)
					throw new Error('Structural hydration leases require primitive text.');
				if (
					definition.kind === 'view' &&
					definition.view.root.handoff !== true &&
					definition.view.root.handoff !== 'structural' &&
					definition.view.root.conditionalRest !== true
				)
					throw new Error('Structural hydration leases require a supported child view.');
				next.set(region.range.start, {
					kind: definition.kind,
					end: region.range.end,
					...(definition.kind === 'if' ? { arm: region.arm } : {}),
					...(definition.kind === 'view' ? { view: definition.view.id } : {}),
					...(definition.kind === 'slot' ? { slot: region.slot } : {}),
				});
				if (region.child !== null)
					collect(
						region.child,
						definition.kind !== 'view' && region.child.id === current.id && closed,
					);
			}
		};
		collect(instance);
		ranges = next;
		views = nextViews;
		rest = nextRest;
		rangeRevision = revision;
		return next;
	};
	currentRanges();
	transaction.published = () => {
		revision++;
		if (retries?.size) {
			const pending = [...retries];
			retries.clear();
			for (const retry of pending)
				queueMicrotask(() => {
					if (!transaction.disposed) retry();
				});
		}
	};
	const valid = (current: FragmentInstance): boolean => {
		const parent = current.range.start.parentNode;
		if (parent === null || current.range.end.parentNode !== parent) return false;
		const cursors = new Map<number, Node | null>([[-1, current.range.start.nextSibling]]);
		for (let index = 0; index < current.definition.nodes.length; index++) {
			const proof = current.definition.nodes[index]!;
			const node = current.nodes[index]!;
			if (
				cursors.get(proof[0]) !== node ||
				node.parentNode !== (proof[0] === -1 ? parent : current.nodes[proof[0]])
			)
				return false;
			let next = node.nextSibling;
			if (proof[1] === 'element') cursors.set(index, node.firstChild);
			else if (proof[1] === 'text') {
				if (node.nodeValue !== proof[2]) return false;
			} else {
				const region = current.regions.find((item) => item.range.start === node)!;
				if (
					region.range.end.parentNode !== node.parentNode ||
					(region.child !== null && !valid(region.child))
				)
					return false;
				if (
					region.definition.kind === 'text' &&
					(node.nextSibling !== (region.text ?? region.range.end) ||
						(region.text !== null && region.text.nextSibling !== region.range.end))
				)
					return false;
				next = region.range.end.nextSibling;
			}
			cursors.set(proof[0], next);
		}
		for (const [index, cursor] of cursors)
			if (cursor !== (index === -1 ? current.range.end : null)) return false;
		return true;
	};
	return {
		id: instance.id,
		root: instance.range.start,
		anchor: instance.range.start,
		end: instance.range.end,
		revision: () => (ready() ? revision : -1),
		ranges: currentRanges,
		view: (root) => {
			currentRanges();
			return views?.get(root);
		},
		rest: (element, site) => {
			currentRanges();
			return rest?.get(element)?.get(site);
		},
		valid: () => {
			if (!ready()) return false;
			try {
				currentRanges();
			} catch {
				return false;
			}
			return valid(instance);
		},
		afterPublication: (callback) => {
			(retries ??= new Set()).add(callback);
			return () => retries!.delete(callback);
		},
		active: () => !transaction.disposed,
		retire: (publish) => {
			retries?.clear();
			transaction.published = undefined;
			transaction.preservePresentation = true;
			dispose(undefined, publish);
		},
	};
}

const stopped = {};
const programRoots = /* @__PURE__ */ new WeakSet<Comment>();

function requireActive(transaction: Transaction): void {
	if (transaction.disposed) throw stopped;
}

function mismatch(): never {
	throw new Error('DOM presentation cannot adopt mismatched compiler-owned ranges or nodes.');
}

function rangeAt(node: Node | null, end: Node | null): BindingRange {
	if (node?.nodeType !== 8) return mismatch();
	const close = rendererRangeClose(node);
	if (close === null) return mismatch();
	// A malformed nested range must never claim the enclosing range's end.
	for (let cursor: Node | null = node; cursor !== close; cursor = cursor.nextSibling)
		if (cursor === null || cursor === end) return mismatch();
	if (close === end) return mismatch();
	return { start: node as Comment, end: close };
}

function rootRange(root: Element | BindingRange, id: string): BindingRange {
	if ((root as Node).nodeType === 1) {
		let start: Node = root as Element;
		let end: Node = start;
		let match: BindingRange | undefined;
		// A composite may return only another view. Cross its adjacent wrappers,
		// never siblings, DOM parents, or conditional/slot/list ownership boundaries.
		while (start.previousSibling?.nodeType === 8) {
			const open = start.previousSibling as Comment;
			const marker = parseBindingMarker(open.data);
			if (marker?.kind !== 'root' && marker?.kind !== 'view') break;
			const close = rendererRangeClose(open);
			if (close === null || close.previousSibling !== end) break;
			if (marker.kind === 'root' && marker.id === id) {
				if (match !== undefined) mismatch();
				match = { start: open, end: close };
			}
			start = open;
			end = close;
		}
		return match ?? mismatch();
	}
	const range = root as BindingRange;
	if (range?.start?.nodeType !== 8 || range?.end?.nodeType !== 8) mismatch();
	const marker = parseBindingMarker(range.start.data);
	if (marker?.kind !== 'root' || marker.id !== id || rendererRangeClose(range.start) !== range.end)
		mismatch();
	return range;
}

function releaseInstance(instance: FragmentInstance, transaction: Transaction): void {
	if (instance.disposed) return;
	instance.disposed = true;
	transaction.all.delete(instance);
	transaction.candidates.delete(instance);
	let failed = false;
	let failure: unknown;
	const attempt = (callback: () => void): void => {
		try {
			callback();
		} catch (error) {
			if (!failed) {
				failed = true;
				failure = error;
			}
		}
	};
	// Abort native control/event bridges before releasing channels. An item owns
	// this lifetime only; removing it does not retire the shared document source.
	transaction.hostOperations?.releaseControls(instance, attempt);
	attempt(() => instance.controller?.abort());
	attempt(() => instance.cleanup?.());
	instance.cleanup = undefined;
	instance.updateAdapters = undefined;
	for (const connection of instance.signals?.values() ?? [])
		attempt(() => connection.dispose(transaction.preservePresentation));
	instance.signals?.clear();
	transaction.hostOperations?.releaseProjections(instance, transaction, attempt);
	instance.signalPlan = undefined;
	for (const region of instance.regions) {
		if (region.signal) attempt(() => region.signal!.dispose());
		region.signalPlan = undefined;
		if (region.child) attempt(() => releaseInstance(region.child!, transaction));
		if (region.items)
			for (const child of region.items.values()) attempt(() => releaseInstance(child, transaction));
	}
	for (let i = 0; i < instance.owned.length; i++) {
		const [node, channel] = instance.owned[i]!;
		const binding = instance.definition.bindings[i]!;
		if (instance.groups.has(i))
			attempt(() => instance.groups.get(i)!.dispose(transaction.preservePresentation));
		if (instance.styles?.has(i))
			attempt(() => instance.styles!.get(i)!.dispose(transaction.preservePresentation));
		if (
			!transaction.preservePresentation &&
			binding[1] === 'classToken' &&
			instance.previous[i] === ''
		)
			attempt(() => node.classList.remove(binding[2]));
		__releaseBinding(node, channel);
	}
	instance.owned.length = 0;
	instance.previous.length = 0;
	instance.groups.clear();
	instance.styles?.clear();
	if (failed) throw failure;
}

function resolveFragment(
	definition: BindingFragment,
	id: string,
	range: BindingRange,
	fresh: boolean,
	transaction: Transaction,
): FragmentInstance {
	requireActive(transaction);
	const instance: FragmentInstance = {
		id,
		definition,
		range,
		nodes: [],
		regions: [],
		owned: [],
		previous: [],
		groups: new Map(),
		environment: [],
		fresh,
		disposed: false,
		activated: false,
	};
	transaction.all.add(instance);
	if (fresh) {
		transaction.candidates.add(instance);
		transaction.preview?.fragments.add(instance);
	}
	const cursors = new Map<number, Node | null>([[-1, range.start.nextSibling]]);
	const counts = new Map<number, number>();
	const regions = new Map<number, BindingRegion>();
	for (const region of definition.regions) {
		if (regions.has(region.node) || definition.nodes[region.node]?.[1] !== 'region') mismatch();
		regions.set(region.node, region);
	}
	for (let index = 0; index < definition.nodes.length; index++) {
		const proof = definition.nodes[index]!;
		const parent = proof[0];
		if (
			parent !== -1 &&
			(parent < 0 ||
				parent >= index ||
				definition.nodes[parent]?.[1] !== 'element' ||
				definition.nodes[parent]?.[4] === null)
		)
			mismatch();
		const node = cursors.get(parent);
		if (node == null || node === range.end) mismatch();
		counts.set(parent, (counts.get(parent) ?? 0) + 1);
		instance.nodes[index] = node;
		let next: Node | null = node.nextSibling;
		if (proof[1] === 'element') {
			if (
				node.nodeType !== 1 ||
				(node as Element).localName !== proof[2] ||
				(node as Element).namespaceURI !==
					(proof[3] === 0 ? 'http://www.w3.org/1999/xhtml' : 'http://www.w3.org/2000/svg')
			)
				mismatch();
			if (proof[4] !== null) cursors.set(index, node.firstChild);
		} else if (proof[1] === 'text') {
			if (node.nodeType !== 3 || node.nodeValue !== proof[2]) mismatch();
		} else {
			const childRange = rangeAt(node, parent === -1 ? range.end : null);
			const marker = parseBindingMarker(childRange.start.data);
			const region = regions.get(index);
			if (!region || marker?.id !== id || marker.site !== proof[2] || marker.kind !== region.kind)
				mismatch();
			const state: RegionInstance = {
				definition: region,
				range: childRange,
				site: proof[2],
				arm: marker.arm ?? -1,
				child: null,
				items: null,
				text: null,
				unresolvedSlot: region.kind === 'slot' && !fresh,
			};
			instance.regions.push(state);
			next = childRange.end.nextSibling;
			if (!fresh) adoptRegion(state, id, transaction);
		}
		cursors.set(parent, next);
	}
	if (cursors.get(-1) !== range.end) mismatch();
	for (let index = 0; index < definition.nodes.length; index++) {
		const proof = definition.nodes[index]!;
		if (
			proof[1] === 'element' &&
			proof[4] !== null &&
			(cursors.get(index) !== null || (counts.get(index) ?? 0) !== proof[4])
		)
			mismatch();
	}
	for (let index = 0; index < definition.bindings.length; index++) {
		const binding = definition.bindings[index]!;
		const node = instance.nodes[binding[0]];
		if (node?.nodeType !== 1) mismatch();
		instance.owned.push([node as Element, __claimBinding(node as Element, binding)]);
		if (binding[1] === 'control')
			transaction.hostOperations!.claimControl(instance, index, node as Element, transaction);
		if (!fresh && binding[1] === 'classGroup')
			instance.groups.set(
				index,
				definition.createClassGroup!(node as Element, binding[2], binding[3] as number),
			);
	}
	return instance;
}

function adoptRegion(region: RegionInstance, id: string, transaction: Transaction): void {
	const definition = region.definition;
	const range = region.range;
	if (definition.kind === 'if') {
		if (region.arm === -1) {
			if (range.start.nextSibling !== range.end) mismatch();
			return;
		}
		const arm = definition.arms[region.arm];
		if (!arm) mismatch();
		let body = range;
		if (definition.armRange) {
			body = rangeAt(range.start.nextSibling, range.end);
			if (body.start.data !== '[' || body.end.nextSibling !== range.end) mismatch();
		}
		region.child = resolveFragment(arm, id, body, false, transaction);
	} else if (definition.kind === 'for') {
		transaction.list!.adopt(region, id, transaction);
	} else if (definition.kind === 'view') {
		region.child = resolveFragment(
			definition.view.root,
			definition.view.id,
			range,
			false,
			transaction,
		);
	} else if (definition.kind === 'text') {
		const text = range.start.nextSibling;
		if (text !== range.end) {
			if (text?.nodeType !== 3 || text.nextSibling !== range.end) mismatch();
			region.text = text as Text;
		}
	}
}

function createFragment(
	definition: BindingFragment,
	id: string,
	document: Document,
	transaction: Transaction,
): FragmentInstance {
	requireActive(transaction);
	if (definition.constructible === false)
		throw new Error(
			definition.constructionError ??
				'This opaque view cannot be constructed without its external owner.',
		);
	const template = document.createElement('template');
	template.innerHTML = definition.ns === 1 ? `<svg>${definition.html}</svg>` : definition.html;
	const content = document.createDocumentFragment();
	const start = document.createComment(`[b;${id};root`);
	const end = document.createComment(']');
	content.appendChild(start);
	if (definition.ns === 1) {
		const svg = template.content.firstChild!;
		while (svg.firstChild) content.appendChild(svg.firstChild);
	} else content.appendChild(template.content);
	content.appendChild(end);
	return resolveFragment(definition, id, { start, end }, true, transaction);
}

function projectValues(
	values: readonly unknown[],
	instance: FragmentInstance,
	transaction: Transaction,
	controls?: Map<number, BindingControlPrepared>,
): BindingValue[] {
	const operations = instance.definition.bindings;
	if (!Array.isArray(values) || values.length !== operations.length)
		throw new TypeError('A DOM presentation projection must return its synchronous scalar values.');
	values = transaction.hostOperations?.project(values, instance, transaction) ?? values;
	if (transaction.signals || transaction.styles) {
		let copied = false;
		const indices = instance.definition.styleIndices
			? [...(instance.definition.signalIndices ?? []), ...instance.definition.styleIndices]
			: (instance.definition.signalIndices ?? []);
		for (const index of indices) {
			requireActive(transaction);
			let connection = (transaction.preview?.signals.get(instance) ?? instance.signals)?.get(index);
			const style = operations[index]![1] === 'styleObject';
			if (!connection && (style || transaction.signals?.isSignal(values[index]))) {
				const prepare = (): (() => void) => {
					if (
						instance.disposed ||
						(transaction.preparing && instance.signalFrame !== transaction.frame)
					)
						return () => {};
					const value = __normalizeBinding(operations[index]!, connection!.get());
					const group = instance.groups.get(index)?.prepare((value as string | null) ?? '');
					if (transaction.preparing && instance.signalPlan) {
						instance.signalPlan.values[index] = value;
						if (group) instance.signalPlan.groups.set(index, group);
						return () => {};
					}
					return () => writeOperation(instance, index, value, group, transaction);
				};
				const notify = forwardNativeTransitionConsumer(transaction.consumer!, (): void =>
					transaction.notifySignal!(prepare),
				);
				connection = style
					? transaction.styles!.connect(
							instance.nodes[operations[index]![0]] as Element,
							notify,
							transaction.restoreStyles,
						)
					: transaction.signals!.connect(notify);
				if (transaction.preview) {
					let signals = transaction.preview.signals.get(instance);
					if (!signals)
						transaction.preview.signals.set(instance, (signals = new Map(instance.signals)));
					signals.set(index, connection);
					const created = connection;
					transaction.preview.disposals.push(() => created.dispose(true));
				} else (instance.signals ??= new Map()).set(index, connection);
			}
			if (connection) {
				if (!copied) {
					values = [...values];
					copied = true;
				}
				if (transaction.preview) {
					const receipt = connection.preview(values[index]);
					transaction.preview.receipts.push(receipt);
					(values as unknown[])[index] = receipt.value;
				} else (values as unknown[])[index] = connection.read(values[index]);
			}
		}
	}
	return values.map((value, index) => {
		if (operations[index]![1] === 'control') {
			const control = transaction.preview
				? instance.controls!.get(index)!.preview(value)
				: instance.controls!.get(index)!.prepare(value);
			transaction.preview?.controls.push(control as BindingControlPreview);
			controls!.set(index, control);
			return null;
		}
		return __normalizeBinding(operations[index]!, value);
	});
}

function textValue(value: unknown, generic?: boolean): string {
	if (generic) {
		if (value == null || typeof value === 'boolean') return '';
		if (!['string', 'number', 'bigint'].includes(typeof value))
			throw new TypeError('A DOM presentation signal text requires a primitive value.');
	}
	return value == null || value === false ? '' : String(value);
}

function initialValues(
	instance: FragmentInstance,
	environment: readonly unknown[],
): Array<string | boolean | readonly string[] | null> | null {
	const definition = instance.definition;
	if (!instance.fresh || !definition.initializers?.length) return null;
	const values = definition.initialize?.(environment);
	if (!Array.isArray(values) || values.length !== definition.initializers.length)
		throw new TypeError(
			'A DOM presentation initializer must return its synchronous scalar values.',
		);
	return definition.initializers.map((operation, index) => {
		if (instance.nodes[operation[0]]?.nodeType !== 1) mismatch();
		const value = values[index];
		switch (operation[1]) {
			case 'classGroupInitial': {
				const baseline = __normalizeBinding([operation[0], 'class', 'class'], value) ?? '';
				const groups: string[] = [];
				for (const binding of definition.bindings)
					if (
						binding[0] === operation[0] &&
						binding[1] === 'classGroup' &&
						binding[2] === operation[2]
					)
						groups[binding[3] as number] = '';
				return JSON.stringify([baseline, groups]);
			}
			case 'checked':
			case 'defaultChecked':
			case 'selected':
				return Boolean(value);
			case 'value':
			case 'defaultValue':
				if (
					(instance.nodes[operation[0]] as Element).localName === 'select' &&
					Array.isArray(value)
				)
					return value.map(String);
				return value == null ? '' : String(value);
			default:
				return __normalizeBinding(operation, value) as string | null;
		}
	});
}

function prepareFragment(
	instance: FragmentInstance,
	environment: readonly unknown[],
	transaction: Transaction,
): FragmentPlan {
	requireActive(transaction);
	const definition = instance.definition;
	const controls = instance.controls && new Map<number, BindingControlPrepared>();
	const plan: FragmentPlan = {
		instance,
		environment,
		values: projectValues(definition.project(environment), instance, transaction, controls),
		initial: transaction.hostOperations?.initial(instance, environment) ?? null,
		regions: [],
		groups: new Map(),
		controls,
		adapters: instance.cleanup?.prepare?.(environment),
	};
	if (!transaction.preview && (instance.signals || instance.controls || instance.projections)) {
		instance.signalPlan = plan;
		instance.signalFrame = transaction.frame;
	}
	requireActive(transaction);
	transaction.hostOperations?.groups(plan);
	const document = instance.range.start.ownerDocument;
	requireActive(transaction);
	for (const region of instance.regions) {
		const descriptor = region.definition;
		const candidate: RegionPlan = {
			instance: region,
			arm: -1,
			child: null,
			items: null,
			text: null,
		};
		plan.regions.push(candidate);
		if (descriptor.kind === 'text') {
			let value = descriptor.read(environment);
			if (descriptor.signal && transaction.signals) {
				let connection = transaction.preview?.text.get(region) ?? region.signal;
				if (!connection && transaction.signals.isSignal(value)) {
					const prepare = (): (() => void) => {
						if (
							instance.disposed ||
							(transaction.preparing && region.signalFrame !== transaction.frame)
						)
							return () => {};
						const next = textValue(region.signal!.get(), descriptor.generic);
						if (transaction.preparing && region.signalPlan) {
							region.signalPlan.text = next;
							return () => {};
						}
						return () => {
							if (!instance.disposed && !transaction.disposed) writeText(region, next);
						};
					};
					connection = transaction.signals.connect(
						forwardNativeTransitionConsumer(transaction.consumer!, () =>
							transaction.notifySignal!(prepare),
						),
					);
					if (transaction.preview) {
						transaction.preview.text.set(region, connection);
						const created = connection;
						transaction.preview.disposals.push(() => created.dispose());
					} else region.signal = connection;
				}
				if (connection) {
					if (transaction.preview) {
						const receipt = connection.preview(value);
						transaction.preview.receipts.push(receipt);
						value = receipt.value;
					} else {
						region.signalPlan = candidate;
						region.signalFrame = transaction.frame;
						value = connection.read(value);
					}
				}
			}
			candidate.text = textValue(value, descriptor.generic);
		} else if (descriptor.kind === 'if') {
			const arm = descriptor.select(environment);
			if (!Number.isSafeInteger(arm) || arm < -1 || arm >= descriptor.arms.length)
				throw new TypeError('A DOM presentation branch projection returned an unknown arm.');
			candidate.arm = arm;
			if (arm !== -1)
				candidate.child = prepareFragment(
					region.arm === arm && region.child
						? region.child
						: createFragment(descriptor.arms[arm]!, instance.id, document, transaction),
					environment,
					transaction,
				);
		} else if (descriptor.kind === 'for') {
			transaction.list!.prepare(instance, region, candidate, environment, document, transaction);
		} else if (descriptor.kind === 'view') {
			candidate.child = prepareFragment(
				region.child ??
					createFragment(descriptor.view.root, descriptor.view.id, document, transaction),
				descriptor.view.prepareProps
					? descriptor.view.prepareProps(descriptor.props(environment))
					: [descriptor.props(environment)],
				transaction,
			);
		} else if (descriptor.kind === 'slot') {
			const value = descriptor.read(environment);
			if (
				value != null &&
				(typeof value !== 'object' || (value as BindingSlot)[bindingSlot] !== true)
			)
				throw new TypeError('A DOM presentation child slot requires a compiler-owned fragment.');
			const slot = value as BindingSlot | null | undefined;
			if (slot?.site !== undefined) candidate.slot = slot.id + ';' + slot.site;
			if (region.unresolvedSlot) {
				if (slot)
					region.child = resolveFragment(slot.fragment, slot.id, region.range, false, transaction);
				else if (region.range.start.nextSibling !== region.range.end) mismatch();
				region.unresolvedSlot = false;
			}
			if (slot)
				candidate.child = prepareFragment(
					region.child?.definition === slot.fragment && region.child.id === slot.id
						? region.child
						: createFragment(slot.fragment, slot.id, document, transaction),
					slot.environment,
					transaction,
				);
		}
	}
	requireActive(transaction);
	return plan;
}

function removeRange(range: BindingRange, interior: boolean, transaction?: Transaction): void {
	let node: Node | null = interior ? range.start.nextSibling : range.start;
	const stop = interior ? range.end : range.end.nextSibling;
	while (node !== stop && node !== null && !transaction?.disposed) {
		const next: Node | null = node.nextSibling;
		node.parentNode!.removeChild(node);
		node = next;
	}
}

function moveRange(
	range: BindingRange,
	parent: Node,
	anchor: Node | null,
	transaction: Transaction,
): void {
	if (range.end.nextSibling === anchor && range.start.parentNode === parent) return;
	const nodes: Node[] = [];
	for (let node: Node | null = range.start; node !== null; node = node.nextSibling) {
		nodes.push(node);
		if (node === range.end) break;
	}
	for (const node of nodes) {
		if (transaction.disposed) return;
		moveNativeNodeBefore(parent, node, anchor, transaction.focused, transaction.contentEditable);
	}
}

function insertBody(
	instance: FragmentInstance,
	range: BindingRange,
	armRange: boolean,
	transaction: Transaction,
): void {
	if (armRange) {
		instance.range.start.data = '[';
		moveRange(instance.range, range.end.parentNode!, range.end, transaction);
	} else {
		let node = instance.range.start.nextSibling;
		while (node !== instance.range.end && !transaction.disposed) {
			const next = node!.nextSibling;
			range.end.parentNode!.insertBefore(node!, range.end);
			node = next;
		}
		instance.range = range;
	}
}

function initializeProperties(
	plan: FragmentPlan,
	afterChildren: boolean,
	transaction: Transaction,
): void {
	if (!plan.initial) return;
	const instance = plan.instance;
	const operations = instance.definition.initializers!;
	for (let index = 0; index < operations.length && !transaction.disposed; index++) {
		const operation = operations[index]!;
		const node = instance.nodes[operation[0]] as Element;
		const value = plan.initial[index]!;
		const deferred =
			node.localName === 'select' && (operation[1] === 'value' || operation[1] === 'defaultValue');
		if (deferred !== afterChildren) continue;
		switch (operation[1]) {
			case 'classGroupInitial': {
				const baseline = JSON.parse(value as string)[0] as string;
				__writeBinding(node, [operation[0], 'class', 'class'], baseline);
				if (!transaction.disposed) node.setAttribute(operation[2], value as string);
				break;
			}
			case 'value':
			case 'defaultValue':
				if (node.localName === 'select') {
					const select = node as HTMLSelectElement;
					if (Array.isArray(value)) {
						const selected = new Set(value);
						for (const option of select.options) option.selected = selected.has(option.value);
					} else select.value = value as string;
					if (operation[1] === 'defaultValue')
						for (const option of select.options) option.defaultSelected = option.selected;
				} else (node as HTMLInputElement)[operation[1]] = value as string;
				break;
			case 'checked':
			case 'defaultChecked':
				(node as HTMLInputElement)[operation[1]] = value as boolean;
				break;
			case 'selected':
				(node as HTMLOptionElement).selected = value as boolean;
				break;
			default:
				__writeBinding(node, operation, value as string | null);
		}
	}
}

function commitRegion(plan: RegionPlan, id: string, transaction: Transaction): void {
	const region = plan.instance;
	const definition = region.definition;
	if (definition.kind === 'opaque') return;
	if (definition.kind === 'text') {
		region.signalPlan = undefined;
		writeText(region, plan.text!);
		return;
	}
	if (definition.kind === 'for') {
		transaction.list!.commit(plan, id, transaction);
		return;
	}
	const oldChild = region.child;
	const child = plan.child?.instance ?? null;
	region.child = child;
	region.arm = plan.arm;
	if (definition.kind === 'slot') region.slot = plan.slot;
	if (oldChild !== child) {
		if (oldChild) releaseInstance(oldChild, transaction);
		if (transaction.disposed) return;
		removeRange(region.range, true, transaction);
	}
	if (plan.child) {
		commitFragment(plan.child, transaction);
		if (transaction.disposed) return;
		if (oldChild !== child)
			insertBody(
				child!,
				region.range,
				definition.kind === 'if' && !!definition.armRange,
				transaction,
			);
	}
	if (definition.kind === 'if') region.range.start.data = `[b;${id};${region.site};${plan.arm}`;
}

function writeText(region: RegionInstance, value: string): void {
	if (region.text === null) {
		if (value !== '') {
			region.text = region.range.start.ownerDocument.createTextNode(value);
			region.range.end.parentNode!.insertBefore(region.text, region.range.end);
		}
	} else if (region.text.data !== value) region.text.data = value;
}

function writeOperation(
	instance: FragmentInstance,
	index: number,
	value: BindingValue,
	group: { commit(): void } | undefined,
	transaction: Transaction,
): void {
	if (transaction.disposed || instance.disposed || value === instance.previous[index]) return;
	const operation = instance.definition.bindings[index]!;
	if (operation[1] === 'classToken') instance.previous[index] = value;
	if (operation[1] === 'styleObject') {
		const projection = instance.projections?.get(index);
		if (projection) projection.writeStyle(index, value);
		else instance.signals!.get(index)!.write!(value);
	} else if (operation[1] === 'classGroup') group!.commit();
	else if (
		(operation[1] === 'styleProperty' || operation[1] === 'styleAttribute') &&
		transaction.restoreStyles
	) {
		instance.styles ??= new Map();
		let style = instance.styles.get(index);
		if (!style)
			instance.styles.set(
				index,
				(style = __createBindingStyleRestoration(
					instance.nodes[operation[0]] as Element,
					operation,
				)),
			);
		style.write(value as string | null);
	} else __writeBinding(instance.nodes[operation[0]] as Element, operation, value as string | null);
	if (!transaction.disposed && !instance.disposed) instance.previous[index] = value;
}

function commitFragment(plan: FragmentPlan, transaction: Transaction): void {
	const instance = plan.instance;
	if (transaction.disposed) return;
	instance.signalPlan = undefined;
	instance.environment = plan.environment;
	instance.updateAdapters = plan.adapters;
	transaction.hostOperations?.initialize(plan, false, transaction);
	for (let index = 0; index < plan.values.length && !transaction.disposed; index++) {
		if (instance.definition.bindings[index]![1] === 'control') continue;
		writeOperation(instance, index, plan.values[index]!, plan.groups.get(index), transaction);
	}
	for (const region of plan.regions) {
		if (transaction.disposed) return;
		commitRegion(region, instance.id, transaction);
	}
	transaction.hostOperations?.initialize(plan, true, transaction);
	for (const control of plan.controls?.values() ?? []) {
		if (transaction.disposed) return;
		control.commit();
	}
	if (!transaction.disposed) instance.fresh = false;
}

function publishControls(plan: FragmentPlan, transaction: Transaction): void {
	if (transaction.disposed) return;
	for (const control of plan.controls?.values() ?? []) {
		if (transaction.disposed) return;
		control.publish();
	}
	for (const region of plan.regions) {
		if (region.child) publishControls(region.child, transaction);
		if (region.items)
			for (const child of region.items.values()) publishControls(child, transaction);
	}
}

function activateInstance(instance: FragmentInstance, transaction: Transaction): void {
	if (transaction.disposed || instance.disposed) return;
	if (!instance.activated) {
		instance.activated = true;
		if (instance.definition.activate) {
			const controller = new AbortController();
			instance.controller = controller;
			const cleanup = instance.definition.activate(instance.nodes, {
				signal: controller.signal,
				getEnvironment: () => instance.environment,
			});
			if (cleanup !== undefined && typeof cleanup !== 'function')
				throw new TypeError('A DOM presentation activation must return cleanup or undefined.');
			if (instance.disposed) cleanup?.();
			else if (cleanup) instance.cleanup = cleanup;
		}
	} else {
		const update = instance.updateAdapters;
		instance.updateAdapters = undefined;
		update?.();
	}
	for (const region of instance.regions) {
		if (region.child) activateInstance(region.child, transaction);
		if (region.items)
			for (const child of region.items.values()) activateInstance(child, transaction);
	}
}

function bindProgram<Props>(
	root: Element | BindingRange | BindingMountTarget,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options: BindingOptions | undefined,
	mount: boolean,
	list: BindingListCapability | undefined = descriptor.list,
	hostOperations: BindingProgramHostOperations | undefined = descriptor.hostOperations,
): BindingHandle {
	if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function')
		throw new TypeError(
			'DOM presentation requires synchronous getSnapshot() and subscribe() methods.',
		);
	const target = mount ? (root as BindingMountTarget) : null;
	if (
		target &&
		(!target.parent || (target.before != null && target.before.parentNode !== target.parent))
	)
		throw new TypeError(
			'A DOM presentation mount requires a parent and its optional insertion anchor.',
		);
	const transaction: Transaction = {
		disposed: false,
		all: new Set(),
		candidates: new Set(),
		focused: null,
		contentEditable: false,
		restoreStyles: options?.restoreStyles === true,
		signals: descriptor.connectSignal?.(),
		styles: descriptor.connectStyle?.(),
		projections: descriptor.connectProjection?.(),
		controls: descriptor.createControls?.(),
		list,
		hostOperations,
		frame: 0,
	};
	const signalUpdates =
		transaction.signals || transaction.styles || transaction.projections || transaction.controls
			? new Set<() => () => void>()
			: undefined;
	let instance: FragmentInstance | undefined;
	let ownedRoot: Comment | undefined;
	let busy = true;
	let dirty = false;
	let revision = 0;
	let mounted = !mount;
	let unsubscribe: (() => void) | undefined;
	const signal = options?.signal;
	const dispose = (disposal?: { preserveDOM?: boolean }, publish?: () => void): void => {
		if (transaction.disposed) {
			publish?.();
			return;
		}
		transaction.disposed = true;
		signalUpdates?.clear();
		signal?.removeEventListener('abort', abort);
		let failed = false;
		let failure: unknown;
		if (publish !== undefined) {
			// Quiesce early native listeners before normal ownership is activated.
			// Ref cleanup and source unsubscribe below may synchronously write or
			// dispatch; they must observe the new owner, never stale preparation.
			for (const owned of transaction.all) owned.controller?.abort();
			try {
				publish();
			} catch (error) {
				failed = true;
				failure = error;
			}
		}
		for (const owned of [...transaction.all]) {
			try {
				releaseInstance(owned, transaction);
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		const stop = unsubscribe;
		unsubscribe = undefined;
		try {
			stop?.();
		} catch (error) {
			if (!failed) {
				failed = true;
				failure = error;
			}
		}
		try {
			if (disposal?.preserveDOM === false && mounted && instance)
				removeRange(instance.range, false);
		} catch (error) {
			if (!failed) {
				failed = true;
				failure = error;
			}
		} finally {
			if (ownedRoot) programRoots.delete(ownedRoot);
		}
		if (failed) throw failure;
	};
	const abort = (): void => dispose();
	const drain = (): void => {
		if (transaction.disposed) return;
		if (busy) return;
		busy = true;
		try {
			while ((dirty || signalUpdates?.size) && !transaction.disposed) {
				if (!dirty) {
					if (transaction.projections) {
						// A group may invalidate while another field coerces. Replace its
						// stale prepared commit before writing any of the coupled fields.
						const writes = new Map<() => () => void, () => void>();
						while (signalUpdates!.size && !dirty && !transaction.disposed) {
							const pending = [...signalUpdates!];
							signalUpdates!.clear();
							for (const prepare of pending) writes.set(prepare, prepare());
						}
						if (!dirty && !transaction.disposed) {
							for (const write of writes.values()) write();
							transaction.published?.();
						}
						continue;
					}
					const pending = [...signalUpdates!];
					signalUpdates!.clear();
					const writes = pending.map((prepare) => prepare());
					if (!dirty && !transaction.disposed) {
						for (const write of writes) write();
						transaction.published?.();
					}
					continue;
				}
				dirty = false;
				signalUpdates?.clear();
				const snapshot = source.getSnapshot();
				if (dirty || transaction.disposed) continue;
				if (
					snapshot !== null &&
					(typeof snapshot === 'object' || typeof snapshot === 'function') &&
					typeof (snapshot as { then?: unknown }).then === 'function'
				)
					throw new TypeError('DOM presentation requires a synchronous snapshot, not a thenable.');
				transaction.preparing = true;
				transaction.frame++;
				const plan = prepareFragment(
					instance!,
					descriptor.prepareProps ? descriptor.prepareProps(snapshot) : [snapshot],
					transaction,
				);
				if (!dirty && !transaction.disposed && transaction.controls)
					transaction.hostOperations!.publish(plan, transaction);
				while (signalUpdates?.size && !dirty && !transaction.disposed) {
					const pending = [...signalUpdates];
					signalUpdates.clear();
					for (const prepare of pending) prepare();
				}
				transaction.preparing = false;
				if (dirty || transaction.disposed) {
					for (const candidate of [...transaction.candidates])
						if (candidate !== instance) releaseInstance(candidate, transaction);
					if (instance!.fresh) {
						for (const group of instance!.groups.values()) group.dispose();
						instance!.groups.clear();
					}
					continue;
				}
				const document = instance!.range.start.ownerDocument;
				const tree = instance!.range.start.getRootNode();
				let focused =
					'activeElement' in tree
						? (tree as Document | ShadowRoot).activeElement
						: document.activeElement;
				while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
				transaction.focused = focused;
				transaction.contentEditable = !!(transaction.focused as HTMLElement | null)
					?.isContentEditable;
				commitFragment(plan, transaction);
				if (transaction.disposed) break;
				transaction.published?.();
				if (!mounted) {
					moveRange(instance!.range, target!.parent, target!.before ?? null, transaction);
					mounted = true;
				}
				transaction.candidates.clear();
				activateInstance(instance!, transaction);
			}
		} catch (error) {
			if (error === stopped) return;
			try {
				dispose();
			} catch {
				/* The publication failure remains primary. */
			}
			throw error;
		} finally {
			transaction.preparing = false;
			busy = false;
		}
	};
	if (signalUpdates)
		transaction.notifySignal = (prepare): void => {
			if (!transaction.disposed) {
				revision++;
				signalUpdates.add(prepare);
				drain();
			}
		};
	const refresh: NativeTransitionNotify = (): void => {
		if (transaction.disposed) return;
		revision++;
		dirty = true;
		drain();
	};
	transaction.consumer = refresh;
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	refresh[NATIVE_TRANSITION_CONSUMER] = {
		active: () => !transaction.disposed,
		prepare: () =>
			run(() => {
				const version = revision;
				const preview: BindingPreview = {
					receipts: [],
					controls: [],
					fragments: new Set(),
					signals: new Map(),
					projections: new Map(),
					text: new Map(),
					disposals: [],
				};
				let accepted = false;
				let retired = false;
				const discard = (): void => {
					if (accepted || retired) return;
					retired = true;
					for (const receipt of preview.receipts) receipt.discard();
					for (const control of preview.controls) control.discard();
					for (const dispose of preview.disposals) dispose();
					for (const fragment of preview.fragments) releaseInstance(fragment, transaction);
				};
				let plan: FragmentPlan;
				transaction.preview = preview;
				const previousBusy = busy;
				busy = true;
				try {
					const snapshot = source.getSnapshot();
					if (snapshot != null && typeof (snapshot as { then?: unknown }).then === 'function')
						throw new TypeError(
							'DOM presentation requires a synchronous snapshot, not a thenable.',
						);
					plan = prepareFragment(
						instance!,
						descriptor.prepareProps ? descriptor.prepareProps(snapshot) : [snapshot],
						transaction,
					);
				} catch (error) {
					discard();
					throw error;
				} finally {
					transaction.preview = undefined;
					busy = previousBusy;
				}
				return {
					validate: () =>
						!retired &&
						!transaction.disposed &&
						!busy &&
						version === revision &&
						preview.receipts.every((receipt) => receipt.validate()) &&
						preview.controls.every((control) => control.validate()),
					discard,
					commit() {
						if (retired || accepted || transaction.disposed) return;
						accepted = true;
						busy = true;
						try {
							for (const [fragment, signals] of preview.signals) fragment.signals = signals;
							for (const [fragment, projections] of preview.projections)
								fragment.projections = projections;
							for (const [region, signal] of preview.text) region.signal = signal;
							for (const receipt of preview.receipts) receipt.commit();
							transaction.hostOperations?.publish(plan, transaction);
							const document = instance!.range.start.ownerDocument;
							const tree = instance!.range.start.getRootNode();
							transaction.focused =
								'activeElement' in tree
									? (tree as Document | ShadowRoot).activeElement
									: document.activeElement;
							while (transaction.focused?.shadowRoot?.activeElement)
								transaction.focused = transaction.focused.shadowRoot.activeElement;
							transaction.contentEditable = !!(transaction.focused as HTMLElement | null)
								?.isContentEditable;
							commitFragment(plan, transaction);
							transaction.published?.();
							for (const fragment of preview.fragments) transaction.candidates.delete(fragment);
							activateInstance(instance!, transaction);
						} finally {
							busy = false;
						}
					},
				};
			}),
	};
	let handoff: BindingHandoff | undefined;
	const handle = {
		refresh,
		dispose,
		[BINDING_HANDOFF](): BindingHandoff {
			const structural =
				descriptor.root.handoff === 'structural' || descriptor.root.conditionalRest === true;
			if (structural && !mount && instance && descriptor.root.createHandoff)
				return (handoff ??= descriptor.root.createHandoff(
					instance,
					transaction,
					dispose,
					() => !busy,
				));
			if (
				mount ||
				descriptor.root.handoff !== true ||
				!instance ||
				descriptor.root.regions.length !== 0 ||
				descriptor.root.bindings.some((binding) => binding[1] === 'control') ||
				descriptor.root.nodes.some((node) => node[1] === 'element' && node[4] === null)
			)
				throw new Error(
					'Hydration binding leases require an adopted fixed native view without structural regions or controls.',
				);
			return (handoff ??= {
				id: descriptor.id,
				root: instance.range.start,
				anchor: instance.nodes.find((node) => node.nodeType === 1) ?? instance.range.start,
				active: () => !transaction.disposed,
				retire: (publish) => {
					transaction.preservePresentation = true;
					dispose(undefined, publish);
				},
			});
		},
	};
	if (signal?.aborted) {
		dispose();
		return handle;
	}
	try {
		if (mount) {
			instance = createFragment(
				descriptor.root,
				descriptor.id,
				target!.parent.ownerDocument ?? (target!.parent as Document),
				transaction,
			);
			ownedRoot = instance.range.start;
			programRoots.add(ownedRoot);
		} else {
			const range = rootRange(root as Element | BindingRange, descriptor.id);
			if (programRoots.has(range.start))
				throw new Error(
					'This DOM presentation range already has a binding. Dispose it before rebinding.',
				);
			ownedRoot = range.start;
			programRoots.add(ownedRoot);
			instance = resolveFragment(descriptor.root, descriptor.id, range, false, transaction);
		}
		if (signal?.aborted) {
			dispose();
			return handle;
		}
		signal?.addEventListener('abort', abort, { once: true });
		const stop = source.subscribe(refresh);
		if (typeof stop !== 'function')
			throw new TypeError('A DOM presentation subscription must return cleanup.');
		if (transaction.disposed) stop();
		else unsubscribe = stop;
		busy = false;
		refresh();
		return handle;
	} catch (error) {
		try {
			dispose();
		} catch {
			/* The initialization failure remains primary. */
		}
		throw error;
	}
}

function adoptProgram<Props>(
	root: Element | BindingRange,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options: BindingOptions | undefined,
	list?: BindingListCapability,
	hostOperations?: BindingProgramHostOperations,
): BindingHandle {
	if (
		(root as Node).nodeType === 1 &&
		descriptor.scalar?.id === descriptor.id &&
		descriptor.adoptScalar
	) {
		const element = root as Element;
		const previous = element.previousSibling;
		const marker = previous?.nodeType === 8 ? parseBindingMarker((previous as Comment).data) : null;
		// A forced-mount artifact may also adopt its original scalar SSR output.
		// An actual mounted program range must keep structural lifetime/removal.
		if (marker?.kind !== 'root' && element.getAttribute('data-octane-bindings') === descriptor.id)
			return descriptor.adoptScalar(element, descriptor.scalar, source, options);
	}
	return bindProgram(root, descriptor, source, options, false, list, hostOperations);
}

/** @internal The current compiler supplies every capability used by its program. */
export function __adoptLeanBindingProgram<Props>(
	root: Element | BindingRange,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	return adoptProgram(root, descriptor, source, options);
}

/** @internal Construct only compiler-proven native fragments, never application builders. */
export function __mountLeanBindingProgram<Props>(
	target: BindingMountTarget,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	return bindProgram(target, descriptor, source, options, true);
}

/** @internal A compiler-selected capability; list-free programs never reference it. */
export const __bindingList = { adopt: adoptList, prepare: prepareList, commit: commitList };

type BindingListCapability = typeof __bindingList;

/** @internal Selected only for controls, grouped projections/classes, or native initialization. */
export const __bindingProgramHostOperations = {
	claimControl: claimProgramControl,
	project: projectHostValues,
	initial: initialValues,
	groups: prepareHostGroups,
	initialize: initializeProperties,
	publish: publishControls,
	releaseControls: releaseHostControls,
	releaseProjections: releaseHostProjections,
};
type BindingProgramHostOperations = typeof __bindingProgramHostOperations;

// Older query artifacts only carry their adopter, not selected capabilities.
// Keeping this metadata on that legacy callable lets a new parent forward an
// old imported child's capabilities without retaining them for current children.
export const __adoptBindingProgram = /* @__PURE__ */ Object.assign(
	function __adoptBindingProgram<Props>(
		root: Element | BindingRange,
		descriptor: CompiledBindingProgram<Props>,
		source: BindingSource<Props>,
		options?: BindingOptions,
	): BindingHandle {
		return adoptProgram(
			root,
			descriptor,
			source,
			options,
			__bindingList,
			__bindingProgramHostOperations,
		);
	},
	{ list: __bindingList, hostOperations: __bindingProgramHostOperations },
);

/** @internal Compatibility entry for artifacts emitted before capability selection. */
export function __mountBindingProgram<Props>(
	target: BindingMountTarget,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	return bindProgram(
		target,
		descriptor,
		source,
		options,
		true,
		__bindingList,
		__bindingProgramHostOperations,
	);
}

function adoptList(region: RegionInstance, id: string, transaction: Transaction): void {
	const definition = region.definition as Extract<BindingRegion, { kind: 'for' }>;
	const range = region.range;
	if (region.arm === 0) {
		if (definition.empty)
			region.child = resolveFragment(definition.empty, id, range, false, transaction);
		else if (range.start.nextSibling !== range.end) mismatch();
		return;
	}
	region.items = new Map();
	let cursor: Node | null = range.start.nextSibling;
	while (cursor !== range.end) {
		const itemRange = rangeAt(cursor, range.end);
		const marker = parseBindingMarker(itemRange.start.data);
		if (
			marker?.id !== id ||
			marker.site !== region.site ||
			marker.kind !== 'item' ||
			region.items.has(marker.key!)
		)
			mismatch();
		region.items.set(
			marker.key!,
			resolveFragment(definition.item, id, itemRange, false, transaction),
		);
		cursor = itemRange.end.nextSibling;
	}
	if (region.items.size === 0) mismatch();
}

function prepareList(
	instance: FragmentInstance,
	region: RegionInstance,
	candidate: RegionPlan,
	environment: readonly unknown[],
	document: Document,
	transaction: Transaction,
): void {
	const descriptor = region.definition as Extract<BindingRegion, { kind: 'for' }>;
	const input = descriptor.items(environment);
	if (input == null || typeof input[Symbol.iterator] !== 'function')
		throw new TypeError('A DOM presentation list requires a synchronous iterable.');
	const items = Array.from(input);
	const keys = items.map((item, index) =>
		encodeBindingKey(descriptor.key(item, index, environment)),
	);
	if (new Set(keys).size !== keys.length)
		throw new Error('A DOM presentation list cannot contain duplicate keys.');
	candidate.arm = items.length === 0 ? 0 : 1;
	if (items.length === 0) {
		if (descriptor.empty)
			candidate.child = prepareFragment(
				region.arm === 0 && region.child
					? region.child
					: createFragment(descriptor.empty, instance.id, document, transaction),
				environment,
				transaction,
			);
	} else {
		candidate.items = new Map();
		for (let index = 0; index < items.length; index++) {
			const key = keys[index]!;
			const child =
				region.items?.get(key) ??
				createFragment(descriptor.item, instance.id, document, transaction);
			candidate.items.set(
				key,
				prepareFragment(child, [...environment, items[index], index], transaction),
			);
		}
	}
}

function commitList(plan: RegionPlan, id: string, transaction: Transaction): void {
	const region = plan.instance;
	const oldChild = region.child;
	const oldItems = region.items;
	const child = plan.child?.instance ?? null;
	const items = plan.items
		? new Map([...plan.items].map(([key, item]) => [key, item.instance]))
		: null;
	region.child = child;
	region.items = items;
	region.arm = plan.arm;
	if (oldChild && oldChild !== child) {
		releaseInstance(oldChild, transaction);
		if (transaction.disposed) return;
		removeRange(region.range, true, transaction);
	}
	if (oldItems)
		for (const [key, item] of oldItems) {
			if (items?.get(key) === item) continue;
			releaseInstance(item, transaction);
			if (transaction.disposed) return;
			removeRange(item.range, false, transaction);
		}
	if (plan.child) {
		commitFragment(plan.child, transaction);
		if (transaction.disposed) return;
		if (child !== oldChild) insertBody(child!, region.range, false, transaction);
	} else if (plan.items) {
		for (const item of plan.items.values()) {
			commitFragment(item, transaction);
			if (transaction.disposed) return;
		}
		let anchor: Node = region.range.end;
		for (const [key, item] of [...plan.items].reverse()) {
			item.instance.range.start.data = `[b;${id};${region.site};k;${key}`;
			moveRange(item.instance.range, region.range.end.parentNode!, anchor, transaction);
			if (transaction.disposed) return;
			anchor = item.instance.range.start;
		}
	}
	region.range.start.data = `[f${plan.arm};b;${id};${region.site}`;
	return;
}

function claimProgramControl(
	instance: FragmentInstance,
	index: number,
	node: Element,
	transaction: Transaction,
): void {
	if (!transaction.controls)
		throw new TypeError('A DOM control binding requires its compiler-selected adapter.');
	const prepare = (): (() => void) => {
		if (instance.disposed || (transaction.preparing && instance.signalFrame !== transaction.frame))
			return () => {};
		const prepared = instance.controls!.get(index)!.prepareCurrent();
		prepared.publish();
		if (transaction.preparing && instance.signalPlan) {
			instance.signalPlan.controls!.set(index, prepared);
			return () => {};
		}
		return prepared.commit;
	};
	(instance.controls ??= new Map()).set(
		index,
		transaction.controls.claim(
			node,
			instance.definition.bindings[index]![2] as 'value' | 'checked',
			forwardNativeTransitionConsumer(transaction.consumer!, () =>
				transaction.notifySignal!(prepare),
			),
		),
	);
}

function projectHostValues(
	values: readonly unknown[],
	instance: FragmentInstance,
	transaction: Transaction,
): readonly unknown[] {
	const operations = instance.definition.bindings;
	if (transaction.projections && instance.definition.projectionGroups) {
		values = [...values];
		for (const group of instance.definition.projectionGroups) {
			requireActive(transaction);
			const first = group[0]![0];
			let connection = (
				transaction.preview?.projections.get(instance) ?? instance.projections
			)?.get(first);
			if (!connection) {
				const prepare = (): (() => void) => {
					if (
						instance.disposed ||
						(transaction.preparing && instance.signalFrame !== transaction.frame)
					)
						return () => {};
					const projected = connection!.get();
					const groups = new Map<number, { commit(): void }>();
					for (const [index] of group) {
						const classGroup = instance.groups
							.get(index)
							?.prepare((projected[index] as string | null) ?? '');
						if (classGroup) groups.set(index, classGroup);
					}
					if (transaction.preparing && instance.signalPlan) {
						for (const [index] of group) {
							instance.signalPlan.values[index] = projected[index]!;
							const classGroup = groups.get(index);
							if (classGroup) instance.signalPlan.groups.set(index, classGroup);
						}
						return () => {};
					}
					return () => {
						for (const [index] of group)
							writeOperation(instance, index, projected[index]!, groups.get(index), transaction);
					};
				};
				connection = transaction.projections.connect(
					group,
					operations,
					instance.nodes,
					forwardNativeTransitionConsumer(transaction.consumer!, () =>
						transaction.notifySignal!(prepare),
					),
					transaction.restoreStyles,
				);
				if (transaction.preview) {
					let projections = transaction.preview.projections.get(instance);
					if (!projections)
						transaction.preview.projections.set(
							instance,
							(projections = new Map(instance.projections)),
						);
					for (const [index] of group) projections.set(index, connection);
					const created = connection;
					transaction.preview.disposals.push(() => created.dispose(true));
				} else {
					instance.projections ??= new Map();
					for (const [index] of group) instance.projections.set(index, connection);
				}
			}
			const receipt = transaction.preview ? connection.preview(values[first]) : undefined;
			if (receipt) transaction.preview!.receipts.push(receipt);
			const projected = receipt ? receipt.value : connection.read(values[first]);
			for (const [index] of group) (values as unknown[])[index] = projected[index];
		}
	}

	return values;
}

function prepareHostGroups(plan: FragmentPlan): void {
	const instance = plan.instance;
	const definition = instance.definition;
	for (let index = 0; index < definition.bindings.length; index++) {
		const operation = definition.bindings[index]!;
		if (operation[1] !== 'classGroup') continue;
		let group = instance.groups.get(index);
		if (!group) {
			const receipt = definition.initializers?.findIndex(
				(initializer) =>
					initializer[0] === operation[0] &&
					initializer[1] === 'classGroupInitial' &&
					initializer[2] === operation[2],
			);
			if (receipt === undefined || receipt < 0 || typeof plan.initial?.[receipt] !== 'string')
				throw new Error('A constructible class group requires its compiler baseline initializer.');
			group = definition.createClassGroup!(
				instance.nodes[operation[0]] as Element,
				operation[2],
				operation[3] as number,
				plan.initial[receipt] as string,
			);
			instance.groups.set(index, group);
		}
		plan.groups.set(index, group.prepare((plan.values[index] as string | null) ?? ''));
	}
}

function releaseHostControls(
	instance: FragmentInstance,
	attempt: (callback: () => void) => void,
): void {
	for (const control of instance.controls?.values() ?? []) attempt(() => control.dispose());
	instance.controls?.clear();
}

function releaseHostProjections(
	instance: FragmentInstance,
	transaction: Transaction,
	attempt: (callback: () => void) => void,
): void {
	for (const connection of instance.projections ? new Set(instance.projections.values()) : [])
		attempt(() => connection.dispose(transaction.preservePresentation));
	instance.projections?.clear();
}

/** @internal Compatibility for artifacts which selected lists but not host operations. */
export const __adoptSelectedBindingProgram = /* @__PURE__ */ Object.assign(
	function __adoptSelectedBindingProgram<Props>(
		root: Element | BindingRange,
		descriptor: CompiledBindingProgram<Props>,
		source: BindingSource<Props>,
		options?: BindingOptions,
	): BindingHandle {
		return adoptProgram(
			root,
			descriptor,
			source,
			options,
			descriptor.list,
			__bindingProgramHostOperations,
		);
	},
	{ hostOperations: __bindingProgramHostOperations },
);

/** @internal Compatibility for artifacts which selected lists but not host operations. */
export function __mountSelectedBindingProgram<Props>(
	target: BindingMountTarget,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	return bindProgram(
		target,
		descriptor,
		source,
		options,
		true,
		descriptor.list,
		__bindingProgramHostOperations,
	);
}
