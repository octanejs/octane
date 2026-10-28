// Child slots and text holes
//
// Renderable holes: childSlot and its value regimes, text holes, mapSlot and
// the compiler's cached arrays.

import {
	sameRenderBody,
	isChildrenBlock,
	coerceChildText,
	renderFrontierBlock,
	clearChildContent,
	tryImplicitBail,
} from './component-slots.js';
import { hydrationStarted, hydrating } from '../hydration-flag.js';
import {
	// Read only on setAttribute's cold dangerouslySetInnerHTML arm.
	VOID_ELEMENTS,
	HYDRATION_RANGE_BOUNDARY,
	HYDRATION_END,
} from '../constants.js';
import { hasOwnProp } from '../has-own.js';
import { textareaChildText } from '../shared-value-helpers.js';
import { __profileHasComponentMetadata, __profileTrackComponent } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { ELEMENT_TAG, CONTEXT_TAG } from '../runtime-tags.js';
import { nativeSignalHydration as NATIVE_SIGNAL_HYDRATION } from '../signals/read-protocol.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import { withProfileComponentOverride } from './profile-probes.js';
import type { ComponentBody, Scope, Block, ElementDescriptor, ChildSlot } from './types.js';
import {
	SIGNAL_CHILD,
	type HydrationDriver,
	HYDRATION_DRIVER,
	SIGNAL_BINDINGS_ENABLED,
	MEMO_BAIL,
	HOST_DESCRIPTORS,
	ROOT_RENDER_ROLLBACK,
} from './drivers.js';
import {
	type SignalInstanceKey,
	RENDERER_INVOCATION_SITE,
	TEMPLATE_INVOCATION_SITE,
	stampSignalInstanceKey,
	renderBlock,
} from './signal-owners.js';
import { journalRootProperty, isCreatedInRootRender } from './engine.js';
import { type TrackedThenable, useThenable } from './use.js';
import { CONTEXT_CHILD, type Context, promoteMemoAncestry } from './context.js';
import { KEPT_TEXT_CONTENT, clearKeptTextContent, CURSOR } from './hydration.js';
import { isBlockOpen } from '../stream-protocol.js';
import { PORTAL_CHILD } from './portals.js';
import {
	createBlock,
	RETURNED_OUTPUT_SCOPE,
	setReturnedOutputOwner,
	renderReturnedValue,
	bordersOutput,
	registerSlot,
} from './block.js';
import { CURRENT_BLOCK, ROOT_RENDER_TRANSACTION, preserveRootCreatedDom } from './render.js';
import { PRESENTATION_HYDRATION, BINDING_CHILDREN_SITE } from './hydration-presentation.js';
import { bindImplicitSignalChild } from './signal-bindings.js';
import { isSignalHandle } from '../signals/handle-protocol.js';
import {
	updateTextValue,
	setText,
	renderText,
	setRenderText,
	dangerouslySetInnerHTMLOwnsChild,
	HTML_NS,
	isHostElementOfType,
	deoptChildNamespace,
} from './host-props.js';
import {
	activityDescriptorDispatch,
	SCOPED_ELEMENT_PROPS,
	SCOPED_VALUE_RECORD,
	type ScopedValueDescriptor,
	isElementDescriptor,
	invalidChildError,
	invalidElementTypeError,
} from './elements.js';
import { siteLoc } from './diagnostics.js';
import {
	replaceSharedBlockBoundary,
	sharesBlockBoundary,
	freshSlotEnd,
	settleFreshSlot,
} from './branches.js';
import {
	warnMissingListKey,
	getDeoptDesc,
	prepareDeoptList,
	iterableChildArray,
	itemRange,
	descNeedsBlocks,
	teardownChildForSlot,
	journalRootChildShape,
	renderPreparedChildList,
} from './deopt.js';
import { detachDeoptTreeRefs } from './activity.js';
import {
	BAG_SIZE,
	bagRecord,
	slotNext,
	slotFrontier,
	queueFrontier,
	usesFrontier,
	placeAtCommit,
	atCommit,
	placeHydratedText,
	queueRootDeletion,
	journalBag,
} from './commit.js';
import { getFirstChild, getNextSibling, rejectTextareaChild } from './templates.js';
import { ROOT_ROLLBACK } from '../rollback-flag.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// One-shot handoff for the pure-host → blocks upgrade (see childSlot's upgrade
// branch): set around the upgraded block's renderBlock so the block's
// owns-parent childSlot (hostElementBody's single children slot) knows to ADOPT
// the element's existing raw children instead of mounting fresh. `children` is
// the OLD descriptor's children (pre-upgrade), used to key the existing nodes.
let DEOPT_UPGRADE: { block: Block; children: any } | null = null;

// A portal target is a container, not a host element receiving JSX `children`.
// React therefore permits portals into Lexical-owned void nodes such as `<hr>`;
// keep the void-host validation for actual authored/de-opt host children only.
function isPortalTarget(block: Block, domParent: Node): boolean {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if (current.kind === 'portal' && current.parentNode === domParent) return true;
	}
	return false;
}

// Snapshot the intrinsics at module load, before user code can replace them,
// so a later replacement is recognized as authored code. Bundlers cannot prove
// a bare property read side-effect-free, so each read sits in a pure IIFE:
// a bundle that never reaches these guards drops it rather than keeping a dead
// statement. `Reflect.apply` is a known-pure global read and needs no wrapper.
const NATIVE_ARRAY_MAP = /* @__PURE__ */ (() => Array.prototype.map)();
const NATIVE_ARRAY_FILTER = /* @__PURE__ */ (() => Array.prototype.filter)();
export const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_ARRAY_SPECIES_GETTER = /* @__PURE__ */ (() =>
	Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get)();
// Components hand the reconciler immutable array snapshots. Memoizing indexed
// accessor classification by snapshot identity avoids a descriptor allocation
// per row on every unchanged parent render; holes and intrinsic overrides are
// still rechecked each time. Mutating an existing data index into an accessor
// without changing the snapshot identity/length is outside that contract.
const NATIVE_ARRAY_ACCESSORS = new WeakMap<
	object,
	{ length: number; accessor: boolean; renderable?: boolean }
>();
let IMMUTABLE_FILTER_ARRAYS: WeakMap<object, Map<string, number>> | undefined;

/**
 * Compiler ABI for a safely reusable value-position array. A plain dense array
 * of ordinary descriptor snapshots can skip reconciliation while its identity
 * holds; indexed getters, nested collections, Fragments, and scope-sensitive
 * descriptors must stay on the ordinary live-render path. A fresh array will
 * be reconciled regardless, so inspect its entries only when that same identity
 * can actually skip a later render. Classification is cached by immutable
 * snapshot identity, just like the existing mapped-array accessor proof, so
 * subsequent cache hits remain constant-time without penalizing fresh lists.
 * @internal
 */
export function compilerCacheArray(value: unknown, previous: unknown): boolean {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
	// The region's existing identity-miss guard guarantees a changed value runs
	// its ordinary reconciliation. No safety classification is needed until a
	// previously rendered array could actually be reused.
	if (value !== previous) return true;
	const length = value.length;
	const cached = NATIVE_ARRAY_ACCESSORS.get(value);
	if (cached !== undefined && cached.length === length) {
		if (cached.accessor) return false;
		if (cached.renderable !== undefined) return cached.renderable;
	}

	let accessor = false;
	let renderable = true;
	for (let index = 0; index < length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, index);
		if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
			accessor = true;
			renderable = false;
			break;
		}
		const item = descriptor.value;
		if (Array.isArray(item)) {
			renderable = false;
			continue;
		}
		if (item !== null && typeof item === 'object') {
			if (item.$$kind !== ELEMENT_TAG) {
				renderable = false;
				continue;
			}
			// A scoped-value descriptor exposes type/props through getters. Check its
			// private marker before touching either field or moving context reads.
			if ((item as ScopedValueDescriptor<any>)[SCOPED_VALUE_RECORD] !== undefined) {
				renderable = false;
				continue;
			}
			// Hosts and Fragments own child collections that may hide live getters;
			// only ordinary component descriptor snapshots are independently safe.
			if (typeof item.type !== 'function' || SCOPED_ELEMENT_PROPS.has(item.props as object)) {
				renderable = false;
			}
		} else if (typeof item === 'function' || typeof item === 'symbol') {
			renderable = false;
		}
	}
	// Continue scanning after a nested/scoped rejection: mapSlot shares this
	// record and still needs its accessor verdict to cover every array index.
	NATIVE_ARRAY_ACCESSORS.set(value, { length, accessor, renderable });
	return renderable;
}

/**
 * Reuse a native filter projection from a compiler-proven state snapshot.
 *
 * Generated code calls this only after its ordinary dependency comparisons
 * prove a possible cache hit, so fresh snapshots never pay a classification
 * scan. Intrinsics are rechecked on every hit without invoking user getters;
 * dense array entries and the predicate's own data property are inspected
 * once per immutable snapshot and property.
 * @internal
 */
