// Hydration cursor
//
// Adopting server DOM: the HydrationCapability cursor, server value differences
// and their diagnostics, the navigation helpers, and mismatch recovery.

import { useImpl, isHostContextRequest } from './context.js';
import { setHydrating } from '../hydration-flag.js';
import { domBindingClaims } from '../dom-binding-claims.js';
import {
	STREAM_BOUNDARY_ATTR,
	HYDRATION_START,
	SUSPENSE_SEED_WIRE_PREFIX,
	REJECTION_SENTINEL_KEY,
	HYDRATION_END,
	HYDRATION_TEXT_SEP,
} from '../constants.js';
import { unpatchedStatics, unpatchedHTML, takeUnpatchedValues } from '../hydration/dev-values.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { BINDING_OPEN_PREFIX, parseBindingMarker } from '../dom-binding-protocol.js';
import {
	HYDRATION_PROTOCOL_VERSION,
	BOUNDARY_STREAMED,
	SUSPENSE_RESOLVED_COMMENT,
	BOUNDARY_CONTENT,
	STREAM_SEED_COMMENT,
	STREAM_CATCH_COMMENT,
	NATIVE_SIGNAL_FRESH_COMMENT,
	BOUNDARY_CLIENT,
	BOUNDARY_CLIENT_CAUGHT,
	BOUNDARY_CLIENT_NATIVE,
	BOUNDARY_CATCH_GUARD,
	boundaryIdCount,
	parserNormalizedMatch,
	isRangeOpen,
} from '../hydration-protocol.js';
import { PORTAL_TAG } from '../runtime-tags.js';
import { isBlockOpen, isRendererStreamBoundaryTemplate } from '../stream-protocol.js';
import { setNativeAdoptionResolver, NativeAdoptionMiss } from '../signals/read-protocol.js';
import type { NativeAdoptionState } from '../signals/native-adoption.js';
import type {
	Scope,
	Block,
	ElementDescriptor,
	ChildSlot,
	TrySlot,
	RootContainer,
} from './types.js';
import {
	HOST_BODY,
	ELEMENT_DESCRIPTORS,
	installHydrationDriver,
	ROOT_RENDER_ROLLBACK,
} from './drivers.js';
import { renderBlock } from './signal-owners.js';
import {
	QUEUE,
	journalUndo,
	journalRootProperty,
	inRootHydrationAttempt,
	placeRun,
} from './engine.js';
import {
	type TrackedThenable,
	isSuspenseException,
	HYDRATION_SITE_EVENTS,
	type HydrationSeedArray,
	SEED_SITES,
	observeHydrationSeedThenable,
	useThenable,
} from './use.js';
import { clientRenderDehydratedTry } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	WIP_CAPTURE,
	preserveRootCreatedDom,
	renderInitialSuspenseHydration,
} from './render.js';
import { noteRecoverableHydrationError, isDocumentSingleton } from './roots.js';
import { isAdoptionControl } from './hydration-presentation.js';
import { isHostElementOfType, setCustomElementListener } from './host-props.js';
import { isElementDescriptor, isHostDescriptor } from './elements.js';
import { siteLoc, componentSourceLoc } from './diagnostics.js';
import { nodeAfter, atCommit, discardMarker, placeHydratedText, applyOutgoing } from './commit.js';
import {
	getFirstChild,
	getNextSibling,
	type LazyTemplateRecord,
	firstElementChild,
	rootWalkMisses,
	isLazyFragment,
	templateRootCount,
	lazyRootMatches,
	lazyFragmentRootMatches,
	resolveLazyTemplate,
	startsWithHost,
	ssrForMarkerState,
} from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ---------------------------------------------------------------------------
// Hydration VALUE differences, as in React. A server text that differs from the
// client's does not match the client render (HydrationMismatch), while the
// server's attributes, class, style and raw HTML are kept, never patched: their
// writers return while hydration adopts their element (HydrationCapability's
// adopts and adoptHTML). Development lists what
// differs in one warning per hydration pass (hydration/dev-values.ts), and
// production compares nothing.
// `suppressHydrationWarning` on the owning element (React's
// shallow semantics) keeps a differing server text and silences the attribute
// warning. It never keeps a structural difference.
// ---------------------------------------------------------------------------

/**
 * Has the owning element opted out of hydration-mismatch handling? The compiler stamps a
 * non-enumerable-ish `__oct_suppress` JS property (NOT a DOM attribute — it isn't
 * serialized) on elements written as `<el suppressHydrationWarning>`. Read in dev AND prod
 * because suppression keeps a differing server text, which otherwise does not match.
 */
function isHydrationSuppressed(el: Node | null): boolean {
	return el !== null && (el as any).__oct_suppress === true;
}

/**
 * Hydration diagnostics held while a hydrating try body renders. A body that
 * throws to its catch arm is replaced by that arm, so what it adopted before it
 * threw is discarded, and none of it is a mismatch. A body's held diagnostics
 * are dropped when it throws to its catch arm (see
 * HydrationCapability.renderTryBody); otherwise they pass to the enclosing hold,
 * and publish once the outermost one is released. The array is allocated only
 * when a diagnostic is held.
 */
let HYDRATION_DIAGNOSTIC_HOLDS = 0;
let HELD_HYDRATION_DIAGNOSTICS: Array<() => void> | null = null;

/**
 * Only-child text hosts that kept their server content under
 * suppressHydrationWarning (HydrationCapability.keepsServerContent). The
 * client's next text replaces all of it (childTextHole). Only hydration writes
 * it, so a client-only bundle reads it as null.
 */
export let KEPT_TEXT_CONTENT: WeakSet<Node> | null = null;

/** The client's text replaces `host`'s kept server content: remove it all. */
export function clearKeptTextContent(kept: WeakSet<Node>, host: Node): void {
	if (!kept.delete(host)) return;
	for (let child = getFirstChild(host); child !== null; child = getFirstChild(host))
		host.removeChild(child);
}

/**
 * The render error that is unwinding while a hydration runs, and the hydration
 * that was adopting server DOM where it was thrown: null for content built on
 * the client, such as a fallback owner's client render. The innermost
 * renderBlock it unwinds through records it (noteHydrationThrow), and a catch
 * arm, or the end of the outermost hydration, ends it (clearHydrationThrow).
 * React's throwException tells a hydrating thrower the same way: only an error
 * thrown while a hydration adopts fails that hydration (renderTryBody), and an
 * error from client-rendered content reaches a catch arm as in a client render.
 */
const NO_HYDRATION_THROW = {};
export let HYDRATION_THROWN: unknown = NO_HYDRATION_THROW;
let HYDRATION_THROWN_BY: HydrationCapability | null = null;

export function noteHydrationThrow(error: unknown, by: HydrationCapability | null): void {
	HYDRATION_THROWN = error;
	HYDRATION_THROWN_BY = by;
}

export function clearHydrationThrow(): void {
	HYDRATION_THROWN = NO_HYDRATION_THROW;
	HYDRATION_THROWN_BY = null;
}

/**
 * DEV-only: log a hydration-mismatch warning unless a try body holds it, then
 * wait for its root attempt's commit. An attempt that is rolled back is
 * retried, and the retry repeats the warning.
 */
function logHydrationMismatch(message: string): void {
	if (HYDRATION_PASS?.holds(() => logHydrationMismatch(message)) === true) return;
	if (HYDRATION_PASS?.awaitsCommit(() => console.error(message)) !== true) console.error(message);
}

/** DEV-only human-readable description of the server node at the cursor (for warnings). */
function describeHydrationNode(node: Node | null): string {
	if (node === null) return 'nothing';
	if (node.nodeType === 1) return `<${(node as Element).localName}>`;
	if (node.nodeType === 3) {
		const text = (node as Text).nodeValue;
		// An empty Text node stands for the server's empty text (newText).
		return text ? `text ${JSON.stringify(text)}` : 'nothing';
	}
	if (node.nodeType === 8) {
		if (isBlockOpen(node)) return 'a control-flow block';
		if (isBlockClose(node)) return 'the end of the parent block (fewer nodes than expected)';
		return 'a comment';
	}
	return 'a node';
}

/**
 * DEV-only STRUCTURAL hydration-mismatch warning (wrong tag / swapped branch / list shape /
 * component-vs-host). Callers pre-gate on `loc` truthiness so production pays no diagnostic
 * argument construction (describeHydrationNode etc.) — the internal `!loc` return stays as
 * defense-in-depth. The fallback the mismatch causes runs in dev AND prod regardless.
 * Returns the warning it logged.
 */
function warnHydrationStructuralMismatch(
	loc: string | undefined,
	expected: string,
	actual: string,
	log = true,
): string | undefined {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (!loc) return;
	const message =
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
		`rendered ${actual}. The nearest Suspense or Hydrate boundary, or the root, will be ` +
		`regenerated on the client.`;
	if (log) logHydrationMismatch(message);
	return message;
}

/**
 * DEV-only: React's one warning per hydration pass for the server attributes, static markup and
 * raw HTML that hydration kept where the client's differ, one line each. Nothing is patched, and
 * production compares none of them, so this never changes what hydration does.
 */
function warnHydrationUnpatched(lines: readonly string[]): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	logHydrationMismatch(
		`Octane hydration mismatch: a tree hydrated but some attributes of the server rendered ` +
			`HTML didn't match the client. This won't be patched up. If a difference is intentional ` +
			`(e.g. a timestamp or random id), add suppressHydrationWarning to the element.\n  ` +
			lines.join('\n  '),
	);
}

/**
 * Does the adopted server node match the template's shape? Node type and element tag decide,
 * in development and production alike: as in React, the server's attributes are kept rather
 * than compared, and a tag or node-type difference is a mismatch that falls back to the
 * client (HydrationMismatch). Development additionally warns about static differences.
 */
function hydrationNodeMatches(server: Node, template: Node): boolean {
	if (server.nodeType !== template.nodeType) return false;
	if (server.nodeType !== 1) return true;
	return (server as Element).localName === (template as Element).localName;
}

/**
 * Does the server node at the cursor match a nested fragment's FIRST logical
 * root? A leading template comment is a dynamic hole whose server form (text,
 * a marker range, or nothing) cannot decide a mismatch, as in fragmentRoots.
 * The first static element root after the leading `<!>` holes decides instead,
 * compared with the server node that the compiled walk reaches from the cursor
 * (HydrationCapability.sibling steps over each hole's server form). Otherwise
 * another fragment's server nodes would stand for this one's: a hole's slot
 * would take one of them as its anchor, and the static roots would never be
 * built. Matches when no static element root follows the leading holes, and
 * under a passthrough root (HydrationCapability.passthroughRoot). Development
 * also lists the static differences of the root it compared
 * (unpatchedStatics), which never change the match.
 */
function fragmentRootMatches(
	server: Node,
	fragment: Node,
	hydration: HydrationCapability,
	loc: string | undefined,
	partialStyles: string | undefined,
): boolean {
	let root: Node | null = getFirstChild(fragment)!;
	let at: Node | null = server;
	let holes = 0;
	if (root.nodeType === 8) {
		if (hydration.passthroughRoot) return true;
		for (; root !== null && root.nodeType === 8; holes++) root = getNextSibling(root);
		if (root === null || root.nodeType !== 1) return true;
		at = hydration.sibling(server, holes);
		if (at === null) return false;
	}
	if (!hydrationNodeMatches(at, root)) return false;
	if (process.env.NODE_ENV !== 'production')
		unpatchedStatics(hydration, at, root, loc, partialStyles, String(holes));
	return true;
}

