// Signal bindings
//
// Direct signal bindings for text, attributes, values and checked state,
// signal-backed host prop sources, and signal children.

import {
	presentationMiss,
	preparedPresentationAttribute,
	commitRenderWrite,
} from './hydration-presentation.js';
import { hydrating, hydrationStarted } from '../hydration-flag.js';
import { domBindingClaims } from '../dom-binding-claims.js';
import { __normalizeBindingStyle } from '../dom-binding-styles.js';
import { HYDRATE_INPUT_ATTR } from '../constants.js';
import { snapshotHydrationControl, consumeHydrationControl } from '../hydration/event-capture.js';
import { isRestoredHydrationTextarea } from '../hydration/control-capture.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { PORTAL_TAG } from '../runtime-tags.js';
import { withCommittedSignals } from '../signals/transition-state.js';
import {
	type NativeTransitionNotify,
	NATIVE_TRANSITION_CONSUMER,
} from '../signals/read-protocol.js';
import { currentSignalOwner } from '../signals/owner-context.js';
import { signalDocumentEnabled, enableSignalDocument } from '../signals/document-owner.js';
import { registerHydrationControlSignalWriter } from '../signals/early-values.js';
import { isSignalHandle, isWritableSignal } from '../signals/handle-protocol.js';
import {
	type SignalHandle,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
} from '../signals/types.js';
import { styleName } from '../css.js';
import type { Scope, Block, RootRenderTransaction, HostPropSource, ChildSlot } from './types.js';
import { HYDRATION_DRIVER, enableSignalBindings } from './drivers.js';
import {
	scopeSignalOwner,
	runWithBlockSignalOwner,
	type NativeStyleBinding,
} from './signal-owners.js';
import { queueOwnRefDetach } from './refs.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	activeFragments,
	scheduleRender,
} from './engine.js';
import { registerHookCleanup } from './hooks.js';
import { CURSOR, type HydrationCapability } from './hydration.js';
import {
	teardownPortalState,
	registerValuePortalFragmentOwners,
	renderPortalState,
	type PortalDescriptor,
} from './portals.js';
import { enqueueEffectEventCommitAction } from './block.js';
import {
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
	WIP_CAPTURE,
} from './render.js';
import {
	setText,
	setRenderText,
	dangerouslySetInnerHTMLOwnsChild,
	HTML_NS,
	isHtmlCustomElement,
	setClassName,
	setClassAttr,
	type HostPropWriter,
	formActionAttributeName,
	isHostPropIdentityKey,
	resolveHostPropSources,
	setHostPropSources,
	setSpread,
} from './host-props.js';
import { coerceChildText, clearChildContent } from './component-slots.js';
import { renderSignalChildSlot, type SignalChildSlotRenderer } from './child-slots.js';
import { teardownChildForSlot } from './deopt.js';
import { BAG_SIZE, bagRecord, journalBag, journalObjectOnce } from './commit.js';
import { getFirstChild, getNextSibling, htext, htextSwap, bindingText } from './templates.js';
import { isEventKey } from './events.js';
import { setValue, setChecked, setSelectValue, drainDevFormDiagnostics } from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

/**
 * The open root render that a write to DOM the screen shows waits for, or null
 * when the write lands at once: nothing can drop the render (no transaction, a
 * rollback, an adopting hydration), or `block` is one the root attempt
 * discards whole, so its DOM is fresh (bagDone's rule).
 */
export function pendingWrites(block: Block | null): RootRenderTransaction | null {
	const transaction = ROOT_RENDER_TRANSACTION!;
	return transaction.aborted ||
		ROOT_RENDER_ROLLBACK ||
		hydrating ||
		(block !== null && TRANSITION_JOURNAL_DEPTH === 1 && block.createdStamp === ROOT_DISCARD_STAMP)
		? null
		: transaction;
}

export const DIRECT_SIGNAL_BINDING = /* @__PURE__ */ Symbol('octane.direct-signal-binding');
const CLAIMED_BINDING_VALUE = /* @__PURE__ */ Symbol('octane.claimed-binding-value');

/** @internal Invalidate scalar-view caches when hydration retained a claimed publication. */
export function hydrateClaimedBindingCaches(
	scope: Scope,
	fields: readonly (string | number)[],
): void {
	if (!hydrating || CURSOR === null) return;
	const bag = scope.slots[0] as Record<string, any>;
	for (let i = 0; i < fields.length; i += 3) {
		const field = fields[i]!;
		const node = bag[fields[i + 1] as string] as Node;
		const element = (node.nodeType === 3 ? node.parentNode : node) as Element;
		const claims = domBindingClaims.get(element);
		if (claims === undefined) continue;
		const channel = fields[i + 2] as string;
		const tokenOnly = channel === '#text-token';
		let claimed = claims.has(
			tokenOnly
				? '#text'
				: channel.startsWith('style:')
					? 'style:' + styleName(channel.slice(6))
					: channel,
		);
		if (channel === 'style') {
			for (const name of claims.keys())
				if (name.startsWith('style:')) {
					claimed = true;
					break;
				}
		}
		if (!claimed) continue;
		// A whole style must retain its actual CSS so null/removal can clear it;
		// scalar raw-value caches instead need a value no authored scalar can equal.
		const value =
			channel === 'style' ? (element as HTMLElement).style.cssText : CLAIMED_BINDING_VALUE;
		if (typeof field === 'number') {
			// A scalar native style has no Block and caches its last write itself.
			const binding = scope.slots[field] as NativeStyleBinding;
			if (binding.block === null) {
				journalRootProperty(binding, 'style', binding.style);
				binding.style = value;
			} else {
				const slots = binding.block.slots;
				journalRootProperty(slots, 0, slots[0]);
				slots[0] = value;
			}
		} else {
			const cached = bag[field];
			if (cached?.[DIRECT_SIGNAL_BINDING] === true) {
				if (TRANSITION_JOURNAL !== null) journalObjectOnce(cached);
				cached.value = value;
			} else if (!tokenOnly) {
				// Scalar text keeps its adopted Text in the token field.
				if (TRANSITION_JOURNAL !== null) journalBag();
				bag[field] = value;
			}
		}
	}
}

type DirectSignalBindingKind = 'text' | 'textOnlyChild' | 'attribute' | 'value' | 'checked';
// The compiler names the concrete scalar writer (setPlainAttribute,
// setURLAttribute, setStringData, setBooleanAttribute, setAriaAttribute, or the
// generic setAttribute) so an ordinary binding retains only that writer's graph.
// Class composition is the one namespace-dependent writer, so it stays a tag.
type DirectSignalAttributeWriter = (el: Element, name: string, value: unknown) => void;
export type DirectSignalAttributeKind = 'class' | DirectSignalAttributeWriter;

// Shared renderer policies keep the subscription/lifetime path independent of
// control adoption. Scalar bindings still use their existing cache tokens.
interface DirectSignalBindingPolicy {
	readonly kind: DirectSignalBindingKind;
	readonly writeBinding: (binding: DirectSignalBinding, value: unknown) => void;
	readonly write: (
		target: Node,
		value: unknown,
		kind: DirectSignalBindingKind,
		previous: unknown,
		name?: string,
		attributeKind?: DirectSignalAttributeKind,
	) => unknown;
	readonly control?: {
		validateNew: (scope: Scope, target: Node, kind: DirectSignalBindingKind) => void;
		snapshot: (target: Node, site: string) => ReturnType<typeof snapshotHydrationControl>;
		restored: (target: Node, value: unknown) => boolean;
		activate: (binding: DirectSignalBinding, revision: number) => void;
		adopt: (binding: DirectSignalBinding) => void;
	};
}

