// Signal owners and native reads
//
// Signal instance keys, renderer signal owners and their retry tracking, native
// style and projection bindings, and the native-read scopes and adoptions that
// compiled signal reads use.

import {
	TRANSITION_ROOT_DRIVER,
	NATIVE_READ_DRIVER,
	SIGNAL_BINDINGS_ENABLED,
	ensureNativeReadDriver,
	registerRootOptions,
} from './drivers.js';
import { hydrating } from '../hydration-flag.js';
import { __normalizeBindingStyle } from '../dom-binding-styles.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { BOUNDARY_CLIENT, boundaryIdCount } from '../hydration-protocol.js';
import { CONTEXT_TAG } from '../runtime-tags.js';
import type { NativeReadWitness } from '../signals/native-read-collector.js';
import { type NativeReadRetry, createNativeReadRetry } from '../signals/native-read-retry.js';
import {
	readNativeDomStyle,
	setNativeAdoptionResolver,
	type SignalDeclarationStage,
} from '../signals/read-protocol.js';
import {
	supersedeSignalOwner,
	currentSignalOwner,
	runWithSignalOwner,
} from '../signals/owner-context.js';
import {
	signalDocumentEnabled,
	documentSignalOwner,
	streamedSignalOwnerActivator as STREAMED_SIGNAL_OWNER_ACTIVATOR,
	signalOwnerFrame,
} from '../signals/document-owner.js';
import { associateSignalOwnerDocument } from '../signals/early-values.js';
import type { SignalRendererOwnerIdentity, SignalOwner } from '../signals/types.js';
import { normalizeClass } from '../css.js';
import type {
	Scope,
	SignalRetryOwners,
	SignalRetryLocation,
	RootIdState,
	Block,
	QueuedCell,
	RootRenderOwner,
	RefAttach,
	SuspenseRefEntry,
	OffscreenCapture,
	TrySlot,
} from './types.js';
import { blockSubtreeDisposed } from './refs.js';
import {
	retireRendererSignalOwner,
	scheduleNativeRead,
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	attachLiveFragmentRef,
	maximumUpdateDepthError,
	RENDER_PHASE_UPDATE_LIMIT,
} from './engine.js';
import { INSERTION, LAYOUT, PASSIVE, blockIsAncestorOf } from './effects.js';
import { registerHookCleanup } from './hooks.js';
import { isSuspenseException } from './use.js';
import {
	HYDRATION_THROWN,
	noteHydrationThrow,
	CURSOR,
	type HydrationCapability,
} from './hydration.js';
import {
	takeClientRootId,
	createBlock,
	type RenderPhaseSnapshot,
	discardHookFolds,
	restoreRenderPhaseUpdate,
	LiteBlockImpl,
	unmountBlock,
	registerSlot,
	SLOT_FLAG_TEARDOWN,
} from './block.js';
import { reserveHydrationIds } from './hydrate-boundary.js';
import { type ErrorSlot, discardServerArm } from './suspense.js';
import {
	discardSignalRetryItem,
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	ROOT_RENDER_TRANSACTION,
	WIP_CAPTURE,
	renderBlockInner,
} from './render.js';
import {
	type PresentationHydrationFrame,
	preparePresentationOperation,
	commitRenderWrite,
} from './hydration-presentation.js';
import { setAttribute, coerceAttrValue, setClassAttr, setStyle } from './host-props.js';
import { CHILDREN_SIGNAL_OWNER } from './component-slots.js';
import { forEachSubtreeChild, collectVisibleSubtreeRefs } from './activity.js';
import type { ForSlot, ListKeySource } from './lists.js';
import { JOURNAL_PROP, usesFrontier } from './commit.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

export let NATIVE_BLOCK_RETRIES: WeakMap<Block, NativeReadRetry> | null = null;
export type SignalInstanceKey =
	| string
	| { parentScope: Scope; invocationSite: string | undefined; key: unknown; hasKey: boolean };
// Compiled fragment renderers (`_frag$N`) and value-position host descriptors
// carry this invocation site. They represent their enclosing component's JSX,
// not authored component invocations: the server renders that JSX inline, and a
// `.tsrx` body has no such renderer. The compiler and runtime.server.ts spell it
// the same way.
export const RENDERER_INVOCATION_SITE = 'r:';
// A render function rendered as a child, such as a compiled nested `@{ … }`
// block, carries this invocation site. Its scope keeps its own instance for the
// declarations it evaluates, but it is part of the template that renders it, so
// it reads other handles the way that template does (see scopeSignalOwner).
// runtime.server.ts spells it the same way.
export const TEMPLATE_INVOCATION_SITE = 't:';
// Parent links, root namespaces, and keyed item identities are lifetime-stable.
// Keep their recipe until a real owner is needed: scalar-only components avoid
// ancestor walks, visited sets, key coercion, and JSON strings altogether. The
// recipe lives on the scope's signalInstance* fields — no per-mount record or
// WeakMap entry.
export interface SignalRetryNode {
	children?: Map<unknown, SignalRetryNode>;
	owner?: SignalRendererOwnerIdentity | undefined;
}
// A replacement renders before the live slot may publish it. Only signal-owned
// WIPs need this prospective location; the weak metadata never owns their life.
export const SIGNAL_RETRY_LOCATIONS = /* @__PURE__ */ new WeakMap<Scope, SignalRetryLocation>();

export function signalRetryBoundary(block: Block): TrySlot | undefined {
	let current: Block | null = block;
	while (current !== null) {
		const state = current.rare?.trySlot;
		if (state !== undefined && !state.propagateSuspense) return state;
		current = current.parentBlock;
	}
}

// A named function expression keeps recursive references inside its own
// binding, so an unused retry walk can be removed with its callers.
const signalRetrySlot = function signalRetrySlot(scope: Scope, target: Scope): unknown[] | null {
	const children = scope.children;
	if (children !== null) {
		for (const child of children) {
			if (child.scope === target) return ['scope', child.key];
			const nested = signalRetrySlot(child.scope, target);
			if (nested !== null) return ['scope', child.key, ...nested];
		}
	}
	const block = target.block;
	for (let index = 0; index < scope.slots.length; index++) {
		const slot = scope.slots[index];
		if (slot === null || typeof slot !== 'object') continue;
		if (block.forSlot != null && (slot === block.forSlot || slot.forSlot === block.forSlot))
			return ['slot', index, 'item', block.key];
		if (slot.block === block || slot.tryBlock === block || slot.emptyBlock === block) {
			// Slot indices and branch tags are compiler/reconciler identities. Do
			// not retain a generated render-body closure as a retry-path token.
			return [
				'slot',
				index,
				slot.__kind,
				slot.tryBlock === block ? 'primary' : slot.branch,
				slot.emptyBlock === block ? 'empty' : slot.currentIsBodyFn ? undefined : slot.currentComp,
				slot.prevKey,
			];
		}
	}
	return null;
};

