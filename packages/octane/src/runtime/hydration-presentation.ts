// Early binding presentations
//
// Hydrating compiled binding views: presentation frames and leases, and the
// writers that adopt an early presentation or refuse it.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './roots.js';
import { hydrationStarted, hydrating } from '../hydration-flag.js';
import { __normalizeBindingStyle } from '../dom-binding-styles.js';
import { type BindingHandoff, releaseBindingHandoff } from '../dom-binding-handoff.js';
import { type ControlHandoff, hasSignalControlBinding } from '../signals/control-handoff.js';
import { BOOLEAN_ATTR_PROPS, ATTRIBUTE_ALIASES, cssStyleValue } from '../constants.js';
import { snapshotHydrationControl, consumeHydrationControl } from '../hydration/event-capture.js';
import { isRestoredHydrationTextarea } from '../hydration/control-capture.js';
import { markComponentFlags, COMPONENT_FLAG_BOUNDARY } from '../component-flags.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { bindingRootMarker } from '../dom-binding-protocol.js';
import {
	type NativeReadWitness,
	validateNativeReadWitness,
} from '../signals/native-read-collector.js';
import { setNativeAdoptionResolver, ADOPTION_CONTROL } from '../signals/read-protocol.js';
import {
	activeSynchronousSignalOwner,
	activeSignalOwnerEnvironment,
	currentExplicitSignalOwner,
	currentSignalOwner,
} from '../signals/owner-context.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import { hasHydrationControlSignalWriter } from '../signals/early-values.js';
import { SIGNAL_BINDING_SUBSCRIBE } from '../signals/types.js';
import { normalizeClass } from '../css.js';
import type { Scope, Block, RootRenderOwner, OffscreenCapture, HostPropSource } from './types.js';
import { SIGNAL_BINDINGS_ENABLED } from './drivers.js';
import {
	runWithBlockSignalOwner,
	type NativeStyleBinding,
	disposeNativeStyleBinding,
	isScalarNativeStyle,
	writeScalarNativeStyle,
	preparedNativeStyleBody,
	preparedNativeProjectionBody,
	nativePresentationBinding,
	beginNativeReadScope,
	endNativeReadScope,
	beginNativeReadWitness,
	finishNativeReadWitness,
} from './signal-owners.js';
import {
	ROOT_RENDER_ROLLBACK,
	retireBindingLease,
	scheduleRender,
	reportEffectError,
} from './engine.js';
import { registerHookCleanup } from './hooks.js';
import { isSuspenseException } from './use.js';
import { reportRendererOwnerError } from './context.js';
import { CURSOR, type HydrationCapability } from './hydration.js';
import { BlockImpl, ScopeImpl, invalidateRender } from './block.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
	preserveRootCreatedDom,
	WIP_CAPTURE,
} from './render.js';
import {
	pendingWrites,
	DIRECT_SIGNAL_BINDING,
	type DirectSignalAttributeKind,
	type DirectSignalBinding,
	isSignalHandle,
	bindingTransitionNotify,
	readSignalBinding,
	isWritableSignal,
	disposeDirectSignalBinding,
	validateDirectSignalControl,
	writeDirectSignalBinding,
	writeDirectSignalAttribute,
	DIRECT_SIGNAL_TEXT_POLICY,
	DIRECT_SIGNAL_TEXT_ONLY_POLICY,
	DIRECT_SIGNAL_ATTRIBUTE_POLICY,
	DIRECT_SIGNAL_VALUE_POLICY,
	updateDirectSignalBinding,
	installDirectSignalControl,
	queueDirectSignalControlAdoption,
	activateDirectSignalBinding,
	prepareSignalHostPropSources,
} from './signal-bindings.js';
import {
	attributeUnchanged,
	DANGER_HTML_ACTIVE,
	HTML_NS,
	setStringData,
	setBooleanAttribute,
	coerceAttrValue,
	setClassAttr,
	setStyle,
	setText,
} from './host-props.js';
import { JOURNAL_PROP, JOURNAL_EVENT_OWNER, journalBag } from './commit.js';
import { getFirstChild, getNextSibling, coerceText, bindingText } from './templates.js';
import { type SignalEventOwner, queueEventOwner } from './events.js';
import {
	UNCONTROLLED,
	onCtrlCompositionEnd,
	renderControlledState,
	armControlled,
} from './forms.js';

export const BINDING_VIEW_ROOT = /* @__PURE__ */ Symbol.for('octane.binding.view-root');

export interface PresentationHydrationFrame {
	previous: PresentationHydrationFrame | null;
	scope: Scope;
	writes: Map<object, Map<string, () => void>>;
	native: ReturnType<typeof setNativeAdoptionResolver>;
	readToken: number;
	witnessToken: number;
	witnesses: Map<object, NativeReadWitness | null>;
	/** Successor native writers only; a host receipt never tears down children. */
	hostSuccessors?: Map<object, () => void>;
	controls?: Map<
		Element,
		{
			valid: (retired?: boolean) => boolean;
			binding: DirectSignalBinding;
			lease: ControlHandoff | undefined;
			stop?: (() => void) | undefined;
		}
	>;
	completed: boolean;
	lease: BindingHandoff;
	revision?: number;
	/** Installed only for structural/control/host receipts, not ordinary fixed presentations. */
	current?: typeof currentPresentation;
	hydration: HydrationCapability | null;
}

export let PRESENTATION_HYDRATION: PresentationHydrationFrame | null = null;
export const PRESENTATION_PREPARATIONS = /* @__PURE__ */ new WeakMap<
	BindingHandoff,
	PresentationHydrationFrame
>();

/** A refused takeover leaves the early owner active; it is not a client remount request. */
export class PresentationAdoptionMiss extends Error {
	/** Assigned in the constructor, so that client-only bundles drop the class. */
	declare readonly [ADOPTION_CONTROL]: true;
	/** Presence distinguishes authored `throw undefined` from an eligibility refusal. */
	declare failure?: unknown;
	constructor(
		readonly lease: BindingHandoff | undefined,
		readonly retry: boolean,
		readonly revision = PRESENTATION_HYDRATION?.revision,
	) {
		super(formatClientError(75));
		this[ADOPTION_CONTROL] = true;
	}
}

export function retryPresentationMiss(error: PresentationAdoptionMiss, retry: () => void): void {
	const revision = error.lease?.revision?.();
	if (revision !== undefined && revision >= 0 && revision !== error.revision) queueMicrotask(retry);
	else error.lease?.afterPublication?.(retry);
}

