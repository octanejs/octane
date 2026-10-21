// Form actions
//
// React 19 actions: form action submission, useActionState, useFormStatus,
// useOptimistic and form resets.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './templates.js';
import { hydrating } from '../hydration-flag.js';
import { __profileSchedule } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import type { HookSlot, Block } from './types.js';
import { resolveSlot, noop } from './drivers.js';
import {
	VIEW_TRANSITION_DRIVER,
	TRANSITION_DEPTH,
	ASYNC_TRANSITION_COUNT,
	TRANSITION_PENDING_COUNT,
	isTransitionUpdateContext,
	scheduleRender,
	scheduleUrgentRender,
} from './engine.js';
import { ensureHooks, registerHookCleanup, missingSlot } from './hooks.js';
import {
	transitionActionBatchForUpdate,
	TRANSITION_LISTENERS,
	markTransitionCue,
	startTransition,
} from './transitions.js';
import { CURSOR } from './hydration.js';
import { reassertControlledIn } from './portals.js';
import { findTryHandler } from './suspense.js';
import { CURRENT_SCOPE, CURRENT_BLOCK } from './render.js';
import { setAttribute } from './host-props.js';
import { delegateEvents, ACTIVE_SUBMIT_DISPATCH } from './events.js';
import { queueFormActionAuthoringDiagnostic, atCommitIf } from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// Function form actions are the only submits the runtime intercepts, and
// setFormAction is the only writer of `$$formAction`. Installing the handler
// from there keeps the Action/transition graph out of every bundle that only
// delegates events; the dispatch loop still records the submit for manual
// useFormStatus activation.
export let FORM_SUBMIT_DRIVER: typeof handleFormSubmit | null = null;
export function clearCurrentTarget(event: Event): void {
	// Deleting the own property re-exposes Event.prototype's native getter.
	delete (event as any).currentTarget;
}

// ---------------------------------------------------------------------------
// React 19 Actions — <form action={fn}>, useActionState, useFormStatus,
// useOptimistic. A function passed to a form/button action intercepts native
// submit, builds FormData, and runs the action inside a transition. Submission
// status is published per-form so a descendant useFormStatus() can read it.
// ---------------------------------------------------------------------------

export interface FormStatus {
	pending: boolean;
	data: FormData | null;
	method: string | null;
	action: ((formData: FormData) => unknown) | string | null;
}
const IDLE_FORM_STATUS: FormStatus = { pending: false, data: null, method: null, action: null };

// Per-form current submission status + the descendant useFormStatus subscribers.
const FORM_STATUS = new WeakMap<HTMLFormElement, FormStatus>();
const FORM_STATUS_LISTENERS = new WeakMap<HTMLFormElement, Set<() => void>>();

function setFormStatus(form: HTMLFormElement, status: FormStatus): void {
	FORM_STATUS.set(form, status);
	const ls = FORM_STATUS_LISTENERS.get(form);
	if (ls) for (const l of ls) l();
}

// ---------------------------------------------------------------------------
// Manual-action useFormStatus activation (React parity — FormActionEventPlugin):
// besides the intercepted `<form action={fn}>` path, React publishes pending
// status when startTransition is called synchronously during a form's submit
// dispatch whose default was prevented (the `onSubmit={e => { e.preventDefault();
// startTransition(async () => …) }}` idiom). React entangles the pending state
// with the transitions the event scheduled (currentEventTransitionLane);
// octane's equivalent is a per-dispatch record: dispatchDelegated opens it for
// a submit event targeting a form, startTransition registers on it, and when
// the walk ends with the default prevented (and the intercepted path didn't
// claim the submit) pending status is published until every registered
// transition settles. Shares handleFormSubmit's `$$pendingSubmits` counter so
// overlapping manual and intercepted submissions coalesce to one idle flip.
// ---------------------------------------------------------------------------

export interface SubmitDispatchRec {
	form: HTMLFormElement;
	event: SubmitEvent;
	/** Effective default action and submitter captured before user callbacks. */
	action: unknown;
	submitter: HTMLElement | null;
	/** Transitions started synchronously during this dispatch, not yet settled. */
	transitions: number;
	/** Pending status was published for this dispatch (manual-action path). */
	published: boolean;
	/** handleFormSubmit ran for this dispatch — status is its responsibility. */
	intercepted: boolean;
}

