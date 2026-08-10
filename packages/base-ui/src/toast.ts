// Ported from .base-ui/packages/react/src/toast/ (v1.6.0) — Phase 3g.
//
// Toast is the one overlay family that is NOT driven by a trigger and a floating store. Toasts are
// created imperatively — from `useToastManager().add()` inside a component, or from a
// `createToastManager()` handle outside React entirely — and live in a `ToastStore` that owns the
// list, the per-toast auto-dismiss timers, and the pause/resume rules (hover, focus, window blur,
// touch). `Toast.Viewport` is a live region that renders them; `Toast.Root` is one toast, including
// its own pointer-drag swipe-to-dismiss.
//
// SCOPE NOTE — the migration plan said this phase also lands `useSwipeDismiss` (1,208 loc) because
// "it is shared with Drawer". That is wrong for 1.6.0: Toast implements its swipe inline in
// `ToastRoot` and imports only two pure geometry helpers (`getDisplacement`, `getElementTransform`)
// from that file, which are inlined here. The hook itself has exactly two consumers, both Drawer
// (`DrawerViewport`, `DrawerSwipeArea`), so it moves to Phase 6 where it is actually used.
//
// octane adaptations:
//   - components are `createElement`, not JSX; `forwardRef` → ref-as-prop; each component takes its
//     per-call-site slot from `S('…')` and derives every composed hook's slot via `subSlot`;
//   - `ReactDOM.flushSync` → octane `flushSync`;
//   - native, delegated events, so `event.nativeEvent` collapses to `event`;
//   - `React.createContext`/`useContext` → octane's; `useIsoLayoutEffect` → `useLayoutEffect`;
//   - `useId` → `useBaseUiId` for element ids (Title/Description), matching the rest of the binding;
//     the toast IDS themselves come from `generateId`, because they are minted outside render;
//   - this package carries NO `process.env.NODE_ENV` branches.
import {
	createContext,
	createElement,
	Fragment,
	useContext,
	useMemo,
	useRef,
	useState,
	useEffect,
	useLayoutEffect,
	useId,
	flushSync,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import { usePositioner } from './utils/usePositioner';
import { useButton } from './utils/useButton';
import { useStableCallback } from './utils/useStableCallback';
import { useRefWithInit } from './utils/useRefWithInit';
import { useOnMount } from './utils/useOnMount';
import { useTimeout, Timeout } from './utils/useTimeout';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { generateId } from './utils/generateId';
import { ownerDocument, ownerWindow } from './utils/owner';
import { addEventListener } from './utils/addEventListener';
import { mergeCleanups } from './utils/mergeCleanups';
import { visuallyHidden } from './utils/visuallyHidden';
import { inertValue } from './utils/inertValue';
import { EMPTY_OBJECT } from './utils/empty';
import { NOOP } from './utils/noop';
import { isElement } from './utils/dom';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import type { TransitionStatus } from './utils/useTransitionStatus';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { matchesFocusVisible as isFocusVisible } from './utils/matchesFocusVisible';
import { activeElement, contains } from './utils/floating/element';
import { getTarget } from './utils/composite/list-utils';
import { FocusGuard } from './utils/floating/FocusGuard';
import { FloatingPortalLite } from './utils/FloatingPortalLite';
import { useFloatingRootContext } from './utils/floating/useFloatingRootContext';
import {
	useAnchorPositioning,
	type Align,
	type Side,
	type UseAnchorPositioningSharedParameters,
} from './utils/useAnchorPositioning';
import {
	POPUP_COLLISION_AVOIDANCE,
	BASE_UI_SWIPE_IGNORE_SELECTOR,
	LEGACY_SWIPE_IGNORE_SELECTOR,
} from './utils/constants';

type HTMLProps = Record<string, any>;

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

// --- CSS variables ------------------------------------------------------------

export const ToastRootCssVars = {
	/** The index of the toast in the list. */
	index: '--toast-index',
	/** The vertical pixel offset of the toast in the list when expanded. */
	offsetY: '--toast-offset-y',
	/** The measured natural height of the toast in pixels. */
	height: '--toast-height',
	/** The horizontal swipe movement of the toast. */
	swipeMovementX: '--toast-swipe-movement-x',
	/** The vertical swipe movement of the toast. */
	swipeMovementY: '--toast-swipe-movement-y',
} as const;

export const ToastViewportCssVars = {
	/** The height of the frontmost toast. */
	frontmostHeight: '--toast-frontmost-height',
} as const;

export const ToastPositionerCssVars = {
	availableWidth: '--available-width',
	availableHeight: '--available-height',
	anchorWidth: '--anchor-width',
	anchorHeight: '--anchor-height',
	transformOrigin: '--transform-origin',
} as const;

// --- Toast object -------------------------------------------------------------

export interface ToastObject<Data extends object = any> {
	/** The unique identifier for the toast. */
	id: string;
	/** The ref for the toast. */
	ref?: { current: HTMLElement | null } | undefined;
	/** The title of the toast. */
	title?: any;
	/**
	 * The type of the toast. Used to conditionally style the toast, including conditionally
	 * rendering elements based on the type.
	 */
	type?: string | undefined;
	/** The description of the toast. */
	description?: any;
	/**
	 * The amount of time (in ms) before the toast is auto dismissed. `0` prevents auto-dismissal.
	 * @default 5000
	 */
	timeout?: number | undefined;
	/**
	 * The priority of the toast. `low` announces politely, `high` announces urgently.
	 * @default 'low'
	 */
	priority?: 'low' | 'high' | undefined;
	/** The transition status of the toast. */
	transitionStatus?: 'starting' | 'ending' | undefined;
	/** A counter that increments whenever the toast is updated or upserted. */
	updateKey?: number | undefined;
	/** Whether the toast was limited because the toast limit was exceeded. */
	limited?: boolean | undefined;
	/** The height of the toast. */
	height?: number | undefined;
	/** Called when the toast is closed. */
	onClose?: (() => void) | undefined;
	/** Called when the toast is removed from the list after any closing animations complete. */
	onRemove?: (() => void) | undefined;
	/** The props for the action button. */
	actionProps?: HTMLProps | undefined;
	/** Props forwarded to the toast positioner element when rendering anchored toasts. */
	positionerProps?: HTMLProps | undefined;
	/** Custom data for the toast. */
	data?: Data | undefined;
}

export interface ToastManagerAddOptions<Data extends object = any> extends Omit<
	ToastObject<Data>,
	'id' | 'height' | 'ref' | 'limited' | 'updateKey'
> {
	/**
	 * The unique identifier for the toast. Adding a toast with an existing ID updates it in place
	 * and refreshes its auto-dismiss timer.
	 */
	id?: string | undefined;
}

export interface ToastManagerUpdateOptions<Data extends object = any> extends Partial<
	Omit<ToastObject<Data>, 'id' | 'ref' | 'height' | 'transitionStatus' | 'limited' | 'updateKey'>
> {}

export interface ToastManagerPromiseOptions<Value, Data extends object = any> {
	loading: string | ToastManagerUpdateOptions<Data>;
	success:
		| string
		| ToastManagerUpdateOptions<Data>
		| ((result: Value) => string | ToastManagerUpdateOptions<Data>);
	error:
		| string
		| ToastManagerUpdateOptions<Data>
		| ((error: any) => string | ToastManagerUpdateOptions<Data>);
}

/** Ported from `toast/utils/resolvePromiseOptions.ts`. */
export function resolvePromiseOptions<T, Data extends object>(
	options:
		| string
		| ToastManagerUpdateOptions<Data>
		| ((result: T) => string | ToastManagerUpdateOptions<Data>),
	result?: T,
): ToastManagerUpdateOptions<Data> {
	if (typeof options === 'string') {
		return { description: options };
	}

	if (typeof options === 'function') {
		const resolvedOptions = options(result as T);
		return typeof resolvedOptions === 'string' ? { description: resolvedOptions } : resolvedOptions;
	}

	return options;
}

// --- Store --------------------------------------------------------------------

type ToastInternalUpdateOptions<Data extends object> = Partial<Omit<ToastObject<Data>, 'id'>>;
type UpdateToastBehavior = {
	resetTimer?: boolean | undefined;
	markUpdated?: boolean | undefined;
};
type RemoveToastBehavior = {
	skipOnRemove?: boolean | undefined;
};

export type ToastState = {
	toasts: ToastObject<any>[];
	toastMetadata: Map<string, ToastMetadata>;
	hovering: boolean;
	focused: boolean;
	timeout: number;
	limit: number;
	isWindowFocused: boolean;
	viewport: HTMLElement | null;
	prevFocusElement: HTMLElement | null;
};

type ToastMetadata = {
	value: ToastObject<any>;
	domIndex: number;
	visibleIndex: number;
	offsetY: number;
};

type InitialToastState = Omit<ToastState, 'toastMetadata'>;

function createToastMetadata(toasts: ToastObject<any>[]) {
	const metadata = new Map<string, ToastMetadata>();
	let visibleIndex = 0;
	let offsetY = 0;

	toasts.forEach((toast, toastIndex) => {
		const isEnding = toast.transitionStatus === 'ending';
		metadata.set(toast.id, {
			value: toast,
			domIndex: toastIndex,
			visibleIndex: isEnding ? -1 : visibleIndex,
			offsetY,
		});

		offsetY += toast.height || 0;

		if (!isEnding) {
			visibleIndex += 1;
		}
	});

	return metadata;
}

// Marks the active (non-ending) toasts beyond `limit` as limited. Callers pass toasts in
// newest-first order, so the newest `limit` toasts stay visible and the rest are flagged. Returns
// the same toast reference when its `limited` flag is unchanged to avoid unnecessary re-renders.
function applyLimited(toasts: ToastObject<any>[], limit: number): ToastObject<any>[] {
	let activeIndex = 0;
	return toasts.map((toast) => {
		if (toast.transitionStatus === 'ending') {
			return toast;
		}
		const limited = activeIndex >= limit;
		activeIndex += 1;
		return toast.limited === limited ? toast : { ...toast, limited };
	});
}

const toastMetadataSelector = (state: ToastState) => state.toastMetadata;

export const toastSelectors = {
	toasts: createSelector((state: ToastState) => state.toasts),
	isEmpty: createSelector((state: ToastState) => state.toasts.length === 0),
	toast: createSelector(
		toastMetadataSelector,
		(toastMetadata: Map<string, ToastMetadata>, id: string) => toastMetadata.get(id)?.value,
	),
	toastIndex: createSelector(
		toastMetadataSelector,
		(toastMetadata: Map<string, ToastMetadata>, id: string) =>
			toastMetadata.get(id)?.domIndex ?? -1,
	),
	toastOffsetY: createSelector(
		toastMetadataSelector,
		(toastMetadata: Map<string, ToastMetadata>, id: string) => toastMetadata.get(id)?.offsetY ?? 0,
	),
	toastVisibleIndex: createSelector(
		toastMetadataSelector,
		(toastMetadata: Map<string, ToastMetadata>, id: string) =>
			toastMetadata.get(id)?.visibleIndex ?? -1,
	),
	hovering: createSelector((state: ToastState) => state.hovering),
	focused: createSelector((state: ToastState) => state.focused),
	expanded: createSelector((state: ToastState) => state.hovering || state.focused),
	expandedOrOutOfFocus: createSelector(
		(state: ToastState) => state.hovering || state.focused || !state.isWindowFocused,
	),
	prevFocusElement: createSelector((state: ToastState) => state.prevFocusElement),
};

interface TimerInfo {
	timeout?: Timeout | undefined;
	start: number;
	delay: number;
	remaining: number;
	callback: () => void;
}

export class ToastStore extends ReactStore<ToastState, {}, typeof toastSelectors> {
	private timers = new Map<string, TimerInfo>();

	private areTimersPaused = false;

	constructor(initialState: InitialToastState) {
		super(
			{
				...initialState,
				toastMetadata: createToastMetadata(initialState.toasts),
			},
			{},
			toastSelectors,
		);
	}

	setFocused(focused: boolean) {
		this.set('focused', focused);
	}

	setHovering(hovering: boolean) {
		this.set('hovering', hovering);
	}

	setIsWindowFocused(isWindowFocused: boolean) {
		this.set('isWindowFocused', isWindowFocused);
	}

	setPrevFocusElement(prevFocusElement: HTMLElement | null) {
		this.set('prevFocusElement', prevFocusElement);
	}

	setViewport = (viewport: HTMLElement | null) => {
		this.set('viewport', viewport);
	};

	syncProviderProps(props: Pick<ToastState, 'timeout' | 'limit'>) {
		const limitChanged = this.state.limit !== props.limit;

		if (this.state.timeout === props.timeout && !limitChanged) {
			return;
		}

		const updates: Partial<ToastState> = {
			timeout: props.timeout,
			limit: props.limit,
		};

		if (limitChanged) {
			const newToasts = applyLimited(this.state.toasts, props.limit);
			updates.toasts = newToasts;
			updates.toastMetadata = createToastMetadata(newToasts);
		}

		this.update(updates);
	}

	disposeEffect = () => {
		return () => {
			this.timers.forEach((timer) => {
				timer.timeout?.clear();
			});
			this.timers.clear();
		};
	};

	removeToast(toastId: string, behavior: RemoveToastBehavior = {}) {
		const index = toastSelectors.toastIndex(this.state, toastId);
		if (index === -1) {
			return;
		}

		const toast = this.state.toasts[index];
		if (!behavior.skipOnRemove) {
			toast?.onRemove?.();
		}

		const newToasts = [...this.state.toasts];
		newToasts.splice(index, 1);
		this.setToasts(newToasts);
	}

	addToast = <Data extends object>(toast: ToastManagerAddOptions<Data>): string => {
		const { timeout, limit } = this.state;
		const id = toast.id || generateId('toast');

		if (toast.id) {
			const existingToast = toastSelectors.toast(this.state, toast.id);

			if (existingToast) {
				if (existingToast.transitionStatus === 'ending') {
					this.removeToast(toast.id, { skipOnRemove: true });
				} else {
					const { id: ignoredId, transitionStatus: ignoredTransitionStatus, ...updates } = toast;
					this.updateToastInternal(toast.id, updates, {
						resetTimer: true,
						markUpdated: true,
					});
					return toast.id;
				}
			}
		}

		const toastToAdd: ToastObject<Data> = {
			...toast,
			id,
			updateKey: 0,
			transitionStatus: 'starting',
		};

		const updatedToasts = [toastToAdd, ...this.state.toasts];
		this.setToasts(applyLimited(updatedToasts, limit));

		const duration = toastToAdd.timeout ?? timeout;
		if (toastToAdd.type !== 'loading' && duration > 0) {
			this.scheduleTimer(id, duration, () => this.closeToast(id));
		}

		if (toastSelectors.expandedOrOutOfFocus(this.state)) {
			this.pauseTimers();
		}

		return id;
	};

	updateToast = <Data extends object>(id: string, updates: ToastManagerUpdateOptions<Data>) => {
		this.updateToastInternal(id, updates, { markUpdated: true });
	};

	updateToastInternal = <Data extends object>(
		id: string,
		updates: ToastInternalUpdateOptions<Data>,
		behavior: UpdateToastBehavior = {},
	) => {
		const { timeout, toasts } = this.state;
		const prevToast = toastSelectors.toast(this.state, id) ?? null;
		if (!prevToast) {
			return;
		}

		// Ignore updates for toasts that are already closing. This prevents races where async
		// updates (e.g. promise success/error) can block a dismissal from completing.
		if (prevToast.transitionStatus === 'ending') {
			return;
		}

		const nextToast: ToastObject<Data> = {
			...prevToast,
			...updates,
			...(behavior.markUpdated && {
				updateKey: (prevToast.updateKey ?? 0) + 1,
			}),
		};

		this.setToasts(toasts.map((toast) => (toast.id === id ? nextToast : toast)));

		const nextTimeout = nextToast.timeout ?? timeout;
		const prevTimeout = prevToast?.timeout ?? timeout;

		const timeoutUpdated = Object.hasOwn(updates, 'timeout');

		const shouldHaveTimer =
			nextToast.transitionStatus !== 'ending' && nextToast.type !== 'loading' && nextTimeout > 0;

		const hasTimer = this.timers.has(id);
		const timeoutChanged = prevTimeout !== nextTimeout;
		const wasLoading = prevToast?.type === 'loading';

		if (!shouldHaveTimer && hasTimer) {
			this.clearTimer(id);
			return;
		}

		// Schedule or reschedule timer if needed
		if (
			shouldHaveTimer &&
			(!hasTimer || timeoutChanged || timeoutUpdated || wasLoading || behavior.resetTimer)
		) {
			this.clearTimer(id);

			this.scheduleTimer(id, nextTimeout, () => this.closeToast(id));

			if (toastSelectors.expandedOrOutOfFocus(this.state)) {
				this.pauseTimers();
			}
		}
	};

	closeToast = (toastId?: string) => {
		const closeAll = toastId === undefined;
		const { limit, toasts } = this.state;
		let toastsToClose: ToastObject<any>[];

		if (closeAll) {
			toastsToClose = toasts;
			this.clearTimers();
		} else {
			const toast = toastSelectors.toast(this.state, toastId);
			if (!toast) {
				return;
			}
			toastsToClose = [toast];
			this.clearTimer(toastId);
		}

		const endingToasts = toasts.map((item) =>
			closeAll || item.id === toastId
				? { ...item, transitionStatus: 'ending' as const, height: 0 }
				: item,
		);
		const newToasts = applyLimited(endingToasts, limit);

		const updates: Partial<ToastState> = {
			toasts: newToasts,
			toastMetadata: createToastMetadata(newToasts),
		};
		const hasActiveToasts = newToasts.some((toast) => toast.transitionStatus !== 'ending');
		if (!hasActiveToasts) {
			updates.hovering = false;
			updates.focused = false;
		}
		this.update(updates);

		toastsToClose.forEach((toast) => {
			if (toast.transitionStatus !== 'ending') {
				toast.onClose?.();
			}
		});

		this.handleFocusManagement(toastId);
	};

	promiseToast = <Value, Data extends object>(
		promiseValue: Promise<Value>,
		options: ToastManagerPromiseOptions<Value, Data>,
	): Promise<Value> => {
		// Create a loading toast (which does not auto-dismiss).
		const loadingOptions = resolvePromiseOptions<never, Data>(options.loading);
		const id = this.addToast({
			...loadingOptions,
			type: 'loading',
		});

		const handledPromise = promiseValue
			.then((result: Value) => {
				const successOptions = resolvePromiseOptions<Value, Data>(options.success, result);
				this.updateToast(id, {
					...successOptions,
					type: 'success',
					timeout: successOptions.timeout,
				});

				return result;
			})
			.catch((error) => {
				const errorOptions = resolvePromiseOptions<any, Data>(options.error, error);
				this.updateToast(id, {
					...errorOptions,
					type: 'error',
					timeout: errorOptions.timeout,
				});

				return Promise.reject(error);
			});

		// Private API used exclusively by `Manager` to hand the promise back to the manager after it
		// is handled here.
		if ({}.hasOwnProperty.call(options, 'setPromise')) {
			(options as any).setPromise(handledPromise);
		}

		return handledPromise;
	};

	pauseTimers() {
		if (this.areTimersPaused) {
			return;
		}
		this.areTimersPaused = true;
		this.timers.forEach((timer) => {
			if (timer.timeout) {
				timer.timeout.clear();
				const elapsed = Date.now() - timer.start;
				const remaining = timer.delay - elapsed;
				timer.remaining = remaining > 0 ? remaining : 0;
			}
		});
	}

	resumeTimers() {
		if (!this.areTimersPaused) {
			return;
		}
		this.areTimersPaused = false;
		this.timers.forEach((timer, id) => {
			timer.remaining = timer.remaining > 0 ? timer.remaining : timer.delay;
			timer.timeout ??= Timeout.create();
			timer.timeout.start(timer.remaining, () => {
				this.handleTimerFired(id);
				timer.callback();
			});
			timer.start = Date.now();
		});
	}

	restoreFocusToPrevElement() {
		this.state.prevFocusElement?.focus({ preventScroll: true });
	}

	handleDocumentPointerDown = (event: Event) => {
		if ((event as PointerEvent).pointerType !== 'touch') {
			return;
		}

		const target = getTarget(event) as Element | null;
		if (contains(this.state.viewport, target)) {
			return;
		}

		// This is explicit touch activity outside the viewport, so the paused interaction state
		// should end even if the window focus state is unchanged.
		this.resumeTimers();
		this.update({ hovering: false, focused: false });
	};

	private scheduleTimer(id: string, delay: number, callback: () => void) {
		const start = Date.now();
		const shouldStartActive = !toastSelectors.expandedOrOutOfFocus(this.state);
		const currentTimeout = shouldStartActive ? Timeout.create() : undefined;

		currentTimeout?.start(delay, () => {
			this.handleTimerFired(id);
			callback();
		});

		this.timers.set(id, {
			timeout: currentTimeout,
			start: shouldStartActive ? start : 0,
			delay,
			remaining: delay,
			callback,
		});
	}

	private clearTimers() {
		this.timers.forEach((timer) => {
			timer.timeout?.clear();
		});
		this.timers.clear();
		this.areTimersPaused = false;
	}

	private clearTimer(id: string) {
		const timer = this.timers.get(id);
		timer?.timeout?.clear();
		this.timers.delete(id);

		this.resetPausedStateIfNoTimersRemain();
	}

	private handleTimerFired(id: string) {
		this.timers.delete(id);
		this.resetPausedStateIfNoTimersRemain();
	}

	private resetPausedStateIfNoTimersRemain() {
		if (this.timers.size === 0) {
			// No timers remain to keep paused; clear the flag so a fresh toast's running timer can
			// be paused again on hover/focus.
			this.areTimersPaused = false;
		}
	}

	private setToasts(newToasts: ToastObject<any>[]) {
		const updates: Partial<ToastState> = {
			toasts: newToasts,
			toastMetadata: createToastMetadata(newToasts),
		};
		if (newToasts.length === 0) {
			updates.hovering = false;
			updates.focused = false;
		}
		this.update(updates);
	}

	private handleFocusManagement(toastId: string | undefined) {
		const activeEl = activeElement(ownerDocument(this.state.viewport));
		if (
			!this.state.viewport ||
			!contains(this.state.viewport, activeEl) ||
			!isFocusVisible(activeEl)
		) {
			return;
		}

		if (toastId === undefined) {
			this.restoreFocusToPrevElement();
			return;
		}

		const toasts = toastSelectors.toasts(this.state);
		const currentIndex = toastSelectors.toastIndex(this.state, toastId);
		let nextToast: ToastObject<any> | null = null;

		// Try to find the next toast that isn't animating out
		let index = currentIndex + 1;
		while (index < toasts.length) {
			if (toasts[index].transitionStatus !== 'ending') {
				nextToast = toasts[index];
				break;
			}
			index += 1;
		}

		// Go backwards if no next toast is found
		if (!nextToast) {
			index = currentIndex - 1;
			while (index >= 0) {
				if (toasts[index].transitionStatus !== 'ending') {
					nextToast = toasts[index];
					break;
				}
				index -= 1;
			}
		}

		if (nextToast) {
			nextToast.ref?.current?.focus();
		} else {
			this.restoreFocusToPrevElement();
		}
	}
}

// --- Manager (outside-React handle) -------------------------------------------

export interface ToastManagerEvent {
	action: 'add' | 'close' | 'update' | 'promise';
	options: any;
}

export interface ToastManager<Data extends object = any> {
	' subscribe': (listener: (data: ToastManagerEvent) => void) => () => void;
	add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
	close: (id?: string) => void;
	update: <T extends Data = Data>(id: string, updates: ToastManagerUpdateOptions<T>) => void;
	promise: <Value, T extends Data = Data>(
		promiseValue: Promise<Value>,
		options: ToastManagerPromiseOptions<Value, T>,
	) => Promise<Value>;
}

/** Creates a new toast manager, for driving toasts from outside a component. */
export function createToastManager<Data extends object = any>(): ToastManager<Data> {
	const listeners = new Set<(data: ToastManagerEvent) => void>();

	function emit(data: ToastManagerEvent) {
		listeners.forEach((listener) => listener(data));
	}

	return {
		// Private aside from ToastProvider needing to access it.
		' subscribe': function subscribe(listener: (data: ToastManagerEvent) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		add<T extends Data = Data>(options: ToastManagerAddOptions<T>): string {
			const id = options.id || generateId('toast');
			const toastToAdd: ToastObject<T> = {
				...options,
				id,
				transitionStatus: 'starting',
			};

			emit({ action: 'add', options: toastToAdd });

			return id;
		},

		close(id?: string): void {
			emit({ action: 'close', options: { id } });
		},

		update<T extends Data = Data>(id: string, updates: ToastManagerUpdateOptions<T>): void {
			emit({ action: 'update', options: { ...updates, id } });
		},

		promise<Value, T extends Data = Data>(
			promiseValue: Promise<Value>,
			options: ToastManagerPromiseOptions<Value, T>,
		): Promise<Value> {
			let handledPromise = promiseValue;

			emit({
				action: 'promise',
				options: {
					...options,
					promise: promiseValue,
					setPromise(promise: Promise<Value>) {
						handledPromise = promise;
					},
				},
			});

			return handledPromise;
		},
	};
}

// --- Contexts -----------------------------------------------------------------

const ToastContext = createContext<ToastStore | undefined>(undefined);

export function useToastProviderContext(): ToastStore {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
	}
	return context;
}

export interface ToastRootContextValue {
	toast: ToastObject<any>;
	rootRef: { current: HTMLElement | null };
	titleId: string | undefined;
	setTitleId: (value: string | undefined) => void;
	descriptionId: string | undefined;
	setDescriptionId: (value: string | undefined) => void;
	swiping: boolean;
	swipeDirection: SwipeDirection | undefined;
	index: number;
	visibleIndex: number;
	expanded: boolean;
	recalculateHeight: (flush?: boolean) => void;
}

const ToastRootContext = createContext<ToastRootContextValue | undefined>(undefined);

export function useToastRootContext(): ToastRootContextValue {
	const context = useContext(ToastRootContext);
	if (!context) {
		throw new Error(
			'Base UI: ToastRootContext is missing. Toast parts must be used within <Toast.Root>.',
		);
	}
	return context;
}

export interface ToastPositionerContextValue {
	side: Side;
	align: Align;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	arrowStyles: Record<string, any>;
}

const ToastPositionerContext = createContext<ToastPositionerContextValue | undefined>(undefined);

export function useToastPositionerContext(): ToastPositionerContextValue {
	const context = useContext(ToastPositionerContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: ToastPositionerContext is missing. ToastPositioner parts must be placed within <Toast.Positioner>.',
		);
	}
	return context;
}