/**
 * Whether `error` is hydration control flow (NativeAdoptionMiss, including a
 * HydrationMismatch, or PresentationAdoptionMiss), which every application
 * boundary passes through. It tests their brand, so client-only bundles keep
 * neither class.
 */
export function isAdoptionControl(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { [ADOPTION_CONTROL]?: true })[ADOPTION_CONTROL] === true
	);
}

/** @internal Preserve the early presentation when an authored preparation throws. */
export function presentationFailure(error: unknown): never {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame !== null && !isSuspenseException(error) && !isAdoptionControl(error)) {
		const failure = new PresentationAdoptionMiss(frame.lease, false);
		failure.failure = error;
		throw failure;
	}
	throw error;
}

export function presentationMiss(retry = true): never {
	throw new PresentationAdoptionMiss(PRESENTATION_HYDRATION?.lease, retry);
}

function currentPresentation(frame: PresentationHydrationFrame): boolean {
	if (frame.controls !== undefined && [...frame.controls.values()].some(({ valid }) => !valid()))
		return false;
	if (frame.revision === undefined && frame.controls === undefined) return true;
	const lease = frame.lease;
	return (
		lease.active() &&
		lease.valid?.() !== false &&
		lease.revision?.() === frame.revision &&
		lease.root.parentNode !== null &&
		(lease.host === undefined
			? lease.end?.parentNode === lease.root.parentNode
			: lease.owner === frame.scope.block.idState.renderOwner &&
				frame.scope.block.idState.renderOwner!.bindingContainer!.contains(lease.root)) &&
		[...frame.witnesses.values()].every(
			(witness) => witness === null || validateNativeReadWitness(witness),
		)
	);
}

function trackPresentationFrame(frame: PresentationHydrationFrame): void {
	if (frame.current !== undefined) return;
	frame.current = currentPresentation;
	(WIP_CAPTURE!.presentations ??= []).push(frame);
	if (frame.hydration === null) return;
	frame.hydration.presentation = true;
	for (let block: Block | null = frame.scope.block; block !== null; block = block.parentBlock) {
		preserveRootCreatedDom(block);
		if (block === frame.hydration.rootBlock) break;
	}
}

export function currentPresentations(capture: OffscreenCapture): boolean {
	return capture.presentations?.every((frame) => frame.current!(frame)) !== false;
}

export function retryPresentations(capture: OffscreenCapture): void {
	const retries = new Set<() => void>();
	for (const frame of capture.presentations ?? []) {
		PRESENTATION_PREPARATIONS.delete(frame.lease);
		if (frame.hydration?.retryPresentation) retries.add(frame.hydration.retryPresentation);
	}
	for (const retry of retries) retry();
}

export function preparePresentationOperation(
	frame: PresentationHydrationFrame,
	target: object,
	key: string,
	write: () => void,
): void {
	let operations = frame.writes.get(target);
	if (operations === undefined) frame.writes.set(target, (operations = new Map()));
	operations.set(key, write);
}

function matchesClosedPresentationKeys(value: unknown, keys: readonly string[]): boolean {
	if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
	let index = 0;
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') return false;
		if (!Object.prototype.propertyIsEnumerable.call(value, key)) continue;
		if (keys[index++] !== key) return false;
	}
	return index === keys.length;
}

function hasClosedPresentationView(lease: BindingHandoff, scope: Scope, id: string): boolean {
	try {
		const root = scope.block.startMarker ?? (hydrating ? CURSOR?.node : undefined);
		const proof = root == null ? undefined : lease.view?.(root);
		return proof?.id === id && matchesClosedPresentationKeys(scope.block.props, proof.closedProps);
	} catch {
		return false;
	}
}

/**
 * A host moved off its server site cannot be adopted there, so hydration builds
 * the renderer's own host in its place. Committing that replacement retires the
 * displaced early owner without touching its moved DOM; a discarded attempt
 * leaves it live, exactly like a suspended takeover.
 */
function supersedeDisplacedHost(
	owner: RootRenderOwner,
	id: string,
	scope: Scope,
	node: Node | null,
): void {
	const parent = node === null ? scope.block.parentNode : node.parentNode;
	if (parent === null) return;
	for (const lease of owner.bindingLeases!) {
		if (
			lease.id !== id ||
			lease.host === undefined ||
			!lease.active() ||
			lease.displaced?.(parent, node) !== true
		)
			continue;
		(WIP_CAPTURE!.renderCleanups ??= []).push((discarded) => {
			const frame = PRESENTATION_PREPARATIONS.get(lease);
			// Another live instance that adopted the moved host owns its takeover.
			if (discarded || owner.disposed || (frame !== undefined && !frame.scope.block.disposed))
				return;
			retireBindingLease(owner, lease);
		});
		return;
	}
}

/** Top-level server nodes that a hydration fallback discarded (markHydrationDiscard). */
let DISCARDED_HYDRATION_NODES: WeakSet<Node> | null = null;

/**
 * A fallback boundary is about to discard its server DOM, from `first` up to
 * `end` in `parent`, and render on the client, as React deletes a failed
 * boundary's server DOM. Captured intent that targets those nodes is dropped
 * (discardedByHydration). An early binding whose server site lies there ends
 * with it: a host removed with the DOM at the root's commit
 * (retireDetachedBindingLeases), and a host moved away while the boundary was
 * pending once the fallback commits.
 */
export function markHydrationDiscard(
	owner: RootRenderOwner | undefined,
	parent: Node,
	first: Node | null,
	end: Node | null,
): void {
	const nodes = (DISCARDED_HYDRATION_NODES ??= new WeakSet());
	for (let node = first; node !== null && node !== end; node = getNextSibling(node))
		nodes.add(node);
	const capture = WIP_CAPTURE ?? ROOT_RENDER_TRANSACTION?.capture ?? null;
	if (!owner?.bindingLeases?.size || capture === null) return;
	const moved: BindingHandoff[] = [];
	for (const lease of owner.bindingLeases)
		if (
			lease.displaced !== undefined &&
			lease.active() &&
			lease.valid?.() === false &&
			displacedWithin(lease, parent, first, end)
		)
			moved.push(lease);
	if (moved.length === 0) return;
	(capture.renderCleanups ??= []).push((discarded) => {
		if (discarded || owner.disposed) return;
		for (const lease of moved) retireBindingLease(owner, lease);
	});
}

/**
 * Whether `lease`'s host moved off a server site among `parent`'s children
 * from `first` through `end` (null: the end of `parent`), or inside one of them.
 */
function displacedWithin(
	lease: BindingHandoff,
	parent: Node,
	first: Node | null,
	end: Node | null,
): boolean {
	for (let node = first; ; node = getNextSibling(node)) {
		if (lease.displaced!(parent, node)) return true;
		if (node === null || node === end) return false;
		if (node.nodeType === 1 && displacedWithin(lease, node, getFirstChild(node), null)) return true;
	}
}