export function snapshotSubmitDispatch(
	form: HTMLFormElement,
	event: SubmitEvent,
): SubmitDispatchRec {
	let submitter = event.submitter;
	let action: unknown = (form as any).$$formAction;
	if (submitter !== null && submitter !== undefined) {
		const override = (submitter as any).$$formAction ?? submitter.getAttribute('formaction');
		if (override != null) {
			action = override;
			// An explicit formAction owns the action input; its submit button is
			// not a named field in that action's FormData (React 19 semantics).
			submitter = null;
		}
	}
	return {
		form,
		event,
		action,
		submitter: submitter ?? null,
		transitions: 0,
		published: false,
		intercepted: false,
	};
}

// Runs when the submit dispatch's handler walk finishes (dispatchDelegated).
export function publishRegisteredManualFormPending(rec: SubmitDispatchRec): void {
	if (rec.intercepted || rec.transitions === 0 || !rec.event.defaultPrevented) return;
	const form = rec.form;
	let data: FormData | null = null;
	try {
		data = new FormData(form, rec.event.submitter);
	} catch {
		/* jsdom quirks — status still activates with data: null */
	}
	const fa = form as any;
	fa.$$pendingSubmits = (fa.$$pendingSubmits || 0) + 1;
	rec.published = true;
	setFormStatus(form, {
		pending: true,
		data,
		method: form.method || 'get',
		// React reports the form's action PROP here; octane's equivalents are the
		// intercept function ($$formAction) or the plain attribute.
		action: (fa.$$formAction as FormStatus['action']) ?? form.getAttribute('action'),
	});
}

// Runs once per registered transition, on settle (fulfil, reject, or sync throw).
export function settleSubmitTransition(rec: SubmitDispatchRec): void {
	rec.transitions--;
	if (rec.transitions !== 0 || !rec.published) return;
	const fa = rec.form as any;
	fa.$$pendingSubmits = Math.max(0, (fa.$$pendingSubmits || 1) - 1);
	if (fa.$$pendingSubmits === 0) setFormStatus(rec.form, IDLE_FORM_STATUS);
}

// Forms whose reset was requested during a transition/action window, applied
// when the window closes (see flushFormResets / startTransition).
let PENDING_FORM_RESETS: Set<HTMLFormElement> | null = null;

function resetFormNow(form: HTMLFormElement): void {
	try {
		form.reset();
		// The native reset restored DEFAULTS; controlled fields snap back to
		// their rendered values (React applies queued resets the same way).
		reassertControlledIn(form);
	} catch {
		/* jsdom/detached form */
	}
}

/**
 * React DOM's `requestFormReset(form)` — schedule a reset of the form's
 * uncontrolled fields, tied to the enclosing transition/action: the reset is
 * deferred until the action window closes (every in-flight async transition has
 * settled), matching React's "reset when the action's transition commits". This
 * is the manual companion to the automatic reset a plain `<form action={fn}>`
 * gets on success — use it from `onSubmit` + `startTransition` flows or
 * `useActionState` forms that DO want a reset.
 *
 * Called outside any transition or action, React logs an error; octane does the
 * same and applies the reset immediately (the least surprising fallback).
 */
export function requestFormReset(form: HTMLFormElement): void {
	if (isTransitionUpdateContext()) {
		(PENDING_FORM_RESETS ??= new Set()).add(form);
		return;
	}
	if (process.env.NODE_ENV !== 'production')
		console.error(
			'requestFormReset was called outside a transition or action. To fix, move to ' +
				'an action, or wrap with startTransition.',
		);
	resetFormNow(form);
}

// Apply the queued form resets once NO transition/action window remains open.
// Called from every startTransition settle path; the guard makes overlapping
// async actions coalesce — resets fire when the LAST one settles (success or
// failure: React applies queued resets when the transition commits, and an
// action whose error routes to a boundary still commits).
export function flushFormResets(): void {
	if (PENDING_FORM_RESETS === null) return;
	if (TRANSITION_DEPTH > 0 || ASYNC_TRANSITION_COUNT > 0) return;
	const forms = PENDING_FORM_RESETS;
	PENDING_FORM_RESETS = null;
	for (const f of forms) resetFormNow(f);
}