// --- useToastManager ----------------------------------------------------------

export interface UseToastManagerReturnValue<Data extends object = any> {
	toasts: ToastObject<Data>[];
	add: <T extends Data = Data>(options: ToastManagerAddOptions<T>) => string;
	close: (toastId?: string) => void;
	update: <T extends Data = Data>(toastId: string, options: ToastManagerUpdateOptions<T>) => void;
	promise: <Value, T extends Data = Data>(
		promise: Promise<Value>,
		options: ToastManagerPromiseOptions<Value, T>,
	) => Promise<Value>;
}

/**
 * Returns the array of toasts and methods to manage them.
 *
 * SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
 */
export function useToastManager<Data extends object = any>(
	slotArg?: symbol,
): UseToastManagerReturnValue<Data> {
	const slot = slotArg ?? S('useToastManager');
	const store = useContext(ToastContext);

	if (!store) {
		throw new Error('Base UI: useToastManager must be used within <Toast.Provider>.');
	}

	const toasts = store.useState('toasts', subSlot(slot, 'toasts'));

	return useMemo(
		() => ({
			toasts,
			add: store.addToast,
			close: store.closeToast,
			update: store.updateToast,
			promise: store.promiseToast,
		}),
		[toasts, store],
		subSlot(slot, 'm'),
	);
}