export interface DirectSignalBinding {
	readonly [DIRECT_SIGNAL_BINDING]: true;
	readonly scope: Scope;
	readonly policy: DirectSignalBindingPolicy;
	readonly target: Node;
	readonly site: string;
	readonly name?: string | undefined;
	readonly attributeKind?: DirectSignalAttributeKind | undefined;
	readonly handle: SignalHandle<unknown> | null;
	text?: Text | undefined;
	value: unknown;
	unsubscribe?: (() => void) | undefined;
	input?: EventListener | undefined;
	controlWriterCleanup?: (() => void) | undefined;
	pendingControl?: boolean | undefined;
	disposed: boolean;
}

/**
 * A transition that writes what a direct binding presents renders the
 * binding's owner with its batch (signals/pending.ts), so the read the render
 * records can suspend that transition. The binding itself writes only
 * committed values, from its commit and from this subscription.
 */
export function bindingTransitionNotify(binding: { scope: Scope }, notify: () => void): () => void {
	(notify as NativeTransitionNotify)[NATIVE_TRANSITION_CONSUMER] = binding.scope.block;
	return notify;
}

export function readSignalBinding(handle: SignalHandle<unknown>): unknown {
	return handle[SIGNAL_BINDING_READ]();
}

export function disposeDirectSignalBinding(binding: DirectSignalBinding): void {
	if (binding.disposed) return;
	binding.disposed = true;
	try {
		binding.unsubscribe?.();
	} finally {
		binding.controlWriterCleanup?.();
		if (binding.input !== undefined) {
			(binding.target as Element).removeEventListener('input', binding.input);
		}
	}
}

function directSignalControlValue(
	binding: DirectSignalBinding,
	snapshot: NonNullable<ReturnType<typeof snapshotHydrationControl>>,
): unknown {
	if (binding.policy.kind === 'checked') return snapshot.checked ?? false;
	return snapshot.selectedValues ?? snapshot.value;
}

export function validateDirectSignalControl(element: Element, site: string): void {
	const actual = element.getAttribute(HYDRATE_INPUT_ATTR);
	if (actual === null && (!hydrating || CURSOR === null)) {
		element.setAttribute(HYDRATE_INPUT_ATTR, site);
		return;
	}
	if (actual !== site) {
		throw new Error(formatClientError(67, site));
	}
}

function writeCommittedDirectSignalBinding(binding: DirectSignalBinding, value: unknown): void {
	if (!binding.disposed) binding.policy.writeBinding(binding, value);
}

export function writeDirectSignalBinding(binding: DirectSignalBinding, value: unknown): void {
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(binding);
	// A render that can be dropped writes committed DOM at its commit; text
	// writes wait for it themselves (setRenderText).
	const policy = binding.policy;
	const transaction = directSignalWrites(binding.scope, policy);
	if (transaction === null) policy.writeBinding(binding, value);
	else
		transaction.ops.push(commitRenderWrite, [
			writeCommittedDirectSignalBinding,
			[binding, value],
			binding.scope.block,
		]);
	binding.value = value;
}

/** The open render's commit queue for a direct signal write that must wait for it. */
function directSignalWrites(
	scope: Scope,
	policy: DirectSignalBindingPolicy,
): RootRenderTransaction | null {
	return ROOT_RENDER_TRANSACTION === null ||
		policy.kind === 'text' ||
		policy.kind === 'textOnlyChild'
		? null
		: pendingWrites(scope.block);
}

/** A plain value's write, at the commit of a render that can be dropped. */
function writeDirectSignal(
	scope: Scope,
	policy: DirectSignalBindingPolicy,
	target: Node,
	value: unknown,
	previous: unknown,
	name?: string,
	attributeKind?: DirectSignalAttributeKind,
): unknown {
	const transaction = directSignalWrites(scope, policy);
	if (transaction === null)
		return policy.write(target, value, policy.kind, previous, name, attributeKind);
	transaction.ops.push(commitRenderWrite, [
		policy.write,
		[target, value, policy.kind, previous, name, attributeKind],
		scope.block,
	]);
	// Attribute, value and checked writers return the value they wrote.
	return value;
}

function writeDirectSignalBoundText(binding: DirectSignalBinding, value: unknown): void {
	if (binding.text === undefined) {
		binding.text =
			binding.policy.kind === 'textOnlyChild'
				? htext(binding.target, value)
				: htextSwap(binding.target, value);
	} else {
		// Adopted Text can belong to another document. The binding already owns
		// this cache; checking its realm's constructor again would discard it.
		setRenderText(binding.text, value);
	}
}

function writeDirectSignalBoundAttribute(binding: DirectSignalBinding, value: unknown): void {
	writeDirectSignalAttribute(
		binding.target,
		value,
		'attribute',
		undefined,
		binding.name,
		binding.attributeKind,
	);
}

function writeDirectSignalBoundValue(binding: DirectSignalBinding, value: unknown): void {
	const element = binding.target as Element;
	const tag = element.localName;
	if (tag === 'select') setSelectValue(element, value);
	else setValue(element, value);
}

function writeDirectSignalBoundChecked(binding: DirectSignalBinding, value: unknown): void {
	setChecked(binding.target as Element, value);
}

function writeDirectSignalText(
	target: Node,
	value: unknown,
	kind: DirectSignalBindingKind,
	previous: unknown,
): Text {
	if (previous instanceof Text) {
		setRenderText(previous, value);
		return previous;
	}
	// The compiler owns this distinction: an empty sibling text hole can
	// point at the next element while hydrating, not an only-child parent.
	return kind === 'textOnlyChild' ? htext(target, value) : htextSwap(target, value);
}

export function writeDirectSignalAttribute(
	target: Node,
	value: unknown,
	_kind: DirectSignalBindingKind,
	_previous: unknown,
	name?: string,
	attributeKind?: DirectSignalAttributeKind,
): unknown {
	const element = target as Element;
	if (attributeKind === 'class') {
		// A signal write can land while another scope renders.
		if (element.namespaceURI === HTML_NS) setClassName(element, value, true);
		else setClassAttr(element, value);
	} else attributeKind!(element, name!, value);
	return value;
}

function writeDirectSignalValue(
	target: Node,
	value: unknown,
	_kind: DirectSignalBindingKind,
	_previous: unknown,
	_name?: string,
	_attributeKind?: DirectSignalAttributeKind,
): unknown {
	const element = target as Element;
	if (element.localName === 'select') setSelectValue(element, value);
	else setValue(element, value);
	return value;
}

function writeDirectSignalChecked(target: Node, value: unknown): unknown {
	setChecked(target as Element, value);
	return value;
}