/** Whether a hydration fallback discarded `node` (markHydrationDiscard) and it stays detached. */
export function discardedByHydration(node: Node): boolean {
	if (DISCARDED_HYDRATION_NODES === null) return false;
	let root = node;
	for (let parent = root.parentNode; parent !== null; parent = parent.parentNode) root = parent;
	return DISCARDED_HYDRATION_NODES.has(root);
}

/**
 * @internal Only compiler-proven native views enter this publication boundary.
 * Only a hydrateRoot root holds binding leases, so a runtime that never
 * hydrated opens no frame.
 */
export function beginPresentationHydration(
	scope: Scope,
	id: string,
	supported = false,
	structural = false,
	conditionalRest = false,
	host = false,
): PresentationHydrationFrame | null {
	if (!hydrationStarted) return null;
	const owner = scope.block.idState.renderOwner;
	if (
		PRESENTATION_HYDRATION !== null &&
		PRESENTATION_HYDRATION.scope.block.idState.renderOwner === owner
	) {
		if (conditionalRest) {
			if (
				!supported ||
				!structural ||
				!hasClosedPresentationView(PRESENTATION_HYDRATION.lease, scope, id)
			)
				presentationMiss(false);
		} else if (!supported) presentationMiss(false);
		return null;
	}
	if (owner?.bindingLeases === undefined || WIP_CAPTURE === null) return null;
	const hydration = hydrating ? CURSOR : null;
	const lease = [...owner.bindingLeases].find(
		(candidate) =>
			candidate.id === id &&
			(candidate.root === scope.block.startMarker ||
				candidate.root === hydration?.node ||
				(candidate.root.nodeType === 8 && candidate.root.nextSibling === hydration?.node) ||
				(candidate.host !== undefined &&
					PRESENTATION_PREPARATIONS.get(candidate)?.scope === scope)),
	);
	if (lease === undefined) {
		if (host && hydration !== null) supersedeDisplacedHost(owner, id, scope, hydration.node);
		return null;
	}
	if (!lease.active()) throw new PresentationAdoptionMiss(lease, false);
	if (host !== (lease.host !== undefined)) throw new PresentationAdoptionMiss(lease, false);
	if (
		conditionalRest
			? !supported || !structural || !hasClosedPresentationView(lease, scope, id)
			: !supported
	)
		throw new PresentationAdoptionMiss(lease, false);
	const revision = lease.revision?.();
	if ((revision === undefined || revision >= 0) && lease.valid?.() === false)
		throw new PresentationAdoptionMiss(lease, false);
	if (revision !== undefined && ((!structural && !host) || revision < 0))
		throw new PresentationAdoptionMiss(lease, revision < 0, revision);
	const pending = PRESENTATION_PREPARATIONS.get(lease);
	const frame: PresentationHydrationFrame = {
		previous: PRESENTATION_HYDRATION,
		scope,
		// A suspended component's cache can skip an unchanged writer on retry.
		// Carry that same scope's prepared operations, replacing by native channel.
		writes:
			pending?.scope === scope
				? new Map([...pending.writes].map(([node, writes]) => [node, new Map(writes)]))
				: new Map(),
		native: setNativeAdoptionResolver(null),
		// An ordinary prop getter can perform the first native read during takeover.
		// Install its owner and witness before evaluating the view.
		readToken: beginNativeReadScope(scope),
		witnessToken: beginNativeReadWitness(),
		witnesses: pending?.scope === scope ? new Map(pending.witnesses) : new Map(),
		...(lease.host === undefined
			? {}
			: { hostSuccessors: new Map(pending?.scope === scope ? pending.hostSuccessors : undefined) }),
		...(pending?.scope === scope && pending.controls !== undefined
			? { controls: new Map(pending.controls) }
			: {}),
		completed: false,
		lease,
		...(revision === undefined ? {} : { revision }),
		hydration,
	};
	PRESENTATION_HYDRATION = frame;
	if (revision !== undefined || frame.controls !== undefined) trackPresentationFrame(frame);
	PRESENTATION_PREPARATIONS.set(lease, frame);
	const hostRefs = host ? WIP_CAPTURE.refs : undefined;
	(WIP_CAPTURE.renderCleanups ??= []).push((discarded) => {
		if (
			discarded ||
			!frame.completed ||
			owner.disposed ||
			scope.block.disposed ||
			PRESENTATION_PREPARATIONS.get(lease) !== frame
		)
			return;
		if (!currentPresentation(frame)) {
			if (frame.hydration?.retryPresentation !== undefined) frame.hydration.retryPresentation();
			else throw new PresentationAdoptionMiss(lease, false);
			return;
		}
		PRESENTATION_PREPARATIONS.delete(lease);
		owner.bindingLeases!.delete(lease);
		releaseBindingHandoff(lease);
		// Only prepared native writes publish here, before refs. Retiring early
		// ownership does not restore old styles/classes or retire shared signals.
		let publicationStarted = false;
		let published = false;
		let hostFailed = false;
		let hostFailure: unknown;
		try {
			lease.retire(() => {
				// The early presentation is already retired on callback entry, even
				// when a later prepared writer fails before publication completes.
				publicationStarted = true;
				try {
					for (const writes of frame.writes.values()) for (const write of writes.values()) write();
				} catch (error) {
					// Publication is irreversible. Revoke every captured successor before
					// arbitrary unsubscribe or presentation cleanup can dispatch input.
					for (const stop of frame.hostSuccessors?.values() ?? []) {
						try {
							stop();
						} catch {
							// Keep the publication error while revoking every host writer.
						}
					}
					frame.hostSuccessors?.clear();
					for (const [element, control] of frame.controls ?? []) {
						const binding = control.binding;
						// An already-released, intact and unclaimed channel needs no new
						// guard that would mask its data owner's original read failure.
						if (binding.disposed && control.valid(true)) continue;
						// Undefined guards a channel without an offered early owner too.
						(owner.controlLeases ??= new Map()).set(element, control.lease);
						if (binding.disposed) continue;
						if (binding.input !== undefined) renderControlledState(element)!.v = UNCONTROLLED;
						control.stop = binding.unsubscribe;
						binding.unsubscribe = undefined;
						disposeDirectSignalBinding(binding);
					}
					for (const control of frame.controls?.values() ?? []) {
						try {
							control.stop?.();
						} catch {
							// Preserve the publication failure, but attempt every cleanup.
						}
					}
					throw error;
				}
				published = true;
			});
		} catch (error) {
			if (!publicationStarted) throw error;
			if (frame.hostSuccessors !== undefined) {
				hostFailed = true;
				hostFailure = error;
			} else reportRendererOwnerError(scope, error);
		} finally {
			// Retirement may invoke application cleanup which moves/replaces the
			// host. Revoke only this receipt's successor writers, never children.
			if (frame.hostSuccessors !== undefined && (!published || lease.valid?.() === false)) {
				published = false;
				// Successful receipts disappear. This failed, already-retired receipt
				// fences only the same host scope until normal root disposal clears it.
				owner.bindingLeases!.add(lease);
				PRESENTATION_PREPARATIONS.set(lease, frame);
				for (const entry of hostRefs!) if (entry.el === lease.root) entry.ref = null;
				for (const stop of frame.hostSuccessors.values()) {
					try {
						stop();
					} catch (error) {
						if (!hostFailed) {
							hostFailed = true;
							hostFailure = error;
						}
					}
				}
				if (!hostFailed) {
					hostFailed = true;
					hostFailure = new Error(formatClientError(77));
				}
			}
			frame.hostSuccessors?.clear();
			frame.writes.clear();
			frame.controls?.clear();
			if (
				published &&
				!owner.disposed &&
				owner.current !== null &&
				[...frame.witnesses.values()].some(
					(witness) => witness !== null && !validateNativeReadWitness(witness),
				)
			) {
				// User retirement cleanup can write after acceptance. Reuse the
				// native publication fence: refs/effects wait for the live reread,
				// while direct bindings already observe writes under normal ownership.
				owner.generation++;
				invalidateRender(scope.block);
				scheduleRender(owner.current);
			}
			frame.witnesses.clear();
		}
		if (hostFailed) reportRendererOwnerError(scope, hostFailure);
	});
	return frame;
}