const signalRetryPath = function signalRetryPath(scope: Scope, root: Scope): unknown[] | null {
	if (scope === root) return [];
	const location = SIGNAL_RETRY_LOCATIONS.get(scope);
	let parent = location?.parent ?? scope.parent ?? scope.block.parentBlock;
	// A lite body's DOM context is not a Scope. Start at its real ancestor;
	// signalRetrySlot descends the registered children and retains each lite
	// call-site segment on the way to this target, without widening the proxy.
	while (parent instanceof LiteBlockImpl) parent = parent.parentBlock;
	if (parent === null) return null;
	const segment =
		location === undefined
			? signalRetrySlot(parent, scope)
			: ['slot', location.slot, location.kind, location.branch, location.component, location.key];
	if (segment === null) return null;
	const path = signalRetryPath(parent, root);
	return path === null ? null : path.concat(segment);
};

function signalRetryNode(
	cache: SignalRetryOwners,
	path: unknown[],
	create: boolean,
): SignalRetryNode | undefined {
	let node = cache.paths;
	for (const key of path) {
		let next = node.children?.get(key);
		if (next === undefined) {
			if (!create) return;
			next = {};
			(node.children ??= new Map()).set(key, next);
		}
		node = next;
	}
	return node;
}

export function retainSignalRetryScope(
	scope: Scope,
	root: Scope,
	holder: { retrySignalOwners?: SignalRetryOwners | undefined },
	subtree = false,
): void {
	// These entry guards must read the live capabilities directly: wrapping
	// the check hides the signal-free case from production tree shaking.
	if (!signalDocumentEnabled && !registerRootOptions) return;
	const owner = scope.signalOwner;
	if (owner) {
		const path = signalRetryPath(scope, root);
		if (path !== null) {
			const cache = (holder.retrySignalOwners ??= { paths: {}, owners: new Set() });
			const node = signalRetryNode(cache, path, true)!;
			const previous = node.owner;
			node.owner = owner;
			cache.owners.add(owner);
			if (previous !== undefined && previous !== owner) {
				cache.owners.delete(previous);
				retireRendererSignalOwner(previous);
			}
		}
	}
	if (subtree)
		forEachSubtreeChild(scope, (child) => retainSignalRetryScope(child, root, holder, true));
	else if (scope.children !== null)
		for (const child of scope.children) retainSignalRetryScope(child.scope, root, holder);
}

// Move a restarted primary's owners to its boundary's retry cache, where the
// replacement claims them by path. A root render defers this tree's teardown to
// its commit, after that claim, so leave each scope ownerless; it still records
// retirement when deleted. A nested boundary's primary claims only from its own
// cache, so its owners stay with it and retire with this tree.
export function handOverSignalRetryScope(scope: Scope, root: Scope, state: TrySlot): void {
	const owner = scope.signalOwner;
	const path = owner ? signalRetryPath(scope, root) : null;
	if (path !== null) {
		const cache = (state.retrySignalOwners ??= { paths: {}, owners: new Set() });
		const node = signalRetryNode(cache, path, true)!;
		if (node.owner !== undefined && node.owner !== owner) {
			cache.owners.delete(node.owner);
			retireRendererSignalOwner(node.owner);
		}
		node.owner = owner as SignalRendererOwnerIdentity;
		cache.owners.add(node.owner);
		scope.signalOwner = false;
	}
	forEachSubtreeChild(scope, (child) => {
		// A lite child is a plain Scope with no `rare` record, and never a boundary.
		const nested = (child as Block).rare?.trySlot;
		if (nested === undefined || nested.propagateSuspense)
			handOverSignalRetryScope(child, root, state);
	});
}

export function clearSignalRetryOwners(holder: {
	retrySignalOwners?: SignalRetryOwners | undefined;
}): void {
	const cache = holder.retrySignalOwners;
	if (cache === undefined) return;
	holder.retrySignalOwners = undefined;
	for (const owner of cache.owners) retireRendererSignalOwner(owner);
}

// New inputs restart an uncommitted attempt's hooks, not its query$ requests:
// a redeclared query re-selects from the new inputs and shares the in-flight
// request when its selection is unchanged. Retire only owners whose cells
// cannot follow those inputs.
export function supersedeSignalRetryOwners(holder: {
	retrySignalOwners?: SignalRetryOwners | undefined;
}): void {
	const cache = holder.retrySignalOwners;
	if (cache === undefined) return;
	const retired: SignalRendererOwnerIdentity[] = [];
	collectRetiredSignalRetryOwners(cache.paths, cache, retired, supersedeSignalOwner);
	for (const owner of retired) retireRendererSignalOwner(owner);
}

const signalRetryListPath = function signalRetryListPath(
	scope: Scope,
	state: ForSlot,
	root: Scope,
): unknown[] | null {
	// Lists can inherit a lite DOM proxy as parentBlock. Its owning Scope is
	// already registered below the real ancestor and found by this same walk.
	while (scope instanceof LiteBlockImpl) scope = scope.parentBlock;
	for (let index = 0; index < scope.slots.length; index++) {
		const slot = scope.slots[index];
		if (slot === state || slot?.forSlot === state) {
			const path = signalRetryPath(scope, root);
			return path === null ? null : path.concat('slot', index, 'item');
		}
	}
	if (scope.children !== null) {
		for (const child of scope.children) {
			const path = signalRetryListPath(child.scope, state, root);
			if (path !== null) return path;
		}
	}
	return null;
};

function collectRetiredSignalRetryOwners(
	node: SignalRetryNode,
	cache: SignalRetryOwners,
	retired: SignalRendererOwnerIdentity[],
	keep?: (owner: SignalRendererOwnerIdentity) => boolean,
): void {
	if (node.owner !== undefined && !keep?.(node.owner)) {
		cache.owners.delete(node.owner);
		retired.push(node.owner);
		node.owner = undefined;
	}
	if (node.children !== undefined)
		for (const child of node.children.values())
			collectRetiredSignalRetryOwners(child, cache, retired, keep);
}

// Component, child and branch slots hold one occupant at a time, so a newer
// attempt that renders one there proves every retained occupant with another
// component, key or arm replaced. Try slots keep a primary beside their
// fallback and list rows prune by key (trackSignalRetryListKeys); neither is
// proven here.
function signalRetrySoleKind(kind: unknown): boolean {
	return (
		kind === 'componentSlotSlot' ||
		kind === 'childSlot' ||
		kind === 'ifBlockSlot' ||
		kind === 'switchBlockSlot'
	);
}

function collectReplacedSignalRetryOccupants(
	node: SignalRetryNode | undefined,
	identity: unknown[],
	cache: SignalRetryOwners,
	retired: SignalRendererOwnerIdentity[],
): void {
	for (const token of identity) {
		const children = node?.children;
		if (children === undefined) return;
		node = children.get(token);
		for (const [key, child] of children) {
			if (child === node) continue;
			children.delete(key);
			collectRetiredSignalRetryOwners(child, cache, retired);
		}
	}
}

export interface SignalRetryVisit {
	scope: Scope;
	cache: SignalRetryOwners;
	path: unknown[];
}
// Set when a fresh scope consults a retry cache; its render takes it.
let SIGNAL_RETRY_VISIT: SignalRetryVisit | null = null;

