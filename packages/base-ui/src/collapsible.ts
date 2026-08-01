// Ported from .base-ui/packages/react/src/collapsible/ (v1.6.0): root/CollapsibleRootContext,
// root/useCollapsibleRoot, root/CollapsibleRoot, root/stateAttributesMapping,
// trigger/CollapsibleTrigger, panel/useCollapsiblePanel, panel/CollapsiblePanel,
// panel/CollapsiblePanelCssVars — plus its `index.parts` (the `Collapsible` namespace).
//
// octane adaptations:
//   1. `forwardRef` → ref-as-prop, per the repo-wide divergence. `useMergedRefs` becomes an
//      array ref, which octane accepts natively.
//   2. Events are NATIVE. Base UI reads `event.nativeEvent` to build its change-event details;
//      octane hands the native event straight to the handler, so it is passed as-is.
//   3. `useIsoLayoutEffect` → `useLayoutEffect`, per the other ports in this package.
//   4. Every hook threads an explicit compiler slot (`S(...)` / `subSlot(...)`), because these
//      are plain `.ts` hooks rather than compiled `.tsrx` call sites.
//
// Upstream's `<Activity>` animation-resume suppression IS ported. It exists because Activity
// tears down effects while preserving state and DOM, so revealing an already-open keyframe panel
// would replay its open animation. Octane has the same contract, not an absence of one: it
// exports `Activity`, a hidden subtree still renders, `deactivateScope` fires each effect's
// cleanup and clears its deps, and the reveal re-render re-fires them — so the teardown-marks,
// reveal-suppresses mechanism works here unchanged.
import {
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { useTransitionStatus, transitionStatusMapping } from './utils/useTransitionStatus';
import type { TransitionStatus } from './utils/useTransitionStatus';
import { addEventListener } from './utils/addEventListener';
import { AnimationFrame } from './utils/useAnimationFrame';
import { ownerWindow } from './utils/owner';
import { resolveStyle } from './utils/resolveStyle';
import { useAnimationsFinished } from './utils/useAnimationsFinished';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { useValueAsRef } from './utils/useValueAsRef';
import {
	collapsibleOpenStateMapping,
	collapsibleTriggerOpenStateMapping,
} from './utils/collapsibleOpenStateMapping';

export interface CollapsibleRootState {
	open: boolean;
	disabled: boolean;
	transitionStatus: TransitionStatus;
}

const rootStateAttributesMapping: StateAttributesMapping<CollapsibleRootState> = {
	...(collapsibleOpenStateMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

const triggerStateAttributesMapping: StateAttributesMapping<CollapsibleRootState> = {
	...(collapsibleTriggerOpenStateMapping as StateAttributesMapping<any>),
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

// --- Context -----------------------------------------------------------------

export interface CollapsibleRootContextValue {
	disabled: boolean;
	handleTrigger: (event: Event) => void;
	mounted: boolean;
	open: boolean;
	panelId: string | undefined;
	setMounted: (nextMounted: boolean) => void;
	setOpen: (open: boolean) => void;
	setPanelIdState: (id: string | undefined) => void;
	transitionStatus: TransitionStatus;
	onOpenChange: (open: boolean, eventDetails: any) => void;
	state: CollapsibleRootState;
}

const CollapsibleRootContext = createContext<CollapsibleRootContextValue | undefined>(undefined);

export function useCollapsibleRootContext(): CollapsibleRootContextValue {
	const context = useContext(CollapsibleRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: CollapsibleRootContext is missing. Collapsible parts must be placed within <Collapsible.Root>.',
		);
	}
	return context;
}

// --- useCollapsibleRoot ------------------------------------------------------

export function useCollapsibleRoot(
	...args: any[]
): Omit<CollapsibleRootContextValue, 'onOpenChange' | 'state'> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCollapsibleRoot');
	const {
		open: openParam,
		defaultOpen,
		onOpenChange,
		disabled,
	} = user[0] as {
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange: (open: boolean, eventDetails: any) => void;
		disabled: boolean;
	};

	const [open, setOpen] = useControlled<boolean>(
		{ controlled: openParam, default: defaultOpen, name: 'Collapsible', state: 'open' },
		subSlot(slot, 'ctrl'),
	);

	const { mounted, setMounted, transitionStatus } = useTransitionStatus(
		open,
		true,
		true,
		subSlot(slot, 'transition'),
	);

	const defaultPanelId = useBaseUiId(undefined, subSlot(slot, 'id'));
	const [panelIdState, setPanelIdState] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'panelId'),
	);
	const panelId = panelIdState ?? defaultPanelId;

	const handleTrigger = useStableCallback(
		(event: Event) => {
			const nextOpen = !open;
			// octane: events are native, so the handler already HAS what Base UI reaches for
			// through `event.nativeEvent`.
			const eventDetails = createChangeEventDetails(REASONS.triggerPress, event);

			onOpenChange(nextOpen, eventDetails);

			if (eventDetails.isCanceled) {
				return;
			}

			setOpen(nextOpen);
		},
		subSlot(slot, 'trigger'),
	);

	return useMemo(
		() => ({
			disabled,
			handleTrigger,
			mounted,
			open,
			panelId,
			setMounted,
			setOpen,
			setPanelIdState,
			transitionStatus,
		}),
		[
			disabled,
			handleTrigger,
			mounted,
			open,
			panelId,
			setMounted,
			setOpen,
			setPanelIdState,
			transitionStatus,
		],
		subSlot(slot, 'memo'),
	);
}