export const DIRECT_SIGNAL_TEXT_POLICY: DirectSignalBindingPolicy = {
	kind: 'text',
	writeBinding: writeDirectSignalBoundText,
	write: writeDirectSignalText,
};
export const DIRECT_SIGNAL_TEXT_ONLY_POLICY: DirectSignalBindingPolicy = {
	kind: 'textOnlyChild',
	writeBinding: writeDirectSignalBoundText,
	write: writeDirectSignalText,
};
export const DIRECT_SIGNAL_ATTRIBUTE_POLICY: DirectSignalBindingPolicy = {
	kind: 'attribute',
	writeBinding: writeDirectSignalBoundAttribute,
	write: writeDirectSignalAttribute,
};
const DIRECT_SIGNAL_CONTROL_POLICY: NonNullable<DirectSignalBindingPolicy['control']> = {
	validateNew(scope, target, kind) {
		if (
			hydrationStarted &&
			kind === 'value' &&
			scope.block.idState.renderOwner?.controlLeases?.has(target as Element)
		)
			HYDRATION_DRIVER!.presentationMiss(false);
	},
	snapshot(target, site) {
		const snapshot = snapshotHydrationControl(target as Element);
		if (snapshot !== null) validateDirectSignalControl(target as Element, site);
		return snapshot;
	},
	restored: (target, value) => isRestoredHydrationTextarea(target as Element, value),
	activate(binding, revision) {
		installDirectSignalControl(binding);
		if (!binding.pendingControl) consumeHydrationControl(binding.target as Element, revision);
	},
	adopt: queueDirectSignalControlAdoption,
};
export const DIRECT_SIGNAL_VALUE_POLICY: DirectSignalBindingPolicy = {
	kind: 'value',
	writeBinding: writeDirectSignalBoundValue,
	write: writeDirectSignalValue,
	control: DIRECT_SIGNAL_CONTROL_POLICY,
};
const DIRECT_SIGNAL_CHECKED_POLICY: DirectSignalBindingPolicy = {
	kind: 'checked',
	writeBinding: writeDirectSignalBoundChecked,
	write: writeDirectSignalChecked,
	control: DIRECT_SIGNAL_CONTROL_POLICY,
};

export function updateDirectSignalBinding(binding: DirectSignalBinding): void {
	if (
		binding.disposed ||
		binding.pendingControl ||
		binding.handle === null ||
		binding.scope.block.disposed
	)
		return;
	// A signal written while a root renders: the owner's render reads the new
	// value and its commit writes it, rather than this write landing mid-render.
	if (ROOT_RENDER_TRANSACTION !== null) {
		scheduleRender(binding.scope.block);
		return;
	}
	try {
		runWithBlockSignalOwner(binding.scope, () => {
			const value = readSignalBinding(binding.handle!);
			if (!Object.is(binding.value, value)) writeDirectSignalBinding(binding, value);
			if (process.env.NODE_ENV !== 'production' && binding.target.nodeType === 1)
				drainDevFormDiagnostics(binding.target as Element);
		});
	} catch {
		// Pending/error reads re-enter the renderer so the nearest Suspense/error
		// boundary, rather than this targeted DOM subscription, owns recovery.
		scheduleRender(binding.scope.block);
	}
}

export function installDirectSignalControl(binding: DirectSignalBinding): void {
	if (!isWritableSignal(binding.handle)) return;
	const element = binding.target as Element;
	validateDirectSignalControl(element, binding.site);
	const handle = binding.handle;
	const input: EventListener = () => {
		if (binding.disposed || binding.pendingControl) return;
		const snapshot = snapshotHydrationControl(element);
		if (snapshot === null) return;
		// Target listeners precede delegated dispatch. A platform edit is urgent,
		// even while an unrelated async Action keeps its post-await batch open.
		withCommittedSignals(() =>
			runWithBlockSignalOwner(binding.scope, () =>
				handle.set(directSignalControlValue(binding, snapshot)),
			),
		);
	};
	binding.input = input;
	element.addEventListener('input', input);
	binding.controlWriterCleanup = registerHydrationControlSignalWriter(
		element,
		binding.policy.kind === 'checked' ? 'checked' : 'value',
		(value) =>
			withCommittedSignals(() =>
				runWithBlockSignalOwner(binding.scope, () => {
					if (!binding.disposed && !binding.pendingControl && isWritableSignal(binding.handle))
						binding.handle.set(value);
				}),
			),
	);
}

export function queueDirectSignalControlAdoption(
	binding: DirectSignalBinding,
	priorEditRevision = 0,
): void {
	// Use the render attempt's existing commit queue: failed/WIP attempts discard
	// this publication, and committed actions run outside the native read guard.
	// Ignore edits already published by an offered owner when fencing a restored value.
	enqueueEffectEventCommitAction(() => {
		if (binding.disposed || binding.scope.block.disposed || !binding.pendingControl) return;
		withCommittedSignals(() =>
			runWithBlockSignalOwner(binding.scope, () => {
				const element = binding.target as Element;
				const snapshot = snapshotHydrationControl(element)!;
				if (
					isWritableSignal(binding.handle) &&
					(snapshot.editRevision > priorEditRevision ||
						(element.localName === 'textarea' &&
							Object.is(readSignalBinding(binding.handle), binding.value)))
				) {
					binding.handle.set(directSignalControlValue(binding, snapshot));
				}
				if (binding.disposed || binding.scope.block.disposed) return;
				// A synchronous subscriber can dispatch a newer native edit. Leave the
				// DOM authoritative until that exact revision has also been published.
				if (!consumeHydrationControl(element, snapshot.revision)) {
					queueDirectSignalControlAdoption(binding, priorEditRevision);
					return;
				}
				binding.pendingControl = false;
				writeDirectSignalBinding(binding, readSignalBinding(binding.handle!));
			}),
		);
	});
}

export function activateDirectSignalBinding(
	binding: DirectSignalBinding,
	revision: number | undefined,
): void {
	if (binding.disposed) return;
	if (binding.handle !== null)
		binding.unsubscribe = binding.handle[SIGNAL_BINDING_SUBSCRIBE](
			bindingTransitionNotify(binding, () => updateDirectSignalBinding(binding)),
		);
	if (revision !== undefined) binding.policy.control!.activate(binding, revision);
}

function createDirectSignalBinding(
	scope: Scope,
	target: Node,
	value: unknown,
	site: string,
	policy: DirectSignalBindingPolicy,
	name?: string,
	attributeKind?: DirectSignalAttributeKind,
	text?: Text,
): DirectSignalBinding {
	policy.control?.validateNew(scope, target, policy.kind);
	const handle = isSignalHandle(value) ? value : null;
	const binding: DirectSignalBinding = {
		[DIRECT_SIGNAL_BINDING]: true,
		scope,
		policy,
		target,
		site,
		name,
		attributeKind,
		handle,
		value: scope,
		disposed: false,
	};
	// A previous text token has already gone through mount/hydration. Reuse
	// it across capability changes; a raw SSR Text target still needs adoption.
	if (text !== undefined) binding.text = text;
	const controlSnapshot = policy.control?.snapshot(target, site) ?? null;
	const initial = handle === null ? value : readSignalBinding(handle);
	binding.pendingControl = hydrating
		? CURSOR !== null &&
			isWritableSignal(handle) &&
			controlSnapshot !== null &&
			// Only control policies snapshot, so text/attribute bindings never retain
			// the restored-textarea adoption graph.
			(controlSnapshot.editRevision > 0 || policy.control!.restored(target, initial))
		: false;
	if (binding.pendingControl) binding.value = initial;
	if (!binding.pendingControl) writeDirectSignalBinding(binding, initial);
	activateDirectSignalBinding(binding, controlSnapshot?.revision);
	if (binding.pendingControl) policy.control!.adopt(binding);
	registerHookCleanup(scope, () => disposeDirectSignalBinding(binding));
	return binding;
}