export function compilerCacheImmutableArrayFilter(value: unknown, property: string): boolean {
	if (
		Object.getOwnPropertyDescriptor(Array.prototype, 'filter')?.value !== NATIVE_ARRAY_FILTER ||
		Object.getOwnPropertyDescriptor(Array.prototype, 'map')?.value !== NATIVE_ARRAY_MAP ||
		Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value !== Array ||
		Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== NATIVE_ARRAY_SPECIES_GETTER ||
		!Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Array.prototype ||
		hasOwnProp.call(value, 'filter') ||
		hasOwnProp.call(value, 'map') ||
		hasOwnProp.call(value, 'constructor')
	) {
		return false;
	}

	const length = value.length;
	let properties = IMMUTABLE_FILTER_ARRAYS?.get(value);
	if (properties?.get(property) === length) return true;

	for (let index = 0; index < length; index++) {
		const entry = Object.getOwnPropertyDescriptor(value, index);
		if (entry === undefined || entry.get !== undefined || entry.set !== undefined) return false;
		const item = entry.value;
		if (
			item === null ||
			typeof item !== 'object' ||
			Object.getPrototypeOf(item) !== Object.prototype
		) {
			return false;
		}
		const member = Object.getOwnPropertyDescriptor(item, property);
		if (member === undefined || member.get !== undefined || member.set !== undefined) return false;
	}

	if (properties === undefined) {
		properties = new Map();
		(IMMUTABLE_FILTER_ARRAYS ??= new WeakMap()).set(value, properties);
	}
	properties.set(property, length);
	return true;
}

/**
 * Reuse only an immutable array snapshot already proven safe by native mapSlot.
 *
 * Probe the private WeakMap first: a custom receiver or observable map getter
 * that never passed the native path must not acquire new proxy traps or getter
 * reads merely because its parent region is eligible. Recheck the constant-size
 * intrinsic/override surface without invoking those getters. Decline own or
 * inherited default props so their public descriptor read stays observable;
 * indexed stability follows the existing immutable-snapshot contract.
 * @internal
 */
export function compilerCacheMappedArray(value: unknown, component: unknown): boolean {
	const cached = NATIVE_ARRAY_ACCESSORS.get(value as object);
	if (
		cached === undefined ||
		typeof component !== 'function' ||
		'defaultProps' in component ||
		cached.accessor ||
		cached.renderable !== undefined ||
		cached.length !== (value as any[]).length
	) {
		return false;
	}

	return (
		Object.getPrototypeOf(value) === Array.prototype &&
		!hasOwnProp.call(value, 'map') &&
		!hasOwnProp.call(value, 'constructor') &&
		Object.getOwnPropertyDescriptor(Array.prototype, 'map')?.value === NATIVE_ARRAY_MAP &&
		Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value === Array &&
		Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get === NATIVE_ARRAY_SPECIES_GETTER
	);
}

/** Shared compiler ABI: native-array eligibility query plus stable keyed map dispatch. */
export function mapSlot(
	scopeOrItems: any,
	slotOrMethod: any,
	domParent?: Node,
	items?: any,
	method?: any,
	native?: boolean | ((...args: any[]) => any),
	callback?: (...args: any[]) => any,
	getKey?: (item: any, index: number) => any,
	itemBody?: (item: any, scope: Scope) => void,
	flags?: number,
	deps?: any[],
	anchor?: Node | null,
	ownEnd?: boolean | 1,
): boolean | void {
	if (arguments.length === 2) {
		const receiver = scopeOrItems;
		if (
			!Array.isArray(receiver) ||
			Object.getPrototypeOf(receiver) !== Array.prototype ||
			slotOrMethod !== NATIVE_ARRAY_MAP ||
			hasOwnProp.call(receiver, 'constructor') ||
			Object.getOwnPropertyDescriptor(Array.prototype, 'constructor')?.value !== Array ||
			Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get !== NATIVE_ARRAY_SPECIES_GETTER
		) {
			return false;
		}
		const length = receiver.length;
		let accessor = NATIVE_ARRAY_ACCESSORS.get(receiver);
		if (accessor === undefined || accessor.length !== length) {
			let found = false;
			for (let index = 0; index < length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(receiver, index);
				if (descriptor === undefined || descriptor.get !== undefined) {
					found = true;
					break;
				}
			}
			accessor = { length, accessor: found };
			NATIVE_ARRAY_ACCESSORS.set(receiver, accessor);
		}
		if (accessor.accessor) return false;
		for (let index = 0; index < length; index++) {
			if (!(index in receiver)) return false;
		}
		return true;
	}
	// Unmemoized mapped regions do not need the eligibility answer separately.
	// Accept their compact one-call ABI and run the same guard exactly once.
	if (typeof native === 'function') {
		ownEnd = anchor as boolean | 1 | undefined;
		anchor = deps as Node | null | undefined;
		deps = flags as any[] | undefined;
		flags = itemBody as unknown as number | undefined;
		itemBody = getKey as unknown as (item: any, scope: Scope) => void;
		getKey = callback as (item: any, index: number) => any;
		callback = native;
		native = mapSlot(items, method) as boolean;
	}
	if (process.env.NODE_ENV !== 'production' && ((flags ?? 0) & 64) !== 0 && items?.length > 0)
		warnMissingListKey((scopeOrItems as Scope).block);
	if (ownEnd === 1) ownEnd = true;
	if (native === true) {
		const previous = ((scopeOrItems as Scope).slots[slotOrMethod] as ChildSlot | undefined)
			?.forSlot;
		if (previous?.mappedNative === false) {
			// A list a custom receiver rendered keeps rendering the authored map
			// callback's descriptors for its lifetime, so its rows keep their
			// elements, as React keeps a same-key, same-type element: the
			// reconciler patches them, and nothing switches representation.
			const mapped = NATIVE_REFLECT_APPLY(method, items, [callback]);
			childSlot(
				scopeOrItems,
				slotOrMethod,
				domParent!,
				mapped,
				anchor,
				ownEnd,
				undefined,
				false,
				true,
				undefined,
				undefined,
				undefined,
				undefined,
				true,
			);
			return;
		}
		childSlot(
			scopeOrItems,
			slotOrMethod,
			domParent!,
			items,
			anchor,
			ownEnd,
			undefined,
			false,
			true,
			itemBody,
			getKey,
			flags,
			deps,
		);
	} else {
		let mapped = NATIVE_REFLECT_APPLY(method, items, [callback]);
		if (Array.isArray(mapped)) {
			let packed: any[] | null = null;
			for (let index = 0; index < mapped.length; index++) {
				if (!(index in mapped)) {
					packed = [];
					break;
				}
			}
			if (packed !== null) {
				for (let index = 0; index < mapped.length; index++) {
					if (index in mapped) packed.push(mapped[index]);
				}
				mapped = packed;
			}
		}
		childSlot(
			scopeOrItems,
			slotOrMethod,
			domParent!,
			mapped,
			anchor,
			ownEnd,
			undefined,
			false,
			true,
			undefined,
			undefined,
			undefined,
			undefined,
			true,
		);
		const state = (scopeOrItems as Scope).slots[slotOrMethod] as ChildSlot | undefined;
		if (state?.forSlot !== null && state?.forSlot !== undefined) {
			state.forSlot.mappedNative = false;
		}
	}
}

/**
 * Renders a signal child's value into its slot. bindSignalChild and a hole that
 * receives a handle at run time (bindImplicitSignalChild) both pass this, so
 * installing the implicit signal child names none of the hole machinery that an
 * application without holes never ships.
 */
export function renderSignalChildSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor: Node | null | undefined,
	ownEnd: boolean | undefined,
	ownsHost: Element | undefined,
	compactable: boolean | undefined,
	onlyChild: boolean | undefined,
	bindingMarker: string | undefined,
	cachedText: Text | null,
): Text | null {
	if (onlyChild) return childTextHole(parentScope, slotKey, domParent, value, cachedText);
	if (bindingMarker === undefined)
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, ownsHost, compactable);
	else bindingChildSlot(parentScope, slotKey, domParent, value, bindingMarker, anchor, ownEnd);
	return null;
}

export type SignalChildSlotRenderer = typeof renderSignalChildSlot;

/** @internal Address an ordinary renderable slot without narrowing its value semantics. */
export function bindingChildSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	marker: string,
	anchor?: Node | null,
	ownEnd?: boolean,
): void {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame?.revision !== undefined) {
		// Signal children reach this slot too (bindSignalChild): only the driver
		// names the range validator, so that client-only bundles drop it.
		const driver: HydrationDriver = HYDRATION_DRIVER!;
		const start = (hydrating ? CURSOR?.resolveOpen(anchor ?? null, domParent) : null) ?? null;
		const range = driver.presentationRange(frame, start, marker, 'slot');
		if (
			value == null
				? range.slot !== undefined || getNextSibling(start!) !== range.end
				: range.slot === undefined ||
					typeof value !== 'function' ||
					(value as Function & { [BINDING_CHILDREN_SITE]?: string })[BINDING_CHILDREN_SITE] !==
						range.slot
		)
			driver.presentationMiss(false);
	}
	childSlot(
		parentScope,
		slotKey,
		domParent,
		value,
		anchor,
		ownEnd,
		undefined,
		false,
		true,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		marker,
	);
}