// --- Provider -----------------------------------------------------------------

function ToastProvider(props: any): any {
	const slot = S('ToastProvider');
	const { children, timeout = 5000, limit = 3, toastManager } = props;

	const store = useRefWithInit<ToastStore>(
		() =>
			new ToastStore({
				timeout,
				limit,
				viewport: null,
				toasts: [],
				hovering: false,
				focused: false,
				isWindowFocused: true,
				prevFocusElement: null,
			}),
		subSlot(slot, 'store'),
	).current;

	useOnMount(store.disposeEffect, subSlot(slot, 'dispose'));

	useEffect(
		function subscribeToToastManager() {
			if (!toastManager) {
				return undefined;
			}

			const unsubscribe = toastManager[' subscribe'](({ action, options }: ToastManagerEvent) => {
				const id = options.id;

				if (action === 'promise' && options.promise) {
					store.promiseToast(options.promise, options);
				} else if (action === 'update' && id) {
					store.updateToast(id, options);
				} else if (action === 'close') {
					store.closeToast(id);
				} else {
					store.addToast(options);
				}
			});

			return unsubscribe;
		},
		[store, toastManager],
		subSlot(slot, 'e:subscribe'),
	);

	// `limit` needs custom syncing because changing it must also recompute each toast's `limited`
	// flag; `useSyncedValues` would only update the raw value.
	useLayoutEffect(
		() => {
			store.syncProviderProps({ timeout, limit });
		},
		[store, timeout, limit],
		subSlot(slot, 'e:sync'),
	);

	return createElement(ToastContext.Provider, { value: store, children });
}