/**
 * Compiler-emitted binding for `<form action={fn}>` / `<button formAction={fn}>`.
 * A FUNCTION value wires submit interception (stored on the element as
 * `$$formAction`, with submit delegation installed once);
 * a string/null value falls back to the native attribute so ordinary form posts
 * still work. The previous-value argument remains part of the compiler ABI.
 */
export function setFormAction(
	el: HTMLFormElement | HTMLButtonElement | HTMLInputElement,
	name: string,
	value: unknown,
	_prev: unknown,
): void {
	if (typeof value === 'function') {
		(el as any).$$formAction = value;
		if (process.env.NODE_ENV !== 'production') queueFormActionAuthoringDiagnostic(el);
		if (!(el as any).$$formSubmitWired) {
			(el as any).$$formSubmitWired = true;
			FORM_SUBMIT_DRIVER = handleFormSubmit;
			delegateEvents(['submit']);
		}
		// A function action implies a non-native submit; drop any stale attribute,
		// an adopted server element's at commit.
		if (el.hasAttribute(name)) atCommitIf(hydrating && CURSOR !== null, dropAttribute, [el, name]);
		return;
	}
	setFormActionAttribute(el, name, value);
}

function dropAttribute([el, name]: [Element, string]): void {
	el.removeAttribute(name);
}

// A string or nullish action is the native attribute. Clearing the action must
// preserve the independently authored onSubmit.
export function setFormActionAttribute(
	el: Element,
	name: string,
	value: unknown,
	_prev?: unknown,
): void {
	// Only a descriptor host without installed form actions passes a function
	// here (DESCRIPTOR_FORM_ACTION): a compiler classification gap.
	if (process.env.NODE_ENV !== 'production' && typeof value === 'function')
		throw new Error(formatClientError(342));
	(el as any).$$formAction = undefined;
	setAttribute(el, name, value);
}

function handleFormSubmit(
	form: HTMLFormElement,
	event: Event,
	action: unknown,
	submitter: HTMLElement | null,
): void {
	if (typeof action !== 'function') return; // native submit / no function action
	event.preventDefault();
	// This submit is the intercepted-action path's responsibility — suppress the
	// manual startTransition activation for the same dispatch (the action's own
	// transition would otherwise double-publish through the record).
	if (ACTIVE_SUBMIT_DISPATCH !== null && ACTIVE_SUBMIT_DISPATCH.form === form)
		ACTIVE_SUBMIT_DISPATCH.intercepted = true;

	// Construct all successful controls in document order before formdata fires.
	const data = new FormData(form, submitter);

	const fn = action as (formData: FormData) => unknown;
	// Track in-flight submissions per form. A useActionState dispatcher returns a
	// promise that resolves when THAT dispatch's action finishes — not when the
	// whole sequential queue drains — so a rapid second submit must NOT flip the
	// form's status to idle while a later queued action is still running. Only
	// clear when the count returns to 0.
	const fa = form as any;
	fa.$$pendingSubmits = (fa.$$pendingSubmits || 0) + 1;
	setFormStatus(form, { pending: true, data, method: 'post', action: fn });

	// useActionState dispatchers self-wrap in a transition AND keep typed-in
	// values (no auto-reset); a raw action function is wrapped here and its form
	// is reset on success.
	const isDispatcher = (fn as any).$$isActionDispatcher === true;

	const settle = (ok: boolean) => {
		fa.$$pendingSubmits = Math.max(0, (fa.$$pendingSubmits || 1) - 1);
		if (fa.$$pendingSubmits === 0) setFormStatus(form, IDLE_FORM_STATUS);
		// React resets a plain <form action={fn}>'s uncontrolled fields on success;
		// useActionState-driven forms keep their values. form.reset() restores
		// uncontrolled inputs to defaultValue; reassertControlledIn then snaps
		// controlled fields back to their rendered values (React parity — the
		// reset must not clobber controlled state).
		if (ok && !isDispatcher) {
			try {
				form.reset();
				reassertControlledIn(form);
			} catch {
				/* jsdom/detached form */
			}
		}
	};

	let result: unknown;
	try {
		if (isDispatcher) {
			result = fn(data);
		} else {
			startTransition(() => {
				result = fn(data);
				return result as void | Promise<unknown>;
			});
		}
	} catch (err) {
		// A SYNCHRONOUS throw from the action (or a startTransition rethrow) would
		// otherwise skip the settle wiring below, leaving the form's status stuck
		// on `pending`. Clear it, then report — an error thrown inside a DOM submit
		// handler has no meaningful propagation target (mirrors the runtime's
		// effect-error handling: recover + console.error).
		settle(false);
		console.error(err);
		return;
	}
	Promise.resolve(result).then(
		() => settle(true),
		() => settle(false),
	);
}