function bindDirectSignal(
	scope: Scope,
	previous: unknown,
	target: Node,
	value: unknown,
	site: string,
	policy: DirectSignalBindingPolicy,
	name?: string,
	attributeKind?: DirectSignalAttributeKind,
): unknown {
	const kind = policy.kind;
	const prior =
		typeof previous === 'object' &&
		previous !== null &&
		(previous as DirectSignalBinding)[DIRECT_SIGNAL_BINDING] === true
			? (previous as DirectSignalBinding)
			: null;
	const handle = isSignalHandle(value) ? value : null;
	if (handle !== null && (!signalDocumentEnabled || currentSignalOwner() !== scope.signalOwner)) {
		// A prop/callback can reveal the first handle midway through a render.
		// Enter its already-stamped scope for both the initial read and subscribe;
		// the ambient render frame may have started before document activation.
		if (!signalDocumentEnabled) enableSignalBindings();
		if (currentSignalOwner() !== scopeSignalOwner(scope)) {
			return runWithBlockSignalOwner(scope, () =>
				bindDirectSignal(scope, previous, target, value, site, policy, name, attributeKind),
			);
		}
	}
	if (handle === null && prior === null) {
		if (kind === 'attribute' && previous === value) {
			// An undefined cache slot has not yet compared an adopted server attribute.
			const hydration = value === undefined && hydrating ? CURSOR : null;
			if (hydration === null) return previous;
		}
		if (TRANSITION_JOURNAL !== null) journalBag();
		const scalarTarget =
			(kind === 'text' || kind === 'textOnlyChild') && previous instanceof Text ? previous : target;
		return writeDirectSignal(scope, policy, scalarTarget, value, previous, name, attributeKind);
	}
	if (
		prior !== null &&
		!prior.disposed &&
		prior.target === target &&
		prior.policy === policy &&
		prior.site === site &&
		prior.name === name &&
		prior.attributeKind === attributeKind &&
		prior.handle === handle
	) {
		if (prior.pendingControl) {
			// The preceding attempt's action may have been dropped by rollback.
			policy.control!.adopt(prior);
			return prior;
		}
		const next = readSignalBinding(handle!);
		if (!Object.is(prior.value, next)) writeDirectSignalBinding(prior, next);
		return prior;
	}
	if (TRANSITION_JOURNAL !== null) journalBag();
	if (handle === null) {
		const scalarTarget =
			kind === 'text' || kind === 'textOnlyChild'
				? (prior?.text ?? prior?.target ?? target)
				: target;
		const token = writeDirectSignal(
			scope,
			policy,
			scalarTarget,
			value,
			kind === 'text' || kind === 'textOnlyChild' ? prior?.text : (prior?.value ?? previous),
			name,
			attributeKind,
		);
		if (prior !== null) {
			const finish = (discarded: boolean): void => {
				if (!discarded) disposeDirectSignalBinding(prior);
			};
			if (WIP_CAPTURE === null) finish(false);
			else (WIP_CAPTURE.renderCleanups ??= []).push(finish);
		}
		return token;
	}
	const signalTarget =
		(kind === 'text' || kind === 'textOnlyChild') && previous instanceof Text ? previous : target;
	const binding = createDirectSignalBinding(
		scope,
		signalTarget,
		value,
		site,
		policy,
		name,
		attributeKind,
		kind === 'text' || kind === 'textOnlyChild'
			? (prior?.text ?? (previous instanceof Text ? previous : undefined))
			: undefined,
	);
	if (prior !== null) {
		const finish = (discarded: boolean): void =>
			disposeDirectSignalBinding(discarded ? binding : prior);
		if (WIP_CAPTURE === null) finish(false);
		else (WIP_CAPTURE.renderCleanups ??= []).push(finish);
	}
	return binding;
}

/**
 * @internal Compiler target for a direct signal/scalar text binding.
 *
 * Updates pass `previousValue` (the bag's raw-value cache) right after
 * `onlyChild`; `seededText` and `bindingMarker` only matter while `previous` is
 * still undefined, so compiled updates omit them.
 */
export function bindSignalText(
	scope: Scope,
	previous: unknown,
	position: Node,
	value: unknown,
	site: string,
	onlyChild = false,
	previousValue?: unknown,
	seededText: 1 | undefined = undefined,
	bindingMarker?: string,
): unknown {
	// Keep the ordinary text cache in the compiler's existing binding bag. A
	// signal token must still re-enter the read path even when its handle is
	// unchanged, so pending/error recovery is not hidden by this scalar guard.
	// A supplied previousValue may itself be undefined, so count arguments.
	if (previous instanceof Text && !isSignalHandle(value)) {
		if (arguments.length > 6 && previousValue === value) return previous;
		// A scalar over the Text this hole already owns is bindDirectSignal's
		// unbound scalar write without its policy dispatch. setRenderText journals
		// this binding bag.
		setRenderText(previous, value);
		return previous;
	}
	if (previous === undefined && bindingMarker !== undefined) {
		const existing = hydrating && CURSOR !== null ? getNextSibling(position) : null;
		previous = bindingText(
			position,
			existing?.nodeType === 3 ? existing.nodeValue : '',
			bindingMarker,
		);
	}
	// Only the compiler's fresh native template placeholder is already owned.
	// Hydration still goes through htext to adopt and advance the server cursor.
	if (previous === undefined && onlyChild && seededText === 1 && (!hydrating || CURSOR === null)) {
		const text = getFirstChild(position);
		if (text instanceof Text) previous = text;
	}
	const prior = previous as DirectSignalBinding | undefined;
	return bindDirectSignal(
		scope,
		previous,
		prior?.target ?? (previous instanceof Text ? previous : position),
		value,
		site,
		onlyChild ? DIRECT_SIGNAL_TEXT_ONLY_POLICY : DIRECT_SIGNAL_TEXT_POLICY,
	);
}

/** @internal Compiler target for a direct signal/scalar attribute binding. */
export function bindSignalAttribute(
	scope: Scope,
	previous: unknown,
	element: Element,
	name: string,
	value: unknown,
	site: string,
	attributeKind: DirectSignalAttributeKind,
): unknown {
	// Defined scalar equality needs no binding token/handle probe. Undefined
	// still reconciles hydration; stable objects/functions can reveal handles.
	if (
		previous === value &&
		value !== undefined &&
		(value === null || (typeof value !== 'object' && typeof value !== 'function'))
	)
		return previous;
	return bindDirectSignal(
		scope,
		previous,
		element,
		value,
		site,
		DIRECT_SIGNAL_ATTRIBUTE_POLICY,
		name,
		attributeKind,
	);
}

/** @internal Compiler target for a direct signal/scalar value binding. */
export function bindSignalValue(
	scope: Scope,
	previous: unknown,
	element: Element,
	value: unknown,
	site: string,
): unknown {
	return bindDirectSignal(scope, previous, element, value, site, DIRECT_SIGNAL_VALUE_POLICY);
}

/** @internal Compiler target for a direct signal/scalar checked binding. */
export function bindSignalChecked(
	scope: Scope,
	previous: unknown,
	element: Element,
	value: unknown,
	site: string,
): unknown {
	return bindDirectSignal(scope, previous, element, value, site, DIRECT_SIGNAL_CHECKED_POLICY);
}

/**
 * Record a direct signal binding (bagRecord). Render still reads a handle, so
 * a pending or failed signal suspends or throws here, and a handle whose value
 * the committed binding already shows records nothing. The commit function's
 * bindSignal* call reads the handle again and subscribes: a value that moved
 * after this read commits current, and a dropped render subscribed nothing.
 * A text binding passes the raw value it last committed beside its Text; a
 * value or checked binding passes the bag, so a scalar reasserts every commit.
 */