/** @internal Restore the read frame even when preparation suspends or throws. */
export function endPresentationHydration(
	frame: PresentationHydrationFrame | null,
	completed = true,
): void {
	if (!hydrationStarted || frame === null) return;
	frame.completed = completed;
	frame.witnesses.set(frame.scope, finishNativeReadWitness(frame.witnessToken, completed));
	endNativeReadScope(frame.readToken, completed);
	setNativeAdoptionResolver(frame.native);
	PRESENTATION_HYDRATION = frame.previous;
}

export function preparedPresentationAttribute(
	el: Element,
	name: string,
	value: unknown,
	kind: 'attr' | 'booleanAttr' | DirectSignalAttributeKind,
): unknown {
	if (kind === 'class') return value == null || value === false ? null : normalizeClass(value);
	if (kind === 'booleanAttr' || kind === setBooleanAttribute)
		return !!value && typeof value !== 'function' && typeof value !== 'symbol';
	const result = coerceAttrValue(el, name, value);
	// Generic boolean writers require truthiness, not their normalized empty string.
	return result === '' && BOOLEAN_ATTR_PROPS.has(name.toLowerCase()) ? true : result;
}

/** A fixed scalar view owns a markerless single-text-child leaf. */
function prepareFixedPresentationText(
	frame: PresentationHydrationFrame,
	element: Element,
	value: unknown,
): Text {
	const node = getFirstChild(element);
	let root = frame.lease.root;
	if (frame.lease.end !== root) {
		const start = CURRENT_SCOPE?.block.startMarker;
		const range = start == null ? undefined : frame.lease.ranges?.().get(start);
		root = start?.nextSibling ?? root;
		if (range?.kind !== 'view' || root.nextSibling !== range.end) presentationMiss(false);
	}
	if (
		frame.lease.host !== undefined ||
		!root.contains(element) ||
		node?.nodeType !== 3 ||
		getNextSibling(node) !== null
	)
		presentationMiss(false);
	const text = coerceText(value);
	preparePresentationOperation(frame, node, 'text', () => {
		if (node.nodeValue !== text) setText(node as Text, text);
	});
	return node as Text;
}

function preparePresentationSignalBinding(
	args: any[],
	frame: PresentationHydrationFrame,
	text = false,
	fixedText?: typeof prepareFixedPresentationText,
): unknown {
	const [scope, previous, element] = args as [Scope, unknown, Element];
	const name = text ? undefined : (args[3] as string);
	const value = args[text ? 3 : 4];
	const site = args[text ? 4 : 5] as string;
	const attributeKind = text ? undefined : (args[6] as DirectSignalAttributeKind);
	const policy = text
		? args[5]
			? DIRECT_SIGNAL_TEXT_ONLY_POLICY
			: DIRECT_SIGNAL_TEXT_POLICY
		: DIRECT_SIGNAL_ATTRIBUTE_POLICY;
	return runWithBlockSignalOwner(scope, () => {
		const handle = isSignalHandle(value) ? value : null;
		// Unlike the ordinary direct-binding read, this read belongs to validation.
		// A host receipt validates this channel without subscribing the component
		// as a second writer beside the direct binding being prepared below.
		const witness =
			handle !== null && frame.lease.host !== undefined ? beginNativeReadWitness(true) : -1;
		let current: unknown;
		let readCompleted = false;
		try {
			current = handle === null ? value : handle.get();
			readCompleted = true;
		} finally {
			if (witness >= 0)
				frame.witnesses.set(handle!, finishNativeReadWitness(witness, readCompleted));
		}
		// bindSignalText(scope, previous, position, value, site, onlyChild,
		// previousValue, seededText, bindingMarker): the marker is argument 8.
		if (
			text &&
			((current !== null && (typeof current === 'object' || typeof current === 'function')) ||
				(typeof args[8] !== 'string' && (args[5] !== true || fixedText === undefined)))
		)
			presentationMiss(false);
		const prepared = text
			? typeof args[8] === 'string'
				? bindingText(element, current, args[8])
				: fixedText!(frame, element, current)
			: preparedPresentationAttribute(element, name!, current, attributeKind!);
		if (handle === null) {
			if (text) {
				frame.writes.get(element)?.delete('signalText');
				return prepared;
			}
			preparePresentationOperation(frame, element, name!, () =>
				writeDirectSignalAttribute(element, prepared, 'attribute', previous, name, attributeKind),
			);
			return value;
		}
		const prior = previous as DirectSignalBinding | undefined;
		const reusable =
			prior?.[DIRECT_SIGNAL_BINDING] === true &&
			!prior.disposed &&
			prior.unsubscribe === undefined &&
			prior.handle === handle &&
			prior.target === element &&
			prior.policy === policy &&
			prior.site === site &&
			prior.name === name &&
			prior.attributeKind === attributeKind;
		const binding: DirectSignalBinding = reusable
			? prior
			: {
					[DIRECT_SIGNAL_BINDING]: true,
					scope,
					target: element,
					policy,
					site,
					name,
					attributeKind,
					handle,
					value: current,
					disposed: false,
				};
		if (text) binding.text = prepared as Text;
		if (!reusable) registerHookCleanup(scope, () => disposeDirectSignalBinding(binding));
		frame.hostSuccessors?.set(binding, () => disposeDirectSignalBinding(binding));
		// Text insertion/update already has its own operation; activation must not replace it.
		preparePresentationOperation(frame, element, name ?? 'signalText', () => {
			if (binding.disposed) return;
			if (!text)
				writeDirectSignalAttribute(element, prepared, 'attribute', previous, name, attributeKind);
			binding.value = current;
			runWithBlockSignalOwner(scope, () => activateDirectSignalBinding(binding, undefined));
		});
		return binding;
	});
}

