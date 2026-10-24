// Root API
//
// Root options and error handlers, root containers and hydration fallbacks. The
// engine creates roots.

import {
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	beginHydratingRootRender,
	endRootRender,
	requeuePassiveEffect,
} from './render.js';
import { hydrating } from '../hydration-flag.js';
import type { BindingHandle } from '../dom-bindings.js';
import {
	type BindingHandoffCapability,
	BINDING_HANDOFF,
	claimBindingHandoff,
} from '../dom-binding-handoff.js';
import { type SignalControlBinding, CONTROL_HANDOFF } from '../signals/control-handoff.js';
import {
	HYDRATE_ID_ATTR,
	HYDRATE_INDEPENDENT_ATTR,
	SUSPENSE_SCRIPT_ATTR,
	STREAM_SCRIPT_ATTR,
	HYDRATION_RANGE_BOUNDARY,
} from '../constants.js';
import { applyElementDefaultProps } from '../shared-value-helpers.js';
import { __profileTrackComponent } from '../profiling.js';
import {
	__devtoolsSetNameResolver,
	__devtoolsSetChildWalker,
	__devtoolsRegisterRoot,
} from '../devtools-hook.js';
import type {
	IndependentHydrateActivator,
	IndependentHydrateActivationContext,
} from '../hydration/independent-island.js';
import { cloneHydrationReplayEvent } from '../hydration/replay-event.js';
import {
	type HydrationReplayIntent,
	type HydrationReplayHold,
	isHydrationSelectionIntentCurrent,
	holdHydrationReplays,
} from '../hydration/event-capture.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { snapshotSignalValue } from '../data-encoding.js';
import {
	startEarlySignalHydration,
	nativeSignalHydration as NATIVE_SIGNAL_HYDRATION,
	setNativeAdoptionResolver,
	NativeAdoptionMiss,
} from '../signals/read-protocol.js';
import {
	captureInitialDocumentSignals,
	NATIVE_SIGNAL_SEED_ATTR,
} from '../signals/native-read-seeds.js';
import {
	materializeNativeSignalManifest,
	parseNativeSignalManifest,
} from '../signals/native-adoption.js';
import { signalDocumentEnabled, documentSignalOwner } from '../signals/document-owner.js';
import { installEarlyControlBridge } from '../signals/early-values.js';
import type { SignalOwner, ScopeSeed, SignalRendererOwnerIdentity } from '../signals/types.js';
import { inspectDevtoolsChildScopes, inspectDevtoolsName } from './profile-probes.js';
import type {
	ComponentBody,
	EffectFn,
	Scope,
	OutputHandler,
	RootIdState,
	Block,
	RootRenderOwner,
	SlotNext,
	SuspenseRefEntry,
	ElementDescriptor,
	TrySlot,
	RootContainer,
} from './types.js';
import {
	withRefDetachSuppression,
	ROOT_ERROR_HANDLERS,
	registerRootOptions,
	installRootOptions,
	reportUncaughtError,
	installHydrationDriver,
} from './drivers.js';
import { rootSignalInstanceKey, stampSignalInstanceKey, renderBlock } from './signal-owners.js';
import {
	ownNativeAdoption,
	scheduled,
	requestFlush,
	syncFlush,
	inFlush,
	journalRootProperty,
	createdInRootRender,
	rollbackRootRender,
	commitRootRenders,
	type EffectEventCommitAction,
	scheduleRender,
	drainHydrationRenderPhaseUpdates,
	retireEventHostTree,
	makeRoot,
} from './engine.js';
import { blockIsAncestorOf } from './effects.js';
import {
	type HiddenRevealAction,
	deferHiddenRevealAction,
	cancelHiddenRevealAction,
	useEffect,
} from './hooks.js';
import {
	clearHydrationThrow,
	HYDRATION_PASS,
	swapHydration,
	isRendererHydrationStyle,
	isProtocolMark,
	skipFoldedHeadPrefix,
	auditHydrationProbe,
	HydrationCapability,
	claimDeferred,
	hydrationFailure,
	settleTexts,
	parseSeedJson,
	HydrationMismatch,
} from './hydration.js';
import type { PortalDescriptor } from './portals.js';
import {
	takeClientRootId,
	createBlock,
	enqueueEffectEventCommitAction,
	renderReturnedValue,
	unmountBlock,
} from './block.js';
import { HYDRATE_NOTIFY_SLOT, findHydrateSeedSidecar } from './hydrate-boundary.js';
import {
	EFFECT_RECONNECT_CONTEXT,
	suspenseRetryBatchForSubtree,
	type ErrorSlot,
	tryBlock,
	type ScheduledVisibilityOwner,
	findScheduledVisibilityOwner,
	findSuspenseHiddenTry,
	type EffectReconnectContext,
	handleRenderError,
} from './suspense.js';
import {
	BINDING_VIEW_ROOT,
	PresentationAdoptionMiss,
	retryPresentationMiss,
} from './hydration-presentation.js';
import { isElementDescriptor } from './elements.js';
import { componentSlotVoid } from './component-slots.js';
import { collectVisibleSubtreeRefs } from './activity.js';
import { queueFrontier, noteFrontierMember } from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';
import { registerDelegationTarget } from './events.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

/** Server heads a client render discards with the document it replaces (installHydrationFallback). */
export let DISCARDED_HEADS: WeakSet<HTMLHeadElement> | null = null;

// ---------------------------------------------------------------------------
// Post-hydration exact-range compaction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public root API — React-DOM parity
// ---------------------------------------------------------------------------

export interface Root {
	/**
	 * Render into this root. Two forms:
	 *  - React-style:   `root.render(<App foo={x}/>)` — a single element descriptor
	 *    (the compiler lowers the JSX to `createElement(App, {foo: x})`).
	 *  - Body + props:  `root.render(App, { foo: x })` — the original octane
	 *    form, kept for direct (non-JSX) callers and existing test helpers.
	 * Re-rendering with the same component (`type`/body) updates props in place;
	 * a different component tears down and remounts.
	 */
	render(
		element:
			| ElementDescriptor
			| PortalDescriptor
			| string
			| number
			| bigint
			| boolean
			| null
			| undefined
			| readonly unknown[],
	): void;
	render(body: ComponentBody, props?: any): void;
	unmount(): void;
}