// ---------------------------------------------------------------------------
// Hydration (SSR Phase 2). While a HydrationCapability is active, the compiled mount path ADOPTS the
// server-rendered DOM instead of cloning a fresh template: `clone()` returns the
// adopted server root, and `htext()` adopts the existing server text node rather
// than creating one. Element/attribute/event/ref bindings are unchanged — their
// template paths (`_root.firstChild.nextSibling…`) already align with the server
// DOM, because text lives INSIDE elements and so doesn't shift element siblings.
//
// Dead-code-elimination contract (mirrors Ripple/Svelte): the capability class is
// instantiated ONLY by `hydrateRoot()`. Retained client helpers dispatch through
// its methods; when `hydrateRoot` is unused the bundler can remove the class and
// every hydration-only helper reachable exclusively from those methods.
// ---------------------------------------------------------------------------
// The HYDRATION CURSOR (ported from Ripple's `hydrate_node`). While a capability is active,
// this points at the server-rendered node the next adopt operation should claim.
// `clone()` adopts the cursor as a template root; the compiler-emitted cursor
// walk (`child`/`sibling` — used only for templates that contain control-flow /
// component holes, whose server DOM no longer matches the raw template paths)
// advances it node-by-node; block functions (forBlock/ifBlock/componentSlot/…)
// adopt the server `<!--[-->`/`<!--]-->` markers off it. For hole-free leaf
// templates the cursor is just the adopted root and the old raw path-walk
// (`_root.firstChild.nextSibling…`) still resolves bindings correctly.
// Hidden server Activities serialize as empty ranges. Their client trees must
// mount only AFTER the server-rendered siblings finish hydrating: mounting one
// inline would consume root-local useId counters ahead of those siblings even
// though the server never visited the hidden tree. hydrateRoot drains this
// root-local queue at the end of its synchronous adoption pass with hydration
// suspended, still before returning the live Root.
// Server-resolved `use(thenable)` values (SSR Phase 4), parsed from the inline
// `<script data-octane-suspense>` in `hydrateRoot()` and consumed in render
// order by `useThenable` so a hydrating boundary returns synchronously. They are
// fields on the hydrateRoot-only capability, so client-only builds discard them.
// A compiled use() creation's seeded site (seedOrCreate) is hydration/use-seeds.ts,
// which only an app with such a site ships.
// Set while adopting a root when a matched range is physically wrapped by an
// exactly-adjacent marker pair. The post-hydration ownership walk can only
// remove comments in that shape, so roots without one skip the pass entirely.

/** A server text whose comparison waits for the pass's render-phase updates (keepsText). */
interface PendingHydrationText {
	server: string | null;
	loc: string | undefined;
	/** The text the client rendered last, which settleTexts compares. */
	text: string;
}

/** Write `text` into `node` at commit (HydrationCapability.writeText). */
function commitTextValue([node, text]: [Text, string]): void {
	node.nodeValue = text;
}

// Client-reachable code reads these only behind the `hydrating` flag
// (hydration-flag.ts), which is true exactly while HYDRATION_PASS is set. Only
// swapHydration and the pass's own depth changes (suspend, defer) write them.
/** The current hydration pass, also while a render suspends its adoption. */
export let HYDRATION_PASS: HydrationCapability | null = null;
/** The current pass while it adopts server DOM: null while a render suspends it. */
export let CURSOR: HydrationCapability | null = null;

/**
 * Make `next` the current hydration pass, keeping the `hydrating` flag in step,
 * and return the pass it replaces. Only hydration entry points and
 * HydrationCapability call it: a call from client-reachable code, even behind
 * a guard, would keep the flag and every guard in client-only bundles.
 */
export function swapHydration(next: HydrationCapability | null): HydrationCapability | null {
	if (next !== null) installHydrationDriver();
	const previous = HYDRATION_PASS;
	HYDRATION_PASS = next;
	CURSOR = next !== null && next.depth === 0 ? next : null;
	setHydrating(next !== null);
	return previous;
}

/** Direct-child scoped CSS resources are renderer-owned hydration sidecars. */
export function isRendererHydrationStyle(node: Node): boolean {
	return (
		node.nodeType === 1 &&
		(node as Element).localName === 'style' &&
		(node as Element).hasAttribute('data-octane')
	);
}

/** A hoisted Float stylesheet, script, or resource hint the server stamped for dedupe. */
function isFloatHeadResource(node: Node): boolean {
	if (node.nodeType !== 1) return false;
	const el = node as Element;
	const tag = el.localName;
	return (
		(tag === 'link' || tag === 'style' || tag === 'script') &&
		(el.hasAttribute('data-precedence') ||
			el.hasAttribute('data-oct-hint') ||
			el.hasAttribute('data-oct-res'))
	);
}

/**
 * Return the first body node of a hydrating root container. A body-only render
 * folds its hoisted metadata AHEAD of the body (`headChannel: 'fold'`, React's
 * resource-hoisting shape), so a container filled with the whole `html` starts
 * with that prefix. Each `<!--rnh-…-->` interval is a scope-owned head entry:
 * move it into the document head, where a split-head host places it and
 * headBlock adopts it, so the hydrated DOM matches a client render. Float
 * resources and hints are global and deduped document-wide. Like scoped-style
 * sidecars, they stay in place and the root claim skips them. ssrHeadEl frames
 * every entry as exactly `<!--rnh-K--><tag>…</tag><!--/rnh-K-->`; any other
 * shape ends the prefix, and the root adopts from there.
 */
/** Whether `node` is the comment naming this client's hydration protocol (hydrateRoot). */
export function isProtocolMark(node: Node): boolean {
	return node.nodeType === 8 && (node as Comment).data === HYDRATION_PROTOCOL_VERSION;
}

export function skipFoldedHeadPrefix(container: RootContainer, node: Node | null): Node | null {
	const head =
		container.nodeType === 9 ? null : (container as Element | DocumentFragment).ownerDocument.head;
	while (node !== null) {
		if (node.nodeType === 10 || isRendererHydrationStyle(node) || isFloatHeadResource(node)) {
			node = getNextSibling(node);
			continue;
		}
		const el = head !== null && node.nodeType === 8 ? getNextSibling(node) : null;
		const end = el === null ? null : getNextSibling(el);
		if (end === null || end.nodeType !== 8) return node;
		const key = (node as Comment).data;
		if (!key.startsWith('rnh-') || (end as Comment).data !== '/' + key) return node;
		const next = getNextSibling(end);
		head!.append(node, el!, end);
		node = next;
	}
	return null;
}

/** What a range's owner expects after its content, when the server rendered more (settle). */
export const END_OF_CONTENT = 'the end of its content';

/**
 * Development only: report where hydration probes the server DOM for a range
 * instead of knowing its shape (#2028), or falls back to adopting server nodes
 * outside a range of their own. `kind` names the probe or the fallback, and
 * `hit` whether a probe found a range. Tests install the reporter when
 * OCTANE_HYDRATION_PROBE_AUDIT is set (tests/_hydration-probe-audit.ts), and
 * read the call site from the stack. Production builds drop every call.
 */
export function auditHydrationProbe(kind: string, hit: boolean): void {
	const report = (globalThis as any).__OCTANE_HYDRATION_PROBE_AUDIT__;
	if (report) report(kind, hit);
}

/** A catch guard is either its own boundary or a binding view's primary arm. */
function isCatchGuardOpen(open: Node): boolean {
	const data = (open as Comment).data;
	if (data.startsWith(BOUNDARY_CATCH_GUARD)) return true;
	if (!data.startsWith(BINDING_OPEN_PREFIX)) return false;
	const binding = parseBindingMarker(data);
	return binding?.kind === 'try' && binding.arm === 0;
}

/** A caught guard records the primary's original IDs and positional seeds. */
function caughtGuardState(node: Node | null): string | null {
	const data = node?.nodeType === 8 ? (node as Comment).data : '';
	return data.startsWith(STREAM_CATCH_COMMENT + ':')
		? BOUNDARY_CLIENT + BOUNDARY_CLIENT_CAUGHT + data.slice(STREAM_CATCH_COMMENT.length + 1)
		: null;
}

const EVENT_CELL = Symbol();

interface EventCell {
	value: unknown;
	version: number;
	activation: number;
}

interface NativeEventStage {
	previous: NativeEventStage | undefined;
	active: boolean;
}

type EventCellGetter = (() => unknown) & { [EVENT_CELL]: EventCell };

function writableEventProperty(target: object, key: string): boolean {
	for (
		let current: object | null = target;
		current !== null;
		current = Object.getPrototypeOf(current)
	) {
		const property = Object.getOwnPropertyDescriptor(current, key);
		if (property !== undefined)
			return property.writable === true && (current === target || Object.isExtensible(target));
	}
	return Object.isExtensible(target);
}

function canPrepareEventCell(target: Element, key: string): boolean {
	const own = Object.getOwnPropertyDescriptor(target, key);
	if (own !== undefined)
		return (
			(own.get as EventCellGetter | undefined)?.[EVENT_CELL] !== undefined ||
			(own.configurable === true && own.writable === true)
		);
	return writableEventProperty(target, key);
}

function prepareEventCell(target: Element, key: string): EventCell {
	const own = Object.getOwnPropertyDescriptor(target, key);
	const existing = (own?.get as EventCellGetter | undefined)?.[EVENT_CELL];
	if (existing !== undefined) return existing;
	const initial = (target as any)[key];
	const cell: EventCell = { value: initial, version: 0, activation: 0 };
	const get = (() => cell.value) as EventCellGetter;
	get[EVENT_CELL] = cell;
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: own?.enumerable ?? true,
		get,
		set(value: unknown) {
			cell.version++;
			cell.value = value;
		},
	});
	(WIP_CAPTURE!.renderCleanups ??= []).push((discarded) => {
		const current = Object.getOwnPropertyDescriptor(target, key);
		if (current?.get !== get || current.configurable !== true) return;
		if (discarded && own === undefined && cell.value === initial) delete (target as any)[key];
		else
			Object.defineProperty(target, key, {
				configurable: own?.configurable ?? true,
				enumerable: own?.enumerable ?? true,
				writable: own?.writable ?? true,
				value: cell.value,
			});
	});
	return cell;
}

/**
 * Root-local hydration state and the dynamic dispatch boundary for hydration-only
 * code. The class is constructed only by hydrateRoot, so client-only bundles can
 * discard its methods together with the marker/mismatch/seed helper graph.
 */
export class HydrationCapability {
	depth = 0;
	recoverHostEvent: ((error: unknown) => void) | undefined;
	private nativeEventStages?: WeakMap<Element, Map<string, NativeEventStage>>;

	stageEvent(target: Element, key: string, handler: unknown): boolean {
		if (
			this.recoverHostEvent === undefined ||
			WIP_CAPTURE === null ||
			ROOT_RENDER_TRANSACTION === null ||
			!canPrepareEventCell(target, key) ||
			(key !== '$$signalOwner' && !canPrepareEventCell(target, '$$signalOwner'))
		)
			return false;
		const cell = prepareEventCell(target, key);
		const version = cell.version;
		(WIP_CAPTURE.hostEvents ??= []).push(() => {
			if (cell.version !== version) return;
			const previous = cell.value;
			const activation = ++cell.activation;
			cell.value = handler;
			return () => {
				if (cell.version !== version || cell.activation !== activation) return;
				cell.value = previous;
				cell.activation--;
			};
		});
		return true;
	}