export function childSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	// When set, `anchor` is the slot's OWN dedicated `<!>` placeholder (emitted by
	// the compiler at the slot's source-order position) — reuse it as the end
	// marker instead of minting a second comment. Content still inserts before it.
	// Only valid for a placeholder exclusive to this slot, NOT a shared end-marker.
	ownEnd?: boolean,
	// OWNS-PARENT mode (marker-elision M2): this slot exclusively owns ALL of
	// `ownsHost`'s children — mint no markers at all (append inserts, whole-
	// element clears). De-opt hosts (hostElementBody/hostComponent) pass their
	// element here; ignored under hydration (server-pair adoption wins).
	ownsHost?: Element,
	// Compiler proof that this renderable hole is the body's entire output.
	// Used only by the post-hydration exact-range compactor.
	compactable?: boolean,
	// Internal: a de-opt list item has already consumed its element key, so its
	// nested child slot must render the descriptor directly rather than wrap it
	// in another one-item list.
	includeKeyedSingle: boolean = true,
	compiledMapBody?: (item: any, scope: Scope) => void,
	compiledMapKey?: (item: any, index: number) => any,
	compiledMapFlags?: number,
	compiledMapDeps?: any[],
	mappedFallback?: boolean,
	bindingMarker?: string,
): void {
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	if (slotKey === 0 && parentScope !== RETURNED_OUTPUT_SCOPE) {
		const state = parentScope.slots[0] as any;
		if (state?.returnedOutput === true) {
			if (state.__kind === 'childSlot') {
				setReturnedOutputOwner(state, false);
			} else {
				const block = parentScope.block;
				block.outputHandler!(block, null, true);
				if (block.disposed) return;
			}
		}
	}
	if (
		parentScope.slots[slotKey] === undefined &&
		ownsHost === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentScope.block.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentScope.block, domParent, anchor);
		if (end !== null) {
			try {
				childSlot(
					parentScope,
					slotKey,
					end.parentNode!,
					value,
					end,
					false,
					undefined,
					compactable,
					includeKeyedSingle,
					compiledMapBody,
					compiledMapKey,
					compiledMapFlags,
					compiledMapDeps,
					mappedFallback,
					bindingMarker,
				);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
			return;
		}
	}
	// Only an installed signal capability (compiled signal bindings) or a loaded
	// signal engine can hand a handle to this hole. A signal-free app writes
	// neither, so the bundler folds this branch away there. The engine check
	// covers a handle that a lazily imported module passes through an opaque
	// child before any compiled signal module has installed the capability.
	// Both are direct truthiness tests: the minifier folds a never-written
	// driver only there, never through a local copy.
	if (SIGNAL_CHILD) {
		if (
			SIGNAL_CHILD(
				renderSignalChildSlot,
				parentScope,
				slotKey,
				domParent,
				value,
				anchor,
				ownEnd,
				ownsHost,
				compactable,
				bindingMarker,
			)
		)
			return;
	} else if (
		NATIVE_SIGNAL_HYDRATION &&
		bindImplicitSignalChild(
			renderSignalChildSlot,
			parentScope,
			slotKey,
			domParent,
			value,
			anchor,
			ownEnd,
			ownsHost,
			compactable,
			bindingMarker,
		)
	)
		return;
	// Reading the host's tag costs two DOM accessors and this runs for every
	// renderable hole on every render, so lead with the cheap facts. A de-opt list
	// ITEM (`includeKeyedSingle === false`, passed only by deoptItemBody) shares
	// the domParent its list's own childSlot already validated against a non-null
	// list value, so re-reading the tag once per item proves nothing new.
	if (
		value != null &&
		includeKeyedSingle &&
		domParent.nodeType === 1 &&
		VOID_ELEMENTS.has((domParent as Element).localName) &&
		!isPortalTarget(parentScope.block, domParent)
	) {
		throw new Error(formatClientError(26, (domParent as Element).localName));
	}
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return;
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	// React 19 treats Contexts and thenables as renderable Usable nodes. Resolve
	// them before choosing a child regime; repeated unwrapping supports shapes
	// such as Promise<Context<T>> while preserving the normal Suspense route for
	// a pending thenable and the normal context dependency tracking for Context.
	while (value !== null && (typeof value === 'object' || typeof value === 'function')) {
		if (CONTEXT_CHILD && (value as any).$$kind === CONTEXT_TAG) {
			value = CONTEXT_CHILD(value as Context<unknown>);
			continue;
		}
		if (typeof (value as any).then === 'function') {
			// Without an entry that can suspend, a wakeable is a render error, as a
			// thrown one is (renderBlockInner): nothing could hold the screen.
			if (ROOT_ROLLBACK) value = useThenable(value as TrackedThenable<unknown>);
			else throw value;
			continue;
		}
		break;
	}
	// Each field read of a scoped JSX value resolves its record again, and this
	// classifies every renderable hole on every render. Read the type once here;
	// later branches read only the fields they consume.
	const elementType = isElementDescriptor(value) ? value.type : undefined;
	// Only a factory that installed the host renderer can build a host
	// descriptor. Reading its type first resolves a deferred JSX value, whose
	// factory installs it; a bundle without one keeps no host branch below.
	const hostDriver = typeof elementType === 'string' && HOST_DESCRIPTORS ? HOST_DESCRIPTORS : null;
	const valueComponent =
		typeof value === 'function'
			? (value as ComponentBody)
			: typeof elementType === 'function'
				? (elementType as ComponentBody)
				: null;
	const hydrationTransparent =
		hydration?.passthroughRanges === true &&
		(
			valueComponent as
				| (ComponentBody & {
						[HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner';
				  })
				| null
		)?.[HYDRATION_RANGE_BOUNDARY] !== 'owner';
	// Reaching the selected owner through a value slot (for example a keyed list
	// item) ends passthrough exactly as componentSlot does, so later siblings and
	// boundaries know the server cursor has been handed off. The owner adopts
	// whatever range the server rendered first, so its output need not fill it.
	const passthroughOwner = hydration?.passthroughRanges === true && !hydrationTransparent;
	if (passthroughOwner) hydration!.passthroughRanges = false;
	const iterable = iterableChildArray(value);
	if (iterable !== null) value = iterable;
	const preparedList =
		compiledMapBody !== undefined
			? { items: value as any[], keys: null }
			: prepareDeoptList(value, false, includeKeyedSingle, elementType);
	// A LONE PURE-HOST descriptor (host/text-only subtree — no components, no
	// portals, no render functions). Computed once per call: the slot init below
	// uses it to pick the ANCHORLESS regime, the promotion after it to detect a
	// mode flip out of that regime, and the classifier to route the value.
	let state = parentScope.slots[slotKey] as ChildSlot | undefined;
	// Once a host gains component children, keep its reconciled Block while it
	// remains a host descriptor. Dropping back to the raw path would recreate
	// the host and every surviving input when the last component is removed.
	// After Usable unwrapping a host descriptor is no thenable, so it needs Blocks
	// exactly when its children do.
	const pureHost =
		preparedList === null &&
		hostDriver !== null &&
		state?.currentComp !== (hostDriver.body as unknown as ComponentBody) &&
		!descNeedsBlocks((value as ElementDescriptor).children);
	let rootShapeChanged = false;
	if (state !== undefined && ROOT_RENDER_TRANSACTION !== null) {
		const component =
			pureHost || preparedList !== null
				? null
				: hostDriver !== null
					? (hostDriver.body as unknown as ComponentBody)
					: valueComponent;
		const unchangedList = preparedList !== null && state.forSlot !== null;
		const unchangedComponent =
			state.block !== null &&
			component !== null &&
			(component === state.currentComp ||
				(typeof value === 'function' &&
					state.currentIsBodyFn &&
					sameRenderBody(state.currentComp!, component)));
		const unchangedHost =
			pureHost &&
			state.hostNode !== null &&
			state.block === null &&
			state.hostNode.nodeType === 1 &&
			isHostElementOfType(state.hostNode as Element, elementType as string);
		const primitive = value == null || (typeof value !== 'object' && typeof value !== 'function');
		const text = primitive ? coerceChildText(value) : null;
		const unchangedText =
			primitive &&
			state.block === null &&
			state.forSlot === null &&
			state.hostNode === null &&
			state.portal === null &&
			(state.text === null) === (text === '');
		if (!unchangedList && !unchangedComponent && !unchangedHost && !unchangedText) {
			journalRootChildShape(state);
			rootShapeChanged = true;
		}
	}
	if (
		state === undefined &&
		hydration !== null &&
		!hydrationTransparent &&
		parentBlock === hydration.rootBlock
	)
		hydration.rootSlot(anchor ?? null, value, preparedList !== null);
	// This call adopted the server's `<!--[-->…<!--]-->` pair as the slot's range,
	// or is the first render of a slot lent its list item's or returning
	// component's range.
	let adoptedRange = false;
	// The server rendered nothing where this value begins (claimRange): build
	// the value with hydration suspended, as a client mount would.
	let rebuild = false;
	// Hydrating, an update of a slot that already rendered, as in a suspended
	// deferred boundary's retry after its captures changed. Its earlier render
	// took the server's content, and the cursor belongs to other slots' server
	// nodes, so content this update creates builds as a client update would.
	let hydratingUpdate = false;
	if (state === undefined) {
		const transaction = ROOT_RENDER_TRANSACTION;
		if (
			transaction !== null &&
			!transaction.aborted &&
			!ROOT_RENDER_ROLLBACK &&
			parentScope.mounted &&
			!isCreatedInRootRender(transaction, parentBlock)
		) {
			// A stable component may have returned undefined until now: its first
			// slot's hole cache.
			journalBag();
		}
		let start: Comment | null;
		let end: Comment | null;
		// A block's return slot borrows the range that bounds the block's output,
		// on the client as on the server (protocol 3): the value renders directly
		// in its component's range. A returned value renders at the block's end
		// unless it replaces committed output (renderReturnedValue's frontier).
		const returned =
			parentScope === RETURNED_OUTPUT_SCOPE &&
			slotKey === 0 &&
			anchor === parentBlock.endMarker &&
			bordersOutput(parentBlock);
		if (hydrationTransparent) {
			// The selected hydration container begins below this logical return
			// slot. Keep its lifecycle/block, but leave the server cursor and ranges
			// untouched until the declared owner component is reached.
			start = null;
			end = null;
		} else if (returned) {
			start = parentBlock.startMarker as Comment;
			end = parentBlock.endMarker as Comment;
			adoptedRange = hydration !== null;
		} else if (hydration !== null && isBlockOpen(anchor ?? null)) {
			start = anchor as Comment;
			// Hydration (nested hole): the anchor resolved via child/sibling to the
			// server's `<!--[-->`. Adopt that `<!--[-->…<!--]-->` range as our markers
			// and point the cursor at the first content node for the Block's clone()
			// / the text adopt below.
			end = hydration.close(start);
			if (parentBlock === hydration.rootBlock) hydration.rootClaimed = true;
			hydration.node = getNextSibling(start);
			adoptedRange = true;
		} else if (hydration !== null && isBlockOpen(hydration.node)) {
			// Hydration (sole top-level hole, e.g. a layout `<>{children}…</>`): the
			// anchor is the block's end-marker (not a `<!--[-->`), but the CURSOR sits
			// on the server's range-open. Adopt from the cursor. This is what lets a
			// component whose only body root is `{children}` hydrate as single-root.
			start = hydration.node as Comment;
			end = hydration.close(hydration.node as Node);
			if (parentBlock === hydration.rootBlock) hydration.rootClaimed = true;
			hydration.node = getNextSibling(start);
			adoptedRange = true;
		} else if (bindingMarker !== undefined) {
			// An authored binding value retains its ordinary child-slot lifecycle,
			// but its range must remain addressable even while empty or primitive.
			start = document.createComment(bindingMarker);
			end = ownEnd && anchor != null ? (anchor as Comment) : document.createComment(HYDRATION_END);
			end.data = HYDRATION_END;
			domParent.insertBefore(start, anchor ?? null);
			if (end !== anchor) domParent.insertBefore(end, anchor ?? null);
		} else if (ownEnd && anchor != null) {
			// Client mount, dedicated placeholder: reuse the slot's own `<!>` as the end
			// marker — content inserts before it just the same. Saves a comment + an
			// insertBefore per `{expr}` hole (no separate end marker minted).
			start = null;
			end = anchor as Comment;
		} else if (hydration === null && ownsHost !== undefined) {
			// OWNS-PARENT: no markers in any value regime — the element's child
			// list IS the slot's range (see ChildSlot.ownerHost).
			start = null;
			end = null;
		} else if (hydration === null && pureHost) {
			// ANCHORLESS client mount: the value is a lone pure-host descriptor, so
			// the element self-delimits — mint NO markers at all (mirrors
			// componentSlot's singleRoot regime). This is what makes a host
			// descriptor at a root / return slot land as `container.firstChild`
			// (React parity) instead of `<!----><el/><!---->`. A later render whose
			// value flips mode promotes to the marked regime (see below).
			start = null;
			end = null;
		} else {
			// Client mount: a SINGLE end anchor. A text/empty hole tracks its own
			// `Text` node (no start needed); the component path lazily mints a start
			// marker when first required. Saves one comment per `{expr}` text hole.
			start = null;
			// Hydrating without a server range, as a return slot does. A runtime
			// host's children (`ownsHost`) adopt the server's from the cursor, and
			// the slot's minted marker joins them, which a root attempt that rolls
			// back restores. A compiled map's rows are the compiler's to frame.
			if (hydration !== null) {
				if (ownsHost === undefined)
					hydration.rejectServerText(
						parentScope,
						slotKey,
						domParent,
						anchor ?? null,
						value,
						preparedList !== null && compiledMapBody === undefined && mappedFallback !== true,
					);
			}
			end = document.createComment('');
			// Hydration places the slot's marker in the server DOM it adopts at commit.
			if (hydration !== null) {
				placeAtCommit(domParent, end, anchor ?? null);
			} else domParent.insertBefore(end, anchor ?? null);
		}
		state = {
			__kind: 'childSlot',
			start,
			end,
			ownerHost: (hydration === null ? (ownsHost ?? null) : null) as Element | null,
			borrowed: hydrationTransparent || returned,
			compactable: compactable === true,
			block: null,
			text: null,
			currentComp: null,
			currentIsBodyFn: false,
			forSlot: null,
			hostNode: null,
			portal: null,
			next: null,
			implicitSignal: undefined,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
		// A host's first component child (an only-child hole leaving text, say)
		// builds off-document under a committed Block, as a replacement does. An
		// upgraded host adopts the children it has instead.
		rootShapeChanged =
			ownsHost !== undefined &&
			hydration === null &&
			ROOT_RENDER_TRANSACTION !== null &&
			DEOPT_UPGRADE?.block !== parentScope.block;
	} else if (hydration !== null) {
		if (hydration.lentSlot === state) {
			hydration.lentSlot = null;
			adoptedRange = true;
		} else hydratingUpdate = true;
	}
	if (adoptedRange)
		rebuild = hydration!.claimRange(
			parentScope,
			slotKey,
			state.start!,
			state.end!,
			value,
			compiledMapBody === undefined && mappedFallback !== true ? preparedList : null,
		);
	if (compactable === true) state.compactable = true;

	// Consume the pure-host → blocks upgrade handoff: this is the upgraded
	// block's owns-parent children slot (its FIRST render), and the element's
	// existing raw children must be adopted rather than mounted fresh. One-shot.
	let upgradeChildren: any = undefined;
	let upgradeArmed = false;
	if (
		DEOPT_UPGRADE !== null &&
		DEOPT_UPGRADE.block === parentScope.block &&
		ownsHost !== undefined
	) {
		upgradeChildren = DEOPT_UPGRADE.children;
		upgradeArmed = true;
		DEOPT_UPGRADE = null;
	}

	// ANCHORLESS → marked promotion: the slot was created markerless for a lone
	// pure-host value (init above). The moment a render flips the value to
	// anything else (component / array / portal / text / null), mint the marker
	// pair on demand around the current host node, so every path below sees the
	// normal marked regime — the childSlot analogue of the singleRoot shape-flip
	// handling in disposeReturnSlot. One-way: once marked, the slot stays marked.
	if (state.end === null && !pureHost && state.ownerHost === null && !state.borrowed) {
		const start = document.createComment('');
		const end = document.createComment('');
		const host = state.hostNode;
		const p = host === null ? null : host.parentNode;
		// An unkeyed host descriptor of the host's own type adopts it (the
		// pure-host upgrade below). A keyed host enters the list regime and
		// replaces the outgoing host.
		const adopts =
			hydration === null &&
			preparedList === null &&
			host !== null &&
			hostDriver !== null &&
			hostDriver.adopts(host, value as ElementDescriptor, domParent);
		if (p !== null && !adopts && ROOT_RENDER_TRANSACTION !== null && usesFrontier(parentBlock, p)) {
			// Over committed DOM the pair, and whatever this render puts in it, take
			// the host's place at commit: the rest of this call renders into the
			// slot's frontier, as a fresh slot's does (freshSlotEnd).
			const frag = slotFrontier(state, parentBlock, p, null);
			frag.append(start, end);
			const pending = state.next!;
			pending.out.push(() => detachDeoptTreeRefs(host!, null), host, host);
			pending.follows = true;
			if (sharesBlockBoundary(parentBlock, host, host))
				pending.bound = [parentBlock, host, host, start, end];
			state.hostNode = null;
			domParent = frag;
		} else if (
			p !== null &&
			adopts &&
			ROOT_RENDER_TRANSACTION !== null &&
			usesFrontier(parentBlock, p)
		) {
			// The pure-host upgrade below adopts the host in place. Its commit puts
			// the pair around it, after any move of the host by its list, and only
			// then hands the shared bound over (landHostPair).
			ROOT_RENDER_TRANSACTION.ops.push(hostDriver!.landPair, [host, start, end, parentBlock]);
		} else if (p !== null) {
			p.insertBefore(start, host);
			p.insertBefore(end, getNextSibling(host!));
			replaceSharedBlockBoundary(parentBlock, host, host, start, end);
		} else {
			// Defensive — anchorless is only entered after a successful pure-host
			// render, so a live host should always exist. Pin at the call's anchor.
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		state.start = start;
		state.end = end;
	}

	if (PORTAL_CHILD && PORTAL_CHILD(state, value, parentBlock, domParent, hydration)) return;

	// Arrays, iterables, Fragment descriptors, and a lone explicitly-keyed
	// element share one keyed-list regime. Keeping a keyed single child in this
	// regime is what lets it retain state when a sibling is added around it.
	if (preparedList !== null) {
		// A hydrating update builds a list that replaces other content, or one an
		// earlier hydrating update built, on the client.
		if (rebuild || (hydratingUpdate && (state.forSlot === null || hydration!.buildsList(state)))) {
			// Mount each item rather than look for server items that are not there.
			const slot = state;
			hydration!.suspend(() =>
				renderPreparedChildList(
					slot,
					parentBlock,
					domParent,
					preparedList,
					null,
					upgradeArmed,
					upgradeChildren,
				),
			);
			return;
		}
		renderPreparedChildList(
			state,
			parentBlock,
			domParent,
			preparedList,
			hydration,
			upgradeArmed,
			upgradeChildren,
			compiledMapBody,
			compiledMapKey,
			compiledMapFlags,
			compiledMapDeps,
			mappedFallback,
		);
		// Past the list's adopted range, as after a component's (below).
		if (hydration !== null && !state.borrowed && state.end !== null)
			hydration.parkPast(state.end, parentScope);
		return;
	}
	// Value is NOT an array — if we were in array mode, tear the list down first.
	if (state.forSlot !== null) {
		if (ROOT_RENDER_TRANSACTION !== null && hydration === null) clearChildContent(state);
		else teardownChildForSlot(state);
	}
	// Upgrade adoption, single-child form: the new children value is a lone
	// renderable. Adopt the element's sole existing raw node as the slot's
	// pure-host reuse candidate (the classifier paths below patch it in place,
	// or the nested upgrade branch takes it over for host-with-components).
	// Multiple or incompatible leftover raw children can't be adopted by a
	// single-value slot — sweep them so the fresh mount starts clean.
	if (upgradeArmed && state.hostNode === null && state.block === null) {
		const first = getFirstChild(domParent);
		if (
			first !== null &&
			getNextSibling(first) === null &&
			(first.nodeType === 1 || first.nodeType === 3)
		) {
			state.hostNode = first;
		} else {
			let n: Node | null = getFirstChild(domParent);
			while (n !== null) {
				const next: Node | null = getNextSibling(n);
				if (ROOT_RENDER_TRANSACTION !== null) {
					const outgoing = n;
					queueRootDeletion(() => detachDeoptTreeRefs(outgoing, null), outgoing, outgoing);
				} else {
					detachDeoptTreeRefs(n, null);
					domParent.removeChild(n);
				}
				n = next;
			}
		}
	}
	// Classify the value. A host descriptor whose subtree contains component
	// descendants can't be a raw rebuild (its components need reconcilable Blocks) →
	// route it through the component path below with the stable `hostElementBody`
	// renderer, which keeps the element across renders and mounts its component
	// children as proper Blocks. A pure-host descriptor (host/text only) is
	// reconciled in place against `state.hostNode` (props patched, children matched)
	// so DOM-resident state survives; only an incompatible node is rebuilt. A
	// function is a `{children}`-style render body; a component descriptor carries its
	// `type` + props; anything else is text/empty.
	let comp: ComponentBody | null = null;
	let props: any = {};
	let isBodyFn = false;
	let invocationSite: string | undefined;
	// A component descriptor's invocation site and key identify a new instance
	// only, so the mount path below reads them; a same-component update never
	// resolves them.
	let componentDescriptor: ElementDescriptor | null = null;
	if (hostDriver !== null) {
		if (pureHost) {
			// Pure host/text → reconcile in place, REUSING the existing node so DOM
			// state survives a re-render. Switching in from a component/text first
			// tears that down (also nulls a stale hostNode).
			if (state.block !== null || state.text !== null) clearChildContent(state);
			if (state.end === null) {
				// ANCHORLESS: no markers — the element self-delimits, so reconcile
				// straight against the tracked node. A same-tag value patches it in
				// place; an incompatible one is rebuilt at the old node's position
				// (first render inserts at the call's anchor). `reconcileDeoptNode`
				// always yields a node for a host descriptor; the null checks are
				// shape-parity with the marked path below.
				const prev = state.hostNode;
				const node = hostDriver.reconcile(
					prev,
					value as ElementDescriptor & { type: string },
					parentBlock,
					deoptChildNamespace(domParent),
				);
				if (node !== prev) {
					const parent = prev === null ? null : prev.parentNode;
					if (ROOT_RENDER_TRANSACTION !== null && usesFrontier(parentBlock, parent ?? domParent)) {
						// Over committed DOM, the new node waits in the slot's frontier and
						// takes the old one's place at commit.
						if (parent !== null) {
							journalRootChildShape(state);
							const pending = slotNext(state);
							pending.out.push(() => detachDeoptTreeRefs(prev!, null), prev, prev);
							pending.follows = true;
						}
						if (node !== null) {
							const frag = slotFrontier(state, parentBlock, parent ?? domParent, anchor ?? null);
							frag.appendChild(node);
						}
					} else if (parent !== null) {
						if (ROOT_RENDER_TRANSACTION !== null) {
							journalRootChildShape(state);
							queueRootDeletion(() => detachDeoptTreeRefs(prev!, null), prev, prev);
							if (node !== null) parent.insertBefore(node, prev);
						} else {
							if (node !== null) parent.insertBefore(node, prev);
							detachDeoptTreeRefs(prev!, null);
							parent.removeChild(prev!);
						}
					} else if (node !== null) {
						domParent.insertBefore(node, anchor ?? null);
					}
				}
				state.hostNode = node;
				return;
			}
			// First render: adopt the server node during hydration, else reuse the
			// prior built node, else build fresh. claimRange checked that a server
			// range holds that node and nothing else.
			let prev = state.hostNode;
			if (prev === null && hydration !== null) {
				prev = getNextSibling(state.start!);
				if (prev === state.end) prev = null;
			}
			const node = hostDriver.reconcile(
				prev,
				value as ElementDescriptor & { type: string },
				parentBlock,
				deoptChildNamespace(domParent),
			);
			if (node !== prev) {
				if (prev != null && prev !== node && prev.parentNode !== null) {
					if (ROOT_RENDER_TRANSACTION !== null) {
						journalRootChildShape(state);
						const outgoing = prev;
						queueRootDeletion(() => detachDeoptTreeRefs(outgoing, null), prev, prev);
					} else {
						detachDeoptTreeRefs(prev, null);
						prev.parentNode!.removeChild(prev);
					}
				}
				// Over committed DOM in a root render, the new node, and the slot's
				// first lower marker, wait in its frontier before its end.
				const frag =
					ROOT_RENDER_TRANSACTION !== null && usesFrontier(parentBlock, domParent)
						? slotFrontier(state, parentBlock, domParent, state.end)
						: null;
				if (state.start === null) {
					state.start = document.createComment('');
					if (frag !== null) frag.appendChild(state.start);
					else domParent.insertBefore(state.start, state.end);
				}
				if (node !== null) {
					if (frag !== null) frag.appendChild(node);
					else state.start.parentNode!.insertBefore(node, state.end);
				}
			}
			state.hostNode = node;
			return;
		}
		comp = hostDriver.body as unknown as ComponentBody;
		props = value;
		invocationSite = RENDERER_INVOCATION_SITE;
	} else if (typeof value === 'function') {
		comp = value as ComponentBody;
		isBodyFn = true;
	} else if (isElementDescriptor(value)) {
		const dispatch = activityDescriptorDispatch;
		const activity = dispatch !== null && (elementType as unknown) === dispatch.type;
		if (!activity && typeof elementType !== 'function') {
			throw invalidElementTypeError(elementType);
		}
		comp = activity ? dispatch!.body : (elementType as ComponentBody);
		props = value.props;
		componentDescriptor = value;
	}
	if (comp !== null) {
		// A bare render-FUNCTION child (a `.tsrx` `{children}` body forwarded onto a `.ts`
		// component's host element via createElement) is re-created every render, so its
		// identity always differs — but it is the SAME slot child. Reconcile by SLOT like
		// componentSlot: swap the block's body in place and re-render, instead of
		// re-mounting on every identity change (which, once effects re-render the tree,
		// loops unboundedly). Compiler-owned source tokens distinguish fresh captures
		// from a different authored body, whose slot layout needs a replacement.
		if (
			isBodyFn &&
			state.block !== null &&
			state.currentIsBodyFn &&
			sameRenderBody(state.currentComp!, comp)
		) {
			// Compiler-generated children are render functions too, so a fresh parent
			// render must still swap their body in place (preserving descendant state).
			// But an identity-equal tagged function is the exact same cached child value:
			// take React's implicit same-element bailout, with lazy context propagation.
			const taggedChildren = isChildrenBlock(comp);
			const wasImplicitlyArmed = state.block.$$implicitBail;
			if (taggedChildren && !wasImplicitlyArmed) {
				// The slot previously hosted an arbitrary render function. Arm before
				// rendering the tagged body so its context reads stamp this block.
				state.block.$$implicitBail = true;
				if (!state.block.memoInChain) promoteMemoAncestry(state.block);
			}
			if (
				wasImplicitlyArmed &&
				taggedChildren &&
				comp === state.currentComp &&
				tryImplicitBail(state.block)
			)
				return;
			if (state.block.body !== comp) journalRootProperty(state.block, 'body', state.block.body);
			if (state.currentComp !== comp) journalRootProperty(state, 'currentComp', state.currentComp);
			state.block.body = comp;
			renderBlock(state.block);
			state.currentComp = comp;
			return;
		}
		if (state.block !== null && comp === state.currentComp) {
			// updateDeoptComponent takes this branch for a de-opt list item without
			// entering the item's render; keep the two in step.
			// Same component identity → update in place (matches componentSlot),
			// honoring React.memo's bail — previously only componentSlot did, so a
			// memo()'d component rendered as VALUE-POSITION children (e.g. provider
			// children in a `.ts` binding tree) re-rendered unconditionally.
			if (MEMO_BAIL && MEMO_BAIL(state.block, comp, props)) return;
			// React's implicit same-element bailout: the IDENTICAL committed props
			// object (same cached descriptor, or a host descriptor re-passed as-is)
			// skips the body outright; changed-context consumers below refresh
			// lazily. This is what lets a `{children}` passthrough under a
			// re-rendering Provider skip untouched subtrees without a memo() shim.
			if (
				props === state.block.props &&
				// Deferred host shells can change their complete record or children.
				// Compare the accepted resolution before accepting the shell's identity.
				(hostDriver === null || hostDriver.unchanged(state.block, props)) &&
				tryImplicitBail(state.block)
			)
				return;
			if (state.block.props !== props) journalRootProperty(state.block, 'props', state.block.props);
			state.block.props = props;
			renderBlock(state.block);
			return;
		}
		let signalInstanceKey: SignalInstanceKey | undefined;
		if (SIGNAL_BINDINGS_ENABLED || signalDocumentEnabled) {
			const key = componentDescriptor?.key;
			// A render function rendered here is part of this template. Compiled
			// children belong to the template that authored them instead, so they
			// keep the plain child identity.
			if (isBodyFn && !isChildrenBlock(comp)) invocationSite = TEMPLATE_INVOCATION_SITE;
			signalInstanceKey = {
				parentScope,
				invocationSite: componentDescriptor?.__octaneInvocationSite ?? invocationSite,
				key,
				hasKey: key != null,
			};
		}
		const retryLocation =
			(state.block === null && state.hostNode === null && state.text === null) ||
			parentBlock.idState.renderOwner?.signalOwner === undefined
				? undefined
				: {
						parent: parentScope,
						slot: slotKey,
						kind: state.__kind,
						branch: undefined,
						component: isBodyFn ? undefined : comp,
						key: undefined,
					};
		// PURE-HOST → BLOCKS UPGRADE (adopt, don't rebuild): the slot's last render
		// was a raw pure-host tree (state.hostNode), and this render the SAME-TAG
		// host descriptor now carries component descendants (e.g. a
		// `{cond && <Comp/>}` child flipped on, or a `.map()` hole filled with
		// component items) — descNeedsBlocks reclassified it through
		// hostElementBody. Tearing the raw tree down would recreate every sibling
		// host node; React preserves them (only the flipped position mounts). So
		// ADOPT: hand the existing element to the new block as its deoptNode
		// (hostElementBody's reuse branch patches props in place) and arm the
		// one-shot child-adoption handoff so the block's owns-parent childSlot
		// wraps the existing raw children into item ranges instead of mounting
		// fresh (see the DEOPT_UPGRADE consumption sites).
		if (
			hydration === null &&
			ROOT_RENDER_TRANSACTION !== null &&
			hostDriver !== null &&
			state.block === null &&
			state.hostNode !== null &&
			hostDriver.adopts(state.hostNode, props as ElementDescriptor, domParent)
		) {
			const el = state.hostNode as Element;
			state.hostNode = null;
			state.currentComp = comp;
			state.currentIsBodyFn = false;
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				state.start,
				state.end,
				comp,
				props,
				undefined,
				renderReturnedValue,
			);
			if (signalInstanceKey !== undefined) stampSignalInstanceKey(b, signalInstanceKey);
			preserveRootCreatedDom(b);
			if (state.borrowed) b.exclusiveMarkers = true;
			b.$$implicitBail = true;
			b.memoInChain = true;
			b.deoptNode = el;
			state.block = b;
			DEOPT_UPGRADE = { block: b, children: getDeoptDesc(el)?.children };
			try {
				renderBlock(b);
			} finally {
				DEOPT_UPGRADE = null;
			}
			return;
		}
		// An upgraded host's component child that adopted nothing above replaces
		// the host's raw children the same way.
		if ((rootShapeChanged || upgradeArmed) && usesFrontier(parentBlock, domParent)) {
			// The incoming Block renders in the slot's fragment, between a pair of
			// its own, and lands where the outgoing content stands at commit.
			const owned = state.ownerHost !== null || (state.borrowed && state.start === null);
			// A de-opt item owns its pair directly: the incoming pair replaces it,
			// preserving one pair per item. Other borrowed ranges may have
			// enclosing slot owners and keep their pair.
			const promote =
				parentScope === parentBlock &&
				parentBlock.forSlot !== null &&
				!parentBlock.exclusiveMarkers &&
				state.borrowed &&
				(sharesBlockBoundary(parentBlock, state.start, state.end) ||
					itemRange(parentBlock)[1] === state.end);
			const implicitBail = !isBodyFn || isChildrenBlock(comp);
			const frag = slotFrontier(
				state,
				parentBlock,
				domParent,
				owned ? null : promote ? getNextSibling(state.end!) : state.end,
			);
			const block =
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				isBodyFn &&
				!__profileHasComponentMetadata(comp)
					? withProfileComponentOverride(comp, null, () =>
							renderFrontierBlock(
								frag,
								parentBlock,
								'',
								comp!,
								props,
								renderReturnedValue,
								implicitBail,
								signalInstanceKey,
								retryLocation,
							),
						)
					: renderFrontierBlock(
							frag,
							parentBlock,
							'',
							comp,
							props,
							renderReturnedValue,
							implicitBail,
							signalInstanceKey,
							retryLocation,
						);
			const anchorless = !owned && state.end === null;
			clearChildContent(state);
			const pending = state.next!;
			if (anchorless || promote) pending.follows = true;
			if (promote) {
				const oldStart = state.start!;
				const oldEnd = state.end!;
				state.start = block.startMarker as Comment;
				state.end = block.endMarker as Comment;
				block.exclusiveMarkers = true;
				pending.out.push(null, oldStart, oldStart, null, oldEnd, oldEnd);
				pending.bound = [parentBlock, oldStart, oldEnd, state.start, state.end];
			} else if (state.start === null && state.ownerHost === null && !state.borrowed) {
				state.start = block.startMarker as Comment;
			}
			state.block = block;
			state.currentComp = comp;
			state.currentIsBodyFn = isBodyFn;
			return;
		}
		// New component (first render, or identity swap from text / another comp).
		// While hydrating the FIRST render adopts the server content between our
		// adopted markers (the cursor sits on it), so DON'T sweep it — clearing would
		// delete the very DOM the component is about to adopt and strand the cursor
		// (a detached node), desyncing every sibling/descendant below. Mirrors the
		// array path's `if (!hydrating) clearChildContent` guard above. (A post-
		// hydration identity swap runs with hydrating=false and clears normally,
		// as does a hydrating update, whose earlier render took the server content.)
		if (hydration === null || hydratingUpdate) {
			clearChildContent(state);
			if (parentBlock.disposed) return;
		}
		state.currentComp = comp;
		state.currentIsBodyFn = isBodyFn;
		if (state.start === null && state.ownerHost === null && !state.borrowed) {
			// First component in this slot — mint the lower-bound marker now so
			// clearChildContent can sweep a (possibly multi-node) component body.
			// (An OWNS-PARENT slot needs neither bound: clears sweep the element.)
			state.start = document.createComment('');
			if (hydration !== null && !hydratingUpdate) placeAtCommit(domParent, state.start, state.end);
			else domParent.insertBefore(state.start, state.end);
		}
		const b = createBlock(
			'dynamic',
			parentBlock,
			domParent,
			state.start,
			state.end,
			comp,
			props,
			undefined,
			renderReturnedValue,
		);
		if (signalInstanceKey !== undefined) stampSignalInstanceKey(b, signalInstanceKey);
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			hostDriver === null
		)
			__profileTrackComponent(b, !isBodyFn || __profileHasComponentMetadata(comp) ? comp : null);
		if (state.borrowed) b.exclusiveMarkers = true;
		// Arm React's implicit same-element bailout: value-position mounts are the
		// sites that can receive a CACHED descriptor back (provider children, `.ts`
		// binding trees, `return children` passthroughs), so their context reads
		// must stamp ancestors (memoInChain, like memo blocks) for the bail's lazy
		// consumer refresh to be sound. Set BEFORE renderBlock so the first render
		// stamps. Body-fn children re-create identity per render — no bail is ever
		// possible, so untagged ones skip the stamping cost. Tagged compiler children
		// can be passed through with stable identity and therefore need the same stamps.
		if (!isBodyFn || isChildrenBlock(comp)) {
			b.$$implicitBail = true;
			b.memoInChain = true;
		}
		state.block = b;
		if (hydratingUpdate) {
			hydration!.renderUpdate(b);
		} else if (adoptedRange && !passthroughOwner && hostDriver === null) {
			// The server may have rendered more in the range, for another value.
			// (claimRange already settled a host's.)
			hydration!.renderClaimed(b, parentScope, slotKey);
		} else {
			renderBlock(b);
		}
		// Advance the cursor past this child's adopted range so a following sibling
		// hole adopts the right node (mirrors componentSlot's post-render advance).
		// (Hydration always adopts a marker pair, so `state.end` is non-null here.)
		if (hydration !== null && !state.borrowed && state.end !== null) {
			hydration.parkPast(state.end, parentScope);
		}
		return;
	}

	// Text / empty.
	if (value !== null && typeof value === 'object') throw invalidChildError(value);
	// Swapped away from a component OR a pure-host de-opt node → tear it down first.
	if (state.block !== null || state.hostNode !== null) clearChildContent(state);
	const str = coerceChildText(value);
	if (adoptedRange) hydration!.settleTextRange(parentScope, slotKey, state, str);
	if (str === '') {
		// `null` / `undefined` / `false` / `true` / `''` render NOTHING — not even
		// an empty text node — matching React/Octane. The server emits an empty
		// `<!--[--><!--]-->` range for these, so the marker pair stays content-less
		// on both sides. Drop a text node left over from a prior non-empty render.
		if (state.text !== null) {
			if (ROOT_RENDER_TRANSACTION !== null) clearChildContent(state);
			else {
				state.text.remove();
				state.text = null;
			}
		}
		return;
	}
	if (state.text !== null) {
		renderText(parentBlock, state.text, str);
		return;
	}
	if (hydration !== null && !hydratingUpdate) {
		// Adopt the server text sitting between our adopted markers. (An empty hole
		// has no text node, but `str !== ''` here means the server emitted one.)
		const n = hydration.node;
		const loc = process.env.NODE_ENV !== 'production' ? siteLoc(parentScope, slotKey) : undefined;
		if (n !== null && n !== state.end && n.nodeType === 3) {
			state.text = n as Text;
			hydration.node = getNextSibling(n);
			if (!hydration.keepsText(domParent, n, n.nodeValue, str, loc))
				updateTextValue(n as Text, str);
			return;
		}
		// An adopted range without text is what the server rendered for empty text.
		if (adoptedRange && getNextSibling(state.start!) === state.end) {
			const tn = hydration.newText(domParent, str, loc);
			atCommit(placeHydratedText, [domParent, tn, state.end, false]);
			state.text = tn;
			return;
		}
	}
	insertSlotText(state, parentBlock, domParent, str);
}

/**
 * Give a text child slot its Text. Over committed DOM in a root render
 * (usesFrontier) it waits in the slot's frontier, which commit inserts where
 * the slot's content goes, after the outgoing content leaves.
 */
function insertSlotText(state: ChildSlot, parentBlock: Block, domParent: Node, str: string): void {
	const tn = document.createTextNode(str);
	state.text = tn;
	if (ROOT_RENDER_TRANSACTION === null || !usesFrontier(parentBlock, domParent)) {
		domParent.insertBefore(tn, state.end);
		return;
	}
	const owned = state.ownerHost !== null || (state.borrowed && state.start === null);
	const frag = slotFrontier(state, parentBlock, domParent, owned ? null : state.end);
	frag.appendChild(tn);
}

// A `{expr}` value-hole slot whose value is USUALLY a primitive (text) — what the
// compiler emits for `.tsx` element children. `childSlot` is a large function that
// V8 won't inline, so calling it per cell on every render dominated update-heavy
// keyed lists (a dbmon-style table cell was ~50% of tick time). This thin,
// inlinable wrapper handles the dominant case — a primitive into a slot already in
// text/empty mode — with the same work as `setText`, and delegates to the full
// `childSlot` only for objects/functions (component / element / array values), a
// not-yet-initialized slot (first render), or a slot currently holding non-text
// content. Behaviour is identical to calling `childSlot` directly.
export function textSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	ownEnd?: boolean,
	compactable?: boolean,
): void {
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return;
	const vt = typeof value;
	if (vt === 'object' || vt === 'function') {
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
		return;
	}
	const state = parentScope.slots[slotKey] as ChildSlot | undefined;
	if (
		state === undefined ||
		state.block !== null ||
		state.forSlot !== null ||
		state.hostNode !== null ||
		state.portal !== null
	) {
		// First render (state init + hydration adoption) or a mode switch out of
		// non-text content (block / array / host node / portal) — let the full
		// classifier handle it (it also tears the outgoing mode down, e.g. a
		// portal's foreign-target content).
		childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
		return;
	}
	if (
		slotKey === 0 &&
		parentScope !== RETURNED_OUTPUT_SCOPE &&
		(state as any).returnedOutput === true
	) {
		setReturnedOutputOwner(state, false);
	}
	// Hot path: primitive into a text/empty slot (markerless single Text node).
	const str =
		vt === 'string' ? (value as string) : vt === 'boolean' || value == null ? '' : String(value);
	if (state.text !== null) {
		renderText(parentScope.block, state.text, str);
		return;
	}
	if (str === '') return;
	if (ROOT_RENDER_TRANSACTION !== null) journalRootChildShape(state);
	insertSlotText(state, parentScope.block, domParent, str);
}