// --- Viewport -----------------------------------------------------------------

function ToastViewport(componentProps: any): any {
	const slot = S('ToastViewport');
	const { render, className, style, children, ref: forwardedRef, ...elementProps } = componentProps;

	const store = useToastProviderContext();
	const windowFocusTimeout = useTimeout(subSlot(slot, 'wft'));

	const handlingFocusGuardRef = useRef(false, subSlot(slot, 'hfg'));
	const markedReadyForMouseLeaveRef = useRef(false, subSlot(slot, 'mrml'));
	const touchActiveRef = useRef(false, subSlot(slot, 'touch'));

	const isEmpty = store.useState('isEmpty', subSlot(slot, 'empty'));
	const toasts = store.useState('toasts', subSlot(slot, 'toasts'));
	const focused = store.useState('focused', subSlot(slot, 'focused'));
	const expanded = store.useState('expanded', subSlot(slot, 'expanded'));
	const prevFocusElement = store.useState('prevFocusElement', subSlot(slot, 'prevFocus'));
	const frontmostHeight = toasts[0]?.height ?? 0;

	const hasTransitioningToasts = useMemo(
		() => toasts.some((toast: ToastObject) => toast.transitionStatus === 'ending'),
		[toasts],
		subSlot(slot, 'transitioning'),
	);
	const highPriorityToasts = useMemo(
		() => toasts.filter((toast: ToastObject) => toast.priority === 'high'),
		[toasts],
		subSlot(slot, 'highPriority'),
	);

	// Listen globally for F6 so we can force-focus the viewport.
	useEffect(
		() => {
			const viewport = store.state.viewport;
			if (!viewport) {
				return undefined;
			}

			function handleGlobalKeyDown(event: Event) {
				if (isEmpty) {
					return;
				}

				if ((event as KeyboardEvent).key === 'F6' && getTarget(event) !== viewport) {
					event.preventDefault();
					store.setPrevFocusElement(activeElement(ownerDocument(viewport)) as HTMLElement | null);
					viewport?.focus({ preventScroll: true });
					store.pauseTimers();
					store.setFocused(true);
				}
			}

			const win = ownerWindow(viewport);
			return addEventListener(win, 'keydown', handleGlobalKeyDown);
		},
		[store, isEmpty],
		subSlot(slot, 'e:f6'),
	);

	useEffect(
		() => {
			const viewport = store.state.viewport;
			if (!viewport || isEmpty) {
				return undefined;
			}

			const win = ownerWindow(viewport);

			function handleWindowBlur(event: Event) {
				if (getTarget(event) !== win) {
					return;
				}

				store.setIsWindowFocused(false);
				store.pauseTimers();
			}

			function handleWindowFocus(event: Event) {
				if ((event as FocusEvent).relatedTarget) {
					return;
				}

				const target = getTarget(event);
				const activeEl = activeElement(ownerDocument(viewport));
				if (
					target === win ||
					!contains(viewport, target as HTMLElement | null) ||
					!isFocusVisible(activeEl)
				) {
					store.resumeTimers();
				}

				// Wait for the `handleFocus` event to fire.
				windowFocusTimeout.start(0, () => store.setIsWindowFocused(true));
			}

			return mergeCleanups(
				addEventListener(win, 'blur', handleWindowBlur, true),
				addEventListener(win, 'focus', handleWindowFocus, true),
			);
		},
		[
			store,
			windowFocusTimeout,
			// `store.state.viewport` isn't available on the first render, since the portal node
			// hasn't yet been created. This dependency ensures the window listeners are added once
			// toasts have been created and the ref is available.
			isEmpty,
		],
		subSlot(slot, 'e:window'),
	);

	useEffect(
		() => {
			const viewport = store.state.viewport;
			if (!viewport || isEmpty) {
				return undefined;
			}

			const doc = ownerDocument(viewport);
			return addEventListener(doc, 'pointerdown', store.handleDocumentPointerDown, true);
		},
		[isEmpty, store],
		subSlot(slot, 'e:pointerdown'),
	);

	function handleFocusGuard(event: FocusEvent) {
		const viewport = store.state.viewport;
		if (!viewport) {
			return;
		}

		handlingFocusGuardRef.current = true;

		// If we're coming off the container, move to the first toast that can hold focus, skipping
		// toasts that are animating out or inert because they're limited.
		if (event.relatedTarget === viewport) {
			const firstFocusableToast = toasts.find(
				(toast: ToastObject) => toast.transitionStatus !== 'ending' && !toast.limited,
			);
			if (firstFocusableToast) {
				firstFocusableToast.ref?.current?.focus();
			} else {
				store.restoreFocusToPrevElement();
			}
		} else {
			store.restoreFocusToPrevElement();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Tab' && event.shiftKey && getTarget(event) === store.state.viewport) {
			event.preventDefault();
			store.restoreFocusToPrevElement();
			// Shift+Tab is explicit keyboard navigation out of the viewport.
			store.resumeTimers();
		}
	}

	function flushMouseLeave() {
		const hasEndingToasts = store.state.toasts.some(
			(toast: ToastObject) => toast.transitionStatus === 'ending',
		);

		if (hasEndingToasts || touchActiveRef.current || !markedReadyForMouseLeaveRef.current) {
			return;
		}

		// Once transitions have finished, see if a mouseleave was already triggered but blocked from
		// taking effect. If so, we can now safely collapse the viewport without restarting timers
		// while the window is blurred.
		if (store.state.isWindowFocused) {
			store.resumeTimers();
		}
		store.setHovering(false);
		markedReadyForMouseLeaveRef.current = false;
	}

	useEffect(flushMouseLeave, [hasTransitioningToasts, store], subSlot(slot, 'e:flushLeave'));

	function handleMouseEnter() {
		store.pauseTimers();
		store.setHovering(true);
		markedReadyForMouseLeaveRef.current = false;
	}

	function resumeTimersIfWindowFocused() {
		if (store.state.isWindowFocused) {
			store.resumeTimers();
		}
	}

	function handleMouseLeave() {
		const hasEndingToasts = store.state.toasts.some(
			(toast: ToastObject) => toast.transitionStatus === 'ending',
		);

		if (hasEndingToasts || touchActiveRef.current) {
			// When swiping to dismiss, wait until the transitions have settled or the touch
			// interaction ends to avoid collapsing mid-gesture.
			markedReadyForMouseLeaveRef.current = true;
		} else {
			resumeTimersIfWindowFocused();
			store.setHovering(false);
		}
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'touch') {
			touchActiveRef.current = true;
		}
	}

	function handlePointerEnd(event: PointerEvent) {
		if (event.pointerType !== 'touch') {
			return;
		}

		touchActiveRef.current = false;
		flushMouseLeave();
	}

	function handleFocus() {
		if (handlingFocusGuardRef.current) {
			handlingFocusGuardRef.current = false;
			return;
		}

		if (focused) {
			return;
		}

		// Only set focused when the active element is focus-visible. This prevents the viewport from
		// staying expanded when clicking inside without keyboard navigation.
		if (isFocusVisible(activeElement(ownerDocument(store.state.viewport)))) {
			store.setFocused(true);
			store.pauseTimers();
		}
	}

	function handleBlur(event: FocusEvent) {
		if (!focused || contains(store.state.viewport, event.relatedTarget as HTMLElement | null)) {
			return;
		}

		store.setFocused(false);
		resumeTimersIfWindowFocused();
	}

	const defaultProps: HTMLProps = {
		tabIndex: -1,
		role: 'region',
		'aria-live': 'polite',
		'aria-atomic': false,
		'aria-relevant': 'additions text',
		'aria-label': 'Notifications',
		onMouseEnter: handleMouseEnter,
		onMouseMove: handleMouseEnter,
		onMouseLeave: handleMouseLeave,
		onFocus: handleFocus,
		onBlur: handleBlur,
		onKeyDown: handleKeyDown,
		onClick: handleFocus,
		onPointerDown: handlePointerDown,
		onPointerUp: handlePointerEnd,
		onPointerCancel: handlePointerEnd,
	};

	const state: ToastViewportState = {
		expanded,
	};

	const showGuards = !isEmpty && Boolean(prevFocusElement);

	const element = useRenderElement(
		'div',
		componentProps,
		{
			ref: [forwardedRef, store.setViewport],
			state,
			props: [
				defaultProps,
				{
					style: {
						[ToastViewportCssVars.frontmostHeight]: frontmostHeight
							? `${frontmostHeight}px`
							: undefined,
					},
				},
				elementProps,
				{
					children: [
						showGuards
							? createElement(FocusGuard, { key: 'guard-in-start', onFocus: handleFocusGuard })
							: null,
						createElement(Fragment, { key: 'children', children }),
						showGuards
							? createElement(FocusGuard, { key: 'guard-in-end', onFocus: handleFocusGuard })
							: null,
					],
				},
			],
		},
		subSlot(slot, 're'),
	);

	// octane reconciles a returned ARRAY as a keyed list, so the siblings carry stable keys —
	// otherwise an unkeyed guard appearing/disappearing shifts the viewport element and rebuilds it.
	return [
		showGuards
			? createElement(FocusGuard, { key: 'guard-out-start', onFocus: handleFocusGuard })
			: null,
		createElement(Fragment, { key: 'viewport', children: element }),
		!focused && highPriorityToasts.length > 0
			? createElement('div', {
					key: 'live-region',
					style: visuallyHidden,
					children: highPriorityToasts.map((toast: ToastObject) =>
						createElement('div', {
							key: toast.id,
							role: 'alert',
							'aria-atomic': true,
							children: [
								createElement('div', { key: 'title', children: toast.title }),
								createElement('div', { key: 'description', children: toast.description }),
							],
						}),
					),
				})
			: null,
	];
}