	stageNativeEvent(target: Element, name: string, value: unknown): boolean {
		if (
			this.recoverHostEvent === undefined ||
			WIP_CAPTURE === null ||
			ROOT_RENDER_TRANSACTION === null
		)
			return false;
		let stages = this.nativeEventStages?.get(target);
		const previous = stages?.get(name);
		if (typeof value !== 'function' && previous === undefined) return false;
		if (stages === undefined) {
			stages = new Map();
			(this.nativeEventStages ??= new WeakMap()).set(target, stages);
		}
		const pending = stages;
		const stage: NativeEventStage = { previous, active: true };
		pending.set(name, stage);
		(WIP_CAPTURE.renderCleanups ??= []).push(() => {
			stage.active = false;
			if (pending.get(name) !== stage) return;
			let prior = previous;
			while (prior !== undefined && !prior.active) prior = prior.previous;
			if (prior === undefined) pending.delete(name);
			else pending.set(name, prior);
		});
		preserveRootCreatedDom(this.rootBlock);
		// Preserve native listener identity by waiting to register until acceptance.
		// This can reorder it relative to a third-party listener registered during render.
		function activateHydrationNativeEvent(): void {
			if (pending.get(name) === stage) setCustomElementListener(target, name, value);
		}
		activateHydrationNativeEvent.recover = this.recoverHostEvent;
		(WIP_CAPTURE.hostEvents ??= []).push(activateHydrationNativeEvent);
		return true;
	}
	/**
	 * Depth of a render that adopts nothing but still consumes positional seeds:
	 * the client render that continues after a deferred mismatch (adoptOrDefer).
	 */
	replayDepth = -1;
	seedCursor = 0;
	/** Pairs discovered while matching an outer range; released with this hydration pass. */
	private matchingCloses: WeakMap<Node, Comment> | null = null;
	/**
	 * The root's first top-level template has been adopted, or something else
	 * owns the root's content, so no later clone compares the root's roots.
	 */
	rootClaimed = false;
	readonly deferredActivities: Array<() => void> = [];
	/** Server texts compared once the pass's render-phase updates settle (keepsText). */
	pendingTexts: Map<Text, PendingHydrationText> | null = null;
	/**
	 * The first node of the adopted range whose claim is open (beginClaim),
	 * until the template that renders that range's content adopts it.
	 */
	claimFrom: Node | null = null;
	/** The Scope that owns that range, whose template is the range's content (claimRoots). */
	claimOwner: Scope | null = null;
	/**
	 * The first node after that template's roots, which the range's content
	 * does not claim. Undefined until the template adopts claimFrom.
	 */
	claimEnd: Node | null | undefined = undefined;
	/**
	 * Whether a template's adoption may defer the mismatch it finds
	 * (adoptOrDefer): set by an owner that discards an attempt that suspends and
	 * starts the next one afresh.
	 */
	defers = false;
	/** Whether a template adoption is running (adoptOrDefer). */
	adopting = false;
	/** The mismatch a template's adoption deferred; the attempt renders on the client meanwhile. */
	deferred: HydrationMismatch | null = null;
	/** Whether the client render since `deferred` started a template with a host (claimBefore). */
	deferredHost = false;
	/** Skip component-frame adoption until the declared container owner. */
	passthroughRanges = false;
	/**
	 * The root is a HYDRATION_RANGE_BOUNDARY passthrough root. Its owner adopts
	 * the first server range in the container, so the owner's content can sit
	 * one range level off its server nodes: a nested fragment's static roots
	 * need not follow the server forms of its leading holes there.
	 */
	passthroughRoot = false;
	/**
	 * A de-opt item's slot that borrows the item's server range, whose first
	 * render has yet to claim it (deoptItemBody).
	 */
	lentSlot: ChildSlot | null = null;
	nativeAdoption?: NativeAdoptionState;
	retryPresentation?: () => void;
	presentation?: boolean;
	/** The island's first ID, which a discarded attempt's retry starts from again. */
	idStart = 0;
	/**
	 * Restores the outcomes that this attempt's seeds wrote to thenables, newest
	 * last. A fallback renders from client data, so it discards them
	 * (discardSeeds).
	 */
	seeded: (() => void)[] | null = null;

	constructor(
		public rootBlock: Block,
		public node: Node | null,
		public seeds: unknown[] | null,
	) {
		initialSuspenseHydrationRenderer = renderInitialSuspenseHydration;
	}

	/**
	 * Whether `publish`, a hydration diagnostic, waits for the commit of a root's
	 * hydrating attempt. A method, like `holds`, so that bundles which never
	 * hydrate do not retain it.
	 */
	awaitsCommit(publish: () => void): boolean {
		if (!inRootHydrationAttempt()) return false;
		ROOT_RENDER_TRANSACTION!.ops.push(publish, null);
		return true;
	}

	consumesSeeds(): boolean {
		return this.depth === 0 || this.depth === this.replayDepth;
	}

	/**
	 * Whether `block` renders under this hydration: it descends from the root
	 * block, and not from a block that a hydrating update built (renderUpdate).
	 */
	owns(block: Block): boolean {
		for (let current: Block | null = block; current !== null; current = current.parentBlock)
			if (current === this.rootBlock) return true;
		return false;
	}

	suspend<T>(fn: () => T): T {
		this.depth++;
		const cursor = CURSOR;
		if (cursor === this) CURSOR = null;
		const previousNative = setNativeAdoptionResolver(null);
		try {
			return fn();
		} finally {
			setNativeAdoptionResolver(previousNative);
			this.depth--;
			CURSOR = cursor;
		}
	}

	/**
	 * Render `block`, which an update created in place of content its slot had
	 * already rendered. The server never rendered it, and the cursor belongs to
	 * other slots' server nodes, so it builds on the client without moving the
	 * cursor. A method, so that the callback stays out of callers' frames.
	 */
	renderUpdate(block: Block): void {
		this.suspend(() => renderBlock(block));
	}

	/**
	 * Hold a diagnostic's `publish` when a try body holds diagnostics. A method,
	 * so that bundles which never hydrate do not retain the hold.
	 */
	holds(publish: () => void): boolean {
		if (HYDRATION_DIAGNOSTIC_HOLDS === 0) return false;
		(HELD_HYDRATION_DIAGNOSTICS ??= []).push(publish);
		return true;
	}

	/**
	 * Render a hydrating try body under a diagnostic hold. When the boundary
	 * `catches` and the body throws an application error, the catch arm
	 * replaces the region, so the hold drops what the body reported.
	 *
	 * An error thrown while this hydration adopted the body's server DOM
	 * (HYDRATION_THROWN), where the server's body did not throw (it would have
	 * marked its Suspense boundary for a client render instead), fails the
	 * hydration of the nearest fallback owner, as React's does, even though the
	 * catch arm would catch it. That owner renders on the client, where a
	 * repeated throw reaches the catch arm.
	 */
	renderTryBody(block: Block, catches: boolean): void {
		const mark = holdDiagnostics();
		const texts = this.pendingTexts === null ? 0 : this.pendingTexts.size;
		let caught = false;
		try {
			renderBlock(block);
		} catch (error) {
			caught =
				catches &&
				!isHostContextRequest(error) &&
				!isSuspenseException(error) &&
				!isAdoptionControl(error);
			if (caught && this.deferred !== null) {
				// A deferred mismatch's diagnostic is not the catch arm's to drop.
				caught = false;
				clearHydrationThrow();
				throw hydrationFailure(this, error);
			}
			const failure = caught ? thrownWhileAdopting(this, error) : null;
			if (failure !== null) throw failure;
			throw error;
		} finally {
			releaseDiagnostics(mark, caught);
			// The catch arm's commit discards the body's server texts: none compares.
			const pending = this.pendingTexts;
			if (caught && pending !== null && pending.size > texts) {
				let i = 0;
				for (const node of pending.keys()) if (i++ >= texts) pending.delete(node);
			}
		}
	}

	/**
	 * Open a claim on the server range a slot adopted, whose content starts at
	 * `first`, for the first render of that content. Returns what endClaim
	 * restores. Claims nest: a range's content adopts its template before the
	 * slots inside it render, so an enclosing claim is settled by then, or no
	 * template will settle it, and only its record needs restoring.
	 */
	beginClaim(first: Node | null, owner: Scope): Node | null | undefined {
		const outer = this.claimEnd;
		this.claimFrom = first;
		this.claimOwner = owner;
		this.claimEnd = undefined;
		return outer;
	}

	/**
	 * Close the open claim, restoring `outer` from beginClaim. Returns the first
	 * node after the roots of the template that adopted the range's first node,
	 * or undefined when no template did (claimRoots).
	 */
	endClaim(outer: Node | null | undefined): Node | null | undefined {
		const from = this.claimEnd;
		this.claimFrom = null;
		this.claimEnd = outer;
		return from;
	}

	/**
	 * First render of a component into the server range it adopted, `block`'s
	 * own: its component frame, or the range of a renderable hole or list item
	 * whose value it is. The server may have rendered another component there,
	 * or more from this one, whose content starts with what the client renders:
	 * anything left after the client's content is a mismatch (settleClaim).
	 */
	renderClaimed(block: Block, scope: Scope, slotKey: number): void {
		const outer = this.beginClaim(getNextSibling(block.startMarker!), block);
		let from: Node | null | undefined;
		try {
			renderBlock(block);
		} finally {
			from = this.endClaim(outer);
		}
		if (!block.disposed) this.settleClaim(block, block.endMarker!, from, scope, slotKey);
	}

	/**
	 * After `owner` first rendered its content into an adopted server range
	 * that ends at `end`, server content left after it, from `from` (endClaim),
	 * is content the client renders nothing for: a mismatch. When no template
	 * adopted the range's first node, the content is the owner's slots, and the
	 * last one left the cursor past its range. A cursor on `end` means nothing
	 * is left, and anything less certain is left in place. The slot at `scope`'s `slotKey` owns the
	 * range.
	 */
	settleClaim(
		owner: Scope,
		end: Node,
		from: Node | null | undefined,
		scope: Scope,
		slotKey: number,
	): void {
		const cursor = this.node;
		if (cursor === end) return;
		if (from === undefined) {
			// The cursor must follow the last slot's own range: an adopted lite
			// call's stand-in ends at its close. After any other slot, the cursor
			// proves nothing.
			const slots = owner.slots;
			const last = slots[slots.length - 1];
			const lastEnd: Node | null | undefined =
				last?.borrowed || last?.inherited ? null : (last?.end ?? last?.block?.endMarker);
			if (lastEnd == null || getNextSibling(lastEnd) !== cursor) return;
			from = cursor;
		}
		this.settle(end, scope, slotKey, from);
	}

	/**
	 * After the owner of an adopted server range that ends at `end` first
	 * rendered its content, which ends at `from` (the cursor, by default),
	 * server content left before `end` is content the client renders nothing
	 * for: a mismatch. A `from` outside the range, in content the client built
	 * or a tail past `end`, proves nothing and is left in place. The slot at
	 * `scope`'s `slotKey` owns the range.
	 */
	settle(end: Node, scope: Scope, slotKey = -1, from: Node | null | undefined = this.node): void {
		if (from == null || from === end) return;
		for (let node: Node | null = from; node !== end; node = getNextSibling(node)) {
			if (node === null) return;
		}
		this.fail(
			process.env.NODE_ENV !== 'production'
				? // A return slot or a list item has no site of its own: name the
					// returning component, else the list's host.
					siteLoc(scope, slotKey) ||
						componentSourceLoc(scope.block.body) ||
						(end.parentNode as any).__oct_loc
				: undefined,
			() => END_OF_CONTENT,
			from,
		);
	}

	/**
	 * A slot of `scope` at `slotKey` found no server range of its own where it
	 * hydrates, but `actual`, which the server rendered for something else.
	 */
	failAt(scope: Scope, slotKey: number, expected: string, actual: Node | null): never {
		this.fail(
			process.env.NODE_ENV !== 'production' ? siteLoc(scope, slotKey) || undefined : undefined,
			() => expected,
			actual,
		);
	}

	/**
	 * The renderer-owned marker leading a streamed boundary: its pending template
	 * sentinel, a revealed catch comment, or null for ordinary revealed content.
	 * A method so client-only bundles drop the stream-protocol validator.
	 */
	streamedArmMarker(open: Node): Element | Comment | null {
		let marker = getNextSibling(open);
		if (marker?.nodeType === 1)
			return isRendererStreamBoundaryTemplate(marker as Element) ? (marker as Element) : null;
		// A binding view keeps the stream's seed-scope comment before its content.
		if (marker?.nodeType === 8 && (marker as Comment).data.startsWith(STREAM_SEED_COMMENT))
			marker = getNextSibling(marker);
		return marker?.nodeType === 8 && (marker as Comment).data === STREAM_CATCH_COMMENT
			? (marker as Comment)
			: null;
	}