export function bagRecordSignal(
	bag: any,
	next: any[] | null,
	cell: number,
	value: unknown,
	committed: unknown,
	scope: Scope,
	raw: unknown = committed,
): any[] | null {
	// An undefined slot has not yet compared an adopted server attribute.
	let unchanged = value === raw && (value !== undefined || !hydrating);
	if (isSignalHandle(value)) {
		const prior = committed as DirectSignalBinding | null;
		const bound =
			prior?.[DIRECT_SIGNAL_BINDING] === true && prior.handle === value && !prior.disposed;
		if (bound && prior!.pendingControl) {
			// The preceding attempt's adoption may have been dropped with it.
			prior!.policy.control!.adopt(prior!);
			unchanged = true;
		} else {
			const read = readSignalInScope(scope, value);
			unchanged = bound && Object.is(prior!.value, read);
		}
	}
	// The bag, which no binding value equals, marks the cell unchanged.
	return bagRecord(scope, next, cell, unchanged ? bag : value, bag);
}

/**
 * A bag whose signal binding went pending after render renders its Block
 * again, so the read suspends there, as updateDirectSignalBinding does.
 */
export function retryPendingCommit(bag: any, error: unknown): boolean {
	try {
		if (error === null || typeof error !== 'object' || typeof (error as any).then !== 'function')
			return false;
	} catch {
		// An opaque error value with a throwing accessor is still an error.
		return false;
	}
	scheduleRender(bag.next[bag.$ & BAG_SIZE].block);
	return true;
}

/** Read a handle in its binding Scope's owner, as bindDirectSignal does. */
function readSignalInScope(scope: Scope, handle: SignalHandle<unknown>): unknown {
	if (!signalDocumentEnabled || currentSignalOwner() !== scope.signalOwner) {
		if (!signalDocumentEnabled) enableSignalBindings();
		if (currentSignalOwner() !== scopeSignalOwner(scope))
			return runWithBlockSignalOwner(scope, () => readSignalBinding(handle));
	}
	return readSignalBinding(handle);
}

export const SIGNAL_HOST_PROP_SOURCES = /* @__PURE__ */ Symbol('octane.signal-host-prop-sources');

interface SignalHostPropSourcesBinding {
	readonly [SIGNAL_HOST_PROP_SOURCES]: true;
	readonly scope: Scope;
	readonly element: Element;
	readonly site: string;
	readonly hasNestedChildren: boolean;
	readonly readStyle: ((value: unknown) => unknown) | undefined;
	sources: readonly HostPropSource[];
	resolved: Record<string, unknown> | undefined;
	subscriptions: Map<SignalHandle<unknown>, () => void>;
	controlWriters: Map<'value' | 'checked', () => void>;
	input?: EventListener | undefined;
	pendingControl?: boolean | undefined;
	disposed: boolean;
}

function resolveSignalStyle(
	value: unknown,
	handles: Set<SignalHandle<unknown>>,
	read: (handle: SignalHandle<unknown>) => unknown,
): unknown {
	// Only non-native hosts use this targeted, untracked subscription policy.
	// Native hosts defer to readNativeDomStyle after choosing the winning source.
	if (isSignalHandle(value)) {
		handles.add(value);
		return read(value);
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
	let copy: Record<string, unknown> | undefined;
	for (const name of Object.keys(value)) {
		const current = (value as Record<string, unknown>)[name];
		if (!isSignalHandle(current)) continue;
		handles.add(current);
		copy ??= { ...(value as Record<string, unknown>) };
		copy[name] = read(current);
	}
	return copy ?? value;
}

export function resolveSignalHostPropSources(
	sources: readonly HostPropSource[],
	readStyle?: (value: unknown) => unknown,
	read: (handle: SignalHandle<unknown>) => unknown = readSignalBinding,
): {
	sources: readonly HostPropSource[];
	handles: Set<SignalHandle<unknown>>;
} {
	// Children keep their handle for the separate child binding; resolving them
	// here would subscribe only the host props and strand later child updates.
	const handles = new Set<SignalHandle<unknown>>();
	let rows: HostPropSource[] | undefined;
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (!source[0]) {
			const value =
				source[1] === 'children' || (source[1] === 'style' && readStyle !== undefined)
					? source[2]
					: source[1] === 'style'
						? resolveSignalStyle(source[2], handles, read)
						: isSignalHandle(source[2])
							? (handles.add(source[2]), read(source[2]))
							: source[2];
			if (value !== source[2]) {
				rows ??= sources.slice() as HostPropSource[];
				rows[i] = [false, source[1], value, source[3]];
			}
			continue;
		}
		const spread = source[1];
		if (spread === null || typeof spread !== 'object') continue;
		let copy: Record<string, unknown> | undefined;
		for (const name of Object.keys(spread)) {
			const current = (spread as Record<string, unknown>)[name];
			const value =
				name === 'children' || (name === 'style' && readStyle !== undefined)
					? current
					: name === 'style'
						? resolveSignalStyle(current, handles, read)
						: isSignalHandle(current)
							? (handles.add(current), read(current))
							: current;
			if (value !== current) {
				copy ??= { ...(spread as Record<string, unknown>) };
				copy[name] = value;
			}
		}
		if (copy !== undefined) {
			rows ??= sources.slice() as HostPropSource[];
			rows[i] = [true, copy];
		}
	}
	return { sources: rows ?? sources, handles };
}

function winningSignalHostControl(
	sources: readonly HostPropSource[],
	name: 'value' | 'checked',
): SignalHandle<unknown> | null {
	let winner: unknown;
	for (const source of sources) {
		if (!source[0]) {
			if (source[1] === name) winner = source[2];
			continue;
		}
		const spread = source[1];
		if (
			spread !== null &&
			typeof spread === 'object' &&
			Object.prototype.propertyIsEnumerable.call(spread, name)
		) {
			winner = (spread as Record<string, unknown>)[name];
		}
	}
	return isSignalHandle(winner) ? winner : null;
}

function updateSignalHostPropSources(binding: SignalHostPropSourcesBinding): void {
	if (binding.disposed || binding.pendingControl || binding.scope.block.disposed) return;
	if (ROOT_RENDER_TRANSACTION !== null) {
		scheduleRender(binding.scope.block);
		return;
	}
	try {
		runWithBlockSignalOwner(binding.scope, () => {
			const next = resolveSignalHostPropSources(binding.sources, binding.readStyle);
			binding.resolved = setHostPropSources(
				binding.element,
				next.sources,
				binding.resolved,
				binding.scope,
				binding.hasNestedChildren,
				binding.readStyle,
			);
			if (process.env.NODE_ENV !== 'production') drainDevFormDiagnostics(binding.element);
		});
	} catch {
		scheduleRender(binding.scope.block);
	}
}

function addSignalHostSubscription(
	binding: SignalHostPropSourcesBinding,
	handle: SignalHandle<unknown>,
): () => void {
	const unsubscribe = handle[SIGNAL_BINDING_SUBSCRIBE](
		bindingTransitionNotify(binding, () => updateSignalHostPropSources(binding)),
	);
	binding.subscriptions.set(handle, unsubscribe);
	return unsubscribe;
}

function rebindSignalHostSubscriptions(
	binding: SignalHostPropSourcesBinding,
	handles: Set<SignalHandle<unknown>>,
): void {
	for (const [handle, unsubscribe] of binding.subscriptions) {
		if (handles.has(handle)) continue;
		unsubscribe();
		binding.subscriptions.delete(handle);
		if (TRANSITION_JOURNAL !== null) {
			// The record snapshot restores source identity, but a canceled observer
			// must actually be reattached to keep the committed DOM live.
			journalUndo(() => {
				if (binding.disposed || binding.scope.block.disposed) return;
				runWithBlockSignalOwner(binding.scope, () => addSignalHostSubscription(binding, handle));
			});
		}
	}
	for (const handle of handles) {
		if (binding.subscriptions.has(handle)) continue;
		const unsubscribe = addSignalHostSubscription(binding, handle);
		if (TRANSITION_JOURNAL !== null) {
			journalUndo(() => {
				unsubscribe();
				binding.subscriptions.delete(handle);
			});
		}
	}
}

