// Ported from @radix-ui/react-toast (source:
// .radix-primitives/packages/react/toast/src/toast.tsx). A toast notification system:
// `Provider` owns the shared config (label/duration/swipeDirection/swipeThreshold), the
// viewport element, the open-toast count and the pause/escape refs over a Collection of
// toasts; `Viewport` is a `role=region` wrapper (DismissableLayer.Branch) around an `ol`
// list with a document-level hotkey (F8) that focuses it, pause-on-hover/focus (+ window
// blur) via `toast.viewportPause`/`toast.viewportResume` custom events, and programmatic
// most-recent-first Tab order with VisuallyHidden head/tail FocusProxy exits; `Root`
// drives open state (useControllableState + Presence) around `ToastImpl` — a `li`
// portalled into the viewport, wrapped in DismissableLayer (Escape dismissal), with a
// pause/resume-aware close timer and pointer swipe handlers dispatching
// `toast.swipeStart/Move/Cancel/End` custom events; `Title`/`Description` are plain divs;
// `Action` requires `altText` (announce fallback) and composes `Close`, which closes via
// the interactive context; `ToastAnnounce` renders the toast's text content (excluding
// `ToastAnnounceExclude` subtrees) in a portalled VisuallyHidden live region for one
// second so screen readers announce it.
//
// octane adaptations (all previously established in this port series):
// - No forwardRef: `ref: forwardedRef` is destructured from props and composed with
//   useComposedRefs (ref-as-prop, React-19 style).
// - Hook slots: plain-`.ts` components thread explicit `S()`/`subSlot()` slot symbols
//   through every hook call (octane's auto-slotting pass only runs on compiled .tsx/.tsrx).
// - Events are NATIVE delegated DOM events: React's `event.nativeEvent` is the event
//   itself, and swipe/announce handlers receive real CustomEvents.
// - `ReactDOM.createPortal` → octane's `createPortal`-as-a-value (renders at any position).
// - Fragments → keyed arrays (`ToastImpl` returns `[announce, interactive-portal]`).
// - `@radix-ui/react-use-layout-effect`'s SSR-safe wrapper → octane's `useLayoutEffect`.
// - Dev-only console.error surfaces are skipped per repo policy (Provider's empty-label
//   check; Action's empty-altText message — the functional `return null` is kept).
// - Toasts are portalled INTO the viewport `ol` (an octane-rendered element) — the
//   runtime's de-opt reconciler skips foreign `<!--portal-->` ranges (React parity:
//   portal content coexists with the container's children; see
//   octane tests/portal-into-deopt-host.test.ts).
import {
	createElement,
	createPortal,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { DismissableLayer, DismissableLayerBranch } from './DismissableLayer';
import { S, subSlot } from './internal';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { dispatchDiscreteCustomEvent, Primitive } from './Primitive';
import { useCallbackRef } from './use-callback-ref';
import { useControllableState } from './useControllableState';
import { VisuallyHidden } from './VisuallyHidden';

/* -------------------------------------------------------------------------------------------------
 * ToastProvider
 * -----------------------------------------------------------------------------------------------*/

const PROVIDER_NAME = 'ToastProvider';

const [Collection, useCollection, createCollectionScope] = createCollection('Toast');

type SwipeDirection = 'up' | 'down' | 'left' | 'right';

interface ToastProviderContextValue {
	label: string;
	duration: number;
	swipeDirection: SwipeDirection;
	swipeThreshold: number;
	toastCount: number;
	viewport: HTMLElement | null;
	onViewportChange(viewport: HTMLElement | null): void;
	onToastAdd(): void;
	onToastRemove(): void;
	isFocusedToastEscapeKeyDownRef: { current: boolean };
	isClosePausedRef: { current: boolean };
	announcerContainer?: Element | DocumentFragment;
}

const [createToastContext, createToastScope] = createContextScope('Toast', [createCollectionScope]);
export { createToastScope };
const [ToastProviderProvider, useToastProviderContext] =
	createToastContext<ToastProviderContextValue>(PROVIDER_NAME);

export function Provider(props: any): any {
	const slot = S('Toast.Provider');
	const {
		__scopeToast,
		label = 'Notification',
		duration = 5000,
		swipeDirection = 'right',
		swipeThreshold = 50,
		announcerContainer,
		children,
	} = props ?? {};
	const [viewport, setViewport] = useState<HTMLElement | null>(null, subSlot(slot, 'viewport'));
	const [toastCount, setToastCount] = useState(0, subSlot(slot, 'count'));
	const isFocusedToastEscapeKeyDownRef = useRef(false, subSlot(slot, 'escKeyDown'));
	const isClosePausedRef = useRef(false, subSlot(slot, 'paused'));

	// (dev-only empty-`label` console.error intentionally not ported)

	return createElement(Collection.Provider, {
		scope: __scopeToast,
		children: createElement(ToastProviderProvider, {
			scope: __scopeToast,
			label,
			duration,
			swipeDirection,
			swipeThreshold,
			toastCount,
			viewport,
			onViewportChange: setViewport,
			onToastAdd: useCallback(
				() => setToastCount((prevCount: number) => prevCount + 1),
				[],
				subSlot(slot, 'add'),
			),
			onToastRemove: useCallback(
				() => setToastCount((prevCount: number) => prevCount - 1),
				[],
				subSlot(slot, 'remove'),
			),
			isFocusedToastEscapeKeyDownRef,
			isClosePausedRef,
			announcerContainer,
			children,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * ToastViewport
 * -----------------------------------------------------------------------------------------------*/

const VIEWPORT_NAME = 'ToastViewport';
const VIEWPORT_DEFAULT_HOTKEY = ['F8'];
const VIEWPORT_PAUSE = 'toast.viewportPause';
const VIEWPORT_RESUME = 'toast.viewportResume';

export function Viewport(props: any): any {
	const slot = S('Toast.Viewport');
	const {
		__scopeToast,
		hotkey = VIEWPORT_DEFAULT_HOTKEY,
		label = 'Notifications ({hotkey})',
		ref: forwardedRef,
		...viewportProps
	} = props ?? {};
	const context = useToastProviderContext(VIEWPORT_NAME, __scopeToast);
	const getItems = useCollection(__scopeToast, subSlot(slot, 'items'));
	const wrapperRef = useRef<HTMLElement | null>(null, subSlot(slot, 'wrapper'));
	const headFocusProxyRef = useRef<HTMLElement | null>(null, subSlot(slot, 'head'));
	const tailFocusProxyRef = useRef<HTMLElement | null>(null, subSlot(slot, 'tail'));
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		ref,
		context.onViewportChange,
		subSlot(slot, 'refs'),
	);
	const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, '');
	const hasToasts = context.toastCount > 0;

	useEffect(
		() => {
			const handleKeyDown = (event: KeyboardEvent): void => {
				// we use `event.code` as it is consistent regardless of meta keys that were pressed.
				// for example, `event.key` for `Control+Alt+t` is `†` and `t !== †`
				const isHotkeyPressed =
					hotkey.length !== 0 &&
					hotkey.every((key: string) => (event as any)[key] || event.code === key);
				if (isHotkeyPressed) ref.current?.focus();
			};
			document.addEventListener('keydown', handleKeyDown);
			return () => document.removeEventListener('keydown', handleKeyDown);
		},
		[hotkey],
		subSlot(slot, 'e:hotkey'),
	);

	useEffect(
		() => {
			const wrapper = wrapperRef.current;
			const viewport = ref.current;
			if (hasToasts && wrapper && viewport) {
				const handlePause = (): void => {
					if (!context.isClosePausedRef.current) {
						const pauseEvent = new CustomEvent(VIEWPORT_PAUSE);
						viewport.dispatchEvent(pauseEvent);
						context.isClosePausedRef.current = true;
					}
				};

				const handleResume = (): void => {
					if (context.isClosePausedRef.current) {
						const resumeEvent = new CustomEvent(VIEWPORT_RESUME);
						viewport.dispatchEvent(resumeEvent);
						context.isClosePausedRef.current = false;
					}
				};

				const handleFocusOutResume = (event: FocusEvent): void => {
					const isFocusMovingOutside = !wrapper.contains(event.relatedTarget as HTMLElement);
					if (isFocusMovingOutside) handleResume();
				};

				const handlePointerLeaveResume = (): void => {
					const isFocusInside = wrapper.contains(document.activeElement);
					if (!isFocusInside) handleResume();
				};

				// Toasts are not in the viewport [component] tree so we need to bind DOM events
				wrapper.addEventListener('focusin', handlePause);
				wrapper.addEventListener('focusout', handleFocusOutResume);
				wrapper.addEventListener('pointermove', handlePause);
				wrapper.addEventListener('pointerleave', handlePointerLeaveResume);
				window.addEventListener('blur', handlePause);
				window.addEventListener('focus', handleResume);
				return () => {
					wrapper.removeEventListener('focusin', handlePause);
					wrapper.removeEventListener('focusout', handleFocusOutResume);
					wrapper.removeEventListener('pointermove', handlePause);
					wrapper.removeEventListener('pointerleave', handlePointerLeaveResume);
					window.removeEventListener('blur', handlePause);
					window.removeEventListener('focus', handleResume);
				};
			}
		},
		[hasToasts, context.isClosePausedRef],
		subSlot(slot, 'e:pause'),
	);

	const getSortedTabbableCandidates = useCallback(
		({ tabbingDirection }: { tabbingDirection: 'forwards' | 'backwards' }) => {
			const toastItems = getItems();
			const tabbableCandidates = toastItems.map((toastItem: any) => {
				const toastNode = toastItem.ref.current!;
				const toastTabbableCandidates = [toastNode, ...getTabbableCandidates(toastNode)];
				return tabbingDirection === 'forwards'
					? toastTabbableCandidates
					: toastTabbableCandidates.reverse();
			});
			return (
				tabbingDirection === 'forwards' ? tabbableCandidates.reverse() : tabbableCandidates
			).flat();
		},
		[getItems],
		subSlot(slot, 'sorted'),
	);

	useEffect(
		() => {
			const viewport = ref.current;
			// We programmatically manage tabbing as we are unable to influence
			// the source order with portals, this allows us to reverse the
			// tab order so that it runs from most recent toast to least
			if (viewport) {
				const handleKeyDown = (event: KeyboardEvent): void => {
					const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
					const isTabKey = event.key === 'Tab' && !isMetaKey;

					if (isTabKey) {
						const focusedElement = document.activeElement;
						const isTabbingBackwards = event.shiftKey;
						const targetIsViewport = event.target === viewport;

						// If we're back tabbing after jumping to the viewport then we simply
						// proxy focus out to the preceding document
						if (targetIsViewport && isTabbingBackwards) {
							headFocusProxyRef.current?.focus();
							return;
						}

						const tabbingDirection = isTabbingBackwards ? 'backwards' : 'forwards';
						const sortedCandidates = getSortedTabbableCandidates({ tabbingDirection });
						const index = sortedCandidates.findIndex(
							(candidate: Element) => candidate === focusedElement,
						);
						if (focusFirst(sortedCandidates.slice(index + 1))) {
							event.preventDefault();
						} else {
							// If we can't focus that means we're at the edges so we
							// proxy to the corresponding exit point and let the browser handle
							// tab/shift+tab keypress and implicitly pass focus to the next valid element in the document
							isTabbingBackwards
								? headFocusProxyRef.current?.focus()
								: tailFocusProxyRef.current?.focus();
						}
					}
				};

				// Toasts are not in the viewport [component] tree so we need to bind DOM events
				viewport.addEventListener('keydown', handleKeyDown);
				return () => viewport.removeEventListener('keydown', handleKeyDown);
			}
		},
		[getItems, getSortedTabbableCandidates],
		subSlot(slot, 'e:tab'),
	);

	return createElement(DismissableLayerBranch, {
		ref: wrapperRef,
		role: 'region',
		'aria-label': label.replace('{hotkey}', hotkeyLabel),
		// Ensure virtual cursor from landmarks menus triggers focus/blur for pause/resume
		tabIndex: -1,
		// incase list has size when empty (e.g. padding), we remove pointer events so
		// it doesn't prevent interactions with page elements that it overlays
		style: { pointerEvents: hasToasts ? undefined : 'none' },
		children: [
			hasToasts
				? createElement(FocusProxy, {
						key: 'head',
						__scopeToast,
						ref: headFocusProxyRef,
						onFocusFromOutsideViewport: () => {
							const tabbableCandidates = getSortedTabbableCandidates({
								tabbingDirection: 'forwards',
							});
							focusFirst(tabbableCandidates);
						},
					})
				: null,
			/**
			 * tabindex on the the list so that it can be focused when items are removed. we focus
			 * the list instead of the viewport so it announces number of items remaining.
			 */
			createElement(Collection.Slot, {
				key: 'list',
				scope: __scopeToast,
				children: createElement(Primitive.ol, {
					tabIndex: -1,
					...viewportProps,
					ref: composedRefs,
					// the runtime doesn't clobber the portalled toasts on re-render.
					children: viewportProps.children,
				}),
			}),
			hasToasts
				? createElement(FocusProxy, {
						key: 'tail',
						__scopeToast,
						ref: tailFocusProxyRef,
						onFocusFromOutsideViewport: () => {
							const tabbableCandidates = getSortedTabbableCandidates({
								tabbingDirection: 'backwards',
							});
							focusFirst(tabbableCandidates);
						},
					})
				: null,
		],
	});
}

/* -----------------------------------------------------------------------------------------------*/

const FOCUS_PROXY_NAME = 'ToastFocusProxy';

function FocusProxy(props: any): any {
	const {
		__scopeToast,
		onFocusFromOutsideViewport,
		ref: forwardedRef,
		...proxyProps
	} = props ?? {};
	const context = useToastProviderContext(FOCUS_PROXY_NAME, __scopeToast);

	return createElement(VisuallyHidden, {
		tabIndex: 0,
		...proxyProps,
		ref: forwardedRef,
		// Avoid page scrolling when focus is on the focus proxy
		style: { position: 'fixed' },
		onFocus: (event: FocusEvent) => {
			const prevFocusedElement = event.relatedTarget as HTMLElement | null;
			const isFocusFromOutsideViewport = !context.viewport?.contains(prevFocusedElement);
			if (isFocusFromOutsideViewport) onFocusFromOutsideViewport();
		},
	});
}

/* -------------------------------------------------------------------------------------------------
 * Toast
 * -----------------------------------------------------------------------------------------------*/

const TOAST_NAME = 'Toast';
const TOAST_SWIPE_START = 'toast.swipeStart';
const TOAST_SWIPE_MOVE = 'toast.swipeMove';
const TOAST_SWIPE_CANCEL = 'toast.swipeCancel';
const TOAST_SWIPE_END = 'toast.swipeEnd';

export function Root(props: any): any {
	const slot = S('Toast.Root');
	const {
		forceMount,
		open: openProp,
		defaultOpen,
		onOpenChange,
		ref: forwardedRef,
		...toastProps
	} = props ?? {};
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? true, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	return createElement(Presence, {
		present: forceMount || open,
		children: createElement(ToastImpl, {
			open,
			...toastProps,
			ref: forwardedRef,
			onClose: () => setOpen(false),
			onPause: useCallbackRef(props?.onPause, subSlot(slot, 'pause')),
			onResume: useCallbackRef(props?.onResume, subSlot(slot, 'resume')),
			onSwipeStart: composeEventHandlers(props?.onSwipeStart, (event: any) => {
				event.currentTarget.setAttribute('data-swipe', 'start');
			}),
			onSwipeMove: composeEventHandlers(props?.onSwipeMove, (event: any) => {
				const { x, y } = event.detail.delta;
				event.currentTarget.setAttribute('data-swipe', 'move');
				event.currentTarget.style.setProperty('--radix-toast-swipe-move-x', `${x}px`);
				event.currentTarget.style.setProperty('--radix-toast-swipe-move-y', `${y}px`);
			}),
			onSwipeCancel: composeEventHandlers(props?.onSwipeCancel, (event: any) => {
				event.currentTarget.setAttribute('data-swipe', 'cancel');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-end-x');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-end-y');
			}),
			onSwipeEnd: composeEventHandlers(props?.onSwipeEnd, (event: any) => {
				const { x, y } = event.detail.delta;
				event.currentTarget.setAttribute('data-swipe', 'end');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
				event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
				event.currentTarget.style.setProperty('--radix-toast-swipe-end-x', `${x}px`);
				event.currentTarget.style.setProperty('--radix-toast-swipe-end-y', `${y}px`);
				setOpen(false);
			}),
		}),
	});
}

/* -----------------------------------------------------------------------------------------------*/

const [ToastInteractiveProvider, useToastInteractiveContext] = createToastContext(TOAST_NAME, {
	onClose() {},
});

function ToastImpl(props: any): any {
	const slot = S('Toast.Impl');
	const {
		__scopeToast,
		type = 'foreground',
		duration: durationProp,
		open,
		onClose,
		onEscapeKeyDown,
		onPause,
		onResume,
		onSwipeStart,
		onSwipeMove,
		onSwipeCancel,
		onSwipeEnd,
		ref: forwardedRef,
		...toastProps
	} = props ?? {};
	const context = useToastProviderContext(TOAST_NAME, __scopeToast);
	const [node, setNode] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	const composedRefs = useComposedRefs(forwardedRef, setNode, subSlot(slot, 'refs'));
	const pointerStartRef = useRef<{ x: number; y: number } | null>(null, subSlot(slot, 'pStart'));
	const swipeDeltaRef = useRef<{ x: number; y: number } | null>(null, subSlot(slot, 'delta'));
	const duration = durationProp || context.duration;
	const closeTimerStartTimeRef = useRef(0, subSlot(slot, 'timerStart'));
	const closeTimerRemainingTimeRef = useRef(duration, subSlot(slot, 'timerRemaining'));
	const closeTimerRef = useRef(0, subSlot(slot, 'timer'));
	const { onToastAdd, onToastRemove } = context;
	const handleClose = useCallbackRef(
		() => {
			// focus viewport if focus is within toast to read the remaining toast
			// count to SR users and ensure focus isn't lost
			const isFocusInToast = node?.contains(document.activeElement);
			if (isFocusInToast) context.viewport?.focus();
			onClose();
		},
		subSlot(slot, 'close'),
	);

	const startTimer = useCallback(
		(duration: number) => {
			if (!duration || duration === Infinity) return;
			window.clearTimeout(closeTimerRef.current);
			closeTimerStartTimeRef.current = new Date().getTime();
			closeTimerRef.current = window.setTimeout(handleClose, duration);
		},
		[handleClose],
		subSlot(slot, 'startTimer'),
	);

	useEffect(
		() => {
			const viewport = context.viewport;
			if (viewport) {
				const handleResume = (): void => {
					startTimer(closeTimerRemainingTimeRef.current);
					onResume?.();
				};
				const handlePause = (): void => {
					const elapsedTime = new Date().getTime() - closeTimerStartTimeRef.current;
					closeTimerRemainingTimeRef.current = closeTimerRemainingTimeRef.current - elapsedTime;
					window.clearTimeout(closeTimerRef.current);
					onPause?.();
				};
				viewport.addEventListener(VIEWPORT_PAUSE, handlePause);
				viewport.addEventListener(VIEWPORT_RESUME, handleResume);
				return () => {
					viewport.removeEventListener(VIEWPORT_PAUSE, handlePause);
					viewport.removeEventListener(VIEWPORT_RESUME, handleResume);
				};
			}
		},
		[context.viewport, duration, onPause, onResume, startTimer],
		subSlot(slot, 'e:viewport'),
	);

	// start timer when toast opens or duration changes.
	// we include `open` in deps because closed !== unmounted when animating
	// so it could reopen before being completely unmounted
	useEffect(
		() => {
			if (open && !context.isClosePausedRef.current) startTimer(duration);
		},
		[open, duration, context.isClosePausedRef, startTimer],
		subSlot(slot, 'e:open'),
	);

	// Clear close timer on unmount to prevent memory leaks and errors in test environments
	useEffect(
		() => {
			return () => {
				window.clearTimeout(closeTimerRef.current);
			};
		},
		[],
		subSlot(slot, 'e:clear'),
	);

	useEffect(
		() => {
			onToastAdd();
			return () => onToastRemove();
		},
		[onToastAdd, onToastRemove],
		subSlot(slot, 'e:count'),
	);

	const announceTextContent = useMemo(
		() => (node ? getAnnounceTextContent(node) : null),
		[node],
		subSlot(slot, 'announce'),
	);

	if (!context.viewport) return null;

	return [
		announceTextContent
			? createElement(ToastAnnounce, {
					key: 'announce',
					__scopeToast,
					// Toasts are always role=status to avoid stuttering issues with role=alert in SRs.
					role: 'status',
					'aria-live': type === 'foreground' ? 'assertive' : 'polite',
					children: announceTextContent,
				})
			: null,
		createElement(ToastInteractiveProvider, {
			key: 'toast',
			scope: __scopeToast,
			onClose: handleClose,
			children: createPortal(
				createElement(Collection.ItemSlot, {
					scope: __scopeToast,
					children: createElement(DismissableLayer, {
						asChild: true,
						onEscapeKeyDown: composeEventHandlers(onEscapeKeyDown, () => {
							if (!context.isFocusedToastEscapeKeyDownRef.current) handleClose();
							context.isFocusedToastEscapeKeyDownRef.current = false;
						}),
						children: createElement(Primitive.li, {
							// Ensure toasts are announced as status list or status when focused
							tabIndex: 0,
							'data-state': open ? 'open' : 'closed',
							'data-swipe-direction': context.swipeDirection,
							...toastProps,
							ref: composedRefs,
							style: { userSelect: 'none', touchAction: 'none', ...props?.style },
							onKeyDown: composeEventHandlers(toastProps.onKeyDown, (event: KeyboardEvent) => {
								if (event.key !== 'Escape') return;
								// octane: events are native — React's `event.nativeEvent` is `event`.
								onEscapeKeyDown?.(event);
								if (!event.defaultPrevented) {
									context.isFocusedToastEscapeKeyDownRef.current = true;
									handleClose();
								}
							}),
							onPointerDown: composeEventHandlers(
								toastProps.onPointerDown,
								(event: PointerEvent) => {
									if (event.button !== 0) return;
									pointerStartRef.current = { x: event.clientX, y: event.clientY };
								},
							),
							onPointerMove: composeEventHandlers(
								toastProps.onPointerMove,
								(event: PointerEvent) => {
									if (!pointerStartRef.current) return;
									const x = event.clientX - pointerStartRef.current.x;
									const y = event.clientY - pointerStartRef.current.y;
									const hasSwipeMoveStarted = Boolean(swipeDeltaRef.current);
									const isHorizontalSwipe = ['left', 'right'].includes(context.swipeDirection);
									const clamp = ['left', 'up'].includes(context.swipeDirection)
										? Math.min
										: Math.max;
									const clampedX = isHorizontalSwipe ? clamp(0, x) : 0;
									const clampedY = !isHorizontalSwipe ? clamp(0, y) : 0;
									const moveStartBuffer = event.pointerType === 'touch' ? 10 : 2;
									const delta = { x: clampedX, y: clampedY };
									const eventDetail = { originalEvent: event, delta };
									if (hasSwipeMoveStarted) {
										swipeDeltaRef.current = delta;
										handleAndDispatchCustomEvent(TOAST_SWIPE_MOVE, onSwipeMove, eventDetail, {
											discrete: false,
										});
									} else if (isDeltaInDirection(delta, context.swipeDirection, moveStartBuffer)) {
										swipeDeltaRef.current = delta;
										handleAndDispatchCustomEvent(TOAST_SWIPE_START, onSwipeStart, eventDetail, {
											discrete: false,
										});
										(event.target as HTMLElement).setPointerCapture(event.pointerId);
									} else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) {
										// User is swiping in wrong direction so we disable swipe gesture
										// for the current pointer down interaction
										pointerStartRef.current = null;
									}
								},
							),
							onPointerUp: composeEventHandlers(toastProps.onPointerUp, (event: PointerEvent) => {
								const delta = swipeDeltaRef.current;
								const target = event.target as HTMLElement;
								if (target.hasPointerCapture(event.pointerId)) {
									target.releasePointerCapture(event.pointerId);
								}
								swipeDeltaRef.current = null;
								pointerStartRef.current = null;
								if (delta) {
									const toast = event.currentTarget as HTMLElement;
									const eventDetail = { originalEvent: event, delta };
									if (isDeltaInDirection(delta, context.swipeDirection, context.swipeThreshold)) {
										handleAndDispatchCustomEvent(TOAST_SWIPE_END, onSwipeEnd, eventDetail, {
											discrete: true,
										});
									} else {
										handleAndDispatchCustomEvent(TOAST_SWIPE_CANCEL, onSwipeCancel, eventDetail, {
											discrete: true,
										});
									}
									// Prevent click event from triggering on items within the toast when
									// pointer up is part of a swipe gesture
									toast.addEventListener('click', (event) => event.preventDefault(), {
										once: true,
									});
								}
							}),
						}),
					}),
				}),
				context.viewport,
			),
		}),
	];
}

/* -----------------------------------------------------------------------------------------------*/

function ToastAnnounce(props: any): any {
	const slot = S('Toast.Announce');
	const { __scopeToast, children, ...announceProps } = props ?? {};
	const context = useToastProviderContext(TOAST_NAME, __scopeToast);
	const [renderAnnounceText, setRenderAnnounceText] = useState(false, subSlot(slot, 'render'));
	const [isAnnounced, setIsAnnounced] = useState(false, subSlot(slot, 'announced'));

	// render text content in the next frame to ensure toast is announced in NVDA
	useNextFrame(() => setRenderAnnounceText(true), subSlot(slot, 'frame'));

	// cleanup after announcing
	useEffect(
		() => {
			const timer = window.setTimeout(() => setIsAnnounced(true), 1000);
			return () => window.clearTimeout(timer);
		},
		[],
		subSlot(slot, 'e:cleanup'),
	);

	return isAnnounced
		? null
		: createElement(PortalPrimitive, {
				asChild: true,
				container: context.announcerContainer || undefined,
				children: createElement(VisuallyHidden, {
					...announceProps,
					children: renderAnnounceText
						? [context.label, ' ', ...(Array.isArray(children) ? children : [children])]
						: null,
				}),
			});
}

/* -------------------------------------------------------------------------------------------------
 * ToastTitle
 * -----------------------------------------------------------------------------------------------*/

export function Title(props: any): any {
	const { __scopeToast, ...titleProps } = props ?? {};
	return createElement(Primitive.div, { ...titleProps });
}

/* -------------------------------------------------------------------------------------------------
 * ToastDescription
 * -----------------------------------------------------------------------------------------------*/

export function Description(props: any): any {
	const { __scopeToast, ...descriptionProps } = props ?? {};
	return createElement(Primitive.div, { ...descriptionProps });
}

/* -------------------------------------------------------------------------------------------------
 * ToastAction
 * -----------------------------------------------------------------------------------------------*/

export function Action(props: any): any {
	const { altText, ref: forwardedRef, ...actionProps } = props ?? {};

	if (!altText || !String(altText).trim()) {
		// (dev-only console.error intentionally not ported; the functional outcome —
		// an Action without a valid `altText` does not render — is preserved)
		return null;
	}

	return createElement(ToastAnnounceExclude, {
		altText,
		asChild: true,
		children: createElement(Close, { ...actionProps, ref: forwardedRef }),
	});
}

/* -------------------------------------------------------------------------------------------------
 * ToastClose
 * -----------------------------------------------------------------------------------------------*/

const CLOSE_NAME = 'ToastClose';

export function Close(props: any): any {
	const { __scopeToast, ref: forwardedRef, ...closeProps } = props ?? {};
	const interactiveContext = useToastInteractiveContext(CLOSE_NAME, __scopeToast) as any;

	return createElement(ToastAnnounceExclude, {
		asChild: true,
		children: createElement(Primitive.button, {
			type: 'button',
			...closeProps,
			ref: forwardedRef,
			onClick: composeEventHandlers(props?.onClick, interactiveContext.onClose),
		}),
	});
}

/* ---------------------------------------------------------------------------------------------- */

function ToastAnnounceExclude(props: any): any {
	const { __scopeToast, altText, ref: forwardedRef, ...announceExcludeProps } = props ?? {};

	return createElement(Primitive.div, {
		'data-radix-toast-announce-exclude': '',
		'data-radix-toast-announce-alt': altText || undefined,
		...announceExcludeProps,
		ref: forwardedRef,
	});
}

function getAnnounceTextContent(container: HTMLElement): string[] {
	const textContent: string[] = [];
	const childNodes = Array.from(container.childNodes);

	childNodes.forEach((node) => {
		if (node.nodeType === node.TEXT_NODE && node.textContent) textContent.push(node.textContent);
		if (isHTMLElement(node)) {
			const isHidden = node.ariaHidden || node.hidden || node.style.display === 'none';
			const isExcluded = node.dataset.radixToastAnnounceExclude === '';

			if (!isHidden) {
				if (isExcluded) {
					const altText = node.dataset.radixToastAnnounceAlt;
					if (altText) textContent.push(altText);
				} else {
					textContent.push(...getAnnounceTextContent(node));
				}
			}
		}
	});

	// We return a collection of text rather than a single concatenated string.
	// This allows SR VO to naturally pause break between nodes while announcing.
	return textContent;
}

/* ---------------------------------------------------------------------------------------------- */

function handleAndDispatchCustomEvent(
	name: string,
	handler: ((event: any) => void) | undefined,
	detail: { originalEvent: Event } & Record<string, any>,
	{ discrete }: { discrete: boolean },
): void {
	const currentTarget = detail.originalEvent.currentTarget as HTMLElement;
	const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail });
	if (handler) currentTarget.addEventListener(name, handler as EventListener, { once: true });

	if (discrete) {
		dispatchDiscreteCustomEvent(currentTarget, event);
	} else {
		currentTarget.dispatchEvent(event);
	}
}