export interface RootOptions {
	/** Adopt fixed native early bindings only when their matching hydration capture commits. */
	bindingLeases?: readonly BindingHandle[];
	/** Offer an existing textarea value owner for accepted presentation hydration, never early disposal. */
	controlLeases?: readonly SignalControlBinding[];
	/**
	 * Shared document/account owner for module signals. Roots borrow this owner;
	 * unmounting a presentation root never retires shared data state.
	 */
	signalOwner?: SignalOwner;
	/**
	 * Hydration only: the initial document seed also supplied to the server renderer.
	 * Snapshotted once; referenced boundary reads adopt it without initializing or
	 * rewinding live state. Deferred/streamed boundaries borrow the root's snapshot.
	 */
	initialDocumentSignals?: ScopeSeed;
	/**
	 * Caller-controlled useId prefix. createRoot composes it with an automatic
	 * client-root namespace; hydrateRoot uses it verbatim to match server output.
	 */
	identifierPrefix?: string;
	/** @internal Compiler-owned starting useId slot for an independently hydrated range. */
	identifierSeed?: number;
	/** @internal Stable instance namespace for an independently hydrated root. */
	signalInstancePrefix?: string;
	/**
	 * React 19 parity, reporting only: called after an error boundary
	 * (`@try`/`@catch` or `<ErrorBoundary>`) claims an error from this root's
	 * render, passive-effect, or ref-attach channel. Octane passes only the
	 * error — there is no `errorInfo`/`componentStack` second argument (owner
	 * stacks are not part of Octane's API, matching the SSR `onError` shape).
	 * Deletion-phase teardown errors report here too once their enclosing
	 * boundary claims them (the routing itself is unchanged).
	 * First-mount and parent-driven catches in non-suspending renders report
	 * after their fallback's refs and layout effects commit. Retained hidden
	 * reports wait for reveal; abandoning their catch cancels them.
	 */
	onCaughtError?: ((error: unknown) => void) | undefined;
	/**
	 * React 19 parity: called for an error no boundary claims. When provided it
	 * REPLACES the default report for this root (render errors stop rethrowing
	 * out of the flush; effect-channel errors stop reaching console.error).
	 * Recovery semantics are unchanged either way — an uncaught render error
	 * still unmounts the failed root's entire tree.
	 */
	onUncaughtError?: ((error: unknown) => void) | undefined;
	/**
	 * React 19 parity, hydration only: called (dev AND prod) once for each
	 * boundary, a Suspense arm, a Hydrate island or the root, whose server HTML
	 * does not match the client render and which therefore renders on the
	 * client. Attributes never fall back, so they never report.
	 */
	onRecoverableError?: ((error: unknown) => void) | undefined;
}

/**
 * Handlers live OFF the Block shape: registered only for roots created with at
 * least one callback, so every other root pays a single null check on the
 * (already cold) error paths and Block's monomorphic layout is untouched.
 */
export interface RootErrorHandlers {
	onCaughtError: ((error: unknown) => void) | undefined;
	onUncaughtError: ((error: unknown) => void) | undefined;
	onRecoverableError: ((error: unknown) => void) | undefined;
}

export function rootErrorHandlersFor(block: Block | null): RootErrorHandlers | null {
	if (ROOT_ERROR_HANDLERS === null || block === null) return null;
	let b: Block = block;
	while (b.parentBlock !== null) b = b.parentBlock;
	return ROOT_ERROR_HANDLERS.get(b) ?? null;
}

/** A throwing report callback must not corrupt recovery — report it and move on. */
export function invokeRootErrorHandler(handler: (error: unknown) => void, err: unknown): void {
	try {
		handler(err);
	} catch (handlerErr) {
		console.error(handlerErr);
	}
}

/** Report a boundary-claimed error to the owning root's onCaughtError, if any. */
export function registeredReportCaughtError(
	block: Block | null,
	err: unknown,
	caught?: Block | null | void,
): void {
	const h = rootErrorHandlersFor(block)?.onCaughtError;
	if (h === undefined || caught === null || caught?.disposed) return;
	if (caught !== undefined) {
		const hiddenBoundary = findSuspenseHiddenTry(caught);
		if (hiddenBoundary !== null) {
			// An error fallback is still render work and may itself suspend. Its
			// report belongs to the fallback's eventual commit, not to this attempt.
			// Reuse the boundary reveal queue so a memoized fallback need not render
			// again, and an abandoned or unmounted catch never reports its old error.
			const publish = () => {
				if (caught.disposed) return;
				const stillHidden = findSuspenseHiddenTry(caught);
				if (stillHidden !== null) {
					deferHiddenRevealAction(stillHidden, publish);
					return;
				}
				invokeRootErrorHandler(h, err);
			};
			deferHiddenRevealAction(hiddenBoundary, publish);
			return;
		}
	}
	invokeRootErrorHandler(h, err);
}

export interface InlineCaughtErrorReport {
	state: TrySlot | ErrorSlot;
	block: Block;
	error: unknown;
	handler: (error: unknown) => void;
	resume: EffectEventCommitAction;
}

/** Retained catches belong to the reveal even while its retry temporarily shows DOM. */
function inlineCaughtErrorOwner(block: Block): ScheduledVisibilityOwner | null {
	const hidden = findScheduledVisibilityOwner(block, true);
	if (hidden !== null) return hidden;
	// A reconnecting primary is temporarily visible during speculative render.
	// Keep its catch with that owner until reveal, even if a later sibling suspends.
	if (EFFECT_RECONNECT_CONTEXT)
		for (
			let context: EffectReconnectContext | null = EFFECT_RECONNECT_CONTEXT;
			context !== null;
			context = context.parent
		) {
			const root = context.root;
			if (root !== block && !blockIsAncestorOf(root, block)) continue;
			const suspense = root.rare?.trySlot;
			if (suspense !== undefined && suspense.tryBlock === root) return suspense;
			const activity = root.rare?.activitySlot;
			if (activity !== undefined && activity.block === root) return activity;
		}
	if (!block.mounted) {
		// An incomplete fallback may be unwinding a suspension to its enclosing
		// Suspense, before that owner has hidden its primary. An ordinary fallback
		// error instead disposes this catch and cancels its parked report.
		for (let parent = block.parentBlock; parent !== null; parent = parent.parentBlock) {
			const suspense = parent.rare?.trySlot;
			if (suspense !== undefined && suspense.tryBlock === parent && !suspense.propagateSuspense) {
				return suspense;
			}
		}
	}
	return null;
}