// --- Root --------------------------------------------------------------------

function CollapsibleRoot(props: any): any {
	const slot = S('CollapsibleRoot');
	const {
		render,
		className,
		defaultOpen = false,
		disabled = false,
		onOpenChange: onOpenChangeProp,
		open,
		style,
		ref,
		...elementProps
	} = props;

	const onOpenChange = useStableCallback(onOpenChangeProp ?? (() => {}), subSlot(slot, 'onOpen'));

	const collapsible = useCollapsibleRoot(
		{ open, defaultOpen, onOpenChange, disabled },
		subSlot(slot, 'root'),
	);

	const state: CollapsibleRootState = useMemo(
		() => ({
			open: collapsible.open,
			disabled: collapsible.disabled,
			transitionStatus: collapsible.transitionStatus,
		}),
		[collapsible.open, collapsible.disabled, collapsible.transitionStatus],
		subSlot(slot, 'state'),
	);

	const contextValue: CollapsibleRootContextValue = useMemo(
		() => ({ ...collapsible, onOpenChange, state }),
		[collapsible, onOpenChange, state],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: elementProps,
			stateAttributesMapping: rootStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(CollapsibleRootContext.Provider, {
		value: contextValue,
		children: element,
	});
}

// --- Trigger -----------------------------------------------------------------

function CollapsibleTrigger(props: any): any {
	const slot = S('CollapsibleTrigger');
	const {
		panelId,
		open,
		handleTrigger,
		state,
		disabled: contextDisabled,
	} = useCollapsibleRootContext();

	const {
		className,
		disabled = contextDisabled,
		render,
		nativeButton = true,
		style,
		ref,
		...elementProps
	} = props;

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, focusableWhenDisabled: true, native: nativeButton },
		subSlot(slot, 'button'),
	);

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [ref, buttonRef],
			props: [
				{
					'aria-controls': open ? panelId : undefined,
					'aria-expanded': open,
					onClick: handleTrigger,
				},
				elementProps,
				getButtonProps,
			],
			stateAttributesMapping: triggerStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Panel -------------------------------------------------------------------

export const CollapsiblePanelCssVars = {
	collapsiblePanelHeight: '--collapsible-panel-height',
	collapsiblePanelWidth: '--collapsible-panel-width',
} as const;

type AnimationType = 'css-transition' | 'css-animation' | 'none';

interface Dimensions {
	height: number | undefined;
	width: number | undefined;
}

const EMPTY_DIMENSIONS: Dimensions = { height: undefined, width: undefined };

function getDimensions(element: HTMLElement): Dimensions {
	return { height: element.scrollHeight, width: element.scrollWidth };
}

function hasNonZeroDuration(value: string): boolean {
	return value
		.split(',')
		.map((part) => part.trim())
		.some((part) => part !== '' && Number.parseFloat(part) > 0);
}