/** Prepare a native textarea without touching its live early control owner. */
function preparePresentationSignalValue(args: any[], frame: PresentationHydrationFrame): unknown {
	const [scope, previous, element, handle, site] = args as [
		Scope,
		unknown,
		HTMLTextAreaElement,
		unknown,
		string,
	];
	return runWithBlockSignalOwner(scope, () => {
		if (
			element.localName !== 'textarea' ||
			element.namespaceURI !== HTML_NS ||
			!isWritableSignal(handle)
		)
			presentationMiss(false);
		validateDirectSignalControl(element, site);
		const value = handle.get();
		if (typeof value !== 'string') presentationMiss(false);
		const owner = scope.block.idState.renderOwner!;
		const lease = owner.controlLeases?.get(element);
		const valid = (retired = false) =>
			owner.bindingContainer!.contains(element) &&
			(!retired || frame.lease.valid?.() !== false) &&
			(lease !== undefined && !retired
				? lease.owner === owner &&
					lease.active() &&
					runWithBlockSignalOwner(scope, () => lease.matches(handle))
				: !hasSignalControlBinding(element, 'value') &&
					!hasHydrationControlSignalWriter(element, 'value'));
		if (!valid()) presentationMiss(false);
		const prior = previous as DirectSignalBinding | undefined;
		const reusable =
			prior?.[DIRECT_SIGNAL_BINDING] === true &&
			!prior.disposed &&
			prior.input === undefined &&
			prior.handle === handle &&
			prior.target === element &&
			prior.policy === DIRECT_SIGNAL_VALUE_POLICY &&
			prior.site === site;
		const binding: DirectSignalBinding = reusable
			? prior
			: {
					[DIRECT_SIGNAL_BINDING]: true,
					scope,
					target: element,
					policy: DIRECT_SIGNAL_VALUE_POLICY,
					site,
					handle,
					value,
					disposed: false,
				};
		(frame.controls ??= new Map()).set(element, { valid, binding, lease });
		trackPresentationFrame(frame);
		if (!reusable) registerHookCleanup(scope, () => disposeDirectSignalBinding(binding));
		if (binding.unsubscribe === undefined) {
			// Acquire the fallible subscription before either early lease retires.
			// It cannot write or join a transition until input ownership is installed.
			const notify = bindingTransitionNotify(binding, () => {
				if (binding.controlWriterCleanup !== undefined) updateDirectSignalBinding(binding);
			});
			const stop = handle[SIGNAL_BINDING_SUBSCRIBE](notify, () =>
				disposeDirectSignalBinding(binding),
			);
			if (typeof stop !== 'function') throw new TypeError(formatClientError(74));
			if (binding.disposed || scope.block.disposed) {
				stop();
				presentationMiss(false);
			}
			binding.unsubscribe = stop;
		}
		preparePresentationOperation(frame, element, 'value', () => {
			if (binding.disposed || scope.block.disposed) return;
			runWithBlockSignalOwner(scope, () => {
				// An earlier control's retirement can synchronously replace this
				// captured owner. Never publish a stale writer over its successor.
				if (!valid()) throw new Error(formatClientError(77));
				const before = snapshotHydrationControl(element)!;
				const priorValue = readSignalBinding(handle);
				const restored =
					lease === undefined
						? isRestoredHydrationTextarea(element, priorValue)
						: !before.composing &&
							!lease.composing() &&
							typeof priorValue === 'string' &&
							before.value !== priorValue.replace(/\r\n?/g, '\n');
				const ctrl = armControlled(element);
				ctrl.composing = before.composing || lease?.composing() === true;
				if (ctrl.composing) element.addEventListener('blur', onCtrlCompositionEnd);
				// Until the successor owns input, delegated restoration must not replay
				// an old controlled value over a native edit dispatched by cleanup.
				ctrl.v = UNCONTROLLED;
				// The old owner is offered explicitly. Revoke it only once the matching
				// presentation commits, before enabling the successor's input writer.
				let failed = false;
				let failure: unknown;
				if (lease !== undefined) {
					try {
						lease.retire();
					} catch (error) {
						failed = true;
						failure = error;
					} finally {
						lease.owner = undefined;
					}
				}
				// Retirement is user code: revalidate the captured presentation before
				// installing its input writer. Keep a revoked offer guarded against
				// ordinary writes until root cleanup.
				if (lease !== undefined && !scope.block.disposed && !valid(true))
					throw failed ? failure : new Error(formatClientError(77));
				if (lease !== undefined) owner.controlLeases!.delete(element);
				if (!binding.disposed && !scope.block.disposed) {
					// User cleanup may dispatch input or end composition. Sample again;
					// the renderer's composition listeners were armed before cleanup.
					const snapshot = snapshotHydrationControl(element)!;
					binding.value = priorValue;
					// The offered owner already published earlier input to the model.
					// An eventless DOM restore may also transfer, unless retirement advances the model.
					binding.pendingControl =
						snapshot.editRevision > (lease === undefined ? 0 : before.editRevision) || restored;
					installDirectSignalControl(binding);
					if (!binding.pendingControl) consumeHydrationControl(element, snapshot.revision);
					if (binding.pendingControl)
						queueDirectSignalControlAdoption(
							binding,
							lease === undefined ? 0 : before.editRevision,
						);
					else {
						const current = readSignalBinding(handle);
						ctrl.sawV = true;
						// setValue compares against the prepared model: a genuinely
						// changed value must still win during inherited composition.
						ctrl.v = value;
						binding.value = current;
						writeDirectSignalBinding(binding, current);
					}
				}
				if (failed) reportRendererOwnerError(scope, failure);
			});
		});
		return binding;
	});
}