function addSignalHostControlWriter(
	binding: SignalHostPropSourcesBinding,
	channel: 'value' | 'checked',
): () => void {
	const cleanup = registerHydrationControlSignalWriter(binding.element, channel, (next) => {
		withCommittedSignals(() =>
			runWithBlockSignalOwner(binding.scope, () => {
				const handle = winningSignalHostControl(binding.sources, channel);
				if (!binding.disposed && !binding.pendingControl && isWritableSignal(handle))
					handle.set(next);
			}),
		);
	});
	binding.controlWriters.set(channel, cleanup);
	return cleanup;
}

function syncSignalHostControl(binding: SignalHostPropSourcesBinding): void {
	const element = binding.element;
	const value = winningSignalHostControl(binding.sources, 'value');
	const checked = winningSignalHostControl(binding.sources, 'checked');
	const writable = isWritableSignal(value) || isWritableSignal(checked);
	for (const [channel, cleanup] of binding.controlWriters) {
		if (
			(channel === 'value' && isWritableSignal(value)) ||
			(channel === 'checked' && isWritableSignal(checked))
		) {
			continue;
		}
		cleanup();
		binding.controlWriters.delete(channel);
		if (TRANSITION_JOURNAL !== null) {
			journalUndo(() => {
				if (!binding.disposed && !binding.scope.block.disposed)
					addSignalHostControlWriter(binding, channel);
			});
		}
	}
	if (isWritableSignal(value) && !binding.controlWriters.has('value')) {
		const cleanup = addSignalHostControlWriter(binding, 'value');
		if (TRANSITION_JOURNAL !== null) {
			journalUndo(() => {
				cleanup();
				binding.controlWriters.delete('value');
			});
		}
	}
	if (isWritableSignal(checked) && !binding.controlWriters.has('checked')) {
		const cleanup = addSignalHostControlWriter(binding, 'checked');
		if (TRANSITION_JOURNAL !== null) {
			journalUndo(() => {
				cleanup();
				binding.controlWriters.delete('checked');
			});
		}
	}
	if (!writable) {
		if (binding.input !== undefined) {
			const input = binding.input;
			element.removeEventListener('input', input);
			if (TRANSITION_JOURNAL !== null) {
				journalUndo(() => {
					if (!binding.disposed && !binding.scope.block.disposed)
						element.addEventListener('input', input);
				});
			}
			binding.input = undefined;
		}
		return;
	}
	validateDirectSignalControl(element, binding.site);
	if (binding.input !== undefined) return;
	const input: EventListener = () => {
		if (binding.disposed || binding.pendingControl) return;
		const live = snapshotHydrationControl(element);
		if (live === null) return;
		// A spread's winning handle must come from the committed source too:
		// native edits never select or update a private Action candidate.
		withCommittedSignals(() =>
			runWithBlockSignalOwner(binding.scope, () => {
				const nextValue = winningSignalHostControl(binding.sources, 'value');
				const nextChecked = winningSignalHostControl(binding.sources, 'checked');
				if (isWritableSignal(nextChecked) && live.checked !== undefined)
					nextChecked.set(live.checked);
				if (isWritableSignal(nextValue)) nextValue.set(live.selectedValues ?? live.value);
			}),
		);
	};
	binding.input = input;
	element.addEventListener('input', input);
	if (TRANSITION_JOURNAL !== null) journalUndo(() => element.removeEventListener('input', input));
}

function disposeSignalHostPropSources(binding: SignalHostPropSourcesBinding): void {
	if (binding.disposed) return;
	binding.disposed = true;
	for (const unsubscribe of binding.subscriptions.values()) unsubscribe();
	binding.subscriptions.clear();
	for (const cleanup of binding.controlWriters.values()) cleanup();
	binding.controlWriters.clear();
	if (binding.input !== undefined) binding.element.removeEventListener('input', binding.input);
	queueOwnRefDetach(binding.resolved, binding.element);
}

function queueSignalHostControlAdoption(
	binding: SignalHostPropSourcesBinding,
	priorValue: unknown,
): void {
	enqueueEffectEventCommitAction(() => {
		if (binding.disposed || binding.scope.block.disposed || !binding.pendingControl) return;
		withCommittedSignals(() =>
			runWithBlockSignalOwner(binding.scope, () => {
				const snapshot = snapshotHydrationControl(binding.element)!;
				const value = winningSignalHostControl(binding.sources, 'value');
				if (
					snapshot.editRevision > 0 ||
					(binding.element.localName === 'textarea' &&
						isWritableSignal(value) &&
						Object.is(readSignalBinding(value), priorValue))
				) {
					const checked = winningSignalHostControl(binding.sources, 'checked');
					if (isWritableSignal(checked) && snapshot.checked !== undefined)
						checked.set(snapshot.checked);
					if (isWritableSignal(value)) value.set(snapshot.selectedValues ?? snapshot.value);
				}
				if (binding.disposed || binding.scope.block.disposed) return;
				if (!consumeHydrationControl(binding.element, snapshot.revision)) {
					queueSignalHostControlAdoption(binding, priorValue);
					return;
				}
				binding.pendingControl = false;
				updateSignalHostPropSources(binding);
			}),
		);
	});
}

function createSignalHostPropSourcesBinding(
	scope: Scope,
	element: Element,
	sources: readonly HostPropSource[],
	site: string,
	hasNestedChildren: boolean,
	readStyle: ((value: unknown) => unknown) | undefined,
): SignalHostPropSourcesBinding {
	const binding: SignalHostPropSourcesBinding = {
		[SIGNAL_HOST_PROP_SOURCES]: true,
		scope,
		element,
		site,
		hasNestedChildren,
		readStyle,
		sources,
		resolved: undefined,
		subscriptions: new Map(),
		controlWriters: new Map(),
		disposed: false,
	};
	registerHookCleanup(scope, () => disposeSignalHostPropSources(binding));
	return binding;
}

/**
 * The presentation caller has already validated the closed rest receipt and
 * owns the active native-read candidate/witness. Only source resolution and
 * authored coercion run now; ordinary subscriptions and writers activate after
 * that candidate is accepted. An abandoned binding has no resolved ref to detach.
 */