/** Inline boundary catches have no scheduled-error caller to report for them. */
export function registeredEnqueueInlineCaughtError(state: TrySlot | ErrorSlot): void {
	if (ROOT_ERROR_HANDLERS === null || state.branch !== 0) return;
	const block = state.block;
	if (block === null) return;
	const handler = rootErrorHandlersFor(block)?.onCaughtError;
	if (handler === undefined) return;
	const error = state.err;
	let parked: { owner: ScheduledVisibilityOwner; entry: HiddenRevealAction } | null = null;
	let cleanupRegistered = false;
	// Reuse render/WIP rollback: a later sibling can still abandon this catch.
	// The returned record belongs to one commit's local list, so a nested commit
	// during another action cannot publish it before this fallback's refs/layout.
	const action = (owner?: ScheduledVisibilityOwner): InlineCaughtErrorReport | void => {
		parked = null;
		if (block.disposed || state.block !== block) return;
		const hidden = owner ?? findScheduledVisibilityOwner(block, true);
		if (hidden !== null) {
			if (!cleanupRegistered) {
				cleanupRegistered = true;
				// A child can be replaced while its hidden owner stays alive. Release
				// this report then, rather than retaining it until a future reveal.
				(block.cleanups ??= []).push(() => {
					const pending = parked;
					parked = null;
					if (pending === null) return;
					cancelHiddenRevealAction(pending.owner, pending.entry);
				});
			}
			parked = { owner: hidden, entry: deferHiddenRevealAction(hidden, action) };
			return;
		}
		return { state, block, error, handler, resume: action };
	};
	const owner = inlineCaughtErrorOwner(block);
	if (owner !== null) {
		// The fallback or a later sibling can suspend again. Keep this report with
		// its reveal owner, outside the discarded retry's commit-action checkpoint.
		action(owner);
	} else {
		enqueueEffectEventCommitAction(action);
	}
}

export function registeredPublishInlineCaughtErrorReports(
	reports: InlineCaughtErrorReport[],
): void {
	for (let i = 0; i < reports.length; i++) {
		const report = reports[i];
		if (report.block.disposed || report.state.block !== report.block) continue;
		const hidden = findScheduledVisibilityOwner(report.block, true);
		if (hidden !== null) {
			report.resume();
			continue;
		}
		// A layout effect may request reset without replacing this committed arm.
		// Report the captured error, not the slot's now-reset branch or error value.
		invokeRootErrorHandler(report.handler, report.error);
	}
}

/** True when the owning root's onUncaughtError consumed the report (callers skip their default). */
export function registeredReportUncaughtError(block: Block | null, err: unknown): boolean {
	const h = rootErrorHandlersFor(block)?.onUncaughtError;
	if (h === undefined) return false;
	invokeRootErrorHandler(h, err);
	return true;
}

/**
 * Report the fallback of a hydration boundary, a Suspense arm, a Hydrate
 * island or the root, to onRecoverableError: once per boundary that renders on
 * the client, as React reports. It must stay near-free when no root registered
 * the callback: one module-null check, and `makeError` allocates nothing
 * unless a report fires. The report is delivered on a microtask so a user
 * callback can never re-enter the in-progress hydration walk. A hydrating try
 * body holds it until the body settles (HYDRATION_DIAGNOSTIC_HOLDS), and a
 * root's hydrating attempt delivers it only if it commits
 * (inRootHydrationAttempt).
 */
export function noteRecoverableHydrationError(
	makeError: () => Error,
	block: Block | null = null,
): void {
	if (ROOT_ERROR_HANDLERS === null) return;
	const from = block ?? CURRENT_BLOCK;
	if (HYDRATION_PASS?.holds(() => noteRecoverableHydrationError(makeError, from))) return;
	const h = rootErrorHandlersFor(from)?.onRecoverableError;
	if (h === undefined) return;
	const report = () => queueMicrotask(() => invokeRootErrorHandler(h, makeError()));
	if (HYDRATION_PASS?.awaitsCommit(report) !== true) report();
}

let ROOT_CONTAINER_OWNERS: WeakMap<RootContainer, object> | null = null;

// Generic public renderables (host descriptors, strings, null, and so on) run
// through the ordinary return-value reconciler. Compiled component bodies stay
// on the direct fast path and retain Octane's body+props root overload.
export const ROOT_RENDERABLE_BODY = ((value: unknown) =>
	value === undefined ? null : value) as ComponentBody;
const EMPTY_ROOT_BODY = (() => undefined) as ComponentBody;

function assertValidRootContainer(container: unknown): asserts container is RootContainer {
	if (
		container === null ||
		typeof container !== 'object' ||
		((container as Node).nodeType !== 1 &&
			(container as Node).nodeType !== 9 &&
			(container as Node).nodeType !== 11)
	) {
		throw new Error(formatClientError(63));
	}
}

/** `<html>`, `<head>` and `<body>`, React's document host singletons. */
export function isDocumentSingleton(node: Node): boolean {
	if (node.nodeType !== 1) return false;
	const name = (node as Element).localName;
	return name === 'html' || name === 'head' || name === 'body';
}

/** A script, style or stylesheet link: third parties and streaming put these in a document. */
function isDocumentResource(node: Node): boolean {
	if (node.nodeType !== 1) return false;
	const name = (node as Element).localName;
	return (
		name === 'script' ||
		name === 'style' ||
		(name === 'link' && (node as Element).getAttribute('rel')?.toLowerCase() === 'stylesheet')
	);
}