	/**
	 * Render `state`, a boundary the server left to the client, as a dehydrated
	 * boundary, and report one whose server render threw (`errored`) or
	 * suspended unless a catch arm caught an error in that render
	 * (claimClientArm). A method, so client code never names the flag setters
	 * that render calls.
	 */
	clientRender(state: TrySlot, errored: boolean | null): void {
		if (!clientRenderDehydratedTry(state, this) && errored !== null)
			noteRecoverableHydrationError(
				() => new Error(errored ? formatClientError(347) : formatClientError(341)),
				state.parentBlock,
			);
	}

	/**
	 * The range a boundary's body adopts on its first render, from `open` to
	 * `end`: the boundary's own, since the server renders a boundary's content
	 * directly inside its one range (hydration-protocol.ts). The body borrows it,
	 * and the first arm that shows beside the body bounds it (mountPendingBody).
	 * A presentation-binding view's arm keeps the range of its own that opens at
	 * `first` (bindingTryState).
	 */
	armRange(open: Node, first: Node | null, end: Node): readonly [Node, Node] {
		return (open as Comment).data.startsWith(BINDING_OPEN_PREFIX) && this.isOpen(first)
			? [first, this.close(first)]
			: [open, end];
	}

	/** Adopt a primary arm, claiming any guard on its pending descendants at commit. */
	beginTryArm(open: Node, end: Node): readonly [Node, Node] {
		let first = getNextSibling(open);
		if (
			first?.nodeType === 1 &&
			isCatchGuardOpen(open) &&
			isRendererStreamBoundaryTemplate(first as Element)
		) {
			const sentinel = first;
			first = getNextSibling(sentinel);
			// A discarded attempt leaves the server's ability to replace this arm.
			atCommit(discardMarker, sentinel);
		}
		const range = this.armRange(open, first, end);
		this.node = range[0] === open ? first : getNextSibling(range[0]);
		return range;
	}

	/**
	 * What a presentation-binding view's `@try` range holds, spelled as a
	 * boundary's open (hydration-protocol.ts), or null for any other range.
	 * The view keeps its own shape: its open records the arm, the node after
	 * the open may say what the server rendered, and the arm has a range of its
	 * own (armRange).
	 */
	bindingTryState(open: Node): string | null {
		if (!(open as Comment).data.startsWith(BINDING_OPEN_PREFIX)) return null;
		const lead = getNextSibling(open);
		if (lead?.nodeType === 1) {
			const sentinel = lead as Element;
			return isRendererStreamBoundaryTemplate(sentinel) && !isCatchGuardOpen(open)
				? BOUNDARY_STREAMED + sentinel.getAttribute(STREAM_BOUNDARY_ATTR)
				: HYDRATION_START;
		}
		const data = lead?.nodeType === 8 ? (lead as Comment).data : '';
		if (data.startsWith(SUSPENSE_RESOLVED_COMMENT))
			return BOUNDARY_CONTENT + data.slice(SUSPENSE_RESOLVED_COMMENT.length);
		if (data.startsWith(STREAM_SEED_COMMENT))
			return (
				caughtGuardState(getNextSibling(lead!)) ??
				BOUNDARY_STREAMED + data.slice(STREAM_SEED_COMMENT.length)
			);
		const caught = caughtGuardState(lead);
		if (caught !== null) return caught;
		if (data.startsWith(NATIVE_SIGNAL_FRESH_COMMENT))
			return (
				BOUNDARY_CLIENT + BOUNDARY_CLIENT_NATIVE + data.slice(NATIVE_SIGNAL_FRESH_COMMENT.length)
			);
		return HYDRATION_START;
	}

	/** Claim a boundary's first-render state, including a replaced guard's seed span. */
	clientTryState(open: Node): string {
		const binding = this.bindingTryState(open);
		const data = (open as Comment).data;
		const state =
			binding ??
			(data.startsWith(BOUNDARY_CATCH_GUARD)
				? (caughtGuardState(getNextSibling(open)) ?? data)
				: data);
		if (
			state.startsWith(BOUNDARY_CLIENT) &&
			state.charAt(BOUNDARY_CLIENT.length) === BOUNDARY_CLIENT_CAUGHT
		) {
			const separator = state.indexOf(':', BOUNDARY_CLIENT.length + 1);
			if (separator !== -1) {
				const ids = state.slice(0, separator);
				const seeds = boundaryIdCount(BOUNDARY_CONTENT + state.slice(separator + 1));
				if (boundaryIdCount(ids) >= 0 && seeds >= 0) {
					// The replaced primary's positional seeds still precede the next
					// sibling's in this hydration scope, but no client will consume them.
					this.seedCursor += seeds;
					return ids;
				}
			}
		}
		return state;
	}

	/**
	 * The client rebuilt this slot's arm, adopting nothing inside it. Park the
	 * cursor past its end, where the next sibling's server content starts, as
	 * the boundary itself does after it renders.
	 */
	rebuiltSlot(end: Node): void {
		this.node = getNextSibling(end);
	}

	isOpen(node: Node | null): node is Comment {
		const open = isBlockOpen(node);
		if (process.env.NODE_ENV !== 'production') auditHydrationProbe('isOpen', open);
		return open;
	}

	isClose(node: Node | null): node is Comment {
		return isBlockClose(node);
	}

	close(open: Node): Comment {
		const known = this.matchingCloses?.get(open);
		return known ?? findMatchingClose(open, (this.matchingCloses ??= new WeakMap<Node, Comment>()));
	}

	/**
	 * Adopt the text of a binding-view text hole whose server range `posNode`
	 * opens: the range's one text node, or a new one when the server rendered it
	 * empty. The text compares as any server text does (keepsText). Any other
	 * range content does not match the template. Null when `posNode` opens no
	 * range, so bindingText builds one.
	 */
	adoptBindingText(posNode: Node | null, text: string): Text | null {
		const open = isBlockOpen(posNode);
		if (process.env.NODE_ENV !== 'production') auditHydrationProbe('bindingTextOpen', open);
		if (!open) return null;
		const close = this.close(posNode);
		const existing = getNextSibling(posNode);
		const host = posNode.parentNode;
		if (existing !== close && existing?.nodeType === 3 && getNextSibling(existing) === close) {
			const server = existing.nodeValue;
			if (!this.keepsText(host, existing, server, text, (host as any)?.__oct_loc))
				existing.nodeValue = text;
			return existing as Text;
		}
		if (existing !== close) throw new TypeError(formatClientError(72));
		// An empty range is the server's empty text.
		const node = this.newText(host, text, (host as any)?.__oct_loc);
		atCommit(placeHydratedText, [close.parentNode!, node, close, false]);
		return node;
	}

	/**
	 * The new Text node for the client's `text` where the server rendered no
	 * text in `host`, its form of empty text: an empty node, which stands for
	 * the server's and compares as any server text does (keepsText), and takes
	 * the client's text where that is written. The caller inserts it.
	 */
	newText(host: Node | null, text: string, loc: string | undefined): Text {
		const created = document.createTextNode('');
		if (!this.keepsText(host, created, '', text, loc)) created.nodeValue = text;
		return created;
	}

	/**
	 * The open marker of the server range a slot adopts on its first render: at
	 * `anchor`, where its compiled walk found the slot's placeholder, or, for an
	 * appended slot or the sole slot of a range, at the cursor in `domParent`.
	 * The server frames every slot (protocol 3), so null is a structural
	 * mismatch unless the slot renders in a range the client built.
	 */
	resolveOpen(anchor: Node | null | undefined, domParent: Node): Comment | null {
		if (isBlockOpen(anchor ?? null)) return anchor as Comment;
		const cursor = cursorIn(this, domParent);
		return isBlockOpen(cursor) ? cursor : null;
	}

	/**
	 * The open marker of the server range that a component call of `scope` at
	 * `slotKey` adopts as its frame on its first render: at `anchor`, or, for an
	 * appended call or the sole hole of an arm, at the cursor. The server frames
	 * every call that does not inherit its parent's range (protocol 3), so
	 * anything else is a structural mismatch. React runs the call's body before
	 * it hydrates the host that body renders, so where a template's mismatch
	 * would defer (adoptOrDefer), this one does too: null, and the call renders
	 * on the client, into detached DOM.
	 */
	callOpen(anchor: Node | null, domParent: Node, scope: Scope, slotKey: number): Comment | null {
		const open = this.resolveOpen(anchor, domParent);
		if (open !== null) return open;
		const actual =
			anchor !== null && anchor !== scope.block.endMarker ? anchor : cursorIn(this, domParent);
		if (!this.defers) this.failAt(scope, slotKey, 'a component range', actual);
		this.adopting = true;
		try {
			this.failAt(scope, slotKey, 'a component range', actual);
		} catch (error) {
			defer(this, error as HydrationMismatch, false);
			return null;
		} finally {
			this.adopting = false;
		}
	}

	/**
	 * The open marker of the server range that an `@if`/`@switch` slot or a
	 * `@try`/ErrorBoundary boundary of `scope` adopts on its first render at
	 * `anchor`, as resolveOpen finds it. The server frames every such slot, so
	 * a missing range means the server rendered something else there, such as
	 * another arm of an enclosing `@if`. A range the client builds renders with
	 * hydration suspended, and asks nothing.
	 */
	branchOpen(anchor: Node | null, domParent: Node, scope: Scope, slotKey: number): Comment {
		const open = this.resolveOpen(anchor, domParent);
		if (open !== null) return open;
		this.failAt(
			scope,
			slotKey,
			'a branch range',
			anchor !== null && anchor !== scope.block.endMarker ? anchor : this.node,
		);
	}

	markerState(node: Node): -1 | 0 | 1 {
		return ssrForMarkerState(node);
	}

	/**
	 * The server DOM at the cursor does not match the client render. Nothing is
	 * repaired here: the nearest fallback owner discards its server DOM and
	 * renders on the client (see HydrationMismatch), as React does.
	 */
	fail(loc: string | undefined, expected: () => string, actual: Node | null): never {
		// A deferred mismatch comes first in React's order: it is the one reported.
		if (this.deferred !== null && !this.adopting) claimDeferred(this);
		const error = new HydrationMismatch();
		if (process.env.NODE_ENV !== 'production') {
			// A mismatch that a template's adoption defers is reported only when the
			// render reaches it (claimDeferred).
			const message = warnHydrationStructuralMismatch(
				loc || componentSourceLoc(CURRENT_BLOCK?.body) || CURRENT_SCOPE?.locFile,
				expected(),
				describeHydrationNode(actual),
				!this.adopting,
			);
			if (this.adopting) error.warning = message;
			// A root's attempt publishes its diagnostics when it commits, which this
			// mismatch prevents if the root is what falls back (hydrateRoot).
			if (inRootHydrationAttempt()) error.diagnostic = message;
		}
		throw error;
	}

	/**
	 * Before a child slot's first hydrating render of the server range
	 * `start`…`end`, which it adopted or was lent, check that `value` can adopt
	 * what the range holds. A host descriptor serializes as exactly one element
	 * of its tag. A list (`list`, from prepareDeoptList) frames or self-delimits
	 * each of its items, so it neither leaves the range empty nor opens it with
	 * text, unless it has no items, and then the range is empty. A portal does
	 * not open it with text either. Anything else is server content the client
	 * cannot adopt: what the server rendered for another value, or invalid
	 * nesting that the HTML parser repaired (`<p><div></div></p>` arrives as
	 * `<p></p><div></div><p></p>`, all inside the range). Items that render
	 * nothing differ from an empty range only in the frames the server would
	 * have given them: returns true for those, and the caller builds them in
	 * the range as a client mount would.
	 */
	claimRange(
		scope: Scope,
		slotKey: number,
		start: Node,
		end: Node,
		value: unknown,
		list: { items: readonly unknown[] } | null,
	): boolean {
		// Only a bundle with a host descriptor factory can hold one.
		const type = HOST_BODY && list === null && isHostDescriptor(value) ? value.type : null;
		// Other values, such as a component or text, check what they adopt as
		// they render.
		if (type === null && list === null && (value as any)?.$$kind !== PORTAL_TAG) return false;
		const first = getNextSibling(start)!;
		const matches =
			type !== null &&
			first !== end &&
			first.nodeType === 1 &&
			isHostElementOfType(first as Element, type);
		if (
			type !== null
				? matches && getNextSibling(first) === end
				: list !== null && first === end
					? list.items.length === 0
					: first.nodeType !== 3 && list?.items.length !== 0
		)
			return false;
		if (
			list !== null &&
			first === end &&
			!list.items.some((item) => item != null && typeof item !== 'boolean' && item !== '')
		) {
			this.node = end;
			return true;
		}
		this.fail(
			process.env.NODE_ENV !== 'production'
				? // A return slot or a list item has no site of its own: name the
					// returning component, else the list's host.
					siteLoc(scope, slotKey) ||
						componentSourceLoc(scope.block.body) ||
						(end.parentNode as any)?.__oct_loc
				: undefined,
			() =>
				type !== null
					? matches
						? `the end of <${type}>`
						: `<${type}>`
					: list?.items.length === 0
						? 'nothing'
						: list !== null
							? 'a renderable list range'
							: 'a portal',
			matches ? getNextSibling(first) : first === end ? null : first,
		);
	}