export function takeSignalRetryVisit(scope: Scope): SignalRetryVisit | null {
	const visit = SIGNAL_RETRY_VISIT;
	SIGNAL_RETRY_VISIT = null;
	return visit?.scope === scope ? visit : null;
}

// A fresh scope's first render proves what this attempt renders where it has
// been. Its own path ends in the occupant identity of its parent's slot when
// that segment is ['slot', index, kind, branch, component, key]; item and
// scope segments cannot place a sole kind there. Every slot it created holds
// this attempt's occupant: a fresh slot records its identity before anything
// it renders can suspend, so this holds for one still rendering too. A
// completed render that created no slot at an index renders nothing there; a
// suspended one may not have reached it yet.
export function pruneSignalRetryVisit(visit: SignalRetryVisit, suspended: boolean): void {
	if (!signalDocumentEnabled && !registerRootOptions) return;
	const { scope, cache, path } = visit;
	const retired: SignalRendererOwnerIdentity[] = [];
	const tail = path.length - 4;
	if (path[tail - 2] === 'slot' && signalRetrySoleKind(path[tail]))
		collectReplacedSignalRetryOccupants(
			signalRetryNode(cache, path.slice(0, tail), false),
			path.slice(tail),
			cache,
			retired,
		);
	const slots = signalRetryNode(cache, path, false)?.children?.get('slot')?.children;
	if (slots !== undefined) {
		for (const [index, node] of slots) {
			const slot = scope.slots[index as number];
			if (slot === null || typeof slot !== 'object') {
				if (suspended) continue;
				slots.delete(index);
				collectRetiredSignalRetryOwners(node, cache, retired);
			} else if (signalRetrySoleKind(slot.__kind)) {
				collectReplacedSignalRetryOccupants(
					node,
					slot.forSlot != null
						? ['item']
						: [
								slot.__kind,
								slot.branch,
								slot.currentIsBodyFn ? undefined : slot.currentComp,
								slot.prevKey,
							],
					cache,
					retired,
				);
			}
		}
	}
	// Remove every path/claim before abort callbacks can reenter rendering.
	// A cache cleared meanwhile already retired its owners; retiring is idempotent.
	for (const owner of retired) retireRendererSignalOwner(owner);
}

export function trackSignalRetryListKeys<T>(
	parent: Block,
	state: ForSlot,
	length: number,
	source: ListKeySource<T>,
): ((index: number, key: unknown) => void) | undefined {
	if (!signalDocumentEnabled && !registerRootOptions) return;
	const boundary = signalRetryBoundary(parent);
	const owner = parent.idState.renderOwner;
	const cache = boundary?.retrySignalOwners ?? owner?.retrySignalOwners;
	const root = boundary?.retrySignalOwners !== undefined ? boundary.tryBlock : owner?.current;
	if (cache === undefined || root == null) return;
	const path = signalRetryListPath(parent, state, root);
	const node = path === null ? undefined : signalRetryNode(cache, path, false);
	if (node?.children === undefined) return;
	const prune = (keys: Iterable<unknown>) => {
		const present = new Set(keys);
		const retired: SignalRendererOwnerIdentity[] = [];
		for (const [key, child] of node.children!) {
			if (present.has(key)) continue;
			node.children!.delete(key);
			collectRetiredSignalRetryOwners(child, cache, retired);
		}
		// Remove every path/claim before abort callbacks can reenter rendering.
		for (const owner of retired) retireRendererSignalOwner(owner);
	};
	if (typeof source !== 'function') {
		prune(source);
		return;
	}
	if (length === 0) {
		prune([]);
		return;
	}
	const observed = new Map<number, unknown>();
	let complete = false;
	// Observe accepted reads only, never prefix/suffix mismatch probes. A body
	// may suspend before the remaining keys are read: those unknown suffixes
	// cannot prove removal, so retain them without invoking authored keys early.
	return (index, key) => {
		if (!complete) {
			observed.set(index, key);
			if (observed.size === length) {
				complete = true;
				prune(observed.values());
			}
		}
	};
}

type SignalIdentityToken = string | { value: object | symbol; position?: number | undefined };

export interface OpaqueSignalKeys {
	objects: WeakMap<object, number>;
	symbols: Map<symbol, number>;
	used: Set<number>;
	next: number;
}

function signalIdentityToken(value: unknown, position?: number): SignalIdentityToken {
	if (value === null) return 'null';
	const kind = typeof value;
	return kind === 'string' || kind === 'number' || kind === 'bigint' || kind === 'boolean'
		? kind.charCodeAt(0).toString(36) + ':' + String(value)
		: kind === 'undefined'
			? 'u:'
			: { value: value as object | symbol, position };
}

function signalIdentityKey(
	token: SignalIdentityToken,
	base: string,
	site: string | undefined,
	parents: readonly string[],
	componentKey: boolean,
	ids: RootIdState,
): string {
	if (typeof token === 'string') return token;
	// Opaque identities are local to this structural segment. Skipped hydration
	// boundaries and unrelated call sites must not consume one another's ids.
	const namespace = base + JSON.stringify([site ?? 'legacy', parents, componentKey]);
	const state = (ids.signalState ??= { prefix: ids.prefix, next: 0 });
	const namespaces = (state.opaqueKeys ??= new Map());
	let keys = namespaces.get(namespace);
	if (keys === undefined) {
		keys = { objects: new WeakMap(), symbols: new Map(), used: new Set(), next: 0 };
		namespaces.set(namespace, keys);
	}
	const value = token.value;
	let id = typeof value === 'symbol' ? keys.symbols.get(value) : keys.objects.get(value);
	if (id === undefined) {
		// A late read can visit rows out of order. Their initial list positions
		// still agree with SSR; subsequent keys cannot reuse a survivor's id.
		id = token.position;
		if (id === undefined || keys.used.has(id)) {
			while (keys.used.has(keys.next)) keys.next++;
			id = keys.next++;
		}
		keys.used.add(id);
		if (typeof value === 'symbol') keys.symbols.set(value, id);
		else keys.objects.set(value, id);
	}
	return 'o:' + id.toString(36);
}

export function rootSignalInstanceKey(ids: RootIdState): string {
	return JSON.stringify([ids.signalState?.prefix ?? ids.prefix, 'root']);
}

function resolveSignalInstanceKey(scope: Scope): string | undefined {
	if (!signalDocumentEnabled && !registerRootOptions) return;
	const resolved = scope.signalInstanceResolved;
	if (resolved !== undefined) return resolved;
	const parent = scope.signalInstanceParent;
	if (parent === null) return undefined;
	const key = structuralSignalInstanceKey(
		parent,
		scope.signalInstanceSite,
		scope.signalInstanceValue,
		scope.signalInstanceHasKey,
	);
	scope.signalInstanceResolved = key;
	return key;
}