// ---------------------------------------------------------------------------
// useActionState(action, initialState, permalink?) → [state, formAction, isPending]
//
// `action(previousState, payload)` runs inside a transition. `formAction` is a
// stable dispatcher you wire to `<form action={formAction}>` (payload = FormData)
// or call directly (`formAction(payload)`). Dispatches run SEQUENTIALLY, each
// receiving the previous COMPLETED result as previousState. Each runs the action
// that was current when it was dispatched (React stores it on the queue node),
// so a rerender never retargets an already-queued payload. `isPending` is true
// from dispatch until the queue drains. The action's resolved value becomes the
// new state. Errors route to the nearest @try boundary (else console.error).
// `permalink` (server-action progressive enhancement) is accepted for signature
// parity and ignored — octane actions run only on the client (no server-action
// execution); SSR renders the initial state. Form auto-reset is intentionally
// skipped for useActionState forms (typed-in values are kept), matching React.
// ---------------------------------------------------------------------------

interface ActionStateSlot<S> {
	state: S;
	isPending: boolean;
	pendingCount: number;
	chain: Promise<S>;
	action: (prev: S, payload: any) => S | Promise<S>;
	dispatch: ((payload?: any) => Promise<S>) & { $$isActionDispatcher?: true };
}

export function useActionState<S>(
	action: (prevState: S, payload: any) => S | Promise<S>,
	initialState: S,
	permalinkOrSlot?: string | symbol,
	slot?: HookSlot,
): [S, (payload?: any) => void, boolean];
export function useActionState<S>(
	action: (prevState: S, payload: any) => S | Promise<S>,
	initialState: S,
	permalinkOrSlot?: string | symbol,
	slot?: HookSlot,
): [S, (payload?: any) => void, boolean] {
	// `permalink` is optional, the compiler appends the slot last. Disambiguate:
	// a trailing symbol in the 3rd position means no permalink was passed.
	if (typeof permalinkOrSlot === 'symbol') slot = permalinkOrSlot;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useActionState');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as ActionStateSlot<S> | undefined;
	if (s === undefined) {
		const slotRef: ActionStateSlot<S> = {
			state: initialState,
			isPending: false,
			pendingCount: 0,
			chain: Promise.resolve(initialState),
			action,
			dispatch: undefined as any,
		};
		const setPending = (next: boolean): void => {
			if (slotRef.isPending !== next) {
				slotRef.isPending = next;
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'action-state-pending', slot);
					// The rising edge is a pending cue; the falling edge commits with the result.
					if (next) {
						if (VIEW_TRANSITION_DRIVER) VIEW_TRANSITION_DRIVER.markActionCue();
						markTransitionCue(block);
					}
					scheduleRender(block, false, next);
				}
			}
		};
		const dispatch = ((payload?: any): Promise<S> => {
			// Native form actions dispatch before this hook starts its queued
			// transition. The intercepted submit already supplies action context.
			const outsideTransition =
				process.env.NODE_ENV !== 'production' &&
				transitionActionBatchForUpdate() === null &&
				ACTIVE_SUBMIT_DISPATCH?.intercepted !== true;
			// Pin the dispatch-time action; renders keep replacing slotRef.action.
			const run = slotRef.action;
			slotRef.pendingCount++;
			setPending(true);
			// Sequential queue: each run sees the prior COMPLETED state.
			slotRef.chain = slotRef.chain.then(
				(prevState) =>
					new Promise<S>((resolveResult) => {
						const finish = (): void => {
							slotRef.pendingCount--;
							if (slotRef.pendingCount === 0) setPending(false);
						};
						startTransition(() => {
							let p: Promise<S>;
							try {
								const result = run(prevState, payload);
								if (
									process.env.NODE_ENV !== 'production' &&
									outsideTransition &&
									result != null &&
									typeof (result as any).then === 'function'
								) {
									console.error(
										'An async useActionState action was dispatched outside a transition or action. Use an action/formAction prop or wrap the dispatch in startTransition.',
									);
								}
								p = Promise.resolve(result);
							} catch (err) {
								// A SYNCHRONOUS throw from the action would otherwise escape
								// startTransition before `finish` is wired, leaving pendingCount
								// (and isPending) stuck true forever and rejecting the chain so the
								// queue stops threading. Settle it exactly like the async-rejection
								// path: clear pending, route the error, keep prior state.
								finish();
								const handler = findTryHandler(block);
								if (handler) handler(err);
								else console.error(err);
								resolveResult(prevState);
								return;
							}
							p.then(
								(result) => {
									slotRef.state = result;
									finish();
									if (!block.disposed) {
										if (
											typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
											__OCTANE_PROFILE_ENABLED__
										)
											__profileSchedule(block, 'action-state', slot);
										scheduleRender(block);
									}
									resolveResult(result);
								},
								(err) => {
									finish();
									const handler = findTryHandler(block);
									if (handler) handler(err);
									else console.error(err);
									// Keep prior state so the next queued dispatch threads it.
									resolveResult(prevState);
								},
							);
							return p.then(noop, noop);
						});
					}),
			);
			return slotRef.chain;
		}) as ActionStateSlot<S>['dispatch'];
		dispatch.$$isActionDispatcher = true;
		slotRef.dispatch = dispatch;
		s = slotRef;
		ensureHooks(scope).set(slot, slotRef);
	}
	// Keep the action reference fresh across renders (closures over latest props).
	s.action = action;
	return [s.state, s.dispatch, s.isPending];
}