// General path for a compiled renderable binding. The shared textHoleUpdate
// fast path (or an older compiler's inline equivalent) reaches here for objects,
// functions, first render/hydration, and text-mode switches. Return the settled
// text node for the next primitive update; childSlot owns all other content.
export function textHole(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor?: Node | null,
	ownEnd?: boolean,
	compactable?: boolean,
): Text | null {
	childSlot(parentScope, slotKey, domParent, value, anchor, ownEnd, undefined, compactable);
	const state = parentScope.slots[slotKey] as ChildSlot;
	return state.block === null && state.forSlot === null && state.hostNode === null
		? state.text
		: null;
}

/**
 * Shared primitive fast paths for compiler-owned renderable bindings. Stable
 * objects/functions must still reach childSlot: an unchanged descriptor can
 * contain consumers of a changed context. Null also takes the ordinary mode
 * switch so existing child content is released. The caller publishes its raw
 * value only after this returns, preserving the setters' rollback snapshots.
 */
export function textHoleUpdate(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	cachedNode: Text | null,
	previous: unknown,
	anchor?: Node | null,
	ownEnd?: boolean,
	compactable?: boolean,
): Text | null {
	const complex = value !== null && (typeof value === 'object' || typeof value === 'function');
	if (!complex) {
		if (previous === value) return cachedNode;
		if (cachedNode != null && value !== null) {
			setRenderText(cachedNode, value === true ? '' : value);
			return cachedNode;
		}
	}
	return textHole(parentScope, slotKey, domParent, value, anchor, ownEnd, compactable);
}