/** Last-writer-wins stamp matching the recipe/resolved union the key carries. */
export function stampSignalInstanceKey(scope: Scope, key: SignalInstanceKey): void {
	if (typeof key === 'string') {
		scope.signalInstanceResolved = key;
		return;
	}
	// A renderer adds no key segment: it carries its parent's identity, and
	// stays unstamped below an unstamped parent so keys walk on through it.
	const parent = key.parentScope;
	const renderer = key.invocationSite === RENDERER_INVOCATION_SITE;
	scope.signalInstanceParent = renderer ? parent.signalInstanceParent : parent;
	scope.signalInstanceSite = renderer ? parent.signalInstanceSite : key.invocationSite;
	scope.signalInstanceValue = renderer ? parent.signalInstanceValue : key.key;
	scope.signalInstanceHasKey = renderer ? parent.signalInstanceHasKey : key.hasKey;
	scope.signalInstanceResolved = renderer ? parent.signalInstanceResolved : undefined;
}

function structuralSignalInstanceKey(
	parentScope: Scope,
	invocationSite: string | undefined,
	key: unknown,
	hasKey: boolean,
): string {
	let base = resolveSignalInstanceKey(parentScope);
	const itemTokens: SignalIdentityToken[] = [];
	const visited = new Set<Block>();
	let scope: Scope | null = parentScope;
	while (base === undefined && scope !== null) {
		const block = scope.block;
		if (!visited.has(block)) {
			visited.add(block);
			if (block.forSlot) itemTokens.push(signalIdentityToken(block.key, block.itemIndex));
			base = resolveSignalInstanceKey(block);
		}
		scope = scope.parent;
		if (base === undefined && scope !== null) base = resolveSignalInstanceKey(scope);
	}
	let block: Block | null = parentScope.block;
	while (base === undefined && block !== null) {
		if (!visited.has(block)) {
			visited.add(block);
			if (block.forSlot) itemTokens.push(signalIdentityToken(block.key, block.itemIndex));
		}
		base = resolveSignalInstanceKey(block);
		block = block.parentBlock;
	}
	base ??= rootSignalInstanceKey(parentScope.block.idState);
	itemTokens.reverse();
	const ids = parentScope.block.idState;
	let itemKeys = itemTokens as string[];
	for (const token of itemTokens) {
		if (typeof token === 'string') continue;
		itemKeys = [];
		for (const entry of itemTokens) {
			itemKeys.push(signalIdentityKey(entry, base, invocationSite, itemKeys, false, ids));
		}
		break;
	}
	// Encode only the new segment: re-encoding the ancestor JSON doubles its
	// escaping at every level and exhausts string limits on deeply nested trees.
	return (
		base +
		JSON.stringify([
			invocationSite ?? 'legacy',
			itemKeys,
			hasKey
				? signalIdentityKey(signalIdentityToken(key), base, invocationSite, itemKeys, true, ids)
				: '',
		])
	);
}

/** Stamp a fresh lite scope, whose other stamp fields are still their defaults. */
export function stampSignalInstance(
	scope: Scope,
	parentScope: Scope,
	invocationSite: string | undefined,
): void {
	if (SIGNAL_BINDINGS_ENABLED || signalDocumentEnabled) {
		// Blocks the body creates (arms, rows, value slots) hang off its DOM
		// stand-in, not the scope. Their key walks resolve this level through
		// the stand-in, so it carries the same recipe.
		const block = scope.block;
		block.signalInstanceParent = scope.signalInstanceParent = parentScope;
		block.signalInstanceSite = scope.signalInstanceSite = invocationSite;
	}
}

export function scopeSignalOwner(scope: Scope | null): SignalOwner | undefined {
	if (!signalDocumentEnabled && !registerRootOptions) return;
	if (scope === null) return;
	const root = scope.block.idState.renderOwner;
	let documentOwner = root?.signalOwner;
	if (documentOwner === undefined && signalDocumentEnabled) {
		documentOwner = documentSignalOwner(scope.block.parentNode);
		if (root !== undefined) root.signalOwner = documentOwner;
	}
	if (documentOwner === undefined) return;
	let owner = scope.signalOwner;
	if (
		(owner === undefined || owner === false) &&
		!scope.block.forSlot &&
		scope.signalInstanceParent === null &&
		scope.signalInstanceResolved === undefined
	) {
		// Host control fragments borrow the enclosing row's declaration owner.
		// Do not cache it on the fragment: deleting that fragment must not retire
		// the row's cells, and a retired fragment must never reacquire them.
		let parent = scope.parent ?? scope.block.parentBlock;
		while (parent !== null) {
			if (parent instanceof LiteBlockImpl) break;
			if (parent.signalInstanceParent !== null || parent.signalInstanceResolved !== undefined)
				break;
			if (parent.block.forSlot?.signalSite !== undefined) {
				scope.signalOwner = false;
				return scopeSignalOwner(parent);
			}
			parent = parent.parent ?? parent.block.parentBlock;
		}
	}
	const retired = owner === null;
	if (!owner || owner.documentOwner !== documentOwner) {
		const ids = scope.block.idState;
		owner = undefined;
		const boundary = signalRetryBoundary(scope.block);
		const cache = boundary?.retrySignalOwners ?? root?.retrySignalOwners;
		const retryRoot = boundary?.retrySignalOwners !== undefined ? boundary.tryBlock : root?.current;
		let visit: SignalRetryVisit | null = null;
		if (cache !== undefined && !retired && !scope.block.disposed && retryRoot != null) {
			const path = signalRetryPath(scope, retryRoot);
			const node = path === null ? undefined : signalRetryNode(cache, path, false);
			if (node?.owner !== undefined) {
				owner = node.owner;
				node.owner = undefined;
				cache.owners.delete(owner);
			}
			if (path !== null && !scope.mounted) visit = { scope, cache, path };
		}
		if (owner === undefined || owner.documentOwner !== documentOwner) {
			const instanceKey = resolveSignalInstanceKey(scope);
			const signalSite = scope.block.forSlot?.signalSite;
			const identity: {
				scopeKey: string;
				documentOwner: SignalOwner;
				instanceOwner: object;
				instanceKey: string;
				enclosingOwner?: SignalRendererOwnerIdentity;
			} = {
				scopeKey: documentOwner.scopeKey,
				documentOwner,
				instanceOwner: scope as object,
				instanceKey:
					instanceKey ??
					(signalSite !== undefined
						? structuralSignalInstanceKey(scope, signalSite, undefined, false)
						: rootSignalInstanceKey(ids)),
			};
			// Directive arms and inline rows own only the declarations they evaluate,
			// and retire them on removal. A captured declaration of the enclosing
			// component still resolves to that component's cell. A nested `@{ … }`
			// block keeps an instance of its own for its declarations, and a fragment
			// renderer carries the instance of the scope it renders for (the server
			// renders it in that scope's owner). Both link to their template the same
			// way. A renderer, even one inside a block, keeps its parent's key. A block
			// adds a key segment and links to the scope that rendered it, which for a
			// lightweight component is its scope rather than the DOM stand-in its
			// blocks hang off.
			let parent = scope.parent ?? scope.block.parentBlock;
			if (
				instanceKey !== undefined &&
				parent !== null &&
				resolveSignalInstanceKey(parent) !== instanceKey
			)
				parent =
					scope.signalInstanceSite === TEMPLATE_INVOCATION_SITE ? scope.signalInstanceParent : null;
			// A stand-in records the scope its component is registered on.
			if (parent instanceof LiteBlockImpl)
				parent =
					parent.signalInstanceParent?.children?.find((child) => child.scope.block === parent)
						?.scope ?? null;
			// Compiled children instead link to the owner of the template that authored
			// them (see markChildrenBlock), whichever component renders them. A context
			// provider renders them inline in its own block and declares nothing
			// itself, so it links the same way. Only a block has a body; the recorded
			// owner can be any owner, and only a renderer of this document links.
			const body = (scope as Block).body as any;
			const children = (body?.$$kind === CONTEXT_TAG ? (scope as Block).props?.children : body)?.[
				CHILDREN_SIGNAL_OWNER
			];
			if (children?.documentOwner === documentOwner) identity.enclosingOwner = children;
			else if (parent !== null)
				identity.enclosingOwner = scopeSignalOwner(parent) as SignalRendererOwnerIdentity;
			// A retry owner must not keep an abandoned renderer tree alive. This
			// existing opaque identity object is also its own facade-state token.
			identity.instanceOwner = identity;
			owner = Object.freeze(identity);
		}
		scope.signalOwner = owner;
		if (visit !== null) SIGNAL_RETRY_VISIT = visit;
		// A queued native bubble handler may outlive deletion and first enable
		// signals afterwards. Its invocation must remain retired, not fall back
		// to a document owner or create fresh instance state.
		if (retired) retireRendererSignalOwner(owner);
	}
	associateSignalOwnerDocument(owner, scope.block.parentNode.ownerDocument!);
	return owner;
}

