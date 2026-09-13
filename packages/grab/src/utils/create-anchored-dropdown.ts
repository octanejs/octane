import type { DropdownAnchor } from '../types.js';
import {
	DROPDOWN_ANCHOR_GAP_PX,
	DROPDOWN_ANIMATION_DURATION_MS,
	DROPDOWN_OFFSCREEN_POSITION,
	DROPDOWN_VIEWPORT_PADDING_PX,
} from '../constants.js';
import { getAnchoredDropdownPosition } from './get-anchored-dropdown-position.js';
import { getVisualViewport } from './get-visual-viewport.js';
import { getScopeContainer } from './runtime-mode.js';
import { nativeCancelAnimationFrame, nativeRequestAnimationFrame } from './native-raf.js';

interface AnchoredDropdownResult {
	// Bridge the snapshot getters through `useSyncExternalStore(subscribe, …)`.
	subscribe: (listener: () => void) => () => void;
	shouldMount: () => boolean;
	isAnimatedIn: () => boolean;
	lastAnchorEdge: () => DropdownAnchor['edge'];
	displayPosition: () => { left: number; top: number };
	setAnchor: (anchor: DropdownAnchor | null) => void;
	measure: () => void;
	dispose: () => void;
}

export const createAnchoredDropdown = (
	containerRef: () => HTMLDivElement | undefined,
): AnchoredDropdownResult => {
	let measuredWidth = 0;
	let measuredHeight = 0;
	let shouldMountState = false;
	let isAnimatedInState = false;
	let lastAnchorEdgeState: DropdownAnchor['edge'] = 'bottom';
	let currentAnchor: DropdownAnchor | null = null;
	// Reducer-style cache (was a `createMemo` seeded with the offscreen position):
	// keep the last on-screen position when a measurement is not yet available.
	let displayPositionState: { left: number; top: number } = DROPDOWN_OFFSCREEN_POSITION;

	let exitAnimationTimeout: ReturnType<typeof setTimeout> | undefined;
	let enterAnimationFrameId: number | undefined;

	let viewportListenersActive = false;
	let scopeResizeObserver: ResizeObserver | undefined;

	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of [...listeners]) listener();
	};

	const setShouldMount = (value: boolean): void => {
		if (shouldMountState === value) return;
		shouldMountState = value;
		notify();
	};
	const setIsAnimatedIn = (value: boolean): void => {
		if (isAnimatedInState === value) return;
		isAnimatedInState = value;
		notify();
	};
	const setLastAnchorEdge = (value: DropdownAnchor['edge']): void => {
		if (lastAnchorEdgeState === value) return;
		lastAnchorEdgeState = value;
		notify();
	};

	const clearAnimationHandles = () => {
		clearTimeout(exitAnimationTimeout);
		if (enterAnimationFrameId !== undefined) {
			nativeCancelAnimationFrame(enterAnimationFrameId);
			enterAnimationFrameId = undefined;
		}
	};

	// Scope-aware: inside a scoped instance (demo showcases) the container's box
	// is the viewport, so the dropdown stays within the showcase card instead of
	// spilling over the host page. Only recompute when the position actually
	// moves so the snapshot reference stays stable for useSyncExternalStore.
	const recomputeDisplayPosition = (): void => {
		const viewport = getVisualViewport();
		const position = getAnchoredDropdownPosition({
			anchor: currentAnchor,
			measuredWidth,
			measuredHeight,
			viewportLeft: viewport.offsetLeft,
			viewportTop: viewport.offsetTop,
			viewportWidth: viewport.width,
			viewportHeight: viewport.height,
			anchorGapPx: DROPDOWN_ANCHOR_GAP_PX,
			viewportPaddingPx: DROPDOWN_VIEWPORT_PADDING_PX,
			offscreenPosition: DROPDOWN_OFFSCREEN_POSITION,
		});
		if (position.left === DROPDOWN_OFFSCREEN_POSITION.left) return;
		if (position.left === displayPositionState.left && position.top === displayPositionState.top) {
			return;
		}
		displayPositionState = position;
		notify();
	};

	const measure = () => {
		const container = containerRef();
		if (container) {
			measuredWidth = container.offsetWidth;
			measuredHeight = container.offsetHeight;
		}
		recomputeDisplayPosition();
	};

	const handleViewportChange = () => {
		// A scroll/resize can move the viewport box even when dimensions are
		// unchanged, so always re-measure and recompute for this tick.
		measure();
	};

	const addViewportListeners = (): void => {
		if (viewportListenersActive) return;
		viewportListenersActive = true;
		window.addEventListener('resize', handleViewportChange);
		window.visualViewport?.addEventListener('resize', handleViewportChange);
		window.visualViewport?.addEventListener('scroll', handleViewportChange);
		// Scoped instances clamp to the container's box, so its resizes must
		// invalidate the position like a window resize does.
		const scopeContainer = getScopeContainer();
		if (scopeContainer && typeof ResizeObserver !== 'undefined') {
			scopeResizeObserver = new ResizeObserver(handleViewportChange);
			scopeResizeObserver.observe(scopeContainer);
		}
	};

	const removeViewportListeners = (): void => {
		if (!viewportListenersActive) return;
		viewportListenersActive = false;
		window.removeEventListener('resize', handleViewportChange);
		window.visualViewport?.removeEventListener('resize', handleViewportChange);
		window.visualViewport?.removeEventListener('scroll', handleViewportChange);
		scopeResizeObserver?.disconnect();
		scopeResizeObserver = undefined;
	};

	const setAnchor = (anchor: DropdownAnchor | null): void => {
		currentAnchor = anchor;
		// Only add/remove listeners on the open/close transition; repeated calls
		// while open (the anchor object changes as the toolbar tracks its rect)
		// are idempotent no-ops.
		if (anchor !== null) {
			addViewportListeners();
			setLastAnchorEdge(anchor.edge);
			clearTimeout(exitAnimationTimeout);
			setShouldMount(true);
			if (enterAnimationFrameId !== undefined) nativeCancelAnimationFrame(enterAnimationFrameId);
			// The rAF waits for layout so dimensions are non-zero. The forced reflow
			// via offsetHeight then commits the computed position before the opacity
			// transition starts, preventing a flash at the offscreen initial position.
			enterAnimationFrameId = nativeRequestAnimationFrame(() => {
				enterAnimationFrameId = undefined;
				measure();
				void containerRef()?.offsetHeight;
				setIsAnimatedIn(true);
			});
		} else {
			removeViewportListeners();
			if (enterAnimationFrameId !== undefined) nativeCancelAnimationFrame(enterAnimationFrameId);
			setIsAnimatedIn(false);
			exitAnimationTimeout = setTimeout(() => {
				setShouldMount(false);
			}, DROPDOWN_ANIMATION_DURATION_MS);
		}
		recomputeDisplayPosition();
	};

	const dispose = (): void => {
		clearAnimationHandles();
		removeViewportListeners();
	};

	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		shouldMount: () => shouldMountState,
		isAnimatedIn: () => isAnimatedInState,
		lastAnchorEdge: () => lastAnchorEdgeState,
		displayPosition: () => displayPositionState,
		setAnchor,
		measure,
		dispose,
	};
};
