// DOM access and native prototype initialization. Own the expandos shared by the renderer and its hydration cursor.
declare const process: { env: { NODE_ENV?: string } };

import { hydrating } from '../hydration-flag.js';
import type { HydrationFrameMarker } from '../runtime.js';

// ---------------------------------------------------------------------------
// DOM operations bootstrap (Svelte's operations.js technique, measured for
// octane on the js-framework / dbmon / news suites).
//
// Two independent tricks, both initialized lazily so importing the runtime in
// a DOM-less process (compiler tooling, node-only tests) stays safe:
//
// 1. `firstChild` / `nextSibling` reads on the runtime's SHARED helpers
//    (`child`, `sibling`, the hydration cursor walks, range clears) see every
//    DOM hidden class — element tags, Text, Comment — at ONE call site, so the
//    property access goes megamorphic. Calling the native accessor through a
//    cached function reference keeps those sites monomorphic: the C++ accessor
//    doesn't dispatch on the receiver's map. (Compiled template walks —
//    `_root.firstChild.nextSibling…` — stay raw property access on purpose:
//    each generated mount has its own per-template call sites, which V8 keeps
//    mono/polymorphic already.)
//
// 2. The runtime polls expando slots on nodes that mostly DON'T carry them —
//    `$o<type>` handler bundles + `$$portalParent` on every ancestor of every
//    delegated event, `$$portalEnd`/`$$deoptKey` in the de-opt child scans,
//    `$$ctrl`/`__oct_suppress` on form/hydration paths. A read of a property
//    the object does NOT have walks the whole prototype chain and cannot be
//    negatively cached as well as a hit. Pre-seeding the key as `undefined` on
//    the prototype turns every such miss into a fast constant proto hit.
//    Handler-slot keys are seeded per delegated event type at registration
//    (delegateEvents / delegateCaptureEvents), the fixed set here.
// ---------------------------------------------------------------------------

export let firstChildGetter: ((this: Node) => ChildNode | null) | undefined;

let nextSiblingGetter: ((this: Node) => ChildNode | null) | undefined;

export function getFirstChild(node: Node): ChildNode | null {
	// Fallback keeps DOM-less/uninitialized callers correct; the branch is a
	// single well-predicted check once initDomOperations has run.
	return firstChildGetter === undefined ? node.firstChild : firstChildGetter.call(node);
}

export function getNextSibling(node: Node): ChildNode | null {
	if (hydrating && node.nodeType === 8) {
		const span = (node as HydrationFrameMarker)[HYDRATION_FRAME];
		if (span !== undefined && !span.published && node.parentNode === null) {
			if (node === span.end) return span.after as ChildNode | null;
			return span.first as ChildNode | null;
		}
	}
	return nextSiblingGetter === undefined ? node.nextSibling : nextSiblingGetter.call(node);
}

/** Pre-seed one expando key on a prototype (see bootstrap comment, trick 2). */
export function seedExpando(proto: object, key: PropertyKey, enumerable = true): void {
	if (key in proto) return;
	if (enumerable) (proto as any)[key] = undefined;
	else Object.defineProperty(proto, key, { value: undefined, writable: true, configurable: true });
}

let domOperationsReady = false;

/**
 * One-time client bootstrap. Called from every cold entry that precedes DOM
 * work — parseTemplate (first template mount), root creation/hydration, and
 * delegation-target registration — and a no-op everywhere without a DOM.
 */
export function initDomOperations(): void {
	if (domOperationsReady || typeof Element === 'undefined') return;
	domOperationsReady = true;
	const nodeProto = Node.prototype;
	firstChildGetter = Object.getOwnPropertyDescriptor(nodeProto, 'firstChild')?.get;
	nextSiblingGetter = Object.getOwnPropertyDescriptor(nodeProto, 'nextSibling')?.get;
	const elementProto = Element.prototype;
	if (Object.isExtensible(elementProto)) {
		// Polled on every delegated event's ancestor walk.
		seedExpando(elementProto, '$$portalParent');
		// De-opt child scans poll these on every owned child.
		seedExpando(elementProto, '$$portalEnd');
		seedExpando(elementProto, '$$deoptKey');
		// Controlled-form and hydration-suppression checks.
		seedExpando(elementProto, '$$ctrl');
		seedExpando(elementProto, '__oct_suppress');
		// clone()/drainFrag() fragment-wrapper discriminants.
		seedExpando(elementProto, '__oct_frag');
		seedExpando(elementProto, '__oct_vfrag');
		// Raw HTML ownership is polled by dynamic child slots after the first raw host.
		// New private keys must not appear in for...in walks over DOM elements.
		seedExpando(elementProto, DANGER_HTML_ACTIVE, false);
		seedExpando(elementProto, DANGER_HTML_STATIC_CHILD, false);
		seedExpando(elementProto, DANGER_HTML_SPREAD_CHILD, false);
		// De-opt child scans and uncontrolled form baselines also read absent symbols.
		seedExpando(elementProto, DEOPT_DESC, false);
		seedExpando(elementProto, DEFAULT_VALUE_BASELINE, false);
		if (process.env.NODE_ENV !== 'production') {
			seedExpando(elementProto, '__oct_loc');
		}
	}
	// The de-opt/portal scans also poll Text and Comment children (both inherit
	// from CharacterData).
	if (typeof CharacterData !== 'undefined' && Object.isExtensible(CharacterData.prototype)) {
		seedExpando(CharacterData.prototype, '$$portalEnd');
		seedExpando(CharacterData.prototype, '$$deoptKey');
		seedExpando(CharacterData.prototype, DEOPT_DESC, false);
	}
}

// A client frame owns a logical server span until its containing slot commits.
// Only the new, detached markers refer to it: adopted server nodes never carry
// speculative navigation or queued DOM writes.
export const HYDRATION_FRAME = /* @__PURE__ */ Symbol();

export const DANGER_HTML_ACTIVE = '__oct_dangerHTML';

export const DANGER_HTML_STATIC_CHILD = '__oct_dangerChild';

export const DANGER_HTML_SPREAD_CHILD = '__oct_dangerSpreadChild';

/**
 * Compiler-only defaultValue binding for a statically-known input/textarea
 * with no value writer or spread. The element is necessarily uncontrolled, so
 * it needs neither a controlled-state record nor edit/composition listeners.
 */
export const DEFAULT_VALUE_BASELINE = Symbol('octane.defaultValue');

// The descriptor that last produced a de-opt host element is stashed on the element
// as a typed expando, so a re-render can diff props (patchDeoptProps) and match
// children by key against the live DOM — WITHOUT rebuilding, which would destroy
// DOM-resident state (input value, focus, selection, scroll, media). A direct
// property (not a WeakMap) keeps the per-child lookup in reconcileDeoptChildren cheap;
// `DeoptStamped` types it so there's no `any`. Absent on text/adopted server nodes.
export const DEOPT_DESC: unique symbol = Symbol('octane.deoptDesc');