/** @internal Only authored host spreads retain generic host preparation. */
export function presentationHostWrite<T>(writer: (...args: any[]) => T, ...args: any[]): T {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame === null) {
		// A mount builds a detached host. An update rebinds the same committed
		// binding, so it commits like every other presentation writer (#2043).
		const transaction =
			args[1] === undefined || ROOT_RENDER_TRANSACTION === null
				? null
				: pendingWrites(CURRENT_BLOCK);
		if (transaction === null) return writer(...args);
		transaction.ops.push(commitRenderWrite, [writer, args, CURRENT_BLOCK]);
		return args[1] as T;
	}
	const [scope, previous, element, sources, site, hasNestedChildren, readStyle, proofs] = args as [
		Scope,
		unknown,
		Element,
		readonly HostPropSource[],
		string,
		boolean,
		((value: unknown) => unknown) | undefined,
		readonly { id: string; site: number; node: number; spread: number; source: number }[],
	];
	if (frame.revision === undefined || !Array.isArray(proofs) || proofs.length === 0)
		presentationMiss(false);
	const proven = new Set<number>();
	for (const proof of proofs) {
		const receipt = frame.lease.rest?.(element, proof.site);
		const row = sources[proof.source];
		if (
			receipt === undefined ||
			receipt.id !== proof.id ||
			receipt.node !== proof.node ||
			receipt.spread !== proof.spread ||
			row?.[0] !== true ||
			proven.has(proof.source) ||
			!matchesClosedPresentationKeys(row[1], receipt.keys)
		)
			presentationMiss(false);
		proven.add(proof.source);
	}
	for (let index = 0; index < sources.length; index++)
		if (sources[index]![0] && !proven.has(index)) presentationMiss(false);
	const prepared = prepareSignalHostPropSources(
		scope,
		previous,
		element,
		sources,
		site,
		hasNestedChildren,
		readStyle,
	);
	preparePresentationOperation(frame, element, 'hostProps', prepared.publish);
	return prepared.binding as T;
}

/**
 * @internal A writer a presentation view calls from its render, which has no
 * commit function. A root render that can be dropped writes committed DOM at
 * its commit; a writer that returns a cache value returns it now (#2043).
 */
export function renderWrite<T>(writer: (...args: any[]) => T, kind: string, ...args: any[]): T {
	return writeAtCommit(writer, kind, args);
}

function writeAtCommit<T>(writer: (...args: any[]) => T, kind: string, args: any[]): T {
	const transaction = ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(CURRENT_BLOCK);
	if (transaction === null || !RENDER_WRITERS.test(kind)) return writer(...args);
	let cached: unknown;
	if (kind.endsWith('IfChanged')) {
		// `(value, previous, element, …)`: an unchanged value keeps its cache.
		if (attributeUnchanged(args[1], args[0])) return args[1];
		cached = args[0];
	} else if (kind.startsWith('updateFresh')) {
		cached = normalizeClass(args[0]);
		if (cached === args[1]) return cached as T;
	}
	// The view caches what it wrote in its bag; a dropped render must restore it.
	if (TRANSITION_JOURNAL !== null) journalBag();
	transaction.ops.push(commitRenderWrite, [writer, args, CURRENT_BLOCK]);
	return cached as T;
}

// DOM setters. Signal, native style and text writers commit by themselves, and
// installing an event handler writes no DOM.
const RENDER_WRITERS = /^(?:set(?!RenderText|EventHandler)|updateFresh)/;

export function commitRenderWrite([writer, args, block]: [
	(...args: any[]) => unknown,
	any[],
	Block | null,
]): void {
	try {
		writer(...args);
	} catch (error) {
		// As for a binding bag's commit function, the nearest boundary handles it.
		reportEffectError(block, error);
	}
}

function preparePresentationTextWrite<T>(
	frame: PresentationHydrationFrame,
	writer: (...args: any[]) => T,
	args: any[],
): T {
	const [node, value, host] = args as [Text | null, unknown, Node | undefined];
	const text = coerceText(value);
	// A text binding that keeps only its host passes no Text (see setText), so
	// the host keys its prepared write; the host also reaches the deferred write.
	preparePresentationOperation(frame, node ?? host!, 'text', () => writer(node, text, host));
	return undefined as T;
}

function preparePresentationAttributeWrite<T>(
	frame: PresentationHydrationFrame,
	writer: (...args: any[]) => T,
	kind: string,
	args: any[],
	prepared = args.slice(),
): T {
	const changed = kind.endsWith('IfChanged') || kind.startsWith('updateFresh');
	const valueIndex = changed ? 0 : kind === 'setClassName' || kind === 'setClassAttr' ? 1 : 2;
	const element = args[changed ? 2 : 0] as Element;
	const className = kind.includes('Class');
	const name = className ? 'class' : args[changed ? 3 : 1];
	const attributeKind = className ? 'class' : kind.includes('Boolean') ? 'booleanAttr' : 'attr';
	prepared[valueIndex] = preparedPresentationAttribute(
		element,
		name,
		args[valueIndex],
		attributeKind,
	);
	preparePresentationOperation(frame, element, name, () => writer(...prepared));
	return (kind.startsWith('updateFresh') ? prepared[valueIndex] : args[valueIndex]) as T;
}

/** @internal Fixed native views retain only the writer capabilities they use. */
export function presentationFixedWrite<T>(
	writer: (...args: any[]) => T,
	kind: string,
	...args: any[]
): T {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame === null) return writeAtCommit(writer, kind, args);
	// A host lease owns only its declared channels, never a fixed descendant view.
	if (frame.lease.host !== undefined) presentationMiss(false);
	// An explicit lease publishes these caches with its staged writes. Historical
	// hydration without a lease still invalidates retained early publications.
	if (kind === 'hydrateClaimedBindingCaches') return undefined as T;
	if (kind === 'htext') return prepareFixedPresentationText(frame, args[0], args[1]) as T;
	if (kind === 'bindSignalText' || kind === 'bindSignalAttribute')
		return preparePresentationSignalBinding(
			args,
			frame,
			kind === 'bindSignalText',
			prepareFixedPresentationText,
		) as T;
	if (kind === 'setText' || kind === 'setRenderText')
		return preparePresentationTextWrite(frame, writer, args);
	return preparePresentationAttributeWrite(frame, writer, kind, args);
}