export interface ToastViewportState {
	/** Whether toasts are expanded in the viewport. */
	expanded: boolean;
}

// --- Root ---------------------------------------------------------------------

const toastRootStateAttributesMapping: StateAttributesMapping<any> = {
	...transitionStatusMapping,
	swipeDirection(value: SwipeDirection | undefined) {
		return value ? { 'data-swipe-direction': value } : null;
	},
};

const SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const OPPOSITE_DIRECTION_DAMPING_FACTOR = 0.5;
const MIN_DRAG_THRESHOLD = 1;
const TOAST_SWIPE_IGNORE_SELECTOR = `${BASE_UI_SWIPE_IGNORE_SELECTOR},${LEGACY_SWIPE_IGNORE_SELECTOR}`;

// Inlined from `utils/useSwipeDismiss` — Toast uses only these two pure helpers, not the hook. The
// hook itself is Drawer-only and lands in Phase 6.
function getDisplacement(direction: SwipeDirection, deltaX: number, deltaY: number) {
	switch (direction) {
		case 'up':
			return -deltaY;
		case 'down':
			return deltaY;
		case 'left':
			return -deltaX;
		case 'right':
			return deltaX;
		default:
			return 0;
	}
}

function getElementTransform(element: HTMLElement) {
	const computedStyle = ownerWindow(element).getComputedStyle(element);
	const transform = computedStyle.transform;
	let translateX = 0;
	let translateY = 0;
	let scale = 1;

	if (transform && transform !== 'none') {
		const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
		if (matrix) {
			const values = matrix[1].split(', ').map(parseFloat);
			if (values.length === 6) {
				translateX = values[4];
				translateY = values[5];
				scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
			} else if (values.length === 16) {
				translateX = values[12];
				translateY = values[13];
				scale = values[0];
			}
		}
	}

	return { x: translateX, y: translateY, scale };
}