/**
 * The server nodes that a root replacing a failed hydration discards, as
 * React's clearContainer does: a `<head>` or `<body>` container keeps its
 * document resources, and any other element keeps the renderer's scoped-CSS
 * sidecars, which style the client tree as they styled the server's. A
 * document keeps only its doctype. React keeps a document's `<html>`, `<head>`
 * and `<body>` for its host singletons to reuse. Octane has none, so the
 * client render brings its own, and an `<html>` container discards the
 * server's `<head>` and `<body>` as a document discards its `<html>`.
 */
function hydrationFallbackNodes(container: RootContainer): Node[] {
	const nodes: Node[] = [];
	const name = (container as Element).localName;
	for (let node = getFirstChild(container); node !== null; node = getNextSibling(node))
		if (
			container.nodeType === 9
				? node.nodeType !== 10
				: name === 'head' || name === 'body'
					? !isDocumentResource(node)
					: !isRendererHydrationStyle(node)
		)
			nodes.push(node);
	return nodes;
}

/**
 * Take island `boundaryId`'s server wrapper for the client render replacing a
 * failed hydration, whose commit moves it into place (placeKeptIsland). A
 * render that never commits leaves it where the server DOM had it. The island
 * lives on its own root, so the render adopts it as hydration would have, and
 * only an island the render no longer has is discarded with the server DOM
 * (installHydrationFallback).
 */
export function keptHydrationIsland(boundaryId: string): Element | null {
	const islands = ROOT_RENDER_TRANSACTION?.keptIslands;
	const index =
		islands?.findIndex((island) => island.getAttribute(HYDRATE_ID_ATTR) === boundaryId) ?? -1;
	return index < 0 ? null : islands!.splice(index, 1)[0];
}

/** Move a kept island's server wrapper to `place`, its place in the client render. */
export function placeKeptIsland([place, wrapper]: [Comment, Element]): void {
	place.parentNode?.replaceChild(wrapper, place);
}

/** Remove each of `nodes` that is still attached. */
export function removeNodes(nodes: readonly Node[]): void {
	for (const node of nodes) {
		const parent = node.parentNode;
		if (parent !== null) parent.removeChild(node);
	}
}

/**
 * A root's scheduled first render (a transition mount, or the retry of a mount
 * that suspended) builds off-document like a synchronous mount (renderResolved):
 * its commit clears the container and inserts the root's content.
 */
export function frontierRootMount(block: Block): void {
	const container = block.parentNode;
	if (hydrating || (container as any).$$next !== undefined) return;
	journalRootProperty(block, 'parentNode', container);
	const next = (queueFrontier(block, container, null) as any).$$next as SlotNext;
	next.out.push(() => clearRootContainer(container as RootContainer), null, null);
	block.parentNode = next.frag!;
	noteFrontierMember(next.frag!, block);
}

export function clearRootContainer(container: RootContainer): void {
	if (container.nodeType !== 9) {
		(container as Element | DocumentFragment).textContent = '';
		return;
	}
	// A document's textContent setter is a no-op. Preserve its doctype while
	// releasing renderer-owned content, so future roots keep the document mode.
	for (let child = getFirstChild(container); child !== null;) {
		const next = getNextSibling(child);
		if (child.nodeType !== 10) container.removeChild(child);
		child = next;
	}
}

function claimRootContainer(container: RootContainer): object | null {
	if (process.env.NODE_ENV === 'production') return null;
	const owners = (ROOT_CONTAINER_OWNERS ??= new WeakMap());
	if (owners.has(container)) {
		console.error(
			'You are calling createRoot() on a container that has already been passed to ' +
				'createRoot() before. Instead, call root.render() on the existing root instead if ' +
				'you want to update it.',
		);
	}
	const token = {};
	owners.set(container, token);
	return token;
}

export function releaseRootContainer(container: RootContainer, token: object | null): void {
	if (token !== null && ROOT_CONTAINER_OWNERS?.get(container) === token) {
		ROOT_CONTAINER_OWNERS.delete(container);
	}
}

function warnCreateRootElementOption(options: RootOptions | undefined): RootOptions | undefined {
	if (isElementDescriptor(options)) {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				'You passed a JSX element to createRoot. You probably meant to call root.render instead. ' +
					'Example usage:\n\n  let root = createRoot(domContainer);\n  root.render(<App />);',
			);
		}
		return undefined;
	}
	return options;
}

export function warnRootRenderSecondArgument(second: unknown, container: RootContainer): void {
	if (process.env.NODE_ENV === 'production') return;
	if (typeof second === 'function') {
		console.error(
			'does not support the second callback argument. To execute a side effect after ' +
				'rendering, declare it in a component body with useEffect().',
		);
	} else if (second === container) {
		console.error(
			"You passed a container to the second argument of root.render(...). You don't need to " +
				'pass it again since you already passed it to create the root.',
		);
	} else {
		console.error(
			'You passed a second argument to root.render(...) but it only accepts one argument.',
		);
	}
}

function createRootWithOutputHandler(
	container: RootContainer,
	options: RootOptions | undefined,
	outputHandler: OutputHandler | null,
): Root {
	assertValidRootContainer(container);
	if (options?.bindingLeases !== undefined || options?.controlLeases !== undefined)
		throw new Error(formatClientError(76));
	options = warnCreateRootElementOption(options);
	const ownerToken = claimRootContainer(container);
	// Register the container as an event-delegation target up front. Listeners
	// for all currently-known delegated events attach now; any new event types
	// registered later (via `delegateEvents`) will back-attach automatically.
	registerDelegationTarget(container, true);
	// Lazy root: the block is created on the first `.render()` call.
	const rootPrefix = (options?.identifierPrefix ?? '') + 'r' + takeClientRootId() + '-';
	return makeRoot(
		container,
		null,
		null,
		null,
		{
			prefix: rootPrefix,
			next: 0,
			signalState: { prefix: options?.signalInstancePrefix ?? rootPrefix, next: 0 },
		},
		outputHandler,
		ownerToken,
		options?.signalOwner ?? (signalDocumentEnabled ? documentSignalOwner(container) : undefined),
		options,
	);
}

export function createRoot(container: RootContainer, options?: RootOptions): Root {
	installRootOptions();
	return createRootWithOutputHandler(container, options, renderReturnedValue);
}

/** Compiler-only generic root whose source call supplies no options argument. */
export function __createRootDefaultOptions(container: RootContainer): Root {
	return createRootWithOutputHandler(container, undefined, renderReturnedValue);
}