/** @internal Compiler-selected writer seam; ordinary renderer setters stay unchanged. */
export function presentationWrite<T>(
	writer: (...args: any[]) => T,
	kind: string,
	...args: any[]
): T {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame === null) return writeAtCommit(writer, kind, args);
	if (frame.lease.host !== undefined) {
		// A host receipt proves native fields, never descendant or generic-spread
		// ownership. Known provider projections must retain their exact field set.
		const channels = frame.lease.host;
		const changed = kind.endsWith('IfChanged') || kind.startsWith('updateFresh');
		const element =
			kind === 'bindSignalAttribute' ||
			kind === 'nativeStyleBinding' ||
			kind === 'nativeProjectionBinding'
				? args[2]
				: args[changed ? 2 : 0];
		const keys =
			kind === 'nativeProjectionBinding'
				? args[4].map((field: string) => (field === 'className' ? 'class' : field))
				: kind === 'setStyleProperties'
					? args[1]
							.filter((_: unknown, index: number) => index % 2 === 0)
							.map((key: string) => 'style:' + key)
					: [
							kind === 'nativeStyleBinding' || kind === 'setStyle'
								? 'style'
								: kind === 'setStyleProperty'
									? 'style:' + args[1]
									: kind.includes('Class')
										? 'class'
										: kind === 'bindSignalAttribute'
											? args[3]
											: args[changed ? 3 : 1],
						];
		if (
			element !== frame.lease.root ||
			// Preserve authored names for diagnostics; receipts use native field names.
			keys.some((key: string) => !channels.has(ATTRIBUTE_ALIASES.get(key) ?? key)) ||
			kind === 'bindSignalValue' ||
			kind === 'setEventHandler' ||
			kind === 'bindSignalText' ||
			kind === 'setText' ||
			kind === 'setRenderText' ||
			kind === 'markDangerouslySetInnerHTMLChildren'
		)
			presentationMiss(false);
	}
	if (kind === 'queueNativeChangeDiagnostic') {
		preparePresentationOperation(frame, args[0], 'nativeChangeDiagnostic', () => writer(...args));
		return undefined as T;
	}
	if (kind === 'markDangerouslySetInnerHTMLChildren') {
		const element = args[0] as Element;
		if (
			!frame.writes.get(element)?.has('hostProps') ||
			(element as any)[DANGER_HTML_ACTIVE] === true
		)
			presentationMiss(false);
		preparePresentationOperation(frame, element, 'hostChildren', () => writer(element));
		return undefined as T;
	}
	if (kind === 'bindSignalText') return preparePresentationSignalBinding(args, frame, true) as T;
	if (kind === 'setText' || kind === 'setRenderText')
		return preparePresentationTextWrite(frame, writer, args);
	if (kind === 'bindSignalAttribute') return preparePresentationSignalBinding(args, frame) as T;
	if (kind === 'bindSignalValue') return preparePresentationSignalValue(args, frame) as T;
	if (kind === 'nativeStyleBinding' || kind === 'nativeProjectionBinding') {
		const [owner, slot, el] = args;
		const style = kind === 'nativeStyleBinding';
		const current = owner.slots[slot] as NativeStyleBinding | undefined;
		try {
			if (
				style &&
				(current === undefined || current.block === null) &&
				isScalarNativeStyle(args[3], args[4])
			) {
				// No native read to witness or subscribe: prepare the takeover write
				// exactly as a plain style write does, without an owning Block.
				writeScalarNativeStyle(
					owner,
					slot,
					current,
					el,
					__normalizeBindingStyle(args[3]),
					(host, value) =>
						preparePresentationOperation(frame, host, 'style', () => setStyle(host, value, '')),
				);
			} else
				nativePresentationBinding(
					owner,
					slot,
					el,
					style ? preparedNativeStyleBody : preparedNativeProjectionBody,
					style ? { el, value: args[3], frame } : { el, compute: args[3], fields: args[4], frame },
				);
		} finally {
			if (frame.hostSuccessors !== undefined) {
				const binding = owner.slots[slot] as NativeStyleBinding | undefined;
				if (binding !== undefined)
					frame.hostSuccessors.set(binding, () => disposeNativeStyleBinding(binding));
			}
		}
		return undefined as T;
	}
	const prepared = args.slice();
	let result: unknown;
	if (kind === 'setEventHandler') {
		preparePresentationOperation(frame, prepared[0], 'event:' + prepared[1], () => {
			writer(...prepared);
			if (SIGNAL_BINDINGS_ENABLED || signalDocumentEnabled) {
				SIGNAL_EVENT_OWNERS_RECORDED = true;
				prepared[0].$$signalOwner = frame.scope as ScopeImpl;
			}
		});
		return undefined as T;
	}
	if (kind === 'setStyle') {
		prepared[1] = __normalizeBindingStyle(args[1]);
		prepared[2] = '';
	} else if (kind === 'setStyleProperty') {
		prepared[2] =
			args[2] == null || typeof args[2] === 'boolean' ? null : cssStyleValue(args[1], args[2]);
	} else if (kind === 'setStyleProperties') {
		prepared[1] = args[1].map((value: unknown, i: number) =>
			i % 2 === 0 || value == null || typeof value === 'boolean'
				? value
				: cssStyleValue(args[1][i - 1], value),
		);
	} else if (kind === 'setBindingClass' || kind === 'setBindingClassIfChanged') {
		const index = kind.endsWith('IfChanged') ? 0 : 2;
		const value = args[index];
		prepared[index] = [normalizeClass(value[0]), value[1].map(normalizeClass)];
		result = value;
	} else return preparePresentationAttributeWrite(frame, writer, kind, args, prepared);
	const changed = kind.endsWith('IfChanged') || kind.startsWith('updateFresh');
	const element = args[changed ? 2 : 0];
	const key = kind.includes('Class')
		? 'class'
		: kind.startsWith('setStyle')
			? kind === 'setStyleProperty'
				? 'style:' + args[1]
				: 'style'
			: args[changed ? 3 : 1];
	preparePresentationOperation(frame, element, key, () => {
		writer(...prepared);
	});
	return result as T;
}

/** @internal Stamp the view identity and prevent authored ranges from inheriting a caller's boundary. */
export function bindPresentationView<T extends Function>(view: T, id: string, ownsRange = true): T {
	(view as T & { [BINDING_VIEW_ROOT]: string })[BINDING_VIEW_ROOT] = bindingRootMarker(id);
	return ownsRange ? markComponentFlags(view, COMPONENT_FLAG_BOUNDARY, view.name) : view;
}

export const BINDING_CHILDREN_SITE = /* @__PURE__ */ Symbol.for('octane.binding.children-site');

/** @internal A lexical children body carries its authored invocation site across modules. */
export function markBindingChildren<T extends Function>(body: T, site: string): T {
	(body as T & { [BINDING_CHILDREN_SITE]: string })[BINDING_CHILDREN_SITE] = site;
	return body;
}

