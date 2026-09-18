import { useEffect, useRef } from 'octane';
import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	resolveProp,
	runOnce,
	scoped,
	useProp,
} from '../../reactive.js';
import type { Position } from '../../types.js';
import { cn } from '../../utils/cn.js';
import { loadToolbarState, saveToolbarState, type SnapEdge, type ToolbarState } from './state.js';
import { IconSelect } from '../icons/icon-select.tsrx';
import { ToolbarActionButton } from './toolbar-action-button.tsrx';
import {
	TOOLBAR_SNAP_MARGIN_PX,
	TOOLBAR_FADE_IN_DELAY_MS,
	TOOLBAR_COLLAPSE_ANIMATION_DURATION_MS,
	TOOLBAR_DEFAULT_WIDTH_PX,
	TOOLBAR_DEFAULT_HEIGHT_PX,
	TOOLBAR_DEFAULT_POSITION_RATIO,
	Z_INDEX_OVERLAY,
	SELECT_ICON_NATURAL_POINT_ANGLE_DEG,
	SELECT_ICON_POINT_MIN_DISTANCE_PX,
	DEFAULT_ACTION_ID,
} from '../../constants.js';
import { freezeUpdates } from '../../utils/freeze-updates.js';
import {
	freezeGlobalInteractions,
	unfreezeGlobalInteractions,
} from '../../utils/freeze-global-interactions.js';
import { ToolbarContent } from './toolbar-content.tsrx';
import { getVisualViewport } from '../../utils/get-visual-viewport.js';
import { getScopeContainer, ignoreRealInput } from '../../utils/runtime-mode.js';
import { nativeCancelAnimationFrame, nativeRequestAnimationFrame } from '../../utils/native-raf.js';
import {
	calculateExpandedPositionFromCollapsed,
	getCollapsedDimsForEdge,
	getCollapsedPosition,
	getPositionFromEdgeAndRatio,
	getRatioFromPosition,
	isHorizontalEdge,
} from '../../utils/toolbar-position.js';
import { createToolbarDrag } from '../../utils/create-toolbar-drag.js';
import { accumulateRotationDeg } from '../../utils/accumulate-rotation.js';

interface ToolbarProps {
	isActive?: boolean;
	isContextMenuOpen?: boolean;
	onToggle?: () => void;
	activeActionId?: string | null;
	defaultActionId?: string;
	defaultActionLabel?: string;
	enabled?: boolean;
	shakeCount?: number;
	onStateChange?: (state: ToolbarState) => void;
	onSubscribeToStateChanges?: (callback: (state: ToolbarState) => void) => () => void;
	onSelectHoverChange?: (isHovered: boolean) => void;
	onContainerRef?: (element: HTMLDivElement) => void;
	onToggleToolbarMenu?: () => void;
}