export function runWithBlockSignalOwner<T>(scope: Scope | null, callback: () => T): T {
	const owner = scopeSignalOwner(scope);
	if (owner !== undefined) STREAMED_SIGNAL_OWNER_ACTIVATOR?.(owner);
	return owner === undefined || currentSignalOwner() === owner
		? callback()
		: runWithSignalOwner(owner, callback);
}

export interface NativeStyleBinding {
	__kind: 'nativeStyleBinding';
	__flags: number;
	__teardown: typeof disposeNativeStyleBinding;
	block: Block | null;
	// Scalar writes before any Block exists: the host and the last applied
	// style, which seeds the Block's cache if a structured value arrives later.
	el: HTMLElement | SVGElement | null;
	style: unknown;
}

export function disposeNativeStyleBinding(binding: NativeStyleBinding): void {
	if (binding.block !== null) unmountBlock(binding.block, false);
	binding.block = null;
}

function nativeStyleBody(props: { el: HTMLElement | SVGElement; value: any }, scope: Scope): void {
	// This Block owns native subscriptions, not an authored component instance.
	// Facades must resolve in the enclosing component's owner, just as their
	// event callbacks do, while the existing native read frame stays active here.
	const value = SIGNAL_BINDINGS_ENABLED
		? runWithBlockSignalOwner(scope.parent, () => readNativeDomStyle(props.value))
		: readNativeDomStyle(props.value);
	// The host belongs to the template that owns this binding, whose Block may
	// predate this one: a Block created for a later structured value still
	// writes committed DOM.
	const owner = scope.parent!.block;
	publishNativeStyle([scope.slots, props.el, value], usesFrontier(owner, props.el) ? owner : null);
}

/**
 * Write a native style binding's value and publish it as the committed one,
 * or, for committed DOM in a root render, queue both for its commit, where
 * `owner`'s boundary handles a failed write. `write` is `[committed, el,
 * value]`: the cache holding the value at index 0, or a scalar binding, which
 * holds it as `style`.
 */
function publishNativeStyle(write: any[], owner: Block | null): void {
	if (owner !== null) {
		ROOT_RENDER_TRANSACTION!.ops.push(commitRenderWrite, [
			publishNativeStyle,
			[write, null],
			owner,
		]);
		return;
	}
	const committed = write[0];
	const key = committed.__kind === 'nativeStyleBinding' ? 'style' : 0;
	setStyle(write[1], write[2], committed[key]);
	journalRootProperty(committed, key, committed[key]);
	committed[key] = write[2];
}

/**
 * A style binding owns reads in a normal scheduled Block, but owns no DOM range.
 * The enclosing template owns the host and its children. Reusing the native
 * read driver keeps speculative subscriptions, errors, and adoption transactional.
 * @internal
 */
export function nativeStyleBinding(
	owner: Scope,
	slotIndex: number,
	el: HTMLElement | SVGElement,
	value: any,
	literal?: 1,
): void {
	// Only an object carries the native read protocol, so a nullish or string
	// style, such as an optional prop forwarded unset, has nothing to read.
	// Neither does a scalar style literal: the compiler passes `literal` for a
	// fresh object literal of plain data properties, so enumerating it runs no
	// accessor. Write those like an ordinary style binding and allocate the
	// owning Block only once a structured value appears. That Block then stays,
	// so a later scalar releases its subscriptions through the same
	// transactional render.
	const binding = owner.slots[slotIndex] as NativeStyleBinding | undefined;
	if ((binding === undefined || binding.block === null) && isScalarNativeStyle(value, literal)) {
		writeScalarNativeStyle(owner, slotIndex, binding, el, value);
		return;
	}
	nativePresentationBinding(owner, slotIndex, el, nativeStyleBody, { el, value });
}

export function isScalarNativeStyle(value: any, literal: 1 | undefined): boolean {
	if (literal !== 1) return typeof value !== 'object' || value === null;
	for (const name in value) {
		const item = value[name];
		if (item !== null && (typeof item === 'object' || typeof item === 'function')) return false;
	}
	return true;
}

export function writeScalarNativeStyle(
	owner: Scope,
	slotIndex: number,
	binding: NativeStyleBinding | undefined,
	el: HTMLElement | SVGElement,
	value: unknown,
	// Presentation hydration prepares the takeover write instead.
	write: (el: HTMLElement | SVGElement, value: unknown, previous: unknown) => void = setStyle,
): void {
	if (binding === undefined) {
		binding = {
			__kind: 'nativeStyleBinding',
			__flags: SLOT_FLAG_TEARDOWN,
			__teardown: disposeNativeStyleBinding,
			block: null,
			el,
			style: undefined,
		};
		if (owner.slots.length === 0) owner.slots.push(undefined);
		owner.slots[slotIndex] = binding;
		registerSlot(owner, binding);
	} else if (binding.el !== el) {
		// An incomplete template mount retries with a fresh clone, which must be
		// written in full even when its values match the abandoned host.
		if (TRANSITION_JOURNAL !== null) {
			TRANSITION_JOURNAL.push(JOURNAL_PROP, binding, 'el', binding.el);
			TRANSITION_JOURNAL.push(JOURNAL_PROP, binding, 'style', binding.style);
		}
		binding.el = el;
		binding.style = undefined;
	}
	// A compiler literal is fresh per render and never escapes, and a primitive
	// is immutable, so either is its own snapshot.
	if (write === setStyle) {
		publishNativeStyle([binding, el, value], usesFrontier(owner.block, el) ? owner.block : null);
		return;
	}
	write(el, value, binding.style);
	if (TRANSITION_JOURNAL !== null)
		TRANSITION_JOURNAL.push(JOURNAL_PROP, binding, 'style', binding.style);
	binding.style = value;
}