	/**
	 * A child slot's first hydrating render without a server range of its own,
	 * such as a return slot's when its component's range holds server text. A
	 * list, a fragment, a keyed or lone element, and a portal never serialize as
	 * bare text, so a lone text node before `end` in `parent` is what the server
	 * rendered for a primitive, which the value cannot adopt: a mismatch.
	 */
	rejectServerText(
		scope: Scope,
		slotKey: number,
		parent: Node,
		end: Node | null,
		value: unknown,
		list: boolean,
	): void {
		const text = this.node;
		if (
			text === null ||
			text.nodeType !== 3 ||
			!(list || (value as any)?.$$kind === PORTAL_TAG || (HOST_BODY && isHostDescriptor(value))) ||
			text.parentNode !== parent ||
			getNextSibling(text) !== end
		)
			return;
		this.fail(
			process.env.NODE_ENV !== 'production'
				? siteLoc(scope, slotKey) ||
						componentSourceLoc(scope.block.body) ||
						(parent as any).__oct_loc
				: undefined,
			() =>
				list
					? 'a renderable list range'
					: (value as any).$$kind === PORTAL_TAG
						? 'a portal'
						: `<${(value as ElementDescriptor).type as string}>`,
			text,
		);
	}

	/**
	 * Whether a hydrating update of `slot`, whose list exists, builds that list
	 * on the client. It adopts the server's items instead, and when it kept
	 * none, as after a fill that threw, its first fill starts over from the
	 * first of them.
	 */
	buildsList(slot: ChildSlot): boolean {
		const list = slot.forSlot!;
		if (list.size === 0 && !(this.passthroughRanges && slot.borrowed) && this.isOpen(list.start))
			this.node = getNextSibling(list.start);
		return false;
	}

	/**
	 * A slot of `parent` claimed the server range that `close` ends. Step the
	 * cursor past it to the next sibling's server content. A parent that the
	 * slot's render disposed, as a cleanup error an ancestor boundary caught
	 * does, owns no server content any more: the cursor stays where that
	 * boundary left it.
	 */
	parkPast(close: Node, parent: Scope): void {
		if (!parent.block.disposed) this.node = nodeAfter(close);
	}

	/**
	 * First render of an @if or @switch arm into the server range it adopted,
	 * `block`'s own. The cursor ends after what the arm adopted: past the roots
	 * of its own template (claimRoots), or past the range its last slot claimed.
	 */
	renderAdoptedArm(block: Block): void {
		const outerClaim = this.beginClaim(getNextSibling(block.startMarker!), block);
		let claimed: Node | null | undefined;
		try {
			renderBlock(block);
		} finally {
			claimed = this.endClaim(outerClaim);
		}
		if (claimed != null) this.node = claimed;
	}

	/**
	 * Whether the server's text `server` stays where the client renders `text`
	 * in `host`, at `node`, the server's Text node, or the empty one that
	 * stands for the server's empty text where it rendered none (newText). It
	 * does when the two are equal once the HTML parser's normalization is
	 * undone, and under the host's suppressHydrationWarning, as in React. False
	 * when the client's text is written instead: in a host the client built,
	 * which holds the client template, and in a `<textarea>`, whose text is its
	 * default value, which React sets to the client's. Any other difference
	 * does not match the client render. Unless a render-phase update renders
	 * the text again before the pass ends: React renders a component that
	 * updates itself while it renders again before it compares the output, so
	 * the text that render settles on decides, equal or not (settleTexts).
	 * Meanwhile the node keeps the server's text, and the record the client's
	 * (writeText). A method, so that bundles which never hydrate do not retain
	 * it.
	 */
	keepsText(
		host: Node | null,
		node: Node | null,
		server: string | null,
		text: string,
		loc: string | undefined,
	): boolean {
		const equal = server === text || parserNormalizedMatch(server, text);
		if (!equal) {
			if (host !== null && host.nodeType === 1 && (host as Element).localName === 'textarea')
				return false;
			if (isHydrationSuppressed(host)) return true;
		}
		// Every block with an update queued is in the queue, so an empty one spares
		// the common pass rendersAgain's walk.
		if (QUEUE.length !== 0 && node !== null && node.nodeType === 3 && rendersAgain(this)) {
			const pending = (this.pendingTexts ??= new Map());
			if (!pending.has(node as Text)) pending.set(node as Text, { server, loc, text });
			return true;
		}
		if (equal) return true;
		this.fail(
			loc || (host as any)?.__oct_loc,
			() => (text === '' ? 'nothing' : `text ${JSON.stringify(text)}`),
			node,
		);
	}

	/**
	 * Runs before the first hydrating render of a text or empty value `str` in a
	 * child slot that adopted the server's `<!--[-->…<!--]-->` range. The value
	 * serializes as at most one text node there, which the slot adopts when it
	 * leads the range. Anything else in the range is server content the client
	 * cannot adopt, such as an element or component the server rendered for a
	 * value the client renders as text or nothing: a mismatch, as claimRange
	 * finds for a host descriptor.
	 */
	settleTextRange(scope: Scope, slotKey: number, state: ChildSlot, str: string): void {
		const first = getNextSibling(state.start!)!;
		if (str !== '' && first.nodeType === 3)
			this.settle(state.end!, scope, slotKey, getNextSibling(first));
		else if (first !== state.end)
			this.fail(
				process.env.NODE_ENV !== 'production' ? siteLoc(scope, slotKey) : undefined,
				() => (str === '' ? 'nothing' : `text ${JSON.stringify(str)}`),
				first,
			);
	}

	useSeed<T>(
		thenable: TrackedThenable<T>,
		state: TrackedThenable<any>[],
		index: number,
		replaceOnResume: boolean,
	): T {
		// A compiled site's thenable whose seed is not the next one renders what
		// its factory makes instead (hydration/use-seeds.ts).
		const factory = SEED_SITES ? SEED_SITES.factoryOf(thenable) : undefined;
		if (factory !== undefined && factory.index !== this.seedCursor) {
			// useThenable allocated the record before seeding this call.
			CURRENT_BLOCK!.rare!.thenableIdx = index;
			const usable = SEED_SITES!.materialize(factory);
			if (
				replaceOnResume &&
				usable !== null &&
				usable !== undefined &&
				typeof (usable as PromiseLike<T>).then === 'function'
			) {
				return useThenable(usable as TrackedThenable<T>, true);
			}
			return useImpl(usable as PromiseLike<T>) as T;
		}

		const seed = this.seeds![this.seedCursor++];
		if (factory === undefined) observeHydrationSeedThenable(thenable);
		else factory.factory = null;
		const { status, value: previous, reason } = thenable;
		const restore = () => {
			thenable.status = status;
			thenable.value = previous;
			thenable.reason = reason;
		};
		(this.seeded ??= []).push(restore);
		// A root attempt that is discarded, by a suspension or a fallback,
		// restores it too.
		if (
			ROOT_RENDER_TRANSACTION !== null &&
			ROOT_RENDER_TRANSACTION.hydrating === true &&
			!ROOT_RENDER_TRANSACTION.aborted &&
			!ROOT_RENDER_ROLLBACK
		)
			journalUndo(restore);
		const value = seed as T;
		thenable.status = 'fulfilled';
		thenable.value = value;
		state[index] = thenable;
		return value;
	}

	/**
	 * Hydrating, `el`'s server children differ from its de-opt children: the
	 * server rendered no node where they render `child`, or `extra`, a server
	 * child none of them adopted, is content the client renders nothing for.
	 * As React does, the nearest fallback owner renders on the client. An
	 * element the client built holds client children only, and the parser
	 * keeps a `<noscript>`'s server content as text, which React never
	 * hydrates. A method, so that bundles which never hydrate do not retain it.
	 */
	deoptMismatch(el: Element, child: unknown, extra: Node | null = null): void {
		if (this.depth !== 0 || el.localName === 'noscript') return;
		this.fail(
			process.env.NODE_ENV !== 'production' ? (el as any).__oct_loc : undefined,
			() =>
				extra !== null
					? `the end of <${el.localName}>`
					: isHostDescriptor(child)
						? `<${String((child as ElementDescriptor).type)}>`
						: `text ${JSON.stringify(String(child))}`,
			extra,
		);
	}

	/**
	 * Hydrating `el`'s `dangerouslySetInnerHTML`, `next`. As in React, the
	 * server's content stays, even where it differs, until `next` changes
	 * (setHTML), and production compares nothing. Development lists a
	 * difference (hydration/dev-values.ts).
	 */
	adoptHTML(el: Element, next: string): void {
		if (process.env.NODE_ENV !== 'production') unpatchedHTML(this, el, next);
	}

	/**
	 * Before a first render of `value` in a slot of the root, whose server
	 * content is the root container's. The server renders a root's value in a
	 * range of its own, at `anchor` or the cursor, which the slot adopts, but
	 * for the root's two unframed forms (serverComponentOutput): nothing,
	 * which claims nothing, as React leaves the root container's children that
	 * do not match in place, and a string's bare text. Any other markup does
	 * not match the client render, such as a component's markup that no range
	 * bounds, which only a server other than Octane's renders.
	 */
	rootSlot(anchor: Node | null, value: unknown, list: boolean): void {
		const cursor = this.node;
		if (
			isBlockOpen(anchor) ||
			isBlockOpen(cursor) ||
			value == null ||
			value === '' ||
			typeof value === 'boolean' ||
			(typeof value === 'string' && cursor?.nodeType === 3)
		)
			return;
		this.fail(
			process.env.NODE_ENV !== 'production' ? componentSourceLoc(this.rootBlock.body) : undefined,
			() => (list ? 'a renderable list range' : 'a renderable root'),
			cursor,
		);
	}

	clone<T extends Node>(template: T, loc?: string, partialStyles?: string): T {
		return (
			this.defers
				? adoptOrDefer(this, template, null, loc, partialStyles)
				: adopt(this, template, null, loc, partialStyles)
		) as T;
	}

	/**
	 * PROD adoption entry for lazy compiler templates: the root check runs off
	 * the template SOURCE (lazyRootMatches), so the happy path never forces the
	 * parse — `adopt` resolves the parsed template on demand only on its cold
	 * paths (a mismatch, client-side builds mid-hydration, fragment root
	 * claims).
	 */
	cloneLazy(lazy: LazyTemplateRecord, loc?: string): Node {
		return this.defers ? adoptOrDefer(this, null, lazy, loc) : adopt(this, null, lazy, loc);
	}

	/** A detached stand-in for `parent`, where a deferred mismatch's client render lands. */
	detachedHost(parent: Node): Node {
		const node = parent;
		return node.nodeType === 1 ? node.cloneNode(false) : document.createDocumentFragment();
	}