// ---------------------------------------------------------------------------
// useFormStatus() → { pending, data, method, action }
//
// Reads the submission status of the nearest ANCESTOR <form> (found by walking
// the DOM up from this component's markers — so a <form> rendered BY this same
// component is correctly ignored, matching React). Subscribes to that form's
// status so a submission re-renders the consumer. Defaults to the idle status
// when there is no ancestor form or no active submission.
// ---------------------------------------------------------------------------

function findPortalAncestor(block: Block | null): Block | null {
	while (block !== null && block.kind !== 'portal') block = block.parentBlock;
	return block;
}

function findAncestorFormInBlocks(block: Block | null): HTMLFormElement | null {
	while (block !== null) {
		// A form can be the root of a block inside the same detached frontier;
		// prefer it before following that frontier's next parent outward.
		const root = block.startMarker;
		if ((root as any)?.nodeName === 'FORM') return root as HTMLFormElement;
		let n: Node | null = block.parentNode;
		let portal = findPortalAncestor(block);
		while (n !== null) {
			// A block inside a portal can have a target form as its DOM parent. Cross
			// that portal before treating any form in the target tree as an ancestor.
			if (portal !== null && n === portal.parentNode) {
				const host = (portal.startMarker as (Node & { $$portalParent?: Node }) | null)
					?.$$portalParent;
				n = host ?? n.parentNode;
				portal = findPortalAncestor(portal.parentBlock);
				continue;
			}
			if ((n as any).nodeName === 'FORM') return n as HTMLFormElement;
			const parent = n.parentNode;
			n =
				parent ??
				(n.nodeType === 11
					? ((n as DocumentFragment & { $$next?: { parent: Node | null } }).$$next?.parent ?? null)
					: null);
		}
		block = block.parentBlock;
	}
	return null;
}

function findAncestorFormInDetachedHost(node: Node, block: Block | null): HTMLFormElement | null {
	let portal = findPortalAncestor(block);
	let n: Node | null = node;
	while (n !== null) {
		if (portal !== null && n === portal.parentNode) {
			const host = (portal.startMarker as (Node & { $$portalParent?: Node }) | null)
				?.$$portalParent;
			n = host ?? n.parentNode;
			portal = findPortalAncestor(portal.parentBlock);
			continue;
		}
		if ((n as any).nodeName === 'FORM') return n as HTMLFormElement;
		n = n.parentNode;
	}
	return null;
}