interface NativeProjectionProps {
	el: HTMLElement | SVGElement;
	compute: () => Record<string, unknown> | null | undefined;
	fields: readonly string[];
}

function prepareNativeProjection(props: NativeProjectionProps, scope: Scope): unknown[] {
	const prepare = () => {
		const projected = props.compute();
		return props.fields.map((field) => {
			const value = projected?.[field];
			if (field === 'style') return __normalizeBindingStyle(readNativeDomStyle(value));
			if (field === 'class' || field === 'className')
				return value == null || value === false ? null : normalizeClass(value);
			return coerceAttrValue(props.el, field, value);
		});
	};
	// Resolve and normalize the entire projection before the first DOM write.
	// A throwing unit conversion must not leave a new class with the old style.
	return SIGNAL_BINDINGS_ENABLED ? runWithBlockSignalOwner(scope.parent, prepare) : prepare();
}

function publishNativeProjection(
	props: NativeProjectionProps,
	values: unknown[],
	previous: unknown[] | undefined,
): void {
	for (let i = 0; i < props.fields.length; i++) {
		const field = props.fields[i]!;
		const value = values[i];
		if (previous !== undefined && Object.is(previous[i], value)) continue;
		if (field === 'style') setStyle(props.el, value, previous?.[i]);
		else if (field === 'class' || field === 'className') setClassAttr(props.el, value);
		else setAttribute(props.el, field, value);
	}
}

function nativeProjectionBody(props: NativeProjectionProps, scope: Scope): void {
	const write = [scope.slots, props, prepareNativeProjection(props, scope)];
	if (usesFrontier(scope.parent!.block, props.el))
		ROOT_RENDER_TRANSACTION!.ops.push(commitNativeProjection, write);
	else commitNativeProjection(write);
}

/** Publish a projection's prepared values, at commit for committed DOM in a root render. */
function commitNativeProjection(write: any[]): void {
	const committed = write[0];
	publishNativeProjection(write[1], write[2], committed[0]);
	journalRootProperty(committed, 0, committed[0]);
	committed[0] = write[2];
}

export function preparedNativeStyleBody(
	props: { el: HTMLElement | SVGElement; value: unknown; frame: PresentationHydrationFrame },
	scope: Scope,
): void {
	const native = setNativeAdoptionResolver(null);
	const witness = beginNativeReadWitness();
	let value: unknown;
	let completed = false;
	try {
		value = runWithBlockSignalOwner(scope.parent, () =>
			__normalizeBindingStyle(readNativeDomStyle(props.value)),
		);
		completed = true;
	} finally {
		props.frame.witnesses.set(scope, finishNativeReadWitness(witness, completed));
		setNativeAdoptionResolver(native);
	}
	preparePresentationOperation(props.frame, scope, 'native', () => {
		setStyle(props.el, value, '');
		scope.block.body = nativeStyleBody;
	});
	journalRootProperty(scope.slots, 0, scope.slots[0]);
	scope.slots[0] = value;
}

export function preparedNativeProjectionBody(
	props: NativeProjectionProps & { frame: PresentationHydrationFrame },
	scope: Scope,
): void {
	const native = setNativeAdoptionResolver(null);
	const witness = beginNativeReadWitness();
	let values: unknown[];
	let completed = false;
	try {
		values = prepareNativeProjection(props, scope);
		completed = true;
	} finally {
		props.frame.witnesses.set(scope, finishNativeReadWitness(witness, completed));
		setNativeAdoptionResolver(native);
	}
	preparePresentationOperation(props.frame, scope, 'native', () => {
		publishNativeProjection(
			props,
			values,
			props.fields.map((field) => (field === 'style' ? '' : undefined)),
		);
		scope.block.body = nativeProjectionBody;
	});
	journalRootProperty(scope.slots, 0, scope.slots[0]);
	scope.slots[0] = values;
}

/** One scheduled native read owns every field of a compiler-proven projection. @internal */
export function nativeProjectionBinding(
	owner: Scope,
	slotIndex: number,
	el: HTMLElement | SVGElement,
	compute: NativeProjectionProps['compute'],
	fields: readonly string[],
): void {
	nativePresentationBinding(owner, slotIndex, el, nativeProjectionBody, { el, compute, fields });
}

export function nativePresentationBinding(
	owner: Scope,
	slotIndex: number,
	el: HTMLElement | SVGElement,
	body: Block['body'],
	props: any,
): void {
	let binding = owner.slots[slotIndex] as NativeStyleBinding | undefined;
	if (binding === undefined) {
		const block = createBlock('control-flow', owner.block, el, null, null, body, props);
		block.parent = owner;
		binding = {
			__kind: 'nativeStyleBinding',
			__flags: SLOT_FLAG_TEARDOWN,
			__teardown: disposeNativeStyleBinding,
			block,
			el: null,
			style: undefined,
		};
		// The template bag commits after its bindings. Reserve its first index
		// to keep the array packed, and publish ownership before a read can suspend.
		if (owner.slots.length === 0) owner.slots.push(undefined);
		owner.slots[slotIndex] = binding;
		registerSlot(owner, binding);
	} else if (binding.block === null) {
		// A scalar style literal was written directly. Its first structured value
		// needs an owning Block, seeded with the style that host already carries.
		const block = createBlock('control-flow', owner.block, el, null, null, body, props);
		block.parent = owner;
		if (binding.el === el) block.slots[0] = binding.style;
		journalRootProperty(binding, 'block', binding.block);
		binding.block = block;
	} else {
		const block = binding.block!;
		if (block.parentNode !== el) {
			// An incomplete template mount retries with a fresh clone. Its styles
			// must be applied even when the resolved values match the abandoned host.
			journalRootProperty(block, 'parentNode', block.parentNode);
			journalRootProperty(block.slots, 0, block.slots[0]);
			block.parentNode = el;
			block.slots[0] = undefined;
		}
		journalRootProperty(block, 'props', block.props);
		block.props = props;
	}
	renderBlock(binding.block!);
}

/** @internal Enable invocation collection before an opted-in module renders. */
export function enableNativeReadCollection(abi = 1): void {
	if (abi !== 1) throw new Error(formatClientError(58));
	ensureNativeReadDriver();
}

/** @internal Compiler/runtime native-read capability version 1. */
export function beginNativeReadScope(scope: Scope | undefined, abi = 1): number {
	if (abi !== 1) throw new Error(formatClientError(58));
	const block = CURRENT_BLOCK;
	const owner = scope ?? CURRENT_SCOPE;
	if (block === null || owner === null) return -1;
	return ensureNativeReadDriver().beginScope(owner, block);
}