	/**
	 * The client render that continues after a deferred mismatch reaches
	 * `template`'s clone. React would have hydrated the host that the previous
	 * template started with by now, and found the mismatch there.
	 */
	claimBefore(template: Node): void {
		if (this.deferredHost) claimDeferred(this);
		this.deferredHost = startsWithHost(template);
	}

	/** A template's holes ran after a deferred mismatch (commitBag); see claimBefore. */
	claimAfterHoles(): void {
		if (this.deferredHost) claimDeferred(this);
	}

	/**
	 * Commit a template's root to its block's parent. clone() returns an
	 * adopted server root already in place, and moving it before the block's
	 * end would reorder it after any trailing server sibling. Any other root
	 * goes at its block's end.
	 */
	insertRoot(root: Node, block: Block): void {
		const parent = block.parentNode;
		if (root.parentNode === parent) return;
		parent.insertBefore(root, block.endMarker);
	}

	/**
	 * Whether `el`, whose only child is a text value, keeps the server content
	 * it holds: React compares such a host's text content as a whole, and under
	 * its suppressHydrationWarning not at all, so whatever the server rendered
	 * there stays, unreported, until the client next changes the text
	 * (clearKeptTextContent). A lone server Text node, or none, or a text-only
	 * frame, is the server's text itself, which the hole adopts (htext,
	 * hempty). A textarea's text is its default value, which its value props
	 * own. A method, so that bundles which never hydrate do not retain it.
	 */
	keepsServerContent(el: Node): boolean {
		if (!isHydrationSuppressed(el) || (el as Element).localName === 'textarea') return false;
		const first = getFirstChild(el);
		if (first === null || (first.nodeType === 3 && getNextSibling(first) === null)) return false;
		(KEPT_TEXT_CONTENT ??= new WeakSet()).add(el);
		return true;
	}

	/**
	 * Adopt the text of an only-child text hole of `el`: the server's one Text
	 * node, which compares as keepsText decides, or a new one when the server
	 * rendered `el` empty. What an early host binding published there is the
	 * server's text now.
	 */
	htext(el: Node, text: string, loc?: string): Text {
		const first = getFirstChild(el);
		if (first !== null && first.nodeType === 3) {
			const next = getNextSibling(first);
			if (next !== null) unclaimedText(this, el, next, null, loc);
			const server = (first as Text).nodeValue;
			// An equal text stays, and still compares again when a render-phase
			// update renders it again (keepsText).
			if (
				(server === text || domBindingClaims.get(el as Element)?.get('#text') !== server) &&
				!this.keepsText(el, first, server, text, loc)
			)
				adoptText(this, first as Text, text);
			return first as Text;
		}
		if (first !== null) unclaimedText(this, el, first, text, loc);
		const created = this.newText(el, text, loc);
		atCommit(placeHydratedText, [el, created, null, false]);
		return created;
	}

	/**
	 * childTextHole's first hydrating render of `value`, an element, a
	 * component, or a list. The server frames such a value in a
	 * `<!--[-->…<!--]-->` range, which the hole's child slot adopts from the
	 * cursor. Anything else in the host is what the server rendered for a
	 * primitive value: its text, which none of these values can adopt, or
	 * nothing for an empty one, where the value must render nothing too. Either
	 * way a difference is a mismatch, as React finds where its render reaches
	 * the host, and a component renders before it does (renderBeforeMismatch).
	 * A textarea's text is its default value, which its value props own, and
	 * the value builds after it. `render` is the hole's childSlot call into the
	 * parent it is given, passed in so that hydration alone never retains the
	 * child-slot graph.
	 */
	hydrateOnlyChild(
		scope: Scope,
		slotKey: number,
		el: Node,
		value: unknown,
		render: (parent: Node) => void,
	): void {
		let stale = getFirstChild(el);
		if (isBlockOpen(stale)) {
			this.node = stale;
			render(el);
			return;
		}
		const textarea = (el as Element).localName === 'textarea';
		const loc =
			process.env.NODE_ENV !== 'production'
				? siteLoc(scope, slotKey) || (el as any).__oct_loc
				: undefined;
		if (stale !== null && !textarea) {
			if (ELEMENT_DESCRIPTORS && isElementDescriptor(value) && !isHostDescriptor(value))
				renderBeforeMismatch(this, el, render);
			this.fail(loc, () => 'a renderable range', stale);
		}
		// A textarea's text past its first node leaves at commit.
		if (stale !== null && getNextSibling(stale) !== null)
			atCommit(applyOutgoing, [null, getNextSibling(stale), el.lastChild]);
		this.suspend(() => render(el));
		if (textarea) return;
		// An element or text the value built, which lands with its slot's
		// frontier at commit, is a node the server did not render.
		const built = (scope.slots[slotKey] as ChildSlot).next;
		const runs = (scope.slots[slotKey] as ChildSlot).forSlot?.next?.out;
		let shows = built !== null && built.frag !== null && showsContent(built.frag);
		for (let i = 0; runs !== undefined && i < runs.length && !shows; i += 3)
			shows = runs[i] === placeRun && showsContent(runs[i + 1]);
		if (shows || showsContent(el)) this.fail(loc, () => 'a renderable range', null);
	}

	/**
	 * htext's counterpart for an only-child hole whose first hydrating value
	 * renders nothing: `''` (`text`), or `null`, `undefined` or a boolean. The
	 * server serializes that as no children, or as an empty `<!--[--><!--]-->`
	 * frame. A lone server Text node, bare or in a text-only frame, which both
	 * unwrap as in htext, is the server's text, and the hole adopts it. For
	 * `''` it compares as keepsText decides, as React compares the text content
	 * of a host whose child is a string. For any other value React hydrates no
	 * child there, so the text compares without the host's
	 * suppressHydrationWarning, which keeps no unhydrated child. Anything else
	 * is server content the client renders no node for. A textarea's text is
	 * its default value, which its value props own. Returns the Text node the
	 * hole adopted, if any.
	 */
	hempty(el: Node, text: boolean, loc?: string): Text | null {
		const first = getFirstChild(el);
		if (first === null || (el as Element).localName === 'textarea') return null;
		if (first.nodeType === 8 && (first as Comment).data === HYDRATION_START) {
			const end = getNextSibling(first);
			if (isBlockClose(end) && getNextSibling(end) === null) return null;
		}
		if (first.nodeType === 3 && getNextSibling(first) === null) {
			// With no host, keepsText applies no suppressHydrationWarning, and the
			// hole already ruled out a host it would write the client's text into.
			if (!this.keepsText(text ? el : null, first, first.nodeValue, '', loc))
				adoptText(this, first as Text, '');
			return first as Text;
		}
		unclaimedText(this, el, first, '', loc);
	}

	htextSwap(posNode: Node | null, text: string): Text {
		// The server's stand-in for an empty sibling hole (ssrTextSlot). Swap it for
		// the hole's Text node, then compare against the server's '' like any text.
		// Every compiled walk has already resolved its positions (htextSwap mounts
		// run after them), so replacing the comment moves no later claim.
		const host = posNode?.parentNode ?? null;
		if (isEmptyTextSlot(posNode)) {
			const empty = document.createTextNode('');
			atCommit(placeHydratedText, [host!, empty, posNode, true]);
			posNode = empty;
		}
		// An element where the server's text belongs is a structural difference,
		// which suppressHydrationWarning never keeps.
		if (posNode !== null && posNode.nodeType === 1)
			this.fail(
				(host as any)?.__oct_loc,
				() => (text === '' ? 'nothing' : `text ${JSON.stringify(text)}`),
				posNode,
			);
		if (posNode !== null && posNode.nodeType === 3) {
			const server = (posNode as Text).nodeValue;
			// A client-built template's `<!>` reads as the server's empty slot,
			// swapped for '' above, and takes the client's text.
			if (!this.keepsText(host, posNode, server, text, (host as any)?.__oct_loc))
				adoptText(this, posNode as Text, text);
			return posNode as Text;
		}
		// No server text node stands here: the server rendered the hole empty. A
		// host that keeps that installs an empty tracking node, which later
		// commits update normally.
		const created = this.newText(host, text, (host as any)?.__oct_loc);
		if (posNode !== null && host !== null)
			atCommit(placeHydratedText, [host, created, posNode, false]);
		return created;
	}

	/**
	 * Give `node`, a Text this pass adopted, the client's `text`: the record a
	 * render-phase update compares at the end of the pass (keepsText), or else
	 * a write at commit. Returns false for a Text no document holds, which the
	 * caller writes now.
	 */
	writeText(node: Text, text: string): boolean {
		const pending = this.pendingTexts?.get(node);
		if (pending !== undefined) pending.text = text;
		else if (node.isConnected) atCommit(commitTextValue, [node, text]);
		else return false;
		return true;
	}

	sibling(node: Node, count: number): Node | null {
		let cursor: Node | null = node;
		for (let i = 0; i < count; i++) {
			if (cursor === null) return null;
			if (isBlockOpen(cursor)) cursor = this.close(cursor);
			if (isTextSeparator(cursor)) {
				cursor = getNextSibling(cursor!);
				continue;
			}
			cursor = getNextSibling(cursor!);
			if (isTextSeparator(cursor)) {
				const after: Node | null = getNextSibling(cursor!);
				if (
					after !== null &&
					(after.nodeType === 3 || isTextSeparator(after) || isEmptyTextSlot(after))
				)
					cursor = after;
			}
		}
		return cursor;
	}

	/**
	 * A writer sets the client's value on `el`, an element hydration adopted,
	 * which keeps its server attributes, class, style and raw HTML, as React
	 * never patches them; development lists a difference (hydration/dev-values.ts).
	 * No element is where the compiled walk of an adopted template expected the
	 * one a binding writes: the server rendered fewer nodes there than the client.
	 */
	adopts(el: Element | null): void {
		if (el === null) this.fail(undefined, () => 'an element', null);
	}
}

/**
 * Hand the seeded outcomes this attempt wrote to `outer`, the hydration it
 * renders within, so that `outer`'s fallback discards them too.
 */
export function passSeeds(h: HydrationCapability, outer: HydrationCapability | null): void {
	const seeded = h.seeded;
	h.seeded = null;
	if (seeded !== null && outer !== null) (outer.seeded ??= []).push(...seeded);
}

/**
 * The boundary falls back: restore the thenables this attempt's seeds
 * settled, so that the client render reads client data, as React's does.
 */
export function discardSeeds(h: HydrationCapability): void {
	const seeded = h.seeded;
	if (seeded === null) return;
	h.seeded = null;
	for (let i = seeded.length - 1; i >= 0; i--) seeded[i]();
}

/**
 * Hold hydration diagnostics while a try body renders (see
 * HYDRATION_DIAGNOSTIC_HOLDS). Returns the mark that releaseDiagnostics
 * drops back to.
 */
export function holdDiagnostics(): number {
	HYDRATION_DIAGNOSTIC_HOLDS++;
	return HELD_HYDRATION_DIAGNOSTICS?.length ?? 0;
}

/**
 * End a try body's hold. A body `caught` by its catch arm drops what it
 * held; otherwise its diagnostics pass to the enclosing hold, or publish
 * when none remains.
 */
export function releaseDiagnostics(mark: number, caught: boolean): void {
	HYDRATION_DIAGNOSTIC_HOLDS--;
	const held = HELD_HYDRATION_DIAGNOSTICS;
	if (held === null) return;
	if (caught) held.length = mark;
	if (HYDRATION_DIAGNOSTIC_HOLDS !== 0) return;
	HELD_HYDRATION_DIAGNOSTICS = null;
	for (let i = 0; i < held.length; i++) held[i]();
}

/** The cursor, or `domParent`'s first child when the cursor is elsewhere. */
function cursorIn(h: HydrationCapability, domParent: Node): Node | null {
	const cursor = h.node;
	return cursor === null || cursor.parentNode !== domParent ? getFirstChild(domParent) : cursor;
}

/**
 * Whether the block rendering now, or an ancestor of it in this pass, has an
 * update queued, which renders it again before the pass ends
 * (drainHydrationRenderPhaseUpdates). An update from another component's
 * render waits for the commit instead.
 */