export const Toolbar = scoped<ToolbarProps>((props) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const selectButtonRef = useRef<HTMLButtonElement | null>(null);
	const unfreezeUpdatesCallback = useRef<(() => void) | null>(null);

	const savedState = loadToolbarState();

	const [isVisible, setIsVisible] = createSignal(false);
	const [isCollapsed, setIsCollapsed] = createSignal(false);
	const [isResizing, setIsResizing] = createSignal(false);
	const [snapEdge, setSnapEdge] = createSignal<SnapEdge>(savedState?.edge ?? 'bottom');
	const [positionRatio, setPositionRatio] = createSignal(
		savedState?.ratio ?? TOOLBAR_DEFAULT_POSITION_RATIO,
	);
	const [position, setPosition] = createSignal({ x: 0, y: 0 });
	const [isShaking, setIsShaking] = createSignal(false);
	const [isCollapseAnimating, setIsCollapseAnimating] = createSignal(false);
	const [isChevronPressed, setIsChevronPressed] = createSignal(false);
	const [isToolbarHovered, setIsToolbarHovered] = createSignal(false);
	const [selectIconRotationDeg, setSelectIconRotationDeg] = createSignal(0);
	const [hoveredActionId, setHoveredActionId] = createSignal<string | null>(null);

	const releaseInteractionFreeze = () => {
		unfreezeUpdatesCallback.current?.();
		unfreezeUpdatesCallback.current = null;
		// While grab mode is active, core owns the global freeze and releases it
		// on deactivation; only release it when this hover latch is the sole owner.
		if (!resolveProp(props.isActive)) unfreezeGlobalInteractions();
	};

	const drag = runOnce(
		() => createToolbarDrag({
			getContainerRef: () => containerRef.current ?? undefined,
			isCollapsed,
			getExpandedDimensions: () => expandedDimensions.current,
			onDragStart: () => {
				// Pointer capture during a drag suppresses the button's mouseleave, so
				// clear the hover here or the tooltip flashes at the snapped position
				// once isDragging/isSnapping settle.
				setHoveredActionId(null);
				if (unfreezeUpdatesCallback.current) releaseInteractionFreeze();
			},
			onPositionUpdate: (newPosition) => setPosition(newPosition),
			onSnapEdgeChange: (edge, ratio) => {
				syncCollapsedDimensionsToEdge(snapEdge(), edge);
				setSnapEdge(edge);
				setPositionRatio(ratio);
			},
			onSnapComplete: (result) => {
				expandedDimensions.current = result.expandedDimensions;
				setPosition(result.position);
				saveAndNotify({
					edge: result.edge,
					ratio: result.ratio,
					collapsed: isCollapsed(),
					enabled: !isCollapsed(),
				});
			},
		}),
	);

	const isVertical = () => !isHorizontalEdge(snapEdge());

	const buttonSpacingClass = () => (isVertical() ? 'mb-1.5' : 'mr-1.5');

	// Activation paths that bypass the toolbar button use the implicit Copy flow,
	// while toolbar activation tracks the selected default action explicitly.
	const currentActionId = () => resolveProp(props.defaultActionId) ?? DEFAULT_ACTION_ID;
	const currentActionLabel = () => resolveProp(props.defaultActionLabel) ?? 'Copy';
	const isCurrentActionActive = () =>
		Boolean(resolveProp(props.isActive)) &&
			(resolveProp(props.activeActionId) ?? DEFAULT_ACTION_ID) === currentActionId();

	const isTooltipVisible = (actionId: string) =>
		hoveredActionId() === actionId && !resolveProp(props.isActive) && !isCollapsed() &&
			!drag.isDragging() &&
			!drag.isSnapping() &&
			!resolveProp(props.isContextMenuOpen);
	const tooltipPosition = (): 'top' | 'bottom' | 'left' | 'right' => {
		switch (snapEdge()) {
			case 'top':
				return 'bottom';
			case 'bottom':
				return 'top';
			case 'left':
				return 'right';
			case 'right':
				return 'left';
			default:
				return 'top';
		}
	};

	const stopEventPropagation = (event: Event) => {
		event.stopImmediatePropagation();
	};

	const createFreezeHandlers = (getActionId: () => string) => ({
		onMouseEnter: (event: MouseEvent) => {
			if (drag.isDragging()) return;
			setHoveredActionId(getActionId());
			if (!unfreezeUpdatesCallback.current) {
				unfreezeUpdatesCallback.current = freezeUpdates();
				freezeGlobalInteractions(event.clientX, event.clientY);
			}
		},
		onMouseLeave: () => {
			const actionId = getActionId();
			setHoveredActionId((current) => (current === actionId ? null : current));
			if (!resolveProp(props.isActive) && !resolveProp(props.isContextMenuOpen)) {
				releaseInteractionFreeze();
			}
		},
	});

	createEffect(
		on(() => resolveProp(props.shakeCount), (count) => {
			if (count && !resolveProp(props.enabled)) {
				setIsShaking(true);
			}
		}),
	);

	createEffect(
		on(
			() => [
				resolveProp(props.isActive),
				resolveProp(props.isContextMenuOpen),
			] as const,
			([isActive, isContextMenuOpen]) => {
				if (!isActive && !isContextMenuOpen && unfreezeUpdatesCallback.current) {
					releaseInteractionFreeze();
				}
			},
		),
	);

	createEffect(
		on(() => isCurrentActionActive(), (didCurrentActionBecomeActive) => {
			if (!didCurrentActionBecomeActive) {
				// The accumulator can drift past ±180° while the user circles the
				// toolbar; resetting to literal 0 would unspin those revolutions
				// through the CSS transition. Snapping to the nearest equivalent
				// of 0° keeps the ease-back to a shortest-path arc.
				setSelectIconRotationDeg(
					(previousRotationDeg) => accumulateRotationDeg(previousRotationDeg, 0),
				);
				return;
			}

			let pointerFrameId: number | null = null;
			let latestPointerX = 0;
			let latestPointerY = 0;
			const updateSelectIconRotation = () => {
				pointerFrameId = null;
				if (!selectButtonRef.current) return;
				const rect = selectButtonRef.current.getBoundingClientRect();
				const centerX = rect.left + rect.width / 2;
				const centerY = rect.top + rect.height / 2;
				const deltaX = latestPointerX - centerX;
				const deltaY = latestPointerY - centerY;
				if (Math.hypot(deltaX, deltaY) < SELECT_ICON_POINT_MIN_DISTANCE_PX) return;
				const targetAngleDeg = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
				const desiredRotationDeg = targetAngleDeg - SELECT_ICON_NATURAL_POINT_ANGLE_DEG;
				setSelectIconRotationDeg(
					(previousRotationDeg) => accumulateRotationDeg(previousRotationDeg, desiredRotationDeg),
				);
			};

			const handlePointerMove = ignoreRealInput((event: PointerEvent | MouseEvent) => {
				latestPointerX = event.clientX;
				latestPointerY = event.clientY;
				if (pointerFrameId !== null) return;
				pointerFrameId = nativeRequestAnimationFrame(updateSelectIconRotation);
			});

			window.addEventListener('pointermove', handlePointerMove, { passive: true });
			onCleanup(() => {
				window.removeEventListener('pointermove', handlePointerMove);
				if (pointerFrameId !== null) nativeCancelAnimationFrame(pointerFrameId);
			});
		}),
	);

	const expandedDimensions = useRef({
		width: TOOLBAR_DEFAULT_WIDTH_PX,
		height: TOOLBAR_DEFAULT_HEIGHT_PX,
	});
	const [collapsedDimensions, setCollapsedDimensions] = createSignal(
		getCollapsedDimsForEdge(snapEdge()),
	);

	const syncCollapsedDimensionsToEdge = (oldEdge: SnapEdge, newEdge: SnapEdge): void => {
		if (isHorizontalEdge(oldEdge) === isHorizontalEdge(newEdge)) return;
		setCollapsedDimensions(getCollapsedDimsForEdge(newEdge));
	};

	const getExpandedFromCollapsed = (
		collapsedPosition: Position,
		edge: SnapEdge,
	): { position: Position; ratio: number } => {
		const actualRect = containerRef.current?.getBoundingClientRect();
		const fallback = getCollapsedDimsForEdge(edge);
		return calculateExpandedPositionFromCollapsed(
			collapsedPosition,
			edge,
			expandedDimensions.current,
			actualRect?.width ?? fallback.width,
			actualRect?.height ?? fallback.height,
		);
	};

	const recalculatePosition = () => {
		const newPosition = getPositionFromEdgeAndRatio(
			snapEdge(),
			positionRatio(),
			expandedDimensions.current.width,
			expandedDimensions.current.height,
		);
		setPosition(newPosition);
	};

	const handleToggle = drag.createDragAwareHandler(() => props.onToggle?.());
	const actionButtonClass = 'group contain-layout flex items-center justify-center cursor-pointer interactive-scale a11y-hitbox';
	const actionButtonWrapperClass = () => cn(
		'relative contain-layout flex items-center justify-center',
		buttonSpacingClass(),
	);
	const actionIconClass = (isActive: boolean) => isActive
		? 'text-[var(--rg-text-primary)]'
		: 'text-[var(--rg-text-secondary)] group-hover:text-[var(--rg-text-primary)]';

	const handleToggleCollapse = drag.createDragAwareHandler(() => {
		if (isCollapsed()) {
			expandToolbarFromCollapsed();
			return;
		}

		const rect = containerRef.current?.getBoundingClientRect();
		const currentRatio = positionRatio();
		if (rect) {
			expandedDimensions.current = { width: rect.width, height: rect.height };
		}

		setIsCollapseAnimating(true);
		setIsCollapsed(true);

		saveAndNotify({
			edge: snapEdge(),
			ratio: currentRatio,
			collapsed: true,
			enabled: false,
		});

		scheduleCollapseAnimationEnd();
	});

	const computeCollapsedPosition = (): Position => getCollapsedPosition(
		snapEdge(),
		position(),
		expandedDimensions.current,
		collapsedDimensions(),
	);

	const resizeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const collapseAnimationTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const lastObservedExpandedSize = useRef<{ width: number; height: number } | null>(null);

	// Both directions need to refresh their cached dimensions: collapsing
	// updates collapsedDimensions for the next expand-from-collapsed offset
	// calculation, and expanding updates expandedDimensions so handleResize
	// and getExpandedFromCollapsed don't keep using the fallback dimensions that
	// got cached when the toolbar mounted with savedState.collapsed=true and
	// an unmeasurable rect.
	const captureDimensionsAfterAnimation = () => {
		const finalRect = containerRef.current?.getBoundingClientRect();
		if (!finalRect || finalRect.width === 0 || finalRect.height === 0) return;
		if (isCollapsed()) {
			setCollapsedDimensions({ width: finalRect.width, height: finalRect.height });
		} else {
			expandedDimensions.current = { width: finalRect.width, height: finalRect.height };
			lastObservedExpandedSize.current = { width: finalRect.width, height: finalRect.height };
		}
	};

	const scheduleCollapseAnimationEnd = (): void => {
		if (collapseAnimationTimeout.current) {
			clearTimeout(collapseAnimationTimeout.current);
		}
		collapseAnimationTimeout.current = setTimeout(() => {
			setIsCollapseAnimating(false);
			captureDimensionsAfterAnimation();
		}, TOOLBAR_COLLAPSE_ANIMATION_DURATION_MS);
	};

	const expandToolbarFromCollapsed = (): void => {
		const { position: expandedPosition, ratio: newRatio } = getExpandedFromCollapsed(
			currentPosition(),
			snapEdge(),
		);
		setPosition(expandedPosition);
		setPositionRatio(newRatio);
		setIsCollapseAnimating(true);
		setIsCollapsed(false);
		saveAndNotify({
			edge: snapEdge(),
			ratio: newRatio,
			collapsed: false,
			enabled: true,
		});
		scheduleCollapseAnimationEnd();
	};

	// The first onMount measurement can fire before the shadow DOM host is
	// attached to <body> (mountRoot defers attachment to DOMContentLoaded while
	// the renderer's dynamic import can resolve earlier), or before fonts/CSS
	// have settled - both leave getBoundingClientRect returning a 0 rect. The
	// observer adopts the real size once layout commits and re-anchors the
	// toolbar to its saved/default ratio so it lands on the correct edge slot
	// instead of the off-screen position derived from a 0-width measurement.
	const handleObservedSizeChange = (newWidth: number, newHeight: number) => {
		if (newWidth === 0 || newHeight === 0) return;
		if (drag.isDragging() || drag.isSnapping()) return;
		if (isCollapseAnimating()) return;

		if (isCollapsed()) {
			const currentCollapsed = collapsedDimensions();
			if (currentCollapsed.width === newWidth && currentCollapsed.height === newHeight) return;
			setCollapsedDimensions({ width: newWidth, height: newHeight });
			return;
		}

		if (
			lastObservedExpandedSize.current && lastObservedExpandedSize.current.width === newWidth &&
				lastObservedExpandedSize.current.height === newHeight
		) {
			return;
		}
		lastObservedExpandedSize.current = { width: newWidth, height: newHeight };
		expandedDimensions.current = { width: newWidth, height: newHeight };
		setPosition(getPositionFromEdgeAndRatio(snapEdge(), positionRatio(), newWidth, newHeight));
	};

	// In scoped mode the toolbar is anchored to a container whose viewport box
	// moves as the page scrolls, so it must re-anchor on scroll. Repositioning
	// only (no ratio/resize dance) keeps it glued to the container edge.
	// rAF-coalesced: scroll events fire per frame (and from every nested
	// scroller, since the listener captures), but one reposition per frame is
	// all the anchor needs.
	const scopedScrollFrameId = useRef<number | null>(null);
	const handleScopedScroll = () => {
		if (drag.isDragging() || drag.isSnapping()) return;
		if (scopedScrollFrameId.current !== null) return;
		scopedScrollFrameId.current = nativeRequestAnimationFrame(() => {
			scopedScrollFrameId.current = null;
			recalculatePosition();
		});
	};

	const handleResize = () => {
		if (drag.isDragging()) return;

		setIsResizing(true);
		recalculatePosition();

		if (resizeTimeout.current) {
			clearTimeout(resizeTimeout.current);
		}

		resizeTimeout.current = setTimeout(() => {
			setIsResizing(false);

			const newRatio = getRatioFromPosition(
				snapEdge(),
				position().x,
				position().y,
				expandedDimensions.current.width,
				expandedDimensions.current.height,
			);
			setPositionRatio(newRatio);
			saveAndNotify({
				edge: snapEdge(),
				ratio: newRatio,
				collapsed: isCollapsed(),
				enabled: !isCollapsed(),
			});
		}, TOOLBAR_FADE_IN_DELAY_MS);
	};

	const saveAndNotify = (state: ToolbarState) => {
		const stateWithDefaultAction: ToolbarState = {
			...state,
			defaultAction: currentActionId(),
		};
		saveToolbarState(stateWithDefaultAction);
		props.onStateChange?.(stateWithDefaultAction);
	};

	useEffect(() => {
		const containerElement = containerRef.current;
		if (containerElement) {
			props.onContainerRef?.(containerElement);
		}

		const rect = containerElement?.getBoundingClientRect();
		const viewport = getVisualViewport();
		// The host's shadow DOM may still be detached from <body> when this
		// synchronous measurement runs (mountRoot defers attachment to
		// DOMContentLoaded, the renderer's dynamic import can resolve earlier).
		// A detached element returns a 0 rect, which would poison
		// expandedDimensions and place the toolbar off-screen. The ResizeObserver
		// installed below adopts the real size as soon as layout commits.
		const hasMeasurableRect = Boolean(rect && rect.width > 0 && rect.height > 0);

		// Because isCollapsed defaults to false the element is always rendered
		// expanded on initial mount, so rect reflects expanded dimensions here
		// regardless of savedState.collapsed. Using it for collapsed dimensions
		// would make the toolbar too wide after restoring a collapsed state.
		if (savedState) {
			if (hasMeasurableRect && rect) {
				expandedDimensions.current = { width: rect.width, height: rect.height };
			}
			setIsCollapsed(savedState.collapsed);
			const newPosition = getPositionFromEdgeAndRatio(
				savedState.edge,
				savedState.ratio,
				expandedDimensions.current.width,
				expandedDimensions.current.height,
			);
			setPosition(newPosition);
		} else if (hasMeasurableRect && rect) {
			expandedDimensions.current = { width: rect.width, height: rect.height };
			setPosition({
				x: viewport.offsetLeft + (viewport.width - rect.width) / 2,
				y: viewport.offsetTop + viewport.height - rect.height - TOOLBAR_SNAP_MARGIN_PX,
			});
			setPositionRatio(TOOLBAR_DEFAULT_POSITION_RATIO);
		} else {
			const defaultPosition = getPositionFromEdgeAndRatio(
				'bottom',
				TOOLBAR_DEFAULT_POSITION_RATIO,
				expandedDimensions.current.width,
				expandedDimensions.current.height,
			);
			setPosition(defaultPosition);
			setPositionRatio(TOOLBAR_DEFAULT_POSITION_RATIO);
		}

		const unsubscribeStateChanges = props.onSubscribeToStateChanges?.((state: ToolbarState) => {
			if (isCollapseAnimating()) return;

			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;

			const didCollapsedChange = isCollapsed() !== state.collapsed;

			syncCollapsedDimensionsToEdge(snapEdge(), state.edge);
			setSnapEdge(state.edge);

			if (didCollapsedChange && !state.collapsed) {
				const collapsedPos = currentPosition();
				setIsCollapseAnimating(true);
				setIsCollapsed(state.collapsed);
				const { position: expandedPosition, ratio: newRatio } = getExpandedFromCollapsed(
					collapsedPos,
					state.edge,
				);
				setPosition(expandedPosition);
				setPositionRatio(newRatio);
				scheduleCollapseAnimationEnd();
			} else {
				if (didCollapsedChange) {
					setIsCollapseAnimating(true);
					scheduleCollapseAnimationEnd();
				}
				setIsCollapsed(state.collapsed);
				const newPosition = getPositionFromEdgeAndRatio(
					state.edge,
					state.ratio,
					expandedDimensions.current.width,
					expandedDimensions.current.height,
				);
				setPosition(newPosition);
				setPositionRatio(state.ratio);
			}
		});

		window.addEventListener('resize', handleResize);
		window.visualViewport?.addEventListener('resize', handleResize);
		window.visualViewport?.addEventListener('scroll', handleResize);
		// Scoped re-anchoring only matters when init() was given a container
		// (`container` is public library API, not demo-only); unscoped pages —
		// the normal case — register nothing and pay nothing on scroll. The scope
		// is init-only and set before the renderer mounts, so checking once here
		// (and in the matching cleanup) is stable.
		const scopeContainer = getScopeContainer();
		let scopeResizeObserver: ResizeObserver | undefined;
		if (scopeContainer) {
			window.addEventListener('scroll', handleScopedScroll, { passive: true, capture: true });
			// The container's box is the toolbar's viewport, so a layout-only
			// container resize (e.g. a responsive aspect-ratio change) must
			// re-anchor just like a scroll does.
			if (typeof ResizeObserver !== 'undefined') {
				scopeResizeObserver = new ResizeObserver(handleScopedScroll);
				scopeResizeObserver.observe(scopeContainer);
			}
		}

		let observer: ResizeObserver | undefined;
		if (typeof ResizeObserver !== 'undefined' && containerElement) {
			observer = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (!entry) return;
				// entry.contentRect reports content-box, which omits padding; the rest
				// of the toolbar measures border-box via getBoundingClientRect, so
				// mixing them would underestimate the toolbar by its `px-2 py-1.5`
				// padding. borderBoxSize is widely supported (Chrome 84+, Safari 15.4+,
				// Firefox 69+); fall back to getBoundingClientRect for older runtimes.
				const borderBox = entry.borderBoxSize?.[0];
				let width: number;
				let height: number;
				if (borderBox) {
					width = borderBox.inlineSize;
					height = borderBox.blockSize;
				} else {
					const rect = containerRef.current?.getBoundingClientRect();
					if (!rect) return;
					width = rect.width;
					height = rect.height;
				}
				handleObservedSizeChange(width, height);
			});
			observer.observe(containerElement);
		}

		const fadeInTimeout = setTimeout(() => {
			setIsVisible(true);
		}, TOOLBAR_FADE_IN_DELAY_MS);

		return () => {
			unsubscribeStateChanges?.();
			scopeResizeObserver?.disconnect();
			observer?.disconnect();
			clearTimeout(fadeInTimeout);
			window.removeEventListener('resize', handleResize);
			window.visualViewport?.removeEventListener('resize', handleResize);
			window.visualViewport?.removeEventListener('scroll', handleResize);
			// Unconditional: removing a never-added listener is a no-op, and the scope
			// singleton may already be cleared by init's own cleanup at this point.
			window.removeEventListener('scroll', handleScopedScroll, { capture: true });
			if (scopedScrollFrameId.current !== null) nativeCancelAnimationFrame(
				scopedScrollFrameId.current,
			);
			clearTimeout(resizeTimeout.current);
			clearTimeout(collapseAnimationTimeout.current);

			if (unfreezeUpdatesCallback.current) releaseInteractionFreeze();
		};
	}, []);

	const currentPosition = () => {
		const collapsed = isCollapsed();
		return collapsed ? computeCollapsedPosition() : position();
	};

	const getCursorClass = (): string => {
		if (isCollapsed()) {
			return 'cursor-pointer';
		}
		if (drag.isDragging()) {
			return 'cursor-grabbing';
		}
		return 'cursor-grab';
	};

	const isInteracting = (): boolean =>
		isToolbarHovered() || Boolean(resolveProp(props.isContextMenuOpen)) || drag.isDragging() ||
			drag.isSnapping() ||
			isCollapseAnimating() ||
			isChevronPressed();

	const shouldDim = (): boolean => Boolean(resolveProp(props.isActive)) && !isInteracting();

	const getTransitionClass = (): string => {
		// Drag must follow the pointer frame-to-frame; any transform transition
		// here would lag the toolbar behind the cursor.
		if (isResizing() || drag.isDragging()) {
			return '';
		}
		if (drag.isSnapping()) {
			return 'transition-[transform,opacity] duration-300 ease-out';
		}
		if (isCollapseAnimating()) {
			const duration = isCollapsed() ? 'duration-140' : 'duration-220';
			return `transition-[transform,opacity] ${duration} ease-drawer`;
		}
		return 'transition-[transform,opacity] duration-400 ease-drawer';
	};

	const getTransformOrigin = (): string => {
		const edge = snapEdge();
		switch (edge) {
			case 'top':
				return 'center top';
			case 'bottom':
				return 'center bottom';
			case 'left':
				return 'left center';
			case 'right':
				return 'right center';
			default:
				return 'center center';
		}
	};

	const rootClass = useProp(
		() => cn(
			'fixed left-0 top-0 font-sans text-[13px] antialiased select-none',
			getCursorClass(),
			getTransitionClass(),
			// freeze-pseudo-states sets `html { pointer-events: none !important }`
			// during grab; the toolbar must opt back in to stay clickable.
			isVisible() ? 'pointer-events-auto' : 'pointer-events-none',
		),
	);
	const rootTransform = useProp(
		() => `translate(${currentPosition().x}px, ${currentPosition().y}px) scale(${
			shouldDim() ? 0.97 : 1
		})`,
	);
	const rootOpacity = useProp(() => (!isVisible() ? 0 : shouldDim() ? 0.55 : 1));
	const transformOrigin = useProp(getTransformOrigin);
	const collapsed = useProp(isCollapsed);
	const edge = useProp(snapEdge);
	const shaking = useProp(isShaking);
	const chevronPressed = useProp(isChevronPressed);
	const actionId = useProp(currentActionId);
	const actionLabel = useProp(currentActionLabel);
	const currentActionActive = useProp(isCurrentActionActive);
	const iconRotation = useProp(selectIconRotationDeg);
	const actionIcon = useProp(() => actionIconClass(isCurrentActionActive()));
	const wrapperClass = useProp(actionButtonWrapperClass);
	const selectTooltipVisible = useProp(() => isTooltipVisible(currentActionId()));
	const selectTooltipPosition = useProp(tooltipPosition);
	const selectTooltip = useProp(currentActionLabel);
	const selectLabel = useProp(
		() => `${
			isCurrentActionActive() ? 'Stop selecting element' : `${currentActionLabel()} element`
		}`,
	);

	return <div
		ref={(element) => {
			containerRef.current = element;
		}}
		data-react-grab-ignore-events
		data-react-grab-toolbar
		class={rootClass}
		style={{
			zIndex: String(Z_INDEX_OVERLAY),
			transform: rootTransform,
			transformOrigin,
			opacity: rootOpacity,
		}}
		onPointerDown={(event) => {
			stopEventPropagation(event);
			drag.handlePointerDown(event);
		}}
		onMouseDown={stopEventPropagation}
		onMouseEnter={() => {
			setIsToolbarHovered(true);
			if (!isCollapsed()) props.onSelectHoverChange?.(true);
		}}
		onMouseLeave={() => {
			setIsToolbarHovered(false);
			props.onSelectHoverChange?.(false);
		}}
	>
		<ToolbarContent
			isCollapsed={collapsed}
			snapEdge={edge}
			isShaking={shaking}
			isChevronPressed={chevronPressed}
			transformOrigin={transformOrigin}
			onAnimationEnd={() => setIsShaking(false)}
			onCollapseClick={handleToggleCollapse}
			onCollapsePointerDown={() => setIsChevronPressed(true)}
			onCollapsePointerUp={() => setIsChevronPressed(false)}
			onCollapsePointerLeave={() => setIsChevronPressed(false)}
			onPanelClick={(event) => {
				if (isCollapsed()) {
					event.stopPropagation();
					expandToolbarFromCollapsed();
				}
			}}
			actionButtons={<ToolbarActionButton
				actionId={actionId}
				isToggle
				ref={(element: HTMLButtonElement | null) => {
					selectButtonRef.current = element;
				}}
				label={selectLabel}
				isActive={currentActionActive}
				class={actionButtonClass}
				wrapperClass={wrapperClass}
				onClick={handleToggle}
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
					setHoveredActionId(null);
					props.onToggleToolbarMenu?.();
				}}
				{...createFreezeHandlers(currentActionId)}
				icon={<IconSelect size={14} rotationDeg={iconRotation} class={actionIcon} />}
				tooltipVisible={selectTooltipVisible}
				tooltipPosition={selectTooltipPosition}
				tooltip={selectTooltip}
			/>}
		/>
	</div>;
});