function ToastRoot(componentProps: any): any {
	const slot = S('ToastRoot');
	const {
		toast,
		render,
		className,
		swipeDirection = ['down', 'right'],
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const isAnchored = toast.positionerProps?.anchor !== undefined;

	let swipeDirections: SwipeDirection[] = [];
	if (!isAnchored) {
		swipeDirections = Array.isArray(swipeDirection) ? swipeDirection : [swipeDirection];
	}

	const swipeEnabled = swipeDirections.length > 0;

	const store = useToastProviderContext();

	const [currentSwipeDirection, setCurrentSwipeDirection] = useState<SwipeDirection | undefined>(
		undefined,
		subSlot(slot, 'csd'),
	);
	const [isSwiping, setIsSwiping] = useState(false, subSlot(slot, 'swiping'));
	const [isRealSwipe, setIsRealSwipe] = useState(false, subSlot(slot, 'realSwipe'));
	const [dragDismissed, setDragDismissed] = useState(false, subSlot(slot, 'dismissed'));
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }, subSlot(slot, 'offset'));
	const [initialTransform, setInitialTransform] = useState(
		{ x: 0, y: 0, scale: 1 },
		subSlot(slot, 'initTransform'),
	);
	const [titleId, setTitleId] = useState<string | undefined>(undefined, subSlot(slot, 'titleId'));
	const [descriptionId, setDescriptionId] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'descId'),
	);
	const [lockedDirection, setLockedDirection] = useState<'horizontal' | 'vertical' | null>(
		null,
		subSlot(slot, 'locked'),
	);

	const rootRef = useRef<HTMLElement | null>(null, subSlot(slot, 'root'));
	const dragStartPosRef = useRef({ x: 0, y: 0 }, subSlot(slot, 'dragStart'));
	const initialTransformRef = useRef({ x: 0, y: 0, scale: 1 }, subSlot(slot, 'itRef'));
	const intendedSwipeDirectionRef = useRef<SwipeDirection | undefined>(
		undefined,
		subSlot(slot, 'intended'),
	);
	const maxSwipeDisplacementRef = useRef(0, subSlot(slot, 'maxDisp'));
	const cancelledSwipeRef = useRef(false, subSlot(slot, 'cancelled'));
	const swipeCancelBaselineRef = useRef({ x: 0, y: 0 }, subSlot(slot, 'baseline'));
	const isFirstPointerMoveRef = useRef(false, subSlot(slot, 'firstMove'));
	const dragOffsetRef = useRef({ x: 0, y: 0 }, subSlot(slot, 'offsetRef'));
	const activePointerIdRef = useRef<number | null>(null, subSlot(slot, 'pointerId'));
	const dragAbortControllerRef = useRef<AbortController | null>(null, subSlot(slot, 'abort'));

	const domIndex = store.useState('toastIndex', subSlot(slot, 'domIndex'), toast.id);
	const visibleIndex = store.useState('toastVisibleIndex', subSlot(slot, 'visIndex'), toast.id);
	const offsetY = store.useState('toastOffsetY', subSlot(slot, 'offsetY'), toast.id);
	const focused = store.useState('focused', subSlot(slot, 'focused'));
	const expanded = store.useState('expanded', subSlot(slot, 'expanded'));

	useOpenChangeComplete(
		{
			open: toast.transitionStatus !== 'ending',
			ref: rootRef,
			onComplete() {
				if (toast.transitionStatus === 'ending') {
					store.removeToast(toast.id);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	// Recalculates the natural height of the toast and updates it in the toast manager.
	// `flushSync` avoids visual flickers when called from observer callbacks.
	const recalculateHeight = useStableCallback(
		(shouldFlush: boolean = false) => {
			const element = rootRef.current;
			if (!element) {
				return;
			}

			const previousHeight = element.style.height;
			element.style.height = 'auto';

			const height = element.offsetHeight;

			element.style.height = previousHeight;

			function update() {
				store.updateToastInternal(toast.id, {
					ref: rootRef,
					height,
					...(toast.transitionStatus === 'starting' ? { transitionStatus: undefined } : {}),
				});
			}

			if (shouldFlush) {
				flushSync(update);
			} else {
				update();
			}
		},
		subSlot(slot, 'recalc'),
	);

	useLayoutEffect(recalculateHeight, [recalculateHeight], subSlot(slot, 'e:recalc'));

	function setResolvedDragOffset(nextDragOffset: { x: number; y: number }) {
		dragOffsetRef.current = nextDragOffset;
		setDragOffset(nextDragOffset);
	}

	useLayoutEffect(
		() => {
			return () => {
				dragAbortControllerRef.current?.abort();
			};
		},
		[],
		subSlot(slot, 'e:abort'),
	);

	function applyDirectionalDamping(deltaX: number, deltaY: number) {
		let newDeltaX = deltaX;
		let newDeltaY = deltaY;

		if (!swipeDirections.includes('left') && !swipeDirections.includes('right')) {
			newDeltaX =
				deltaX > 0
					? deltaX ** OPPOSITE_DIRECTION_DAMPING_FACTOR
					: -(Math.abs(deltaX) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
		} else {
			if (!swipeDirections.includes('right') && deltaX > 0) {
				newDeltaX = deltaX ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
			}

			if (!swipeDirections.includes('left') && deltaX < 0) {
				newDeltaX = -(Math.abs(deltaX) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
			}
		}

		if (!swipeDirections.includes('up') && !swipeDirections.includes('down')) {
			newDeltaY =
				deltaY > 0
					? deltaY ** OPPOSITE_DIRECTION_DAMPING_FACTOR
					: -(Math.abs(deltaY) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
		} else {
			if (!swipeDirections.includes('down') && deltaY > 0) {
				newDeltaY = deltaY ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
			}

			if (!swipeDirections.includes('up') && deltaY < 0) {
				newDeltaY = -(Math.abs(deltaY) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
			}
		}

		return { x: newDeltaX, y: newDeltaY };
	}

	const handleSwipeEnd = useStableCallback(
		(event: PointerEvent) => {
			if (event.pointerId !== activePointerIdRef.current) {
				return;
			}

			activePointerIdRef.current = null;
			dragAbortControllerRef.current?.abort();
			dragAbortControllerRef.current = null;
			setIsSwiping(false);
			setIsRealSwipe(false);
			setLockedDirection(null);

			const resolvedInitialTransform = initialTransformRef.current;

			if (event.type === 'pointercancel' || cancelledSwipeRef.current) {
				setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
				setCurrentSwipeDirection(undefined);
				return;
			}

			let shouldClose = false;
			const resolvedDragOffset = dragOffsetRef.current;
			const deltaX = resolvedDragOffset.x - resolvedInitialTransform.x;
			const deltaY = resolvedDragOffset.y - resolvedInitialTransform.y;
			let dismissDirection: SwipeDirection | undefined;

			for (const direction of swipeDirections) {
				switch (direction) {
					case 'right':
						if (deltaX > SWIPE_THRESHOLD) {
							shouldClose = true;
							dismissDirection = 'right';
						}
						break;
					case 'left':
						if (deltaX < -SWIPE_THRESHOLD) {
							shouldClose = true;
							dismissDirection = 'left';
						}
						break;
					case 'down':
						if (deltaY > SWIPE_THRESHOLD) {
							shouldClose = true;
							dismissDirection = 'down';
						}
						break;
					case 'up':
						if (deltaY < -SWIPE_THRESHOLD) {
							shouldClose = true;
							dismissDirection = 'up';
						}
						break;
					default:
						break;
				}

				if (shouldClose) {
					break;
				}
			}

			if (shouldClose) {
				setCurrentSwipeDirection(dismissDirection);
				setDragDismissed(true);
				store.closeToast(toast.id);
			} else {
				setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
				setCurrentSwipeDirection(undefined);
			}
		},
		subSlot(slot, 'swipeEnd'),
	);

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) {
			return;
		}

		if (event.pointerType === 'touch') {
			store.pauseTimers();
		}

		const target = getTarget(event) as HTMLElement | null;

		const isInteractiveElement = target
			? target.closest(`button,a,input,textarea,[role="button"],${TOAST_SWIPE_IGNORE_SELECTOR}`)
			: false;

		if (isInteractiveElement) {
			return;
		}

		cancelledSwipeRef.current = false;
		intendedSwipeDirectionRef.current = undefined;
		maxSwipeDisplacementRef.current = 0;
		activePointerIdRef.current = event.pointerId;
		dragStartPosRef.current = { x: event.clientX, y: event.clientY };
		swipeCancelBaselineRef.current = dragStartPosRef.current;

		if (rootRef.current) {
			const transform = getElementTransform(rootRef.current);
			initialTransformRef.current = transform;
			setInitialTransform(transform);
			setResolvedDragOffset({
				x: transform.x,
				y: transform.y,
			});
		}

		store.setHovering(true);
		setIsSwiping(true);
		setIsRealSwipe(false);
		setLockedDirection(null);
		isFirstPointerMoveRef.current = true;

		const element = rootRef.current;
		if (element) {
			dragAbortControllerRef.current?.abort();
			const dragAbortController = new AbortController();
			dragAbortControllerRef.current = dragAbortController;

			const doc = ownerDocument(element);
			doc.addEventListener('pointerup', handleSwipeEnd as EventListener, {
				signal: dragAbortController.signal,
			});
			doc.addEventListener('pointercancel', handleSwipeEnd as EventListener, {
				signal: dragAbortController.signal,
			});

			(element as any).setPointerCapture?.(event.pointerId);
		}
	}

	function handlePointerMove(event: PointerEvent) {
		if (event.pointerId !== activePointerIdRef.current) {
			return;
		}

		// Prevent text selection on Safari
		event.preventDefault();

		if (isFirstPointerMoveRef.current) {
			// Adjust the starting position to the current position on the first move to account for
			// the delay between pointerdown and the first pointermove on iOS.
			dragStartPosRef.current = { x: event.clientX, y: event.clientY };
			isFirstPointerMoveRef.current = false;
		}

		const { clientY, clientX, movementX, movementY } = event;

		if (
			(movementY < 0 && clientY > swipeCancelBaselineRef.current.y) ||
			(movementY > 0 && clientY < swipeCancelBaselineRef.current.y)
		) {
			swipeCancelBaselineRef.current = { x: swipeCancelBaselineRef.current.x, y: clientY };
		}

		if (
			(movementX < 0 && clientX > swipeCancelBaselineRef.current.x) ||
			(movementX > 0 && clientX < swipeCancelBaselineRef.current.x)
		) {
			swipeCancelBaselineRef.current = { x: clientX, y: swipeCancelBaselineRef.current.y };
		}

		const deltaX = clientX - dragStartPosRef.current.x;
		const deltaY = clientY - dragStartPosRef.current.y;
		const cancelDeltaY = clientY - swipeCancelBaselineRef.current.y;
		const cancelDeltaX = clientX - swipeCancelBaselineRef.current.x;

		if (!isRealSwipe) {
			const movementDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
			if (movementDistance >= MIN_DRAG_THRESHOLD) {
				setIsRealSwipe(true);
				if (lockedDirection === null) {
					const hasHorizontal =
						swipeDirections.includes('left') || swipeDirections.includes('right');
					const hasVertical = swipeDirections.includes('up') || swipeDirections.includes('down');
					if (hasHorizontal && hasVertical) {
						const absX = Math.abs(deltaX);
						const absY = Math.abs(deltaY);
						setLockedDirection(absX > absY ? 'horizontal' : 'vertical');
					}
				}
			}
		}

		let candidate: SwipeDirection | undefined;
		if (!intendedSwipeDirectionRef.current) {
			if (lockedDirection === 'vertical') {
				if (deltaY > 0) {
					candidate = 'down';
				} else if (deltaY < 0) {
					candidate = 'up';
				}
			} else if (lockedDirection === 'horizontal') {
				if (deltaX > 0) {
					candidate = 'right';
				} else if (deltaX < 0) {
					candidate = 'left';
				}
			} else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
				candidate = deltaX > 0 ? 'right' : 'left';
			} else {
				candidate = deltaY > 0 ? 'down' : 'up';
			}

			if (candidate && swipeDirections.includes(candidate)) {
				intendedSwipeDirectionRef.current = candidate;
				maxSwipeDisplacementRef.current = getDisplacement(candidate, deltaX, deltaY);
				setCurrentSwipeDirection(candidate);
			}
		} else {
			const direction = intendedSwipeDirectionRef.current;
			const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);

			if (currentDisplacement > SWIPE_THRESHOLD) {
				cancelledSwipeRef.current = false;
				setCurrentSwipeDirection(direction);
			} else if (
				!(swipeDirections.includes('left') && swipeDirections.includes('right')) &&
				!(swipeDirections.includes('up') && swipeDirections.includes('down')) &&
				maxSwipeDisplacementRef.current - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
			) {
				// Mark that a change-of-mind has occurred
				cancelledSwipeRef.current = true;
			}
		}

		const dampedDelta = applyDirectionalDamping(deltaX, deltaY);
		let newOffsetX = initialTransformRef.current.x;
		let newOffsetY = initialTransformRef.current.y;

		if (lockedDirection === 'horizontal') {
			if (swipeDirections.includes('left') || swipeDirections.includes('right')) {
				newOffsetX += dampedDelta.x;
			}
		} else if (lockedDirection === 'vertical') {
			if (swipeDirections.includes('up') || swipeDirections.includes('down')) {
				newOffsetY += dampedDelta.y;
			}
		} else {
			if (swipeDirections.includes('left') || swipeDirections.includes('right')) {
				newOffsetX += dampedDelta.x;
			}

			if (swipeDirections.includes('up') || swipeDirections.includes('down')) {
				newOffsetY += dampedDelta.y;
			}
		}

		setResolvedDragOffset({ x: newOffsetX, y: newOffsetY });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (
				!rootRef.current ||
				!contains(rootRef.current, activeElement(ownerDocument(rootRef.current)))
			) {
				return;
			}

			store.closeToast(toast.id);
		}
	}

	useEffect(
		() => {
			if (!swipeEnabled) {
				return undefined;
			}

			const element = rootRef.current;
			if (!element) {
				return undefined;
			}

			function preventDefaultTouchStart(event: Event) {
				if (
					activePointerIdRef.current === null ||
					!contains(element, getTarget(event) as HTMLElement | null)
				) {
					return;
				}

				// A pointermove `preventDefault` is not enough on iOS; this non-passive touchmove
				// listener blocks native scrolling while dragging.
				event.preventDefault();
			}

			return addEventListener(element, 'touchmove', preventDefaultTouchStart, {
				passive: false,
			});
		},
		[swipeEnabled],
		subSlot(slot, 'e:touchmove'),
	);

	function getDragStyles() {
		if (
			!isSwiping &&
			dragOffset.x === initialTransform.x &&
			dragOffset.y === initialTransform.y &&
			!dragDismissed
		) {
			return {
				[ToastRootCssVars.swipeMovementX]: '0px',
				[ToastRootCssVars.swipeMovementY]: '0px',
			};
		}

		const deltaX = dragOffset.x - initialTransform.x;
		const deltaY = dragOffset.y - initialTransform.y;

		return {
			transition: isSwiping ? 'none' : undefined,
			// While swiping, freeze the element at its current visual transform so it doesn't snap
			// to the end position.
			transform: isSwiping
				? `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) scale(${initialTransform.scale})`
				: undefined,
			[ToastRootCssVars.swipeMovementX]: `${deltaX}px`,
			[ToastRootCssVars.swipeMovementY]: `${deltaY}px`,
		};
	}

	const isHighPriority = toast.priority === 'high';

	const defaultProps: HTMLProps = {
		role: isHighPriority ? 'alertdialog' : 'dialog',
		tabIndex: 0,
		'aria-modal': false,
		'aria-labelledby': titleId,
		'aria-describedby': descriptionId,
		'aria-hidden': isHighPriority && !focused ? true : undefined,
		onPointerDown: swipeEnabled ? handlePointerDown : undefined,
		onPointerMove: swipeEnabled ? handlePointerMove : undefined,
		onPointerUp: swipeEnabled ? handleSwipeEnd : undefined,
		onPointerCancel: swipeEnabled ? handleSwipeEnd : undefined,
		onKeyDown: handleKeyDown,
		inert: inertValue(toast.limited),
		style: {
			...getDragStyles(),
			[ToastRootCssVars.index]: toast.transitionStatus === 'ending' ? domIndex : visibleIndex,
			[ToastRootCssVars.offsetY]: `${offsetY}px`,
			[ToastRootCssVars.height]: toast.height ? `${toast.height}px` : undefined,
		},
	};

	const toastRoot: ToastRootContextValue = useMemo(
		() => ({
			rootRef,
			toast,
			titleId,
			setTitleId,
			descriptionId,
			setDescriptionId,
			swiping: isSwiping,
			swipeDirection: currentSwipeDirection,
			recalculateHeight,
			index: domIndex,
			visibleIndex,
			expanded,
		}),
		[
			toast,
			titleId,
			descriptionId,
			isSwiping,
			currentSwipeDirection,
			recalculateHeight,
			domIndex,
			visibleIndex,
			expanded,
		],
		subSlot(slot, 'ctx'),
	);

	const state: ToastRootState = {
		transitionStatus: toast.transitionStatus,
		expanded,
		limited: toast.limited || false,
		type: toast.type,
		swiping: toastRoot.swiping,
		swipeDirection: toastRoot.swipeDirection,
	};

	const element = useRenderElement(
		'div',
		componentProps,
		{
			ref: [forwardedRef, toastRoot.rootRef],
			state,
			stateAttributesMapping: toastRootStateAttributesMapping,
			props: [defaultProps, elementProps],
		},
		subSlot(slot, 're'),
	);

	return createElement(ToastRootContext.Provider, { value: toastRoot, children: element });
}

export interface ToastRootState {
	/** The transition status of the component. */
	transitionStatus: TransitionStatus;
	/** Whether the toasts in the viewport are expanded. */
	expanded: boolean;
	/** Whether the toast was limited because the toast limit was exceeded. */
	limited: boolean;
	/** The type of the toast. */
	type: string | undefined;
	/** Whether the toast is being swiped. */
	swiping: boolean;
	/** The direction the toast is being swiped. */
	swipeDirection: SwipeDirection | undefined;
}

// --- Title / Description ------------------------------------------------------

function ToastTitle(componentProps: any): any {
	const slot = S('ToastTitle');
	const {
		render,
		className,
		style,
		id: idProp,
		children: childrenProp,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const { toast, setTitleId } = useToastRootContext();

	const children = childrenProp ?? toast.title;

	const shouldRender = Boolean(children);

	// RAW `useId`, not `useBaseUiId`: upstream Title/Description reach for `@base-ui/utils/useId`,
	// which has NO `base-ui-` prefix. Using the prefixed helper here diverged from the real package.
	const generatedId = useId(subSlot(slot, 'id'));
	const id = idProp ?? generatedId;

	useLayoutEffect(
		() => {
			if (!shouldRender) {
				return undefined;
			}

			setTitleId(id);

			return () => {
				setTitleId(undefined);
			};
		},
		[shouldRender, id, setTitleId],
		subSlot(slot, 'e'),
	);

	const state: ToastTitleState = {
		type: toast.type,
	};

	const element = useRenderElement(
		'h2',
		componentProps,
		{
			ref: forwardedRef,
			state,
			props: {
				...elementProps,
				id,
				children,
			},
		},
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

export interface ToastTitleState {
	/** The type of the toast. */
	type: string | undefined;
}

function ToastDescription(componentProps: any): any {
	const slot = S('ToastDescription');
	const {
		render,
		className,
		style,
		id: idProp,
		children: childrenProp,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const { toast, setDescriptionId } = useToastRootContext();

	const children = childrenProp ?? toast.description;

	const shouldRender = Boolean(children);

	// RAW `useId` — see the note in `ToastTitle`.
	const generatedId = useId(subSlot(slot, 'id'));
	const id = idProp ?? generatedId;

	useLayoutEffect(
		() => {
			if (!shouldRender) {
				return undefined;
			}

			setDescriptionId(id);

			return () => {
				setDescriptionId(undefined);
			};
		},
		[shouldRender, id, setDescriptionId],
		subSlot(slot, 'e'),
	);

	const state: ToastDescriptionState = {
		type: toast.type,
	};

	const element = useRenderElement(
		'p',
		componentProps,
		{
			ref: forwardedRef,
			state,
			props: {
				...elementProps,
				id,
				children,
			},
		},
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

export interface ToastDescriptionState {
	/** The type of the toast. */
	type: string | undefined;
}

// --- Content ------------------------------------------------------------------

function ToastContent(componentProps: any): any {
	const slot = S('ToastContent');
	const { render, className, style, ref: forwardedRef, ...elementProps } = componentProps;

	const { visibleIndex, expanded, recalculateHeight } = useToastRootContext();

	const contentRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'content'));

	useLayoutEffect(
		() => {
			const node = contentRef.current;
			if (!node) {
				return undefined;
			}

			recalculateHeight();

			if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') {
				return undefined;
			}

			const resizeObserver = new ResizeObserver(() => recalculateHeight(true));
			const mutationObserver = new MutationObserver(() => recalculateHeight(true));

			resizeObserver.observe(node);
			mutationObserver.observe(node, { childList: true, subtree: true, characterData: true });

			return () => {
				resizeObserver.disconnect();
				mutationObserver.disconnect();
			};
		},
		[recalculateHeight],
		subSlot(slot, 'e'),
	);

	const behind = visibleIndex > 0;

	const state: ToastContentState = {
		expanded,
		behind,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			ref: [forwardedRef, contentRef],
			state,
			props: elementProps,
		},
		subSlot(slot, 're'),
	);
}

export interface ToastContentState {
	/** Whether the toast viewport is expanded. */
	expanded: boolean;
	/** Whether the toast is behind the frontmost toast in the stack. */
	behind: boolean;
}

// --- Close / Action -----------------------------------------------------------

function ToastClose(componentProps: any): any {
	const slot = S('ToastClose');
	const {
		render,
		className,
		style,
		disabled,
		nativeButton = true,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const store = useToastProviderContext();
	const { toast } = useToastRootContext();
	const expanded = store.useState('expanded', subSlot(slot, 'expanded'));

	const [hasFocus, setHasFocus] = useState(false, subSlot(slot, 'focus'));

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const state: ToastCloseState = {
		type: toast.type,
	};

	return useRenderElement(
		'button',
		componentProps,
		{
			ref: [forwardedRef, buttonRef],
			state,
			props: [
				{
					'aria-hidden': !expanded && !hasFocus,
					onClick() {
						store.closeToast(toast.id);
					},
					onFocus() {
						setHasFocus(true);
					},
					onBlur() {
						setHasFocus(false);
					},
				},
				elementProps,
				getButtonProps,
			],
		},
		subSlot(slot, 're'),
	);
}

export interface ToastCloseState {
	/** The type of the toast. */
	type: string | undefined;
}

function ToastAction(componentProps: any): any {
	const slot = S('ToastAction');
	const {
		render,
		className,
		style,
		disabled,
		nativeButton = true,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const { toast } = useToastRootContext();

	const computedChildren = toast.actionProps?.children ?? elementProps.children;
	const shouldRender = Boolean(computedChildren);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const state: ToastActionState = {
		type: toast.type,
	};

	const element = useRenderElement(
		'button',
		componentProps,
		{
			ref: [forwardedRef, buttonRef],
			state,
			props: [
				elementProps,
				toast.actionProps,
				getButtonProps,
				{
					children: computedChildren,
				},
			],
		},
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

export interface ToastActionState {
	/** The type of the toast. */
	type: string | undefined;
}

// --- Positioner / Arrow -------------------------------------------------------

function ToastPositioner(componentProps: any): any {
	const slot = S('ToastPositioner');
	const { toast, ...props } = componentProps;

	const store = useToastProviderContext();

	const positionerProps = (toast.positionerProps ?? EMPTY_OBJECT) as HTMLProps;

	const {
		render,
		className,
		anchor: anchorProp = positionerProps.anchor,
		positionMethod = positionerProps.positionMethod ?? 'absolute',
		side = positionerProps.side ?? 'top',
		align = positionerProps.align ?? 'center',
		sideOffset = positionerProps.sideOffset ?? 0,
		alignOffset = positionerProps.alignOffset ?? 0,
		collisionBoundary = positionerProps.collisionBoundary ?? 'clipping-ancestors',
		collisionPadding = positionerProps.collisionPadding ?? 5,
		arrowPadding = positionerProps.arrowPadding ?? 5,
		sticky = positionerProps.sticky ?? false,
		disableAnchorTracking = positionerProps.disableAnchorTracking ?? false,
		collisionAvoidance = positionerProps.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE,
		style,
		ref: forwardedRef,
		...elementProps
	} = props;

	const [positionerElement, setPositionerElement] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'el'),
	);

	const domIndex = store.useState('toastIndex', subSlot(slot, 'domIndex'), toast.id);
	const visibleIndex = store.useState('toastVisibleIndex', subSlot(slot, 'visIndex'), toast.id);

	const anchor = isElement(anchorProp) ? anchorProp : null;

	const floatingRootContext = useFloatingRootContext(
		{
			open: true,
			onOpenChange: NOOP,
			elements: {
				floating: positionerElement,
				reference: anchor,
			},
		},
		subSlot(slot, 'frc'),
	);

	const positioning = useAnchorPositioning(
		{
			anchor,
			positionMethod,
			floatingRootContext,
			mounted: true,
			side,
			sideOffset,
			align,
			alignOffset,
			collisionBoundary,
			collisionPadding,
			sticky,
			arrowPadding,
			disableAnchorTracking,
			keepMounted: true,
			collisionAvoidance,
		},
		subSlot(slot, 'positioning'),
	);

	const state: ToastPositionerState = useMemo(
		() => ({
			side: positioning.side,
			align: positioning.align,
			anchorHidden: positioning.anchorHidden,
		}),
		[positioning.side, positioning.align, positioning.anchorHidden],
		subSlot(slot, 'state'),
	);

	const element = usePositioner(
		componentProps,
		state,
		{
			styles: {
				...positioning.positionerStyles,
				[ToastRootCssVars.index]: toast.transitionStatus === 'ending' ? domIndex : visibleIndex,
			},
			transitionStatus: toast.transitionStatus,
			props: elementProps,
			refs: [forwardedRef, setPositionerElement],
		},
		subSlot(slot, 'positioner'),
	);

	return createElement(ToastPositionerContext.Provider, {
		value: positioning as unknown as ToastPositionerContextValue,
		children: element,
	});
}

export interface ToastPositionerState {
	/** The side of the anchor the component is placed on. */
	side: Side;
	/** The alignment of the component relative to the anchor. */
	align: Align;
	/** Whether the anchor element is hidden. */
	anchorHidden: boolean;
}

export interface ToastPositionerProps extends Omit<UseAnchorPositioningSharedParameters, 'anchor'> {
	[key: string]: any;
}

function ToastArrow(componentProps: any): any {
	const slot = S('ToastArrow');
	const { className, render, style, ref: forwardedRef, ...elementProps } = componentProps;

	const { arrowRef, side, align, arrowUncentered, arrowStyles } = useToastPositionerContext();

	const state: ToastArrowState = {
		side,
		align,
		uncentered: arrowUncentered,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: [forwardedRef, arrowRef],
			props: [{ style: arrowStyles, 'aria-hidden': true }, elementProps],
		},
		subSlot(slot, 're'),
	);
}

export interface ToastArrowState {
	/** The side of the anchor the component is placed on. */
	side: Side;
	/** The alignment of the component relative to the anchor. */
	align: Align;
	/** Whether the arrow cannot be centered on the anchor. */
	uncentered: boolean;
}

// --- Namespace ----------------------------------------------------------------

/** Mirrors upstream's `toast/index.parts.ts`. `Portal` is `FloatingPortalLite`, as upstream. */
export const Toast = {
	Provider: ToastProvider,
	Viewport: ToastViewport,
	Root: ToastRoot,
	Content: ToastContent,
	Description: ToastDescription,
	Title: ToastTitle,
	Close: ToastClose,
	Action: ToastAction,
	Portal: FloatingPortalLite,
	Positioner: ToastPositioner,
	Arrow: ToastArrow,
	useToastManager,
	createToastManager,
};