function rendersAgain(h: HydrationCapability): boolean {
	for (let block = CURRENT_BLOCK; block !== null; block = block.parentBlock) {
		if (block.pending && !block.crossRenderUpdate) return true;
		if (block === h.rootBlock) return false;
	}
	return false;
}

/** Whether the server's nodes from `cursor` on fit a root fragment `template`'s roots. */
function fragmentRoots(
	h: HydrationCapability,
	template: Node,
	cursor: Node | null,
	loc: string | undefined,
	partialStyles: string | undefined,
): boolean {
	let expected = getFirstChild(template);
	let actual = cursor;
	for (let index = 0; expected !== null; index++) {
		if (actual === null) return false;
		// A template comment is a dynamic logical hole. Its server form may be
		// text or a marker range, so only static text/element roots compare shape.
		if (expected.nodeType !== 8) {
			if (!hydrationNodeMatches(actual, expected)) return false;
			if (process.env.NODE_ENV !== 'production')
				unpatchedStatics(h, actual, expected, loc, partialStyles, String(index));
		}
		actual = h.sibling(actual, 1);
		expected = getNextSibling(expected);
	}
	return true;
}

/**
 * Adopt a template, or defer the mismatch its adoption finds.
 *
 * React runs a component's whole body, every expression of the JSX it
 * returns included, before it hydrates any host that JSX renders, so a body
 * that suspends keeps the server HTML even where that host would not have
 * matched. A compiled body adopts its template's roots first and evaluates
 * its holes after. So when the adoption fails, the body continues on the
 * client: it gets a fresh copy of the template and renders, with the rest of
 * this attempt, into detached DOM, until React's order would reach a host
 * (claimDeferred). A suspension before then wins, and the attempt keeps the
 * server DOM as any suspended attempt does; its retry meets the mismatch
 * again. Only an owner that discards a suspended attempt and starts the next
 * one afresh enables this (`defers`).
 */
function adoptOrDefer(
	h: HydrationCapability,
	template: Node | null,
	lazy: LazyTemplateRecord | null,
	loc?: string,
	partialStyles?: string,
): Node {
	h.adopting = true;
	try {
		return adopt(h, template, lazy, loc, partialStyles);
	} catch (error) {
		if (!(error instanceof HydrationMismatch)) throw error;
		const scope = CURRENT_SCOPE;
		if (scope === null) {
			if (process.env.NODE_ENV !== 'production' && error.warning !== undefined)
				logHydrationMismatch(error.warning);
			throw error;
		}
		const parsed = template ?? resolveLazyTemplate(lazy!);
		defer(h, error, startsWithHost(parsed));
		// The body's DOM context: what it inserts lands in detached DOM, which
		// the discarded attempt drops, never in the server's. A root render's
		// rollback restores it.
		const block = scope.block;
		journalRootProperty(block, 'parentNode', block.parentNode);
		journalRootProperty(block, 'endMarker', block.endMarker);
		block.parentNode = h.detachedHost(block.parentNode);
		if (block.block === block) {
			journalRootProperty(block, 'startMarker', block.startMarker);
			block.startMarker = null;
		}
		block.endMarker = null;
		return parsed.cloneNode(true);
	} finally {
		h.adopting = false;
	}
}

/**
 * Defer `error`: the rest of the attempt renders on the client, reading its
 * seeds as this hydration would, until React's order would reach the host
 * that mismatched (claimBefore). `host` says whether the mismatched content
 * starts with one.
 */
function defer(h: HydrationCapability, error: HydrationMismatch, host: boolean): void {
	h.deferred = error;
	h.deferredHost = host;
	h.replayDepth = ++h.depth;
	if (CURSOR === h) CURSOR = null;
}

/** The render reached the deferred mismatch, or the attempt ended without suspending. */
export function claimDeferred(h: HydrationCapability): never {
	throw takeDeferred(h);
}

/** The deferred mismatch, now reported. */
function takeDeferred(h: HydrationCapability): HydrationMismatch {
	const error = h.deferred!;
	h.deferred = null;
	if (process.env.NODE_ENV !== 'production' && error.warning !== undefined)
		logHydrationMismatch(error.warning);
	return error;
}

/**
 * What fails the attempt when `error` escapes it, or a catch arm in it. Only
 * a suspension comes before a deferred mismatch: an application error that
 * the client render throws after it fails the fallback owner as the mismatch,
 * and that owner's client render throws it again, as React's does. An error
 * thrown while this hydration adopted server DOM fails it too
 * (thrownWhileAdopting).
 */
export function hydrationFailure(h: HydrationCapability, error: unknown): unknown {
	if (isSuspenseException(error) || isAdoptionControl(error) || isHostContextRequest(error))
		return error;
	return h.deferred !== null ? takeDeferred(h) : (thrownWhileAdopting(h, error) ?? error);
}

/**
 * As React's throwException does, an error thrown while this hydration
 * adopted server DOM (HYDRATION_THROWN), such as a compiled walk that finds
 * no server node where the template has one, fails the hydration of the
 * nearest fallback owner, which renders on the client instead, where a
 * repeated throw is an ordinary render error. Returns the failure, or null.
 */
function thrownWhileAdopting(h: HydrationCapability, error: unknown): HydrationMismatch | null {
	if (HYDRATION_THROWN !== error || HYDRATION_THROWN_BY !== h) return null;
	clearHydrationThrow();
	return hydrationHostFailure(error);
}

export function hydrationHostFailure(error: unknown): HydrationMismatch {
	const failure = new HydrationMismatch(formatClientError(340));
	(failure as Error & { cause?: unknown }).cause = error;
	return failure;
}

/** `template` is null only in prod lazy mode (then `lazy` is set) — every cold path resolves it. */
function adopt(
	h: HydrationCapability,
	template: Node | null,
	lazy: LazyTemplateRecord | null,
	loc?: string,
	partialStyles?: string,
): Node {
	let cursor = h.node;
	const isFragment =
		template !== null ? (template as any).__oct_frag === true : isLazyFragment(lazy!);
	// Lite/no-template wrappers can render the logical root while sharing the
	// public root Block, and return-based wrappers render it in a child Block.
	// Identify the first top-level cursor by DOM ownership, and claim the root
	// ONCE, so later lite descendant clones do not compare its roots again.
	const claimsRoot =
		!h.rootClaimed &&
		(cursor !== null
			? cursor.parentNode === h.rootBlock.parentNode
			: CURRENT_BLOCK === h.rootBlock);
	if (claimsRoot) h.rootClaimed = true;
	// A closing marker bounds an empty server range; it cannot be the first
	// child of a newly populated fragment. Build fresh descendants without
	// consuming that boundary, so its owner can advance the outer cursor.
	if (isFragment && isBlockClose(cursor)) {
		h.fail(loc, () => 'a non-empty fragment', cursor);
	}
	// A synthetic fragment wrapper has no server counterpart. At a root, compare
	// its logical static roots before returning the virtual adoption view; otherwise
	// arbitrary server markup could be mistaken for every fragment child at once.
	// (Root claims happen once per hydrateRoot, so parsing here is cold.)
	if (isFragment && claimsRoot) {
		if (template === null) template = resolveLazyTemplate(lazy!);
		if (!fragmentRoots(h, template, cursor, loc, partialStyles)) {
			const fragment = template;
			h.fail(
				process.env.NODE_ENV !== 'production' ? componentSourceLoc(h.rootBlock.body) : undefined,
				() =>
					process.env.NODE_ENV !== 'production'
						? `a fragment starting with ${describeHydrationNode(getFirstChild(fragment))}`
						: '',
				cursor,
			);
		}
	}
	if (cursor === null) {
		h.fail(
			loc,
			() =>
				process.env.NODE_ENV !== 'production'
					? describeHydrationNode(template ?? resolveLazyTemplate(lazy!))
					: '',
			null,
		);
	}
	if (
		!isFragment &&
		(template !== null ? !hydrationNodeMatches(cursor, template) : !lazyRootMatches(cursor, lazy!))
	) {
		const match = skipForeign(h, cursor, template, lazy);
		if (match === null)
			h.fail(
				loc,
				() =>
					process.env.NODE_ENV !== 'production'
						? describeHydrationNode(template ?? resolveLazyTemplate(lazy!))
						: '',
				cursor,
			);
		h.node = cursor = match;
	}
	// The compiled walk descends into the root's children: where it would find
	// no element, the server rendered fewer nodes than the template has.
	if (!isFragment && rootWalkMisses(cursor, template, lazy))
		h.fail(
			loc,
			() =>
				process.env.NODE_ENV !== 'production'
					? describeHydrationNode(firstElementChild(template ?? resolveLazyTemplate(lazy!)))
					: '',
			getFirstChild(cursor),
		);
	if (isFragment) {
		// A nested fragment has no server wrapper, so its first logical root must
		// be the cursor itself, or follow the server forms of its leading holes.
		// A root claim already compared every root above.
		if (
			claimsRoot ||
			(template !== null
				? fragmentRootMatches(cursor, template, h, loc, partialStyles)
				: lazyFragmentRootMatches(cursor, lazy!, h))
		) {
			// A fragment that is a range's content must also fit in that range.
			// Roots that outnumber what the server rendered there, such as holes
			// with no static element root after them, belong to other content:
			// a mismatch, from which the nearest boundary, or the root, falls back.
			if (cursor !== h.claimFrom || claimRoots(h, cursor, template ?? lazy!) || claimsRoot)
				return { __oct_vfrag: true, firstChild: cursor } as unknown as Node;
		}
		const fragment = template ?? resolveLazyTemplate(lazy!);
		h.fail(
			loc,
			() =>
				process.env.NODE_ENV !== 'production'
					? `a fragment starting with ${describeHydrationNode(getFirstChild(fragment))}`
					: '',
			cursor,
		);
	}
	if (process.env.NODE_ENV !== 'production' && template !== null)
		unpatchedStatics(h, cursor, template, loc, partialStyles, '');
	if (cursor === h.claimFrom) claimRoots(h, cursor, null);
	return cursor;
}

/**
 * Among the root container's children and those of `<html>`, `<head>` and
 * `<body>`, React skips server elements that do not match, which third-party
 * scripts and extensions insert there, and leaves them in place. It skips
 * every comment too but its own boundary markers, and range markers are
 * Octane's. A text node ends the search, as it ends React's. Returns the
 * first sibling element from `cursor` on that the template matches, or null.
 */
function skipForeign(
	h: HydrationCapability,
	cursor: Node,
	template: Node | null,
	lazy: LazyTemplateRecord | null,
): Node | null {
	const parent = cursor.parentNode;
	if (
		parent === null ||
		!(
			(parent === h.rootBlock.parentNode && h.rootBlock.kind === 'root') ||
			isDocumentSingleton(parent)
		)
	)
		return null;
	for (let node: Node | null = cursor; node; node = getNextSibling(node)) {
		if (node.nodeType === 1) {
			if (template !== null ? hydrationNodeMatches(node, template) : lazyRootMatches(node, lazy!))
				return node;
		} else if (node.nodeType !== 8 || isBlockOpen(node) || isBlockClose(node)) return null;
	}
	return null;
}

/**
 * A template adopted `root`, the first node of the range whose claim is
 * open. When the template is that range's content, record the first node
 * after its roots: after `root`, or after the `fragment` template's roots,
 * stepped as the compiled walk steps them. The template is the content when
 * it renders in the range's owner: the block whose markers the range's are,
 * a component inheriting them, or the lite component that adopted the
 * range. A component that adopts `root` without a range of its own renders
 * in its own scope, and the slots after it claim the nodes after its root.
 * Returns false when the range ends before the template's roots do: every
 * root, a hole included, renders at least one server node, so the server
 * rendered other content there. Below a passthrough root, the range may
 * instead be one level inside the template's (passthroughRoot).
 */