function findAncestorForm(block: Block, portal: Block | null): HTMLFormElement | null {
	// Start above the range: a single-root Block's start is its own root element,
	// which may be the <form> this component renders.
	const start = block.startMarker;
	let n: Node | null = start ? start.parentNode : (block.parentNode ?? null);
	while (n) {
		// Portal children live in a foreign DOM tree. Stop at its target and resume
		// from the portal's logical host, which is available before the body renders.
		if (portal !== null && n === portal.parentNode) {
			const host = (portal.startMarker as (Node & { $$portalParent?: Node }) | null)
				?.$$portalParent;
			// A host built in a frontier is detached until commit, so walking its
			// DOM parents cannot reach an ancestor form from this first render.
			if (host !== undefined && !host.isConnected) {
				const localForm = findAncestorFormInDetachedHost(host, portal.parentBlock);
				if (localForm !== null) return localForm;
				const form = findAncestorFormInBlocks(portal.parentBlock);
				if (form !== null) return form;
			}
			n = host ?? n.parentNode;
			portal = findPortalAncestor(portal.parentBlock);
			continue;
		}
		if ((n as any).nodeName === 'FORM') return n as HTMLFormElement;
		const parent = n.parentNode;
		// A frontier is detached during render; its slot records the parent it
		// will commit into, which is still part of this component's source tree.
		n =
			parent ??
			(n.nodeType === 11
				? ((n as DocumentFragment & { $$next?: { parent: Node | null } }).$$next?.parent ?? null)
				: null);
	}
	return null;
}

interface FormStatusSlot {
	form: HTMLFormElement | null;
	listener: (() => void) | null;
	// The owning Block tree is stable for this hook scope; cache its portal edge
	// so ordinary form-status renders keep the DOM-only ancestor fast path.
	portal: Block | null;
}

export function useFormStatus(slot?: HookSlot): FormStatus;
export function useFormStatus(slot?: HookSlot): FormStatus {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useFormStatus');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as FormStatusSlot | undefined;
	if (s === undefined) {
		s = { form: null, listener: null, portal: findPortalAncestor(scope.block) };
		const slotRef = s;
		ensureHooks(scope).set(slot, slotRef);
		registerHookCleanup(scope, () => {
			if (slotRef.form && slotRef.listener)
				FORM_STATUS_LISTENERS.get(slotRef.form)?.delete(slotRef.listener);
		});
	}
	// Re-resolve the nearest ANCESTOR <form> on EVERY render: a conditionally
	// rendered form (or a moved consumer) means the form can appear/change after
	// the first run. Re-subscribe when it changes; caching only the first result
	// would leave the hook stuck reporting idle for a form that showed up later.
	// Start from this component's own range: a lite Scope's stand-in sits at its
	// host node, inside any <form> the owning Block renders around it.
	const form = findAncestorForm(scope.block, s.portal);
	if (form !== s.form) {
		if (s.form && s.listener) FORM_STATUS_LISTENERS.get(s.form)?.delete(s.listener);
		s.form = form;
		if (form) {
			const listener = (): void => {
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'form-status', slot);
					scheduleRender(block);
				}
			};
			s.listener = listener;
			let set = FORM_STATUS_LISTENERS.get(form);
			if (!set) {
				set = new Set();
				FORM_STATUS_LISTENERS.set(form, set);
			}
			set.add(listener);
		} else {
			s.listener = null;
		}
	}
	return s.form ? (FORM_STATUS.get(s.form) ?? IDLE_FORM_STATUS) : IDLE_FORM_STATUS;
}

// ---------------------------------------------------------------------------
// useOptimistic(state, updateFn?) → [optimisticState, addOptimistic]
//
// `optimisticState` equals `state` unless an Action/transition is in flight, in
// which case it is `state` folded through `updateFn(acc, value)` for each queued
// addOptimistic call. Without an updateFn the fold is React's basicStateReducer:
// a function value is an updater called with the pending state, as in useState,
// and any other value replaces it. The queue is cleared when the owning
// transition settles, so optimistic and real state converge in the same commit —
// on success `state` has advanced, on error it is unchanged (automatic revert).
// addOptimistic should be called inside an Action.
// ---------------------------------------------------------------------------

interface OptimisticSlot<V> {
	queue: V[];
	add: (value: V) => void;
	/**
	 * True when the queue was populated INSIDE a transition, so it should clear
	 * when that transition settles (count → 0). Without this, an addOptimistic
	 * called outside any transition would (a) never clear via the listener, and
	 * (b) be wiped by an unrelated transition elsewhere settling. See `add`.
	 */
	armed: boolean;
}