function getAnimationType(
	element: HTMLElement,
	hasSuppressedMountAnimation = false,
): AnimationType {
	const panelStyles = ownerWindow(element).getComputedStyle(element);
	const hasAnimation =
		(panelStyles.animationName
			.split(',')
			.map((name) => name.trim())
			.some((name) => name !== '' && name !== 'none') ||
			hasSuppressedMountAnimation) &&
		hasNonZeroDuration(panelStyles.animationDuration);
	const hasTransition = hasNonZeroDuration(panelStyles.transitionDuration);

	if (hasAnimation && hasTransition) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn(
				'Base UI: CSS transitions and CSS animations both detected on Collapsible or Accordion panel. ' +
					'Only one of either animation type should be used.',
			);
		}
		return 'css-transition';
	}
	if (hasTransition) {
		return 'css-transition';
	}
	if (hasAnimation) {
		return 'css-animation';
	}
	return 'none';
}

/** Temporarily override an inline style property; the returned cleanup restores it. */
function setTemporaryStyle(element: HTMLElement, property: string, value: string): () => void {
	const previousValue = element.style.getPropertyValue(property);
	const previousPriority = element.style.getPropertyPriority(property);

	element.style.setProperty(property, value);

	return () => {
		if (previousValue === '') {
			element.style.removeProperty(property);
			return;
		}
		element.style.setProperty(property, previousValue, previousPriority);
	};
}

/** Reset inline alignment styles that distort scroll-based measurement, restoring next frame. */
function resetLayoutStyles(element: HTMLElement): () => void {
	const originalLayoutStyles: Record<string, string> = {
		'justify-content': element.style.justifyContent,
		'align-items': element.style.alignItems,
		'align-content': element.style.alignContent,
		'justify-items': element.style.justifyItems,
	};

	Object.keys(originalLayoutStyles).forEach((key) => {
		element.style.setProperty(key, 'initial', 'important');
	});

	function restoreLayoutStyles() {
		Object.entries(originalLayoutStyles).forEach(([key, value]) => {
			if (value === '') {
				element.style.removeProperty(key);
				return;
			}
			element.style.setProperty(key, value);
		});
	}

	const frame = AnimationFrame.request(restoreLayoutStyles);

	return () => {
		AnimationFrame.cancel(frame);
		restoreLayoutStyles();
	};
}