function claimRoots(
	h: HydrationCapability,
	root: Node,
	fragment: Node | LazyTemplateRecord | null,
): boolean {
	const open = root.previousSibling;
	const scope = CURRENT_SCOPE;
	if (
		scope === null ||
		open === null ||
		(scope !== h.claimOwner && scope.block.startMarker !== open)
	)
		return true;
	h.claimFrom = null;
	let node: Node | null = root;
	// Step over each root's own range. A close marker first is the end of the
	// claimed range, and nothing follows it.
	for (let i = fragment === null ? 1 : templateRootCount(fragment); i > 1; i--) {
		node = h.sibling(node, 1);
		if (node === null || isBlockClose(node)) {
			h.claimEnd = node;
			return h.passthroughRoot;
		}
	}
	// The last root steps over its server range, as the compiled walk does.
	h.claimEnd = getNextSibling(isBlockOpen(node) ? h.close(node) : node);
	return true;
}

/**
 * `from`, in `el`, an only-child text host, starts server content that is
 * not the one Text node the hole adopts: nothing the client renders, and a
 * structural difference that suppressHydrationWarning does not keep. The
 * client expected `text` there (nothing when it is '', or, when null, the
 * end of the Text node it adopted).
 */
function unclaimedText(
	h: HydrationCapability,
	el: Node,
	from: ChildNode,
	text: string | null,
	loc?: string,
): never {
	h.fail(
		loc || (el as any).__oct_loc,
		() =>
			text === null ? END_OF_CONTENT : text === '' ? 'nothing' : `text ${JSON.stringify(text)}`,
		// Name a server range by the content it frames: its first element.
		isBlockOpen(from) ? framedContent(h, from) : from,
	);
}

/** The first element in the server range `open` starts, else its first node. */
function framedContent(h: HydrationCapability, open: Comment): Node {
	const end = h.close(open);
	for (let node = getNextSibling(open); node !== null && node !== end; node = getNextSibling(node))
		if (node.nodeType === 1) return node;
	return getNextSibling(open) ?? open;
}

/**
 * Before hydrateOnlyChild's mismatch at `el`, render its component value on
 * the client into a detached copy of `el`: React renders a component before
 * it reaches the host the component renders, so a suspension in it comes
 * first and keeps the server HTML. Only an owner that discards a suspended
 * attempt (`defers`) lets it. Any other error gives way to the mismatch, and
 * the fallback's client render throws it again (see hydrationFailure).
 */
function renderBeforeMismatch(
	h: HydrationCapability,
	el: Node,
	render: (parent: Node) => void,
): void {
	if (!h.defers) return;
	try {
		h.suspend(() => render(el.cloneNode(false)));
	} catch (error) {
		if (isSuspenseException(error) || isAdoptionControl(error) || isHostContextRequest(error))
			throw error;
	}
}

/** writeText, writing a Text no document holds now. */
function adoptText(h: HydrationCapability, node: Text, text: string): void {
	if (!h.writeText(node, text)) node.nodeValue = text;
}

/**
 * Runs once a pass adopted its content and its render-phase updates
 * settled. Compares the texts those updates rendered again (keepsText), then
 * publishes development's one warning per pass, as React's, for the server
 * values the pass kept where the client's differ. A body that threw to its
 * catch arm dropped its texts, which that arm's commit discards
 * (renderTryBody).
 */
export function settleTexts(h: HydrationCapability): void {
	const root = h.rootBlock.parentNode;
	const texts = h.pendingTexts;
	if (texts !== null) {
		h.pendingTexts = null;
		for (const [node, { server, loc, text }] of texts) {
			if (text !== server && !parserNormalizedMatch(server, text))
				h.fail(
					loc || (node.parentNode as any)?.__oct_loc,
					() => `text ${JSON.stringify(text)}`,
					document.createTextNode(server ?? ''),
				);
		}
	}
	if (process.env.NODE_ENV !== 'production') {
		const lines = takeUnpatchedValues(h, root);
		if (lines !== null) warnHydrationUnpatched(lines);
	}
}

/** Whether `parent` holds an element or a non-empty text. */
function showsContent(parent: Node): boolean {
	for (let node = getFirstChild(parent); node !== null; node = getNextSibling(node))
		if (node.nodeType === 1 || (node.nodeType === 3 && node.nodeValue)) return true;
	return false;
}

/**
 * Parse a seed-JSON payload (the shell's `data-octane-suspense` script or a
 * streamed boundary's `window.$OCTS[id]` stash). Successful values retain the
 * compact array form; a versioned top-level envelope carries compiler-owned
 * site metadata without colliding with fulfilled user data. A post-parse wire
 * decoder restores `undefined` without deleting object properties and
 * unescapes prefix-leading user strings. Returns null on malformed input (the
 * caller re-suspends client-side).
 */
function decodeSeedWire(value: unknown): unknown {
	const undefinedWire = SUSPENSE_SEED_WIRE_PREFIX + 'u';
	const escapedStringWire = SUSPENSE_SEED_WIRE_PREFIX + 's';
	if (typeof value === 'string') {
		if (value === undefinedWire) return undefined;
		if (value.startsWith(escapedStringWire)) return value.slice(escapedStringWire.length);
		return value;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) value[i] = decodeSeedWire(value[i]);
		return value;
	}
	if (value !== null && typeof value === 'object') {
		for (const key of Object.keys(value)) {
			(value as Record<string, unknown>)[key] = decodeSeedWire(
				(value as Record<string, unknown>)[key],
			);
		}
	}
	return value;
}

export function parseSeedJson(raw: string): unknown[] | null {
	try {
		const parsed = decodeSeedWire(JSON.parse(raw));
		if (Array.isArray(parsed)) return parsed;
		if (parsed === null || typeof parsed !== 'object') return null;
		const envelope = (parsed as Record<string, any>)[REJECTION_SENTINEL_KEY];
		if (
			envelope === null ||
			typeof envelope !== 'object' ||
			envelope.version !== 2 ||
			!Array.isArray(envelope.values) ||
			!Array.isArray(envelope.sites)
		)
			return null;
		const values = envelope.values as HydrationSeedArray;
		const queues = new Map<string, number[]>();
		const seededSites = new Set<number>();
		let previousSeedIndex = -1;
		for (const entry of envelope.sites) {
			if (
				!Array.isArray(entry) ||
				entry.length !== 2 ||
				typeof entry[0] !== 'string' ||
				entry[0] === '' ||
				!Number.isInteger(entry[1]) ||
				entry[1] < -1 ||
				entry[1] >= values.length
			)
				return null;
			const index = entry[1] as number;
			if (index >= 0) {
				if (index <= previousSeedIndex || seededSites.has(index)) return null;
				previousSeedIndex = index;
				seededSites.add(index);
			}
			const queue = queues.get(entry[0]);
			if (queue === undefined) queues.set(entry[0], [index]);
			else queue.push(index);
		}
		if (seededSites.size === 0) return null;
		values[HYDRATION_SITE_EVENTS] = { queues, offsets: new Map() };
		return values;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Hydration navigation helpers. The compiler emits `child`/`sibling` instead of
// raw `.firstChild`/`.nextSibling` ONLY for templates containing control-flow /
// component holes — there the server DOM expands each hole into a
// `<!--[-->…<!--]-->` range, so a raw sibling walk would land on the wrong node.
// `child`/`sibling` are PURE navigators (they don't move the cursor): they treat
// a whole `<!--[-->…<!--]-->` block as ONE logical sibling, which exactly matches
// the single `<!>` placeholder the template uses for that hole — so octane's
// existing path+childIndex binding resolution keeps working unchanged on the
// server DOM. The capability cursor is set by each block call (forBlock /
// ifBlock / componentSlot, to its content start) for the child's `clone()` to
// adopt. Without an active capability these are trivial DOM reads; hydration-only
// navigation stays behind methods that client-only builds discard.
// ---------------------------------------------------------------------------

/** True if `node` closes a hydration range. */
export function isBlockClose(node: Node | null): node is Comment {
	return node !== null && node.nodeType === 8 && (node as Comment).data === HYDRATION_END;
}

/**
 * True if `node` is a server text-hole separator `<!-- -->` — emitted between
 * two adjacent text nodes when at least one is a dynamic text hole, so the
 * parser can't merge them into one node (see HYDRATION_TEXT_SEP, constants.ts).
 */
export function isTextSeparator(node: Node | null): node is Comment {
	return node !== null && node.nodeType === 8 && (node as Comment).data === HYDRATION_TEXT_SEP;
}

/** The server's `<!---->` stand-in for an empty sibling-position text hole (ssrTextSlot). */
function isEmptyTextSlot(node: Node | null): node is Comment {
	return node !== null && node.nodeType === 8 && (node as Comment).data === '';
}

/**
 * Resolve the server `<!--[-->` a control-flow slot (try / if / for / switch /
 * Activity / component) should ADOPT during hydration.
 *
 * Two shapes reach here:
 *  - `anchor` IS the open marker — the slot sat at a `<!>` placeholder among
 *    siblings, so the compiler passes the open directly. Return it.
 *  - `anchor` is null or a NON-open marker — the slot is the SOLE hole of its
 *    enclosing scope (an appended-only child, or the only thing a control-flow
 *    arm / component's children render), so its anchor is that scope's END
 *    marker. In that case mountTry/ifBlock/renderBlock parked the cursor
 *    (`hydrateNode`) on the slot's own `<!--[-->`. Adopt from the parked cursor
 *    (falling back to `domParent.firstChild` for the first appended child, whose
 *    cursor still sits after the just-cloned empty host).
 *
 * Returns the open marker to adopt, or null when there's nothing to adopt (a
 * genuine fresh client mount, e.g. the server rendered the slot empty).
 */
/**
 * From a block-open `<!--[-->`, the matching `<!--]-->` (depth-tracked).
 * Throws a HydrationMismatch when the parent ends first.
 */
function findMatchingClose(open: Node, matches: WeakMap<Node, Comment>): Comment {
	let nested: Comment[] | null = null;
	let node: Node | null = getNextSibling(open);
	while (node !== null) {
		if (node.nodeType === 8) {
			const data = (node as Comment).data;
			if (data === HYDRATION_END) {
				const found = node as Comment;
				if (nested === null || nested.length === 0) {
					matches.set(open, found);
					return found;
				}
				matches.set(nested.pop()!, found);
			} else if (isRangeOpen(data)) {
				(nested ??= []).push(node as Comment);
			}
		}
		node = getNextSibling(node);
	}
	// The server closes every range it opens, so something changed its HTML
	// after rendering, such as a minifier or proxy that strips comments. No
	// close in the parent can be trusted then, so the nearest intact owner falls
	// back as for any other mismatch.
	throw new HydrationMismatch(formatClientError(338));
}

/**
 * Hydration found server DOM that does not match the client render. As in
 * React, nothing is repaired in place: the nearest fallback owner whose own
 * range is intact (a Suspense arm, a Hydrate island, or else the root)
 * discards its attempt and its server DOM, renders on the client instead, and
 * reports this error once as recoverable. It is the native adoption miss
 * control flow, which application boundaries already pass through and every
 * hydration owner already recovers from, so client-only bundles are unchanged.
 */
export class HydrationMismatch extends NativeAdoptionMiss {
	/** DEV-only: the warning that a root's fallback publishes, as its attempt never commits. */
	declare diagnostic: string | undefined;
	/** DEV-only: the warning of a deferred mismatch, logged when the render reaches it. */
	declare warning: string | undefined;
	constructor(message = formatClientError(339)) {
		super('', '');
		this.name = 'HydrationMismatch';
		this.message = message;
	}
}

// Initialized by the hydration capability so client-only Suspense cannot make
// the hydrator and its seed parser reachable in the shipped bundle. Keep this
// indirection: calling renderInitialSuspenseHydration from tryBlock directly
// made its hydration swaps reachable and stopped the hydration flag folding,
// +14 kB gzip on a client-only Suspense app (2026-10), and routing those swaps
// through the capability instead still cost +3.5 kB gzip.
export let initialSuspenseHydrationRenderer: typeof renderInitialSuspenseHydration | null = null;