// Renderer calls have already checked the driver. Keep them separate from the
// initializing compiler ABI so ordinary entries can discard the native adapter.
export function beginActiveNativeReadScope(scope: Scope): number {
	const block = CURRENT_BLOCK;
	return block === null ? -1 : NATIVE_READ_DRIVER!.beginScope(scope, block);
}

interface SignalDeclarationRenderStage extends SignalDeclarationStage {
	readonly capture: OffscreenCapture;
	settled: boolean;
}

/**
 * A signal facade declared again by a later render stages its new definition
 * here instead of mutating committed graph state. One stage covers one body
 * invocation, so a render-phase rerun supersedes its earlier pass. The capture's
 * commit accepts it; its discard, or a transition journal rollback that unwinds
 * this render, discards it.
 *
 * `declaring` names the invocation that evaluated the declaration. A directive
 * arm or inline row that reads its component's declaration may render under a
 * nested capture of its own, such as a @try attempt that suspends while the
 * component commits. While the declaring invocation is still rendering, its
 * stage and capture decide the declaration instead of the reader's.
 */
export function currentSignalDeclarationStage(
	declaring?: number,
): SignalDeclarationStage | undefined {
	const block = CURRENT_BLOCK;
	// Native reads open the invocation frame before a facade can be read.
	const declared =
		declaring === undefined || !NATIVE_READ_DRIVER
			? undefined
			: NATIVE_READ_DRIVER.enclosingInvocation(declaring);
	const capture =
		declared === undefined ? WIP_CAPTURE : (declared.capture as OffscreenCapture | null);
	// Outside a render, or in a render that publishes without a capture, a
	// declaration applies immediately.
	if (block === null || capture === null || ROOT_RENDER_ROLLBACK) return undefined;
	const invocation =
		declared ?? (NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.invocation(block) : undefined);
	const current = invocation?.invocationData as SignalDeclarationRenderStage | null | undefined;
	if (current != null && !current.settled && current.capture === capture) return current;
	const callbacks: Array<(discarded: boolean) => void> = [];
	const stage: SignalDeclarationRenderStage = {
		capture,
		settled: false,
		settle(callback) {
			callbacks.push(callback);
		},
	};
	const finish = (discarded: boolean): void => {
		if (stage.settled) return;
		stage.settled = true;
		for (const callback of callbacks) callback(discarded);
	};
	// A boundary hold or a dropped transition unwinds its render while the capture survives.
	if (TRANSITION_JOURNAL !== null) journalUndo(() => finish(true));
	(capture.renderCleanups ??= []).push(finish);
	if (invocation !== undefined) invocation.invocationData = stage;
	return stage;
}

export function inspectNativeReadScope(
	scope: import('../devtools-hook.js').DevtoolsScopeLike,
): import('../devtools-hook.js').DevtoolsNativeReadInspection | null {
	const current = scope as Scope;
	// Installed only in profiling builds, where the driver and retries inspect.
	const inspection = NATIVE_READ_DRIVER ? NATIVE_READ_DRIVER.inspectScope!(current) : undefined;
	const block = inspection?.block ?? current.block;
	const retry =
		NATIVE_BLOCK_RETRIES?.get(block)?.inspect!() ??
		(block.idState.renderOwner?.current === block
			? block.idState.renderOwner.nativeRetry?.inspect!()
			: undefined) ??
		[];
	if (inspection == null && retry.length === 0) return null;
	return {
		block,
		committed: inspection?.committed ?? null,
		pending: inspection?.pending ?? [],
		retry,
	};
}

/** Native receipts survive source writes but not an explicit root replacement. */
export function acceptNativeCapture(
	capture: OffscreenCapture,
	owner: RootRenderOwner | undefined,
	replayRootRefs = false,
): boolean {
	if (!NATIVE_READ_DRIVER) return false;
	const driver = NATIVE_READ_DRIVER;
	const native = driver.acceptCapture(capture);
	if (owner === undefined) return false;
	const replays = replayRootRefs && driver.replayDeferredRefs(capture, owner);
	if (native || replays || driver.hasPublication(owner)) {
		driver.stampPublication(owner, [
			capture.effects[INSERTION],
			capture.effects[LAYOUT],
			capture.effects[PASSIVE],
			capture.events,
			capture.refs,
		]);
	}
	return false;
}

/** Only canceled native ref publication pays for a walk of the surviving tree. */
export function replayNativeUnpublishedRefs(
	capture: OffscreenCapture,
	owner: RootRenderOwner,
): boolean {
	const driver = NATIVE_READ_DRIVER!;
	const pending = driver.deferredRefEntries(owner);
	if (pending === undefined || owner.current === null || owner.disposed) return false;
	const queued = new Set(capture.refs.map((entry) => entry.el));
	const current: SuspenseRefEntry[] = [];
	collectVisibleSubtreeRefs(owner.current, current);
	for (const entry of current) {
		const skipped = pending.get(entry.el) as RefAttach | undefined;
		if (skipped === undefined || queued.has(entry.el) || blockSubtreeDisposed(entry.scope.block))
			continue;
		capture.refs.push({
			ref: skipped.ref === attachLiveFragmentRef ? attachLiveFragmentRef : entry.ref,
			el: entry.el,
			block: entry.scope.block,
			op: 0,
		});
		queued.add(entry.el);
	}
	for (const [target, receipt] of pending) {
		if (blockSubtreeDisposed((receipt as RefAttach).block)) driver.forgetUnpublishedRef(target);
	}
	return true;
}

/** @internal Called from a compiler-generated synchronous finally block. */
export function endNativeReadScope(token: number, _completed: boolean): void {
	if (token >= 0) NATIVE_READ_DRIVER!.endScope(token);
}

/** @internal Automatic caches preserve read evidence without changing useMemo. */
export function beginNativeReadWitness(detached = false): number {
	return detached
		? ensureNativeReadDriver().beginWitness(true)
		: NATIVE_READ_DRIVER
			? NATIVE_READ_DRIVER.beginWitness()
			: -1;
}

/** @internal A failed computation cannot become a reusable cache witness. */
export function finishNativeReadWitness(
	token: number,
	completed: boolean,
): NativeReadWitness | null {
	return token < 0 ? null : NATIVE_READ_DRIVER!.finishWitness(token, completed);
}

/** @internal A cache hit reattaches its native dependencies to this attempt. */
export function replayNativeReadWitness(witness: NativeReadWitness | null | undefined): void {
	if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.replay(witness);
}