export function useCollapsiblePanel(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCollapsiblePanel');
	const {
		hiddenUntilFound,
		id: idParam,
		keepMounted,
		mounted,
		onOpenChange,
		open,
		setMounted,
		setOpen,
		transitionStatus,
	} = user[0] as any;

	const panelRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'panelRef'));
	const animationTypeRef = useRef<AnimationType | null>(null, subSlot(slot, 'animType'));
	const [dimensions, setDimensionsUnwrapped] = useState<Dimensions>(
		EMPTY_DIMENSIONS,
		subSlot(slot, 'dims'),
	);
	const lastMeasuredDimensionsRef = useRef<Dimensions>(EMPTY_DIMENSIONS, subSlot(slot, 'lastDims'));
	// `beforematch` reveals matched content immediately, so the next open cycle skips
	// author-defined motion once and then returns to normal.
	const shouldSkipNextOpenRef = useRef(false, subSlot(slot, 'skipOpen'));
	// Keyframe mount animations on initially open panels cause a visible layout shift during
	// the server-rendered first paint, so suppress that first open until it has closed once.
	const shouldPreventMountAnimationRef = useRef(open, subSlot(slot, 'preventMount'));
	// `<Activity>` tears down effects while PRESERVING state and DOM, so revealing an
	// already-open keyframe panel would otherwise replay its open animation. Octane's Activity
	// has exactly React's contract here: a hidden subtree still renders, `deactivateScope` fires
	// each effect's cleanup and clears its deps, and the reveal re-render re-fires them.
	const shouldPreventActivityResumeAnimationRef = useRef(
		false,
		subSlot(slot, 'preventActivityResume'),
	);
	// Some open paths intentionally bypass motion while the shared root transition status still
	// advances asynchronously; force the panel to idle so its attributes reflect the real state.
	const [forcePanelIdle, setForcePanelIdle] = useState(false, subSlot(slot, 'forceIdle'));
	const pendingTemporaryStyleRestoreRef = useRef<(() => void) | null>(
		null,
		subSlot(slot, 'pendingRestore'),
	);

	const latestStateRef = useValueAsRef<{ mounted: boolean; open: boolean }>(
		{ mounted, open },
		subSlot(slot, 'latest'),
	);
	// Only used to handle panel close.
	const runOnceCloseAnimationsFinish = useAnimationsFinished(
		panelRef,
		false,
		false,
		subSlot(slot, 'closeAnims'),
	);

	const hidden = !open && !mounted;
	const panelTransitionStatus: TransitionStatus = forcePanelIdle ? 'idle' : transitionStatus;
	// These refs are safe to read in render: they are only written from committed layout/effect
	// paths and gate one-shot motion suppression for the next open lifecycle.
	const shouldPreventOpenAnimation =
		open &&
		(shouldPreventMountAnimationRef.current || shouldPreventActivityResumeAnimationRef.current);
	const renderedDimensions =
		!open &&
		mounted &&
		animationTypeRef.current === 'css-animation' &&
		dimensions.height === undefined &&
		dimensions.width === undefined
			? lastMeasuredDimensionsRef.current
			: dimensions;
	const shouldPersistHiddenTransitionStyles =
		hiddenUntilFound && hidden && animationTypeRef.current !== 'css-animation';

	// Measured dimensions are reused when a CSS keyframe close needs a pixel size after the
	// rendered dimensions have been reset back to `auto`. `false` only clears current state.
	const setDimensions = useStableCallback(
		(next: Dimensions, shouldCacheMeasurement = true) => {
			if (shouldCacheMeasurement) {
				lastMeasuredDimensionsRef.current = next;
			}
			setDimensionsUnwrapped(next);
		},
		subSlot(slot, 'setDims'),
	);

	const restorePendingTemporaryStyle = useStableCallback(
		() => {
			pendingTemporaryStyleRestoreRef.current?.();
			pendingTemporaryStyleRestoreRef.current = null;
		},
		subSlot(slot, 'restorePending'),
	);

	// Runs from the teardown path. If an OPEN keyframe panel is being torn down while its state
	// survives — i.e. `<Activity>` hiding it rather than a real unmount — remember to suppress the
	// replayed open animation on the next committed reveal.
	const markActivityResumeAnimationSuppressed = useStableCallback(
		() => {
			if (open && mounted && animationTypeRef.current === 'css-animation') {
				shouldPreventActivityResumeAnimationRef.current = true;
			}
		},
		subSlot(slot, 'markActivityResume'),
	);

	const setPendingTemporaryStyleRestore = useStableCallback(
		(restore: () => void) => {
			restorePendingTemporaryStyle();
			pendingTemporaryStyleRestoreRef.current = () => {
				pendingTemporaryStyleRestoreRef.current = null;
				restore();
			};
		},
		subSlot(slot, 'setPending'),
	);

	useLayoutEffect(
		() => {
			// `forcePanelIdle` is a temporary override for open paths that skip motion. Keep it
			// active while the root still reports `starting`, then drop it once the root catches up.
			if (!forcePanelIdle || transitionStatus === 'starting') {
				return;
			}
			setForcePanelIdle(false);
		},
		[forcePanelIdle, transitionStatus],
		subSlot(slot, 'idleEffect'),
	);

	useEffect(
		() => () => {
			markActivityResumeAnimationSuppressed();
			restorePendingTemporaryStyle();
		},
		[markActivityResumeAnimationSuppressed, restorePendingTemporaryStyle],
		subSlot(slot, 'unmount'),
	);

	useLayoutEffect(
		() => {
			const panel = panelRef.current;
			if (!panel) {
				return undefined;
			}

			// `beforematch` can force a `0s` duration so matched content reveals immediately.
			// Restore the authored duration before detecting the next close animation type,
			// otherwise that first close is misread as "no motion" and gets skipped.
			if (!open && pendingTemporaryStyleRestoreRef.current) {
				restorePendingTemporaryStyle();
			}

			const animationType = getAnimationType(panel, shouldPreventOpenAnimation);
			animationTypeRef.current = animationType;

			// Initially open keyframe panels skip their first paint animation to avoid layout
			// shift, but the expanded size is still cached so the first close starts from pixels.
			if (
				open &&
				transitionStatus === 'idle' &&
				shouldPreventMountAnimationRef.current &&
				animationType === 'css-animation'
			) {
				lastMeasuredDimensionsRef.current = getDimensions(panel);
				return undefined;
			}

			// The opening pass: measure the expanded size and, when necessary, neutralize
			// author-defined motion so the panel can open immediately.
			if (open && transitionStatus === 'starting') {
				const skipNextOpen = shouldSkipNextOpenRef.current;
				shouldSkipNextOpenRef.current = false;

				if (animationType === 'none') {
					setDimensions(getDimensions(panel));
					setForcePanelIdle(true);
					return undefined;
				}

				if (animationType === 'css-transition') {
					const restoreLayout = resetLayoutStyles(panel);
					setDimensions(getDimensions(panel));

					if (!skipNextOpen) {
						return restoreLayout;
					}

					setPendingTemporaryStyleRestore(setTemporaryStyle(panel, 'transition-duration', '0s'));
					setForcePanelIdle(true);
					return restoreLayout;
				}

				if (animationType === 'css-animation') {
					setDimensions(getDimensions(panel));

					if (!skipNextOpen) {
						setTemporaryStyle(panel, 'animation-name', 'none')();
						return undefined;
					}

					const restoreAnimationName = setTemporaryStyle(panel, 'animation-name', 'none');
					const restoreAnimationDuration = setTemporaryStyle(panel, 'animation-duration', '0s');

					restoreAnimationName();
					setPendingTemporaryStyleRestore(restoreAnimationDuration);
					setForcePanelIdle(true);
					return undefined;
				}
			}

			// Capture the current size as soon as close is requested, before the deferred ending
			// phase applies closed styles, so close transitions start from a measured pixel value.
			if (!open && mounted && (transitionStatus === 'idle' || transitionStatus === 'starting')) {
				shouldPreventMountAnimationRef.current = false;
				shouldPreventActivityResumeAnimationRef.current = false;

				if (animationType === 'none') {
					setDimensions(EMPTY_DIMENSIONS, false);
					setMounted(false);
					return undefined;
				}

				setDimensions(getDimensions(panel));
				return undefined;
			}

			if (transitionStatus !== 'ending') {
				return undefined;
			}

			if (animationType === 'none') {
				setMounted(false);
				return undefined;
			}

			const nextDimensions = getDimensions(panel);
			const hasMeasuredSize = (nextDimensions.height ?? 0) > 0 || (nextDimensions.width ?? 0) > 0;

			if (!hasMeasuredSize) {
				setMounted(false);
				return undefined;
			}

			setDimensions(nextDimensions);

			if (animationType === 'css-animation') {
				setTemporaryStyle(panel, 'animation-name', 'none')();
			}

			return undefined;
		},
		[
			mounted,
			open,
			restorePendingTemporaryStyle,
			setDimensions,
			setMounted,
			setPendingTemporaryStyleRestore,
			shouldPreventOpenAnimation,
			transitionStatus,
		],
		subSlot(slot, 'mainEffect'),
	);

	useOpenChangeComplete(
		{
			enabled: open && mounted && panelTransitionStatus === 'idle',
			open: true,
			ref: panelRef,
			onComplete() {
				if (!open) {
					return;
				}
				setDimensions(EMPTY_DIMENSIONS, false);
			},
		},
		subSlot(slot, 'openComplete'),
	);

	// Closing panels need sequencing beyond `useOpenChangeComplete`. This passive effect runs
	// after the `ending` render has committed, so `[data-ending-style]` is already present.
	// Chrome can register the exit transition a frame later when an Accordion closes one item
	// while opening another, so wait one frame before watching animations.
	useEffect(
		() => {
			if (open || !mounted || panelTransitionStatus !== 'ending') {
				return undefined;
			}

			const panel = panelRef.current;
			if (!panel) {
				return undefined;
			}

			const abortController = new AbortController();

			function handleComplete() {
				if (latestStateRef.current.open) {
					return;
				}
				setMounted(false);
				setDimensions(EMPTY_DIMENSIONS, false);
			}

			const endingStyleFrame = AnimationFrame.request(() => {
				if (!abortController.signal.aborted) {
					runOnceCloseAnimationsFinish(handleComplete, abortController.signal);
				}
			});

			return () => {
				AnimationFrame.cancel(endingStyleFrame);
				abortController.abort();
			};
		},
		[
			latestStateRef,
			mounted,
			open,
			panelTransitionStatus,
			runOnceCloseAnimationsFinish,
			setDimensions,
			setMounted,
		],
		subSlot(slot, 'closeEffect'),
	);

	useLayoutEffect(
		() => {
			const panel = panelRef.current;
			if (!panel || !hiddenUntilFound || !hidden) {
				return;
			}
			// React coerces `hidden` to a boolean, so upstream forces the string back in the DOM.
			// octane serializes the string faithfully, but this is kept: the attribute must also
			// survive a re-render that recomputes `hidden` as a boolean prop below.
			panel.setAttribute('hidden', 'until-found');
		},
		[hidden, hiddenUntilFound],
		subSlot(slot, 'hiddenEffect'),
	);

	useEffect(
		() => {
			const panel = panelRef.current;
			if (!panel) {
				return undefined;
			}

			function handleBeforeMatch(event: Event) {
				const eventDetails = createChangeEventDetails(REASONS.none, event);

				onOpenChange(true, eventDetails);

				if (eventDetails.isCanceled) {
					return;
				}

				shouldSkipNextOpenRef.current = true;
				setOpen(true);
			}

			return addEventListener(panel, 'beforematch', handleBeforeMatch);
		},
		[onOpenChange, setOpen],
		subSlot(slot, 'beforematch'),
	);

	const shouldRender = keepMounted || hiddenUntilFound || mounted || open;

	return {
		height: renderedDimensions.height,
		props: {
			...(shouldPersistHiddenTransitionStyles ? { 'data-starting-style': '' } : undefined),
			hidden,
			id: idParam,
		},
		panelRef,
		shouldPreventOpenAnimation,
		shouldRender,
		transitionStatus: panelTransitionStatus,
		width: renderedDimensions.width,
	};
}