function basicOptimisticReducer<S>(state: S, value: unknown): S {
	return typeof value === 'function' ? (value as (pending: S) => S)(state) : (value as S);
}

// Authored calls resolve to React's two overloads; the last one also takes the
// hook slot the compiler appends.
export function useOptimistic<S>(
	passthrough: S,
): [S, (action: S | ((pendingState: S) => S)) => void];
export function useOptimistic<S, V = S>(
	passthrough: S,
	updateFn: (state: S, value: V) => S,
): [S, (value: V) => void];
export function useOptimistic<S, V = S>(
	passthrough: S,
	updateFnOrSlot: ((state: S, value: V) => S) | symbol | undefined,
	slot?: HookSlot,
): [S, (value: V) => void];
export function useOptimistic<S, V = S>(
	passthrough: S,
	updateFnOrSlot?: ((state: S, value: V) => S) | symbol,
	slot?: HookSlot,
): [S, (value: V) => void] {
	let updateFn: ((state: S, value: V) => S) | undefined;
	if (typeof updateFnOrSlot === 'symbol') slot = updateFnOrSlot;
	else updateFn = updateFnOrSlot;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useOptimistic');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as OptimisticSlot<V> | undefined;
	if (s === undefined) {
		let unownedIndices: number[] | null = null;
		const clear = (indices?: number[]): void => {
			if (indices !== undefined && unownedIndices !== indices) return;
			unownedIndices = null;
			const hadUpdates = slotRef.queue.length > 0;
			if (indices === undefined) {
				slotRef.armed = false;
				slotRef.queue.length = 0;
			} else {
				// Compact once so an unowned burst is linear in the queue length.
				let write = indices[0];
				let skip = 0;
				for (let read = write; read < slotRef.queue.length; read++) {
					if (read === indices[skip]) skip++;
					else slotRef.queue[write++] = slotRef.queue[read];
				}
				slotRef.queue.length = write;
			}
			if (hadUpdates && !block.disposed) {
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileSchedule(block, 'optimistic-revert', slot);
				if (indices === undefined) scheduleRender(block);
				else scheduleUrgentRender(block);
			}
		};
		const slotRef: OptimisticSlot<V> = {
			queue: [],
			armed: false,
			add: (value: V) => {
				const inAction = isTransitionUpdateContext();
				if (process.env.NODE_ENV !== 'production' && !inAction) {
					console.error(
						'An optimistic update was dispatched outside a transition or action. Wrap it in startTransition or call it from an action.',
					);
				}
				slotRef.queue.push(value);
				if (inAction && TRANSITION_PENDING_COUNT > 0) {
					// Inside an Action: the optimistic value is held until that
					// transition settles (the listener below clears it then).
					slotRef.armed = true;
				} else {
					// Revert only unowned updates: this slot may already contain
					// optimistic updates owned by a pending Action.
					if (unownedIndices === null) {
						const indices = (unownedIndices = [slotRef.queue.length - 1]);
						queueMicrotask(() => clear(indices));
					} else unownedIndices.push(slotRef.queue.length - 1);
				}
				if (!block.disposed) {
					if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
						__profileSchedule(block, 'optimistic', slot);
					markTransitionCue(block);
					scheduleRender(block, false, true);
				}
			},
		};
		s = slotRef;
		ensureHooks(scope).set(slot, slotRef);
		// When the owning transition settles (pending count hits 0), drop the
		// optimistic queue so the next render re-derives from the real state. Gated
		// on `armed` so an unrelated transition settling doesn't wipe a queue this
		// hook populated outside any transition (that path self-clears via microtask).
		const listener = (): void => {
			if (TRANSITION_PENDING_COUNT === 0 && slotRef.armed) clear();
		};
		TRANSITION_LISTENERS.add(listener);
		registerHookCleanup(scope, () => TRANSITION_LISTENERS.delete(listener));
	}
	let optimistic = passthrough;
	const reduce = updateFn ?? basicOptimisticReducer;
	for (let i = 0; i < s.queue.length; i++) optimistic = reduce(optimistic, s.queue[i]);
	return [optimistic, s.add];
}