export function prepareSignalHostPropSources(
	scope: Scope,
	previous: unknown,
	element: Element,
	sources: readonly HostPropSource[],
	site: string,
	hasNestedChildren = false,
	readStyle?: (value: unknown) => unknown,
): { binding: SignalHostPropSourcesBinding; publish: () => void } {
	if (
		isHtmlCustomElement(element) ||
		element.hasAttribute('is') ||
		element.localName === 'input' ||
		element.localName === 'textarea' ||
		element.localName === 'select'
	)
		presentationMiss(false);
	return runWithBlockSignalOwner(scope, () => {
		const next = resolveSignalHostPropSources(sources, readStyle, (handle) => handle.get());
		const writers = new Map<string, HostPropWriter>();
		const resolved = resolveHostPropSources(element, next.sources, writers, readStyle);
		for (const name of writers.keys()) {
			if (name === 'ref' || isEventKey(name)) continue;
			if (
				isHostPropIdentityKey(name) ||
				name === 'is' ||
				name === 'muted' ||
				name === 'selected' ||
				formActionAttributeName(element, name) !== null
			)
				presentationMiss(false);
		}
		const prepared: Record<string, unknown> = Object.create(null);
		for (const name of Object.keys(resolved)) {
			const value = resolved[name];
			prepared[name] =
				name === 'ref' || isEventKey(name)
					? value
					: name === 'style'
						? __normalizeBindingStyle(value)
						: preparedPresentationAttribute(
								element,
								name,
								value,
								name === 'class' ? 'class' : 'attr',
							);
		}
		const prior = previous as SignalHostPropSourcesBinding | undefined;
		const reusable =
			prior?.[SIGNAL_HOST_PROP_SOURCES] === true &&
			!prior.disposed &&
			prior.resolved === undefined &&
			prior.scope === scope &&
			prior.element === element &&
			prior.site === site &&
			prior.hasNestedChildren === hasNestedChildren &&
			prior.readStyle === readStyle;
		const binding = reusable
			? prior
			: createSignalHostPropSourcesBinding(
					scope,
					element,
					sources,
					site,
					hasNestedChildren,
					readStyle,
				);
		let published = false;
		return {
			binding,
			publish() {
				if (published || binding.disposed || scope.block.disposed) return;
				published = true;
				runWithBlockSignalOwner(scope, () => {
					// A whole-style takeover replaces the early owner's complete style,
					// including properties absent from the accepted snapshot.
					setSpread(
						element,
						prepared,
						'style' in prepared ? { style: '' } : undefined,
						scope,
						true,
					);
					binding.sources = sources;
					binding.resolved = resolved;
					rebindSignalHostSubscriptions(binding, next.handles);
				});
			},
		};
	});
}

/** @internal Compiler target for spread-bearing hosts containing direct signals. */
export function bindSignalHostPropSources(
	scope: Scope,
	previous: unknown,
	element: Element,
	sources: readonly HostPropSource[],
	site: string,
	hasNestedChildren = false,
	readStyle?: (value: unknown) => unknown,
): unknown {
	let binding =
		typeof previous === 'object' &&
		previous !== null &&
		(previous as SignalHostPropSourcesBinding)[SIGNAL_HOST_PROP_SOURCES] === true
			? (previous as SignalHostPropSourcesBinding)
			: undefined;
	if (binding === undefined) {
		binding = createSignalHostPropSourcesBinding(
			scope,
			element,
			sources,
			site,
			hasNestedChildren,
			readStyle,
		);
	} else {
		// The resolved props must roll back with the DOM; otherwise a retry
		// mistakes discarded event/control writes for already committed values.
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(binding);
		binding.sources = sources;
	}
	const valueControl = winningSignalHostControl(sources, 'value');
	if (
		hydrationStarted &&
		valueControl !== null &&
		scope.block.idState.renderOwner?.controlLeases?.has(element)
	)
		HYDRATION_DRIVER!.presentationMiss(false);
	const checkedControl = winningSignalHostControl(sources, 'checked');
	const controlSnapshot =
		isWritableSignal(valueControl) || isWritableSignal(checkedControl)
			? snapshotHydrationControl(element)
			: null;
	if (controlSnapshot !== null) {
		validateDirectSignalControl(element, site);
		binding.pendingControl ||= hydrating
			? CURSOR !== null &&
				(controlSnapshot.editRevision > 0 ||
					(isWritableSignal(valueControl) &&
						isRestoredHydrationTextarea(element, readSignalBinding(valueControl))))
			: false;
	}
	const next = resolveSignalHostPropSources(sources, readStyle);
	binding.resolved = setHostPropSources(
		element,
		next.sources,
		binding.resolved,
		scope,
		hasNestedChildren,
		readStyle,
		binding.pendingControl,
	);
	rebindSignalHostSubscriptions(binding, next.handles);
	syncSignalHostControl(binding);
	if (!binding.pendingControl && controlSnapshot !== null)
		consumeHydrationControl(element, controlSnapshot.revision);
	if (binding.pendingControl) queueSignalHostControlAdoption(binding, binding.resolved?.['value']);
	return binding;
}

const DIRECT_SIGNAL_CHILD = /* @__PURE__ */ Symbol('octane.direct-signal-child');
let IMPLICIT_SIGNAL_CHILD_DEPTH = 0;

interface DirectSignalChildBinding {
	readonly [DIRECT_SIGNAL_CHILD]: true;
	readonly scope: Scope;
	readonly slotKey: number;
	readonly handle: SignalHandle<unknown>;
	text?: Text | null;
	state: ChildSlot | undefined;
	value: unknown;
	unsubscribe?: () => void;
	disposed: boolean;
}

function disposeDirectSignalChild(binding: DirectSignalChildBinding): void {
	if (binding.disposed) return;
	binding.disposed = true;
	binding.unsubscribe?.();
}

function updateDirectSignalChild(binding: DirectSignalChildBinding): void {
	if (binding.disposed || binding.scope.block.disposed) return;
	if (ROOT_RENDER_TRANSACTION !== null) {
		scheduleRender(binding.scope.block);
		return;
	}
	try {
		runWithBlockSignalOwner(binding.scope, () => {
			const value = readSignalBinding(binding.handle);
			if (Object.is(binding.value, value)) return;
			const state = binding.scope.slots[binding.slotKey] as ChildSlot | undefined;
			const type = typeof value;
			const primitive = value == null || (type !== 'object' && type !== 'function');
			const text = primitive ? coerceChildText(value) : null;
			if (state === undefined && binding.text != null && text !== null && text !== '') {
				setText(binding.text, text);
				binding.value = value;
				return;
			}
			if (
				state === binding.state &&
				state?.block === null &&
				state.forSlot === null &&
				state.hostNode === null &&
				state.portal === null &&
				text !== null &&
				text !== '' &&
				state.text !== null
			) {
				setText(state.text, text);
				binding.value = value;
				return;
			}
			scheduleRender(binding.scope.block);
		});
	} catch {
		scheduleRender(binding.scope.block);
	}
}

/** @internal Capability-routed renderable hole with targeted signal text updates. */
export function bindSignalChild(
	parentScope: Scope,
	previous: unknown,
	slotKey: number,
	domParent: Node,
	value: unknown,
	_site: string,
	anchor?: Node | null,
	ownEnd?: boolean,
	ownsHost?: Element,
	compactable?: boolean,
	// Compiler proof that this hole owns the host's markerless only-child ABI.
	onlyChild?: boolean,
	bindingMarker?: string,
): unknown {
	return bindSignalChildWith(
		renderSignalChildSlot,
		parentScope,
		previous,
		slotKey,
		domParent,
		value,
		anchor,
		ownEnd,
		ownsHost,
		compactable,
		onlyChild,
		bindingMarker,
	);
}