/** Compiler-only root for a statically proven void `@{}` entry component. */
export function __createVoidRoot(container: RootContainer, options?: RootOptions): Root {
	installRootOptions();
	return createRootWithOutputHandler(container, options, null);
}

/** Compiler-only void root whose source call supplies no options argument. */
export function __createVoidRootDefaultOptions(container: RootContainer): Root {
	return createRootWithOutputHandler(container, undefined, null);
}

/**
 * Compiler-only props for a proven void root's keyless, childless
 * `<Component ... />` target. `root.render(Component, props)` then matches the
 * descriptor the element would build, including live `defaultProps`, without
 * the general element constructor's renderer-context graph.
 */
export function __voidRootProps(type: ComponentBody, props: any): any {
	applyElementDefaultProps(type, props);
	return props;
}

/**
 * A root whose hydration failed renders on the client instead, as React's
 * does, and the server DOM stays on screen until that render commits: the
 * render builds in the mount's frontier, and its commit first removes the
 * server nodes (see hydrationFallbackNodes), publishes the mismatch's
 * development `diagnostic`, and reports `failure` to onRecoverableError once,
 * then inserts the client render. A render that suspends, or that a newer root
 * render replaces, leaves the server DOM exactly as it was. A render that
 * throws to a catch arm commits without the report, and one that ends in an
 * uncaught error discards the server DOM unreported, both as React's do. Each
 * attempt restarts the root's IDs at `idSeed`, as the server's render started
 * them, so the independent islands it keeps match by boundary id.
 */
function installHydrationFallback(
	owner: RootRenderOwner,
	container: RootContainer,
	failure: Error,
	diagnostic: string | undefined,
	report: ((error: unknown) => void) | undefined,
	ids: RootIdState,
	idSeed: number,
): void {
	owner.hydrationFallback = (failed) => {
		const nodes = hydrationFallbackNodes(container);
		if (failed) {
			owner.hydrationFallback = undefined;
			removeNodes(nodes);
			return null;
		}
		const transaction = ROOT_RENDER_TRANSACTION!;
		const islands = Array.from(container.querySelectorAll('[' + HYDRATE_INDEPENDENT_ATTR + ']'));
		const unadopted = (transaction.keptIslands = islands.slice());
		ids.next = idSeed;
		// A document or `<html>` container renders its client `<html>`, or its
		// `<head>` and `<body>`, off-document too: the commit removes the server's
		// first, so the document never holds two. Its server head goes with them,
		// so the render claims none of its elements, and the head entries it places
		// land in the client's head at commit (headBlock).
		if (container.nodeType === 9 || (container as Element).localName === 'html') {
			const head = (container.nodeType === 9 ? (container as Document) : container.ownerDocument!)
				.head;
			if (head !== null) (DISCARDED_HEADS ??= new WeakSet()).add(head);
		}
		const frontier = (queueFrontier(null, container, null) as any).$$next as SlotNext;
		const commit = () => {
			owner.hydrationFallback = undefined;
			// An island the client render adopted belongs to its tree now.
			const discarded = nodes.filter(
				(node) => !islands.includes(node as Element) || unadopted.includes(node as Element),
			);
			discarded.forEach(retireEventHostTree);
			removeNodes(discarded);
			if (process.env.NODE_ENV !== 'production' && diagnostic !== undefined)
				console.error(diagnostic);
			if (report !== undefined && transaction.caught !== true)
				queueMicrotask(() => invokeRootErrorHandler(report, failure));
		};
		frontier.out.push(commit, null, null);
		return frontier;
	};
}

/**
 * Hydrate a server-rendered container and return a live {@link Root} — the
 * React-18 `hydrateRoot(container, element)` shape (container FIRST). Instead of
 * clearing the container and cloning fresh DOM, the compiled mount ADOPTS the
 * existing server DOM: `clone()` returns the server root, `htext()` adopts
 * server text nodes, and event handlers / update bindings are stamped on the
 * adopted nodes (active hydration capability, see clone/htext). The seeded prev-values make
 * the first update a no-op when the client matches the server (no mismatch
 * re-render).
 *
 * Hydration runs ONCE, here on creation. The returned root's `.render(...)` is a
 * normal (non-hydrating) client render against the block mounted here: the same
 * component updates props in place on the adopted DOM, a different component
 * tears down and remounts.
 */
export function hydrateRoot(
	container: RootContainer,
	element: ElementDescriptor,
	options?: RootOptions,
): Root;
export function hydrateRoot(
	container: RootContainer,
	body: ComponentBody,
	props?: any,
	options?: RootOptions,
): Root;
export function hydrateRoot(
	container: RootContainer,
	bodyOrElement: ComponentBody | ElementDescriptor,
	propsOrOptions?: any,
	rootOptions?: RootOptions,
): Root {
	return hydrateRootWithOutputHandler(
		container,
		bodyOrElement,
		propsOrOptions,
		rootOptions,
		renderReturnedValue,
	);
}

/** Compiler-only hydration for a statically proven void `@{}` entry component. */
export function __hydrateVoidRoot(
	container: RootContainer,
	body: ComponentBody,
	props?: any,
	options?: RootOptions,
): Root {
	return hydrateRootWithOutputHandler(container, body, props, options, null);
}