export function presentationRange(
	frame: PresentationHydrationFrame,
	start: Node | null,
	marker: string,
	kind: 'if' | 'view' | 'slot' | 'text',
) {
	const range = start === null ? undefined : frame.lease.ranges?.().get(start);
	if (
		frame.lease.revision?.() !== frame.revision ||
		start?.nodeType !== 8 ||
		(start as Comment).data !== marker ||
		range?.kind !== kind ||
		range.end.parentNode !== start.parentNode ||
		!hydrating ||
		CURSOR?.close(start) !== range.end
	)
		presentationMiss();
	return range;
}

/** @internal The existing renderer adopts only the current compiler-owned branch or child range. */
export function presentationStructure(
	writer: (...args: any[]) => void,
	kind: 'if' | 'view',
	marker: string,
	...args: any[]
): void {
	const frame = hydrationStarted ? PRESENTATION_HYDRATION : null;
	if (frame?.revision === undefined) return writer(...args);
	const hydration = hydrating ? CURSOR : null;
	if (hydration === null) presentationMiss(false);
	// ifBlock and the component writers (componentSlot/Void/Lite) all carry their
	// anchor at argument 6; compiled calls may omit it as a trailing undefined.
	const start = hydration.resolveOpen(args[6] ?? null, args[2]);
	if (kind === 'if') {
		const arm = args[3] ? (args[4] === null ? -1 : 0) : args[5] === null ? -1 : 1;
		const range = presentationRange(frame, start, marker + arm, kind);
		if (range.arm !== arm) presentationMiss();
		writer(...args);
		return;
	}
	const range = presentationRange(frame, start, marker, kind);
	const expected = (args[3] as Function & { [BINDING_VIEW_ROOT]?: string })[BINDING_VIEW_ROOT];
	// The old inline concatenation stringified a missing view into the literal
	// "undefined", which could never match a compiler-minted stamp. Reject it
	// outright instead of handing a hole to the shared marker builder.
	if (range.view === undefined || expected !== bindingRootMarker(range.view))
		presentationMiss(false);
	writer(...args);
}

/** @internal Keep historical class ownership beside the full renderer's composed class. */
export function setBindingClass(
	element: Element,
	receipt: string,
	values: [unknown, unknown[]],
): void {
	const snapshot = [normalizeClass(values[0]), values[1].map(normalizeClass)] as const;
	const classes = [snapshot[0], ...snapshot[1]].filter(Boolean).join(' ');
	if (element.getAttribute('class') !== classes) setClassAttr(element, classes);
	const serialized = JSON.stringify(snapshot);
	if (element.getAttribute(receipt) !== serialized) setStringData(element, receipt, serialized);
}

/** @internal Attribute-binding comparison ABI for the opt-in class receipt writer. */
export function setBindingClassIfChanged(
	value: [unknown, unknown[]],
	previous: unknown,
	element: Element,
	receipt: string,
): unknown {
	if (value !== previous) setBindingClass(element, receipt, value);
	return value;
}
// Event authority lives on the host beside its handler slots, so publishing it
// for each mounted row is a property write rather than a weak-map insertion.
// The flag keeps documents that never record authority off the dispatch read.
export let SIGNAL_EVENT_OWNERS_RECORDED = false;

/** Publish a native handler; compiled bundle updates omit the key to refresh only authority. */
export function setEventHandler(el: Element, key?: string, handler?: any, foreign?: boolean): void {
	const staged = hydrating
		? key !== undefined &&
			PRESENTATION_HYDRATION === null &&
			CURSOR?.stageEvent(el, key, handler) === true
		: false;
	if (key !== undefined && !staged) {
		// A handler on a host of a Block the root attempt discards (ROOT_DISCARD_STAMP)
		// needs no undo: compiled bindings write their own cloned hosts. `foreign`
		// marks runtime callers that may write a host the current scope does not
		// own, such as a signal-driven spread.
		if (
			TRANSITION_JOURNAL !== null &&
			(foreign === true ||
				TRANSITION_JOURNAL_DEPTH !== 1 ||
				CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP)
		) {
			TRANSITION_JOURNAL.push(JOURNAL_PROP, el, key, (el as any)[key]);
			journalBag();
		}
		(el as any)[key] = handler;
	}
	// Explicit authority also applies to handlers in modules with no signal bindings.
	const explicitOwner =
		activeSynchronousSignalOwner !== null || activeSignalOwnerEnvironment !== undefined
			? currentExplicitSignalOwner()
			: null;
	if (
		SIGNAL_BINDINGS_ENABLED ||
		signalDocumentEnabled ||
		explicitOwner !== null ||
		SIGNAL_EVENT_OWNERS_RECORDED
	) {
		// Retain the precise invocation for an event-only reader whose signal
		// module may arrive later. No owner or wrapper is allocated speculatively.
		const owner =
			explicitOwner ??
			(signalDocumentEnabled || CURRENT_SCOPE?.block.idState.renderOwner?.signalOwner !== undefined
				? CURRENT_SCOPE === null
					? currentSignalOwner()
					: CURRENT_SCOPE.signalOwner || CURRENT_SCOPE
				: CURRENT_SCOPE);
		if (owner !== null) {
			// Mark that a scope token escaped before queuing its commit. A queued
			// event may be followed by deletion in the same render; recording only
			// at commit would miss that retirement. Discard leaves only this
			// conservative flag, never an owner or signal state.
			if ((owner instanceof ScopeImpl || owner instanceof BlockImpl) && !owner.signalTokenEscaped)
				owner.signalTokenEscaped = true;
			// Later writers must replace explicit authority with the usual scope
			// token, including when both writers are still waiting for publication.
			SIGNAL_EVENT_OWNERS_RECORDED = true;
			// Compare queued writes at publication: an earlier preparation may
			// replace even the authority that is currently committed.
			const transaction = ROOT_RENDER_TRANSACTION;
			if (
				hydrating &&
				PRESENTATION_HYDRATION === null &&
				(staged || key === undefined) &&
				CURSOR?.stageEvent(el, '$$signalOwner', owner) === true
			)
				return;
			if (
				key === undefined &&
				transaction !== null &&
				!transaction.aborted &&
				!ROOT_RENDER_ROLLBACK &&
				!hydrating
			)
				queueEventOwner(el, owner, transaction);
			else {
				const previous = (el as any).$$signalOwner as SignalEventOwner | undefined;
				if (previous !== owner) {
					if (TRANSITION_JOURNAL !== null)
						TRANSITION_JOURNAL.push(JOURNAL_EVENT_OWNER, el, previous, null);
					(el as any).$$signalOwner = owner;
				}
			}
		}
	}
}