function bindSignalChildWith(
	render: SignalChildSlotRenderer,
	parentScope: Scope,
	previous: unknown,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor: Node | null | undefined,
	ownEnd: boolean | undefined,
	ownsHost: Element | undefined,
	compactable: boolean | undefined,
	onlyChild: boolean | undefined,
	bindingMarker: string | undefined,
): unknown {
	// A markerless only-child hole keeps its last written primitive as the token
	// (see below), whose Text node is the host's first child. An unchanged
	// primitive then does nothing, as childTextHoleUpdate's raw-value guard does,
	// without a DOM read. Raw HTML still claims the host first.
	const textToken = onlyChild && previous != null && typeof previous !== 'object';
	if (textToken && previous === value && !dangerouslySetInnerHTMLOwnsChild(domParent, value))
		return value;
	const prior =
		typeof previous === 'object' &&
		previous !== null &&
		(previous as DirectSignalChildBinding)[DIRECT_SIGNAL_CHILD] === true
			? (previous as DirectSignalChildBinding)
			: null;
	const cachedText =
		prior?.text ??
		(previous instanceof Text ? previous : textToken ? (getFirstChild(domParent) as Text) : null);
	if (!isSignalHandle(value)) {
		const type = typeof value;
		// An ordinary marker-bounded hole keeps textHoleUpdate's fast path: its
		// token is the last primitive, and a changed primitive rewrites the slot's
		// Text node. Objects never become the token, so it is never read later. A
		// pass that already queued this block skips child writes, so its token must
		// not claim a primitive that never reached the DOM.
		const primitiveToken =
			slotKey !== 0 &&
			!onlyChild &&
			bindingMarker === undefined &&
			value !== null &&
			type !== 'object' &&
			type !== 'function' &&
			!(CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate);
		if (primitiveToken && prior === null) {
			const state = parentScope.slots[slotKey] as ChildSlot | undefined;
			const node = state?.text;
			if (
				node != null &&
				state!.block === null &&
				state!.forSlot === null &&
				state!.hostNode === null &&
				state!.portal === null &&
				state!.implicitSignal === undefined &&
				!dangerouslySetInnerHTMLOwnsChild(domParent, value)
			) {
				if (previous !== value) setRenderText(node, value === true ? '' : value);
				return value;
			}
		}
		const text = render(
			parentScope,
			slotKey,
			domParent,
			value,
			anchor,
			ownEnd,
			ownsHost,
			compactable,
			onlyChild,
			bindingMarker,
			cachedText,
		);
		if (prior !== null) {
			if (TRANSITION_JOURNAL !== null) journalBag();
			const finish = (discarded: boolean): void => {
				if (!discarded) disposeDirectSignalChild(prior);
			};
			if (WIP_CAPTURE === null) finish(false);
			else (WIP_CAPTURE.renderCleanups ??= []).push(finish);
		}
		if (primitiveToken) return value;
		// A primitive whose Text node is the host's first child becomes the token.
		// A previous token or a client mount's empty template proves that position;
		// otherwise compare once, because hydration can keep unclaimed server
		// content ahead of the node it adopted.
		return text !== null &&
			type !== 'object' &&
			type !== 'function' &&
			parentScope.slots[slotKey] === undefined &&
			(textToken ||
				(previous === null && !parentScope.mounted && !hydrating) ||
				getFirstChild(domParent) === text)
			? value
			: text;
	}
	if (prior !== null && !prior.disposed && prior.handle === value) {
		const next = readSignalBinding(value);
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(prior);
		const text = render(
			parentScope,
			slotKey,
			domParent,
			next,
			anchor,
			ownEnd,
			ownsHost,
			compactable,
			onlyChild,
			bindingMarker,
			cachedText,
		);
		if (onlyChild) prior.text = text;
		prior.value = next;
		prior.state = parentScope.slots[slotKey] as ChildSlot | undefined;
		return prior;
	}
	const initial = readSignalBinding(value);
	const text = render(
		parentScope,
		slotKey,
		domParent,
		initial,
		anchor,
		ownEnd,
		ownsHost,
		compactable,
		onlyChild,
		bindingMarker,
		cachedText,
	);
	if (TRANSITION_JOURNAL !== null) journalBag();
	const binding: DirectSignalChildBinding = {
		[DIRECT_SIGNAL_CHILD]: true,
		scope: parentScope,
		slotKey,
		handle: value,
		text,
		state: parentScope.slots[slotKey] as ChildSlot | undefined,
		value: initial,
		disposed: false,
	};
	binding.unsubscribe = value[SIGNAL_BINDING_SUBSCRIBE](
		bindingTransitionNotify(binding, () => updateDirectSignalChild(binding)),
	);
	registerHookCleanup(parentScope, () => disposeDirectSignalChild(binding));
	if (prior !== null) {
		const finish = (discarded: boolean): void =>
			disposeDirectSignalChild(discarded ? binding : prior);
		if (WIP_CAPTURE === null) finish(false);
		else (WIP_CAPTURE.renderCleanups ??= []).push(finish);
	}
	return binding;
}

// A signal passed through an otherwise-unmarked prop is syntactically
// indistinguishable from another renderable child. Keep ordinary primitives
// untouched and activate the signal owner only after the nominal runtime
// capability is observed. Returns whether it rendered the slot.
export function bindImplicitSignalChild(
	render: SignalChildSlotRenderer,
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	value: unknown,
	anchor: Node | null | undefined,
	ownEnd: boolean | undefined,
	ownsHost: Element | undefined,
	compactable: boolean | undefined,
	bindingMarker: string | undefined,
): boolean {
	if (IMPLICIT_SIGNAL_CHILD_DEPTH !== 0) return false;
	const previous = (parentScope.slots[slotKey] as ChildSlot | undefined)?.implicitSignal;
	const handle = isSignalHandle(value);
	if (!handle && previous === undefined) return false;
	// Enable the document directly. Calling enableSignalBindings here would make
	// it and this function reference each other, and the minifier cannot drop
	// that cycle from a signal-free bundle.
	if (handle && !signalDocumentEnabled) enableSignalDocument(1);
	IMPLICIT_SIGNAL_CHILD_DEPTH++;
	let token: unknown;
	try {
		token = runWithBlockSignalOwner(parentScope, () =>
			bindSignalChildWith(
				render,
				parentScope,
				previous,
				slotKey,
				domParent,
				value,
				anchor,
				ownEnd,
				ownsHost,
				compactable,
				undefined,
				bindingMarker,
			),
		);
	} finally {
		IMPLICIT_SIGNAL_CHILD_DEPTH--;
	}
	const state = parentScope.slots[slotKey] as ChildSlot | undefined;
	if (state !== undefined) state.implicitSignal = token;
	return true;
}

// childSlot's portal regime: render the descriptor's body into its foreign
// target, leaving the slot's own markers empty. Switching in from any other
// content tears that down first, and any other value tears a portal down.
// Returns whether `value` is a portal.
export function renderPortalChild(
	state: ChildSlot,
	value: unknown,
	parentBlock: Block,
	domParent: Node,
	hydration: HydrationCapability | null,
): boolean {
	if (value == null || (value as any).$$kind !== PORTAL_TAG) {
		if (state.portal != null) {
			teardownPortalState(state.portal);
			state.portal = null;
		}
		return false;
	}
	const portalDesc = value as PortalDescriptor;
	if (state.forSlot !== null) {
		if (ROOT_RENDER_TRANSACTION !== null && hydration === null) clearChildContent(state);
		else teardownChildForSlot(state);
	}
	if (state.block !== null || state.text !== null || state.hostNode !== null) {
		clearChildContent(state);
	}
	state.portal = renderPortalState(
		state.portal,
		parentBlock,
		portalDesc.target,
		portalDesc.body,
		portalDesc.props,
		// The DOM element containing this hole is the portal's logical parent.
		domParent,
		undefined,
		portalDesc.key,
	);
	// Conditional portals and portals inside directive helpers use childSlot
	// rather than the compiler's direct portal helper. Their retained end anchor
	// still locates the authored position inside any enclosing Fragment refs.
	if (activeFragments.size !== 0 && state.end !== null) {
		registerValuePortalFragmentOwners(state.portal, parentBlock, state.end);
	}
	return true;
}