export function childTextHoleUpdate(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	cachedNode: Text | null,
	previous: unknown,
): Text | null {
	const complex = value !== null && (typeof value === 'object' || typeof value === 'function');
	if (!complex) {
		if (previous === value) return cachedNode;
		if (cachedNode != null && value !== null) {
			setRenderText(cachedNode, value === true ? '' : value);
			return cachedNode;
		}
	}
	return childTextHole(parentScope, slotKey, domParent, value, cachedNode);
}

/**
 * Record a template's renderable hole (#2043). The hole's two commit cells hold
 * its raw value (`cell`) and its Text (`cell + 1`), and the bag holds the
 * committed pair (`prev`, `node`). A primitive into the committed Text records
 * only the value, which the commit function writes (commitHole). Anything else
 * renders the slot now (textHole), which builds new content off-document over
 * committed DOM, and records the Text it settled on: commit only publishes it.
 * A staged bag's cells are this transaction's pending hole, so a later render
 * compares against them. An `always` hole renders the slot every time, so the
 * host's raw-HTML check runs (dangerouslySetInnerHTMLOwnsChild).
 */
export function bagHole(
	bag: any,
	next: any[] | null,
	cell: number,
	value: unknown,
	prev: unknown,
	node: Text | null,
	s: Scope,
	slotKey: number,
	domParent: Node,
	anchor?: Node | null,
	ownEnd?: boolean,
	compactable?: boolean,
	always?: boolean,
): any[] | null {
	if (
		value === prev &&
		always !== true &&
		(next === null ? bag.$ <= BAG_SIZE : next[cell] === bag) &&
		(value === null || (typeof value !== 'object' && typeof value !== 'function'))
	)
		return next;
	return recordHole(
		bag,
		next,
		cell,
		value,
		prev,
		node,
		s,
		slotKey,
		domParent,
		false,
		always,
		anchor,
		ownEnd,
		compactable,
	);
}