const isDeltaInDirection = (
	delta: { x: number; y: number },
	direction: SwipeDirection,
	threshold = 0,
): boolean => {
	const deltaX = Math.abs(delta.x);
	const deltaY = Math.abs(delta.y);
	const isDeltaX = deltaX > deltaY;
	if (direction === 'left' || direction === 'right') {
		return isDeltaX && deltaX > threshold;
	} else {
		return !isDeltaX && deltaY > threshold;
	}
};

function useNextFrame(callback: () => void, slot: symbol | undefined): void {
	const fn = useCallbackRef(callback, subSlot(slot, 'cb'));
	useLayoutEffect(
		() => {
			let raf1 = 0;
			let raf2 = 0;
			raf1 = window.requestAnimationFrame(() => (raf2 = window.requestAnimationFrame(fn)));
			return () => {
				window.cancelAnimationFrame(raf1);
				window.cancelAnimationFrame(raf2);
			};
		},
		[fn],
		subSlot(slot, 'e'),
	);
}

function isHTMLElement(node: any): node is HTMLElement {
	return node.nodeType === node.ELEMENT_NODE;
}

/**
 * Returns a list of potential tabbable candidates.
 *
 * NOTE: This is only a close approximation. For example it doesn't take into account cases like when
 * elements are not visible. This cannot be worked out easily by just reading a property, but rather
 * necessitate runtime knowledge (computed styles, etc). We deal with these cases separately.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 * Credit: https://github.com/discord/focus-layers/blob/master/src/util/wrapFocus.tsx#L1
 */
function getTabbableCandidates(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node: any) => {
			const isHiddenInput = node.tagName === 'INPUT' && node.type === 'hidden';
			if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
			// `.tabIndex` is not the same as the `tabindex` attribute. It works on the
			// runtime's understanding of tabbability, so this automatically accounts
			// for any kind of element that could be tabbed to.
			return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	// we do not take into account the order of nodes with positive `tabIndex` as it
	// hinders accessibility to have tab order different from visual order.
	return nodes;
}

function focusFirst(candidates: HTMLElement[]): boolean {
	const previouslyFocusedElement = document.activeElement;
	return candidates.some((candidate) => {
		// if focus is already where we want to go, we don't want to keep going through the candidates
		if (candidate === previouslyFocusedElement) return true;
		candidate.focus();
		return document.activeElement !== previouslyFocusedElement;
	});
}

export {
	Provider as ToastProvider,
	Viewport as ToastViewport,
	Root as Toast,
	Title as ToastTitle,
	Description as ToastDescription,
	Action as ToastAction,
	Close as ToastClose,
};