export function retainNativeRetryReads(block: Block, reads: NativeReadWitness): void {
	// An existing Suspense/hidden Activity owner survives its unsuccessful body.
	// Retain a minimal retry lease there, not in the discarded child Scope.
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current.rare?.suspenseHandler) {
			const retries = (NATIVE_BLOCK_RETRIES ??= new WeakMap());
			let retry = retries.get(current);
			if (retry === undefined) {
				const owner = current;
				retry = createNativeReadRetry(() => {
					if (!owner.disposed) scheduleNativeRead(owner);
				});
				retries.set(owner, retry);
				const owned = retry;
				registerHookCleanup(owner, () => {
					owned.clear();
					retries.delete(owner);
				});
			}
			retry.track(reads);
			return;
		}
	}
	const owner = block.idState.renderOwner;
	if (owner === undefined || owner.disposed) return;
	let retry = owner.nativeRetry;
	if (retry === undefined) {
		const next = createNativeReadRetry(() => {
			const generation = next.generation;
			queueMicrotask(() => {
				if (
					owner.disposed ||
					owner.nativeRetry !== next ||
					next.generation !== generation ||
					owner.wakeable === null
				)
					return;
				owner.wakeable = null;
				owner.generation++;
				if (!TRANSITION_ROOT_DRIVER || !TRANSITION_ROOT_DRIVER.retry(owner)) owner.retry();
			});
		});
		owner.nativeRetry = retry = next;
	}
	retry.track(reads);
}

/**
 * An ErrorBoundary whose `[$!rN` open says the client renders it
 * (hydration-protocol.ts) replaces only its arm: surrounding adopted hosts
 * survive. Returns the id state of the fresh arm, after reserving the N ids the
 * server's render took, or null for any other boundary. A `@try` or Suspense
 * boundary claims its arm with HydrationCapability.claimClientArm.
 */
export function takeNativeFreshArm(
	hydration: HydrationCapability | null,
	state: ErrorSlot,
	ids: RootIdState,
): RootIdState | null {
	if (hydration === null) return null;
	const value = hydration.clientTryState(state.start);
	const count = value.startsWith(BOUNDARY_CLIENT) ? boundaryIdCount(value) : -1;
	if (count < 0) return null;
	reserveHydrationIds(ids, count);
	discardServerArm(state);
	hydration.node = state.end;
	return {
		prefix: ids.prefix + 'n' + takeClientRootId() + '-',
		next: 0,
		renderOwner: ids.renderOwner,
	};
}
let renderPhaseOwner: Block | null = null;
let renderPhaseUpdates: Map<QueuedCell, RenderPhaseSnapshot> | null = null;
// Advances when an outermost render starts. Only render code runs within one
// pass, and render code cannot move a live import, so compilerMemoWitness reads
// each proof once per pass.
export let compilerMemoPass = 0;

export function captureRenderPhaseUpdate(cell: QueuedCell): void {
	const updates = (renderPhaseUpdates ??= new Map());
	if (!updates.has(cell))
		updates.set(cell, { value: cell.value, base: cell.base, last: cell.last });
}

export function renderBlock(block: Block): void {
	const hydration = hydrating ? CURSOR : null;
	// A Block that a hydrating update built renders on the client, though its
	// parent adopts server siblings (HydrationCapability.owns).
	const rebuild = hydration !== null && !hydration.owns(block);
	let retryVisit: SignalRetryVisit | null = null;
	// The synchronous owner this call replaced, or undefined when the block
	// renders in its caller's owner frame.
	let previousSignalOwner: SignalOwner | null | undefined;
	if (signalDocumentEnabled || block.idState.renderOwner?.signalOwner !== undefined) {
		const owner = scopeSignalOwner(block);
		if (owner !== undefined) {
			STREAMED_SIGNAL_OWNER_ACTIVATOR?.(owner);
			// Every block has an owner of its own, so nearly every render changes
			// owner. Enter it in place: a callback frame would allocate a closure and
			// resolve the same owner a second time on re-entry. A host carrier owns
			// its execution boundary, and a root given an owner without the signal
			// document has no in-place frame, so both keep the callback frame. A
			// rebuilt block enters its owner in the nested client build below.
			if (
				!rebuild &&
				currentSignalOwner() !== owner &&
				(signalOwnerFrame === undefined ||
					(previousSignalOwner = signalOwnerFrame.enter(owner)) === undefined)
			) {
				runWithSignalOwner(owner, () => renderBlock(block));
				return;
			}
		}
		retryVisit = takeSignalRetryVisit(block);
	}
	if (rebuild) {
		// The nested client build renders this block, so it takes the retry visit.
		SIGNAL_RETRY_VISIT = retryVisit;
		hydration!.suspend(() => renderBlock(block));
		return;
	}
	const previousOwner = renderPhaseOwner;
	let previousUpdates = renderPhaseUpdates;
	if (previousOwner === null) compilerMemoPass++;
	renderPhaseOwner = block;
	renderPhaseUpdates = null;
	try {
		let retries = 0;
		while (renderBlockInner(block)) {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileCount(ProfileCounter.RENDER_PHASE_REPLAY);
			if (block.rare?.updateError) {
				block.rare.updateError = false;
				throw maximumUpdateDepthError(block);
			}
			if (++retries > RENDER_PHASE_UPDATE_LIMIT) throw new Error(formatClientError(9));
		}
		if (retryVisit !== null) pruneSignalRetryVisit(retryVisit, false);
		if (
			signalDocumentEnabled &&
			block.rare?.trySlot?.tryBlock === block &&
			block.rare.trySlot.retrySignalOwners !== undefined
		)
			clearSignalRetryOwners(block.rare.trySlot);
		// Completed descendants still belong to their enclosing render attempt.
		// A nested independent root commits separately and does not transfer state.
		const updates = renderPhaseUpdates as Map<QueuedCell, RenderPhaseSnapshot> | null;
		if (updates !== null && previousOwner !== null && blockIsAncestorOf(previousOwner, block)) {
			previousUpdates ??= new Map();
			for (const [cell, snapshot] of updates) {
				if (!previousUpdates.has(cell)) previousUpdates.set(cell, snapshot);
			}
		}
	} catch (error) {
		// The innermost block an error unwinds through while hydrating records
		// whether it was thrown while adopting server DOM (HYDRATION_THROWN).
		if (hydrating && HYDRATION_THROWN !== error) noteHydrationThrow(error, hydration);
		const updates = renderPhaseUpdates as Map<QueuedCell, RenderPhaseSnapshot> | null;
		if (updates !== null) {
			for (const [cell, snapshot] of updates) restoreRenderPhaseUpdate(cell, snapshot);
			discardHookFolds(updates);
			if (!block.crossRenderUpdate) block.pending = false;
		}
		// Prune before a discarded item retains this attempt's owners.
		if (retryVisit !== null && isSuspenseException(error)) pruneSignalRetryVisit(retryVisit, true);
		// A fresh item is linked only after its body succeeds. A boundary can
		// catch this throw and commit fallback without rolling back the root, so
		// the creation journal alone cannot clean up this otherwise-orphaned item.
		// Preserve only its signal authority for retry, never its failed DOM/scope.
		if (
			block.idState.renderOwner?.signalOwner !== undefined &&
			!block.mounted &&
			block.forSlot !== null &&
			block.forSlot.items.get(block.key) !== block
		)
			discardSignalRetryItem(block, error);
		throw error;
	} finally {
		renderPhaseOwner = previousOwner;
		renderPhaseUpdates = previousUpdates;
		if (previousSignalOwner !== undefined) signalOwnerFrame!.restore(previousSignalOwner);
	}
}