/** bagHole for a host's only child, whose markerless Text childTextHole keeps. */
export function bagChildHole(
	bag: any,
	next: any[] | null,
	cell: number,
	value: unknown,
	prev: unknown,
	node: Text | null,
	s: Scope,
	slotKey: number,
	domParent: Node,
	always?: boolean,
): any[] | null {
	if (
		value === prev &&
		always !== true &&
		(next === null ? bag.$ <= BAG_SIZE : next[cell] === bag) &&
		(value === null || (typeof value !== 'object' && typeof value !== 'function'))
	)
		return next;
	return recordHole(bag, next, cell, value, prev, node, s, slotKey, domParent, true, always);
}

function recordHole(
	bag: any,
	next: any[] | null,
	cell: number,
	value: unknown,
	prev: unknown,
	node: Text | null,
	s: Scope,
	slotKey: number,
	domParent: Node,
	onlyChild: boolean,
	always?: boolean,
	anchor?: Node | null,
	ownEnd?: boolean,
	compactable?: boolean,
): any[] | null {
	let last = prev;
	let text = node;
	// A first record stages the bag through bagRecord (the bag, which no value
	// equals, forces it); the hole then writes its own pair of cells.
	if (bag.$ > BAG_SIZE) {
		// Resume through bagRecord, which queues a bag no window queued yet; it
		// rewrites the hole's pending value in place.
		if (next === null) next = bagRecord(s, null, cell, bag.next[cell], bag)!;
		if (next[cell] !== bag) last = next[cell];
		if (next[cell + 1] !== bag) text = next[cell + 1];
	}
	if (
		always !== true &&
		(value === null || (typeof value !== 'object' && typeof value !== 'function'))
	) {
		if (value === last) return next;
		if (text !== null && value !== null) {
			if (next === null) next = bagRecord(s, null, cell, value, bag)!;
			if (text === node && next[cell + 1] === bag) {
				next[cell] = value === prev ? bag : value;
				return next;
			}
			// A Text this transaction built, or one the slot already wrote: write
			// it in render order.
			setRenderText(text, value === true ? '' : value);
			next[cell] = value;
			return next;
		}
	}
	text = onlyChild
		? childTextHole(s, slotKey, domParent, value, text)
		: textHole(s, slotKey, domParent, value, anchor, ownEnd, compactable);
	if (text === node && value === prev) {
		// Back to the committed pair: nothing pending.
		if (next !== null) next[cell] = next[cell + 1] = bag;
		return next;
	}
	if (next === null) next = bagRecord(s, null, cell, value, bag)!;
	// The slot wrote its content itself: commit only publishes the pair.
	next[cell] = value;
	next[cell + 1] = text;
	return next;
}