function hydrateRootWithOutputHandler(
	container: RootContainer,
	bodyOrElement: ComponentBody | ElementDescriptor,
	propsOrOptions: any,
	rootOptions: RootOptions | undefined,
	outputHandler: OutputHandler | null,
): Root {
	installRootOptions();
	assertValidRootContainer(container);
	// Leases, presentations and streamed arms below outlive the adoption pass.
	installHydrationDriver();
	startEarlySignalHydration(installEarlyControlBridge);
	let body: ComponentBody;
	let props: any;
	let rootKey: any = null;
	if (isElementDescriptor(bodyOrElement)) {
		rootKey = bodyOrElement.key ?? null;
		if (typeof bodyOrElement.type === 'function') {
			body = bodyOrElement.type as ComponentBody;
			props = bodyOrElement.props;
		} else {
			body = ROOT_RENDERABLE_BODY;
			props = bodyOrElement;
		}
		rootOptions = propsOrOptions as RootOptions | undefined;
	} else if (bodyOrElement === undefined) {
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				'Must provide initial children as second argument to hydrateRoot. ' +
					'Example usage: hydrateRoot(domContainer, <App />)',
			);
		}
		body = EMPTY_ROOT_BODY;
		props = undefined;
	} else if (typeof bodyOrElement === 'function') {
		body = bodyOrElement;
		props = propsOrOptions;
	} else {
		body = ROOT_RENDERABLE_BODY;
		props = bodyOrElement;
	}
	const bindingLeases = rootOptions?.bindingLeases?.map((handle) => {
		const capability = handle as BindingHandle & Partial<BindingHandoffCapability>;
		const lease = capability[BINDING_HANDOFF]?.();
		if (
			lease === undefined ||
			!lease.active() ||
			(lease.host !== undefined && lease.valid?.() === false) ||
			lease.owner !== undefined ||
			!container.contains(lease.root)
		)
			throw new Error(formatClientError(77));
		return lease;
	});
	if (bindingLeases !== undefined && new Set(bindingLeases).size !== bindingLeases.length)
		throw new Error(formatClientError(78));
	const controlLeases = rootOptions?.controlLeases?.map((handle) => {
		const lease = handle?.[CONTROL_HANDOFF]?.();
		if (
			!bindingLeases?.length ||
			lease === undefined ||
			!lease.active() ||
			lease.owner !== undefined ||
			lease.channel !== 'value' ||
			lease.control.localName !== 'textarea' ||
			!container.contains(lease.control)
		)
			throw new Error(formatClientError(77));
		return lease;
	});
	if (
		controlLeases !== undefined &&
		new Set(controlLeases.map((lease) => lease.control)).size !== controlLeases.length
	)
		throw new Error(formatClientError(78));
	const signalOwner =
		rootOptions?.signalOwner ??
		(signalDocumentEnabled ? documentSignalOwner(container) : undefined);
	const initialDocumentSignals =
		rootOptions?.initialDocumentSignals === undefined
			? undefined
			: NATIVE_SIGNAL_HYDRATION
				? captureInitialDocumentSignals(
						rootOptions.initialDocumentSignals,
						((signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner)
							?.scopeKey ?? 'octane:document',
					)
				: (snapshotSignalValue(rootOptions.initialDocumentSignals) as ScopeSeed);
	const nativeSidecar = findHydrateSeedSidecar(container, NATIVE_SIGNAL_SEED_ATTR);
	const nativeRaw = nativeSidecar === null ? undefined : nativeSidecar.textContent || '';
	const nativeManifest =
		nativeRaw !== undefined && NATIVE_SIGNAL_HYDRATION
			? materializeNativeSignalManifest(
					parseNativeSignalManifest(nativeRaw),
					initialDocumentSignals,
				)
			: nativeRaw;
	nativeSidecar?.remove();
	const ownerToken = claimRootContainer(container);
	registerDelegationTarget(container, true);
	let rootBlock = createBlock(
		'root',
		null,
		container,
		null,
		null,
		body,
		props,
		undefined,
		outputHandler,
	);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileTrackComponent(rootBlock, body);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
		__devtoolsSetNameResolver(inspectDevtoolsName);
		__devtoolsSetChildWalker(inspectDevtoolsChildScopes);
		__devtoolsRegisterRoot(rootBlock as unknown as import('../devtools-hook.js').DevtoolsScopeLike);
	}
	const idState: RootIdState = {
		prefix: rootOptions?.identifierPrefix ?? '',
		next: rootOptions?.identifierSeed ?? 0,
		signalState: {
			prefix: rootOptions?.signalInstancePrefix ?? rootOptions?.identifierPrefix ?? '',
			next: 0,
		},
	};
	rootBlock.idState = idState;
	registerRootOptions!(rootBlock, rootOptions);
	// The comment that opens the root's output names the hydration protocol its
	// server spoke. Without it, or with another version, the root renders on the
	// client instead of adopting ranges it would misread. Like a range's
	// comments, it stays, and the root's content follows it. Foreign elements and
	// comments before it stay too, as hydration skips them, but a text node there
	// is where adoption starts, and fails, as React's does. A root that hydrates
	// a server-rendered document, or part of one such as a shell's app container,
	// finds the version that opened the document's output: the HTML parser keeps
	// it before `<html>`, or moves it into `<head>` after head metadata folded in
	// before it. An empty container holds no server output at all: adoption
	// finds nothing there.
	const served = skipFoldedHeadPrefix(container, getFirstChild(container));
	let mark = served;
	let foreignText: Node | null = null;
	// A numeric comment names the root's protocol even when this client cannot
	// read that version. A document-level version cannot override it.
	while (mark !== null && !(mark.nodeType === 8 && /^\d+$/.test((mark as Comment).data))) {
		if (mark.nodeType === 3) foreignText ??= mark;
		mark = getNextSibling(mark);
	}
	let protocolSkew = served !== null && (mark === null || !isProtocolMark(mark));
	if (protocolSkew && mark === null) {
		const doc = container.nodeType === 9 ? (container as Document) : container.ownerDocument!;
		for (const parent of [doc, doc.head])
			for (let node = parent && getFirstChild(parent); node; node = getNextSibling(node))
				if (isProtocolMark(node)) protocolSkew = false;
	}
	let seeds: unknown[] | null = null;
	// The root-local counter starts at zero, matching the server render carrying
	// the same identifierPrefix. Other roots cannot perturb hydration ordering.
	// Adopt server-serialized use(thenable) values, if any: pull them out of the
	// inline data <script> (and remove it, so it isn't taken for a hydratable
	// node) and stage them for useThenable to consume in render order.
	const seedScript = container.querySelector('script[' + SUSPENSE_SCRIPT_ATTR + ']');
	if (seedScript !== null) {
		if (!protocolSkew) seeds = parseSeedJson(seedScript.textContent || '[]');
		seedScript.remove();
	}
	// Executed stream runtime/reveal scripts remain in a real browser's DOM. They
	// are protocol sidecars rather than authored component output, so remove only
	// direct children carrying the renderer-owned marker before root adoption.
	for (let child = container.firstElementChild; child !== null;) {
		const next = child.nextElementSibling;
		if (child.localName === 'script' && child.hasAttribute(STREAM_SCRIPT_ATTR)) child.remove();
		child = next;
	}
	const root = makeRoot(
		container,
		rootBlock,
		body,
		rootKey,
		idState,
		outputHandler,
		ownerToken,
		signalOwner,
		// Retained public render handles need callbacks, not a second seed alias.
		initialDocumentSignals === undefined
			? rootOptions
			: {
					onCaughtError: rootOptions?.onCaughtError,
					onUncaughtError: rootOptions?.onUncaughtError,
					onRecoverableError: rootOptions?.onRecoverableError,
				},
	);
	const owner = idState.renderOwner!;
	if (initialDocumentSignals !== undefined) owner.initialDocumentSignals = initialDocumentSignals;
	if (controlLeases !== undefined) {
		owner.controlLeases = new Map(controlLeases.map((lease) => [lease.control, lease]));
		for (const lease of controlLeases) lease.owner = owner;
	}
	if (bindingLeases !== undefined) {
		owner.bindingLeases = new Set(bindingLeases);
		owner.bindingContainer = container;
		for (const lease of bindingLeases) claimBindingHandoff(lease, owner);
	}
	const adopt = (): void => {
		if (owner.disposed) return;
		if (rootBlock.disposed) {
			rootBlock = createBlock(
				'root',
				null,
				container,
				null,
				null,
				body,
				props,
				undefined,
				outputHandler,
			);
			rootBlock.idState = idState;
			registerRootOptions!(rootBlock, rootOptions);
			owner.adopt!(rootBlock);
		}
		const frame = beginHydratingRootRender(owner);
		createdInRootRender(rootBlock);
		journalRootProperty(idState, 'next', idState.next);
		// Every failed adoption discards its scopes, not the server DOM. Restart
		// the root-local ID and seed cursors together on the next attempt.
		idState.next = rootOptions?.identifierSeed ?? 0;
		const firstNode =
			mark === null
				? skipFoldedHeadPrefix(container, getFirstChild(container))
				: (foreignText ?? skipFoldedHeadPrefix(container, getNextSibling(mark)));
		const hydration = new HydrationCapability(rootBlock, firstNode, seeds);
		// A suspended attempt rolls back, and its retry adopts afresh.
		hydration.defers = true;
		if (bindingLeases?.length) {
			const attempted = rootBlock;
			hydration.retryPresentation = () => {
				if (owner.disposed || owner.current !== attempted) return;
				const refs: SuspenseRefEntry[] = [];
				collectVisibleSubtreeRefs(attempted, refs);
				withRefDetachSuppression(refs, () => unmountBlock(attempted, false));
				queueMicrotask(() => {
					if (owner.disposed || owner.current !== attempted) return;
					retry();
				});
			};
		}
		hydration.passthroughRoot = hydration.passthroughRanges =
			(body as ComponentBody & { [HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner' })[
				HYDRATION_RANGE_BOUNDARY
			] === 'passthrough';
		if (process.env.NODE_ENV !== 'production' && hydration.passthroughRoot)
			auditHydrationProbe('passthroughRoot', false);
		const previousHydration = HYDRATION_PASS;
		swapHydration(hydration);
		const previousNative = setNativeAdoptionResolver(null);
		let completed = false;
		let nativeRecovery: NativeAdoptionMiss | undefined;
		let teardown: (() => void) | null = null;
		try {
			if (protocolSkew) throw new HydrationMismatch(formatClientError(348));
			if (owner.initialDocumentSignals !== undefined && NATIVE_SIGNAL_HYDRATION)
				owner.initialDocumentSignals = captureInitialDocumentSignals(
					owner.initialDocumentSignals,
					((signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner)
						?.scopeKey ?? 'octane:document',
				);
			if (nativeManifest !== undefined) {
				hydration.nativeAdoption = ownNativeAdoption(rootBlock, nativeManifest);
				setNativeAdoptionResolver(hydration.nativeAdoption.resolve);
			}
			if (
				firstNode?.nodeType === 8 &&
				(firstNode as Comment).data ===
					(body as ComponentBody & { [BINDING_VIEW_ROOT]?: string })[BINDING_VIEW_ROOT]
			) {
				// A marked entry view has one compiler-owned root pair, even when its
				// authored output is initially empty. Only that exact entry may consume
				// it: an unmarked parent may begin with a marked child's own range. Its
				// close is matched inside the attempt, which recovers a missing one.
				rootBlock.startMarker = firstNode;
				rootBlock.endMarker = hydration.close(firstNode);
				// The entry's own pair bounds the root's content, so no clone inside
				// it claims the root.
				hydration.rootClaimed = true;
				hydration.node = getNextSibling(firstNode);
			}
			renderBlock(rootBlock);
			if (hydration.deferred !== null) claimDeferred(hydration);
			drainHydrationRenderPhaseUpdates(rootBlock, true);
			// Mount empty server Activities only after every adopted sibling has
			// consumed its server ID and seed positions.
			if (hydration.deferredActivities.length !== 0)
				hydration.suspend(() => {
					for (const activate of hydration.deferredActivities) activate();
				});
			settleTexts(hydration);
			completed = true;
		} catch (thrown) {
			const error = hydrationFailure(hydration, thrown);
			if (error instanceof PresentationAdoptionMiss) {
				rollbackRootRender(owner.transaction!);
				const refs: SuspenseRefEntry[] = [];
				collectVisibleSubtreeRefs(rootBlock, refs);
				withRefDetachSuppression(refs, () => unmountBlock(rootBlock, false));
				if (error.retry && error.lease?.active()) {
					retryPresentationMiss(error, retry);
				} else {
					owner.preservePresentation = true;
					teardown = () => {
						root.unmount();
						if (!Object.prototype.hasOwnProperty.call(error, 'failure')) throw error;
						if (!reportUncaughtError(rootBlock, error.failure)) throw error.failure;
					};
				}
			} else if (error instanceof NativeAdoptionMiss) {
				nativeRecovery = error;
				rollbackRootRender(owner.transaction!);
				unmountBlock(rootBlock, false);
			} else {
				try {
					handleRenderError(rootBlock, error);
				} catch (unhandled) {
					rollbackRootRender(owner.transaction!);
					unmountBlock(rootBlock, false);
					teardown = () => {
						clearRootContainer(container);
						if (!reportUncaughtError(rootBlock, unhandled)) throw unhandled;
					};
				}
				// An unowned root keeps the server screen while its wakeable is
				// pending. A hosted root still belongs to the external renderer's
				// retry protocol and must release its claim/delegation registration.
				if (teardown === null && owner.wakeable === null) teardown = () => root.unmount();
			}
		} finally {
			setNativeAdoptionResolver(previousNative);
			swapHydration(previousHydration);
			if (previousHydration === null) clearHydrationThrow();
			endRootRender(frame);
			if (!inFlush && ROOT_RENDER_TRANSACTION === null) commitRootRenders();
		}
		// A root the attempt gave up on releases its DOM once its render has
		// closed: rendering writes none.
		if (teardown !== null) {
			teardown();
			return;
		}
		if (nativeRecovery !== undefined && !owner.disposed) {
			installHydrationFallback(
				owner,
				container,
				nativeRecovery,
				process.env.NODE_ENV !== 'production' && nativeRecovery instanceof HydrationMismatch
					? nativeRecovery.diagnostic
					: undefined,
				rootOptions?.onRecoverableError,
				idState,
				rootOptions?.identifierSeed ?? 0,
			);
			if (isElementDescriptor(bodyOrElement)) root.render(bodyOrElement);
			else root.render(body, props);
			return;
		}
		if (!completed) return;
		// From here retries are ordinary client updates on the adopted tree.
		owner.retry = () => {
			if (!rootBlock.disposed) scheduleRender(rootBlock);
		};
		if (!syncFlush && !scheduled) requestFlush();
	};
	// Only the first attempt has a hydrateRoot caller to receive a refused lease.
	// A resumed or retried attempt reports it to the root instead.
	const retry = (): void => {
		try {
			adopt();
		} catch (error) {
			if (!reportUncaughtError(rootBlock, error)) throw error;
		}
	};
	owner.retry = retry;
	adopt();
	return root;
}

/** @internal Adapt a compiler-extracted body to the parent-free island loader contract. */
export function createIndependentHydrateActivator(
	body: ComponentBody,
): IndependentHydrateActivator {
	return (context: IndependentHydrateActivationContext) => {
		const { captures, element, manifest, signalOwner, initialDocumentSignals } = context;
		// The island appends later intent here until this replay takes it or the
		// root unmounts. Suspended retries replace the root block, not its owner.
		let intents: HydrationReplayIntent[] | null =
			context.intents.length === 0 ? null : context.intents.slice();
		let rootOwner: RootRenderOwner | undefined;
		const hold: HydrationReplayHold = () =>
			intents !== null && rootOwner !== undefined && !rootOwner.disposed ? intents : null;
		const notify =
			intents === null
				? null
				: (scope: Scope): void => {
						if (intents === null || scope.block.disposed) return;
						const retryBatch = suspenseRetryBatchForSubtree(scope.block);
						if (retryBatch !== null) {
							// A pending arm can commit before the adopted primary. Keep captured
							// commands with the reveal, after its controls, refs and effects publish.
							const effect = scope.effectSlots!.find((entry) => entry.connectedFn === notify)!;
							(retryBatch.afterCommit ??= []).push(() => {
								if (intents === null || scope.block.disposed || !effect.active) return;
								requeuePassiveEffect(scope, effect);
							});
							return;
						}
						const replays = intents;
						intents = null;
						for (const replay of replays) {
							if (replay.earlyBinding) continue;
							// A preceding replay may have changed this control's selection meaning.
							if (!isHydrationSelectionIntentCurrent(replay)) continue;
							const originalTarget = replay.event.target;
							// A matching DOM path is not matching intent: a replaced button may
							// represent a different action even when its markup is identical.
							if (
								originalTarget === null ||
								(originalTarget as Node).nodeType !== 1 ||
								!element.contains(originalTarget as Node)
							)
								continue;
							const target = originalTarget as Element;
							target.dispatchEvent(cloneHydrationReplayEvent(replay.event, target));
						}
					};
		// SSR Hydrate owns an outer frame and a try/content pair. Recreate those
		// owners before the extracted body adopts its own host or authored ranges.
		const content: ComponentBody = (_props, scope, extra) => {
			body(captures, scope, extra);
			// Control adoption runs in the commit queue. Replaying here immediately
			// after hydrateRoot could let that adoption undo a command's clear.
			if (notify !== null) useEffect(notify as EffectFn, [scope], HYDRATE_NOTIFY_SLOT);
		};
		const framed: ComponentBody = (_props, scope) => {
			// This frame stands in for the server's Hydrate instance, whose children
			// render directly under the island's `[prefix, 'root']` signal identity.
			// Resolve it to that root key so it contributes no invocation segment.
			stampSignalInstanceKey(scope, rootSignalInstanceKey(scope.block.idState));
			tryBlock(scope, 0, scope.block.parentNode, content, null, null, scope.block.endMarker);
		};
		const adapter: ComponentBody = (_props, scope) => {
			rootOwner = scope.block.idState.renderOwner;
			componentSlotVoid(
				scope,
				0,
				scope.block.parentNode,
				framed,
				undefined,
				undefined,
				scope.block.endMarker,
			);
		};
		const root = hydrateRoot(element, adapter, captures, {
			identifierPrefix: manifest.boundaryId + '-',
			identifierSeed: manifest.idSeed,
			signalInstancePrefix: manifest.boundaryId,
			...(signalOwner === undefined ? {} : { signalOwner }),
			...(initialDocumentSignals === undefined ? {} : { initialDocumentSignals }),
		});
		if (notify !== null) {
			// A root that failed during hydrateRoot owes nothing; never capture for it.
			if (hold() !== null) holdHydrationReplays(element, hold);
			const unmount = root.unmount;
			root.unmount = () => {
				intents = null;
				unmount();
			};
		}
		return root;
	};
}