export interface CollapsiblePanelState extends CollapsibleRootState {
	transitionStatus: TransitionStatus;
}

function CollapsiblePanel(props: any): any {
	const slot = S('CollapsiblePanel');
	const {
		className,
		hiddenUntilFound: hiddenUntilFoundProp,
		keepMounted: keepMountedProp,
		render,
		id: idProp,
		style,
		ref,
		...elementProps
	} = props;

	const {
		mounted,
		onOpenChange,
		open,
		panelId,
		setMounted,
		setPanelIdState,
		setOpen,
		state,
		transitionStatus,
	} = useCollapsibleRootContext();

	const hiddenUntilFound = hiddenUntilFoundProp ?? false;
	const keepMounted = keepMountedProp ?? false;

	if (process.env.NODE_ENV !== 'production') {
		useLayoutEffect(
			() => {
				if (hiddenUntilFound && keepMountedProp === false) {
					console.warn(
						'Base UI: The `keepMounted={false}` prop on `Collapsible.Panel` is ignored when ' +
							'`hiddenUntilFound` is enabled, since the panel must remain mounted while closed.',
					);
				}
			},
			[hiddenUntilFound, keepMountedProp],
			subSlot(slot, 'warn'),
		);
	}

	useLayoutEffect(
		() => {
			if (idProp) {
				setPanelIdState(idProp);
				return () => {
					setPanelIdState(undefined);
				};
			}
			return undefined;
		},
		[idProp, setPanelIdState],
		subSlot(slot, 'registerId'),
	);

	const {
		height,
		props: panelProps,
		panelRef,
		shouldPreventOpenAnimation,
		shouldRender,
		transitionStatus: panelTransitionStatus,
		width,
	} = useCollapsiblePanel(
		{
			hiddenUntilFound,
			id: panelId,
			keepMounted,
			mounted,
			onOpenChange,
			open,
			setMounted,
			setOpen,
			transitionStatus,
		},
		subSlot(slot, 'panel'),
	);

	const panelState: CollapsiblePanelState = {
		...state,
		transitionStatus: panelTransitionStatus,
	};

	const resolvedStyle = resolveStyle(style, panelState);

	const element = useRenderElement(
		'div',
		{ render, className, style: undefined },
		{
			state: panelState,
			ref: [ref, panelRef],
			props: [
				panelProps,
				{
					style: {
						[CollapsiblePanelCssVars.collapsiblePanelHeight]:
							height === undefined ? 'auto' : `${height}px`,
						[CollapsiblePanelCssVars.collapsiblePanelWidth]:
							width === undefined ? 'auto' : `${width}px`,
					},
				},
				elementProps,
				resolvedStyle ? { style: resolvedStyle } : undefined,
				// The public `style` prop is resolved above so a temporary `animationName: 'none'`
				// can still win after the user's inline styles have been merged.
				shouldPreventOpenAnimation ? { style: { animationName: 'none' } } : undefined,
			],
			stateAttributesMapping: rootStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

// --- Namespace (mirrors `export * as Collapsible`) ---------------------------

export const Collapsible = {
	Root: CollapsibleRoot,
	Trigger: CollapsibleTrigger,
	Panel: CollapsiblePanel,
};

export { CollapsibleRoot, CollapsibleTrigger, CollapsiblePanel };