/**
 * The commit half of a hole: publish the Text its render settled on, or write
 * the new value into the committed Text when only the value changed.
 */
export function commitHole(bag: any, text: any, node: Text, value: unknown): Text | null {
	if (text !== bag) return text;
	setText(node, value === true ? '' : value);
	return node;
}

// The markerless Text leaves an only-child hole. A Text the host shows leaves at
// the commit of a root render over committed DOM; one this render built is
// still in its frontier.
function removeOnlyChildText(block: Block, host: Node, node: Text): void {
	if (node.parentNode === host && ROOT_RENDER_TRANSACTION !== null && usesFrontier(block, host))
		queueRootDeletion(() => node.remove(), null, null);
	else node.remove();
}

/** The client's text replaces `host`'s kept server content, at its render's commit. */
function clearKeptText(kept: WeakSet<Node>, block: Block, host: Node): void {
	if (ROOT_RENDER_TRANSACTION !== null && usesFrontier(block, host))
		queueRootDeletion(() => clearKeptTextContent(kept, host), null, null);
	else clearKeptTextContent(kept, host);
}

// Slow path for an ONLY-CHILD `{expr}` value hole (the value hole is the sole
// content of `domParent`). When the value is a primitive this is FULLY markerless
// and stateless — a single Text node appended to the host, exactly like a `.tsrx`
// only-child `htext`/`setText` text binding (no `<!>` placeholder, no childSlot
// state, no end marker). Only when the value is an object/function (component /
// element / array) does it fall back to the full `childSlot`, which lazily mints
// the markers + slot state it needs (the host's sole-child invariant means it can
// safely append). childTextHoleUpdate handles the steady-state primitive
// update (`setText` on the cached node); this runs on first render,
// empty↔non-empty, and a primitive↔object mode switch. Returns the text node to
// cache (or null when in object/empty mode).
export function childTextHole(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	cachedNode: Text | null,
): Text | null {
	if (
		domParent.nodeType === 1 &&
		VOID_ELEMENTS.has((domParent as Element).localName) &&
		!isPortalTarget(parentScope.block, domParent) &&
		value != null
	) {
		throw new Error(formatClientError(26, (domParent as Element).localName));
	}
	if (dangerouslySetInnerHTMLOwnsChild(domParent, value)) return null;
	let vt = typeof value;
	const state = parentScope.slots[slotKey] as ChildSlot | undefined;
	// A <textarea>'s children are text (see textareaText); a `children` prop from
	// a spread reaches it here. Only object values pay for the tag read. A signal
	// handle keeps childSlot's subscribing path, which renders its value as text.
	if (
		state === undefined &&
		(vt === 'object' || vt === 'function') &&
		domParent.nodeType === 1 &&
		(domParent as Element).localName === 'textarea' &&
		(domParent as Element).namespaceURI === HTML_NS &&
		!isSignalHandle(value)
	) {
		value = textareaChildText(value, rejectTextareaChild);
		vt = 'string';
	}
	if (ROOT_RENDER_TRANSACTION !== null && state === undefined && parentScope.mounted) {
		journalBag();
		journalRootProperty(parentScope.slots, slotKey, parentScope.slots[slotKey]);
	}
	// `null` is a primitive here too: ssrChildText serializes every empty value
	// alike, and childSlot's adoption would misread the host's markerless content.
	if (state === undefined && (value === null || (vt !== 'object' && vt !== 'function'))) {
		// Markerless pure-text mode.
		const str =
			value == null || value === false || value === true
				? ''
				: vt === 'string'
					? (value as string)
					: String(value);
		if (str === '') {
			if (cachedNode === null) {
				const hydration = hydrating ? CURSOR : null;
				if (hydration === null) {
					if (KEPT_TEXT_CONTENT !== null)
						clearKeptText(KEPT_TEXT_CONTENT, parentScope.block, domParent);
					return null;
				}
				// React treats a host whose child is a string or number as text content.
				if ((vt === 'string' || vt === 'number') && hydration.keepsServerContent(domParent))
					return null;
				return hydration.hempty(domParent, vt === 'string', siteLoc(parentScope, slotKey));
			}
			removeOnlyChildText(parentScope.block, domParent, cachedNode);
			return null;
		}
		if (cachedNode !== null) {
			renderText(parentScope.block, cachedNode, str);
			return cachedNode;
		}
		const hydration = hydrating ? CURSOR : null;
		if (hydration === null) {
			if (KEPT_TEXT_CONTENT !== null)
				clearKeptText(KEPT_TEXT_CONTENT, parentScope.block, domParent);
			const tn = document.createTextNode(str);
			const transaction = ROOT_RENDER_TRANSACTION;
			// A Block this render created builds fresh DOM: skip the frontier test.
			const parent =
				transaction !== null &&
				(parentScope.block.createdStamp !== transaction.createdStamp ||
					transaction.retainedCreated !== null) &&
				usesFrontier(parentScope.block, domParent)
					? queueFrontier(parentScope.block, domParent, null)
					: domParent;
			parent.appendChild(tn);
			return tn;
		}
		if (hydration.keepsServerContent(domParent)) return null;
		return hydration.htext(domParent, str, siteLoc(parentScope, slotKey));
	}
	// Object/function value (or already in slot mode, or text the server framed
	// slot content around on its first hydrating render): hand off to childSlot in
	// OWNS-PARENT mode (marker-elision M4) — the hole is the host's SOLE child,
	// which is exactly the ownerHost invariant, so component/element/array values
	// render with NO markers at all (M2's de-opt host regime; arrays still mint
	// their ForSlot pair lazily). On a pure-text → object switch, drop the
	// markerless text node first. While hydrating, the first render adopts the
	// server's `<!--[-->` range (ownsHost is ignored under hydration: server-pair
	// adoption wins, as in M2), or builds the value as a client mount would when
	// the server rendered text or nothing there.
	if (state === undefined && cachedNode !== null)
		removeOnlyChildText(parentScope.block, domParent, cachedNode);
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null && state === undefined)
		hydration.hydrateOnlyChild(parentScope, slotKey, domParent, value, (parent) =>
			childSlot(parentScope, slotKey, parent, value, null, false, parent as Element),
		);
	else childSlot(parentScope, slotKey, domParent, value, null, false, domParent as Element);
	const s = parentScope.slots[slotKey] as ChildSlot;
	return s.block === null && s.forSlot === null && s.hostNode === null ? s.text : null;
}
