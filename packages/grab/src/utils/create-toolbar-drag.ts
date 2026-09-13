import type { Position } from '../types.js';
import type { SnapEdge } from '../components/toolbar/state.js';
import { TOOLBAR_DRAG_THRESHOLD_PX, TOOLBAR_SNAP_ANIMATION_DURATION_MS } from '../constants.js';
import { onCleanup } from '../reactivity/index.js';
import { nativeCancelAnimationFrame, nativeRequestAnimationFrame } from './native-raf.js';
import { ignoreRealInput } from './runtime-mode.js';
import {
	getRatioFromPosition,
	getPositionFromEdgeAndRatio,
	getSnapPosition,
} from './toolbar-position.js';

interface ToolbarDragConfig {
	getContainerRef: () => HTMLDivElement | undefined;
	isCollapsed: () => boolean;
	getExpandedDimensions: () => { width: number; height: number };
	onDragStart: () => void;
	onPositionUpdate: (position: Position) => void;
	onSnapEdgeChange: (edge: SnapEdge, ratio: number) => void;
	onSnapComplete: (result: {
		edge: SnapEdge;
		ratio: number;
		position: Position;
		expandedDimensions: { width: number; height: number };
	}) => void;
	onSnapAnimationEnd?: () => void;
}

interface ToolbarDragResult {
	// `useSyncExternalStore(subscribe, isDragging)` /
	// `useSyncExternalStore(subscribe, isSnapping)` drive the toolbar's reactive
	// drag/snap state without a reactive runtime.
	subscribe: (listener: () => void) => () => void;
	isDragging: () => boolean;
	isSnapping: () => boolean;
	handlePointerDown: (event: PointerEvent) => void;
	createDragAwareHandler: (callback: () => void) => (event: MouseEvent) => void;
	dispose: () => void;
}

export const createToolbarDrag = (config: ToolbarDragConfig): ToolbarDragResult => {
	let isDraggingState = false;
	let isSnappingState = false;
	// hasDragMoved and velocity are internal-only, so they never notify subscribers.
	let hasDragMoved = false;
	let velocity: Position = { x: 0, y: 0 };
	let dragOffset: Position = { x: 0, y: 0 };

	let lastPointerPosition = { x: 0, y: 0, time: 0 };
	let pointerStartPosition = { x: 0, y: 0 };
	let didDragOccur = false;
	let snapAnimationFrame: number | undefined;
	let snapAnimationTimeout: ReturnType<typeof setTimeout> | undefined;
	let dragAbortController: AbortController | null = null;

	const listeners = new Set<() => void>();
	const notify = (): void => {
		for (const listener of [...listeners]) listener();
	};

	const setIsDragging = (value: boolean): void => {
		if (isDraggingState === value) return;
		isDraggingState = value;
		notify();
	};

	const setIsSnapping = (value: boolean): void => {
		if (isSnappingState === value) return;
		isSnappingState = value;
		notify();
	};

	const teardownDragListeners = () => {
		dragAbortController?.abort();
		dragAbortController = null;
	};

	const cancelSnapAnimationFrame = () => {
		if (snapAnimationFrame === undefined) return;
		nativeCancelAnimationFrame(snapAnimationFrame);
		snapAnimationFrame = undefined;
	};

	const handleWindowPointerMove = (event: PointerEvent) => {
		if (!hasDragMoved) {
			const distanceMoved = Math.hypot(
				event.clientX - pointerStartPosition.x,
				event.clientY - pointerStartPosition.y,
			);
			if (distanceMoved <= TOOLBAR_DRAG_THRESHOLD_PX) {
				return;
			}
			hasDragMoved = true;
			config.onDragStart();
		}

		const now = performance.now();
		const deltaTime = now - lastPointerPosition.time;

		if (deltaTime > 0) {
			const newVelocityX = (event.clientX - lastPointerPosition.x) / deltaTime;
			const newVelocityY = (event.clientY - lastPointerPosition.y) / deltaTime;
			velocity = { x: newVelocityX, y: newVelocityY };
		}

		lastPointerPosition = { x: event.clientX, y: event.clientY, time: now };

		const newX = event.clientX - dragOffset.x;
		const newY = event.clientY - dragOffset.y;

		config.onPositionUpdate({ x: newX, y: newY });
	};

	const handleWindowPointerUp = () => {
		teardownDragListeners();

		const didMove = hasDragMoved;
		setIsDragging(false);

		if (!didMove) {
			return;
		}

		didDragOccur = true;

		const containerRef = config.getContainerRef();
		const rect = containerRef?.getBoundingClientRect();
		if (!rect) return;

		const currentVelocity = velocity;
		const snap = getSnapPosition(
			rect.left,
			rect.top,
			rect.width,
			rect.height,
			currentVelocity.x,
			currentVelocity.y,
		);
		const ratio = getRatioFromPosition(snap.edge, snap.x, snap.y, rect.width, rect.height);

		config.onSnapEdgeChange(snap.edge, ratio);
		setIsSnapping(true);

		// Two nested rAFs are needed because an edge change may switch the toolbar
		// orientation (horizontal to vertical), altering its dimensions. The first
		// frame waits for the DOM update and the second for layout to settle so
		// getBoundingClientRect returns the post-transition size.
		cancelSnapAnimationFrame();
		snapAnimationFrame = nativeRequestAnimationFrame(() => {
			const postRenderRect = containerRef?.getBoundingClientRect();
			const updatedDimensions = postRenderRect
				? { width: postRenderRect.width, height: postRenderRect.height }
				: config.getExpandedDimensions();

			snapAnimationFrame = nativeRequestAnimationFrame(() => {
				snapAnimationFrame = undefined;
				const snappedPosition = getPositionFromEdgeAndRatio(
					snap.edge,
					ratio,
					updatedDimensions.width,
					updatedDimensions.height,
				);

				config.onSnapComplete({
					edge: snap.edge,
					ratio,
					position: snappedPosition,
					expandedDimensions: updatedDimensions,
				});

				snapAnimationTimeout = setTimeout(() => {
					setIsSnapping(false);
					config.onSnapAnimationEnd?.();
				}, TOOLBAR_SNAP_ANIMATION_DURATION_MS);
			});
		});
	};

	const handlePointerDown = ignoreRealInput((event: PointerEvent) => {
		if (event.button !== 0) return;
		if (config.isCollapsed() || isSnappingState) return;

		const containerRef = config.getContainerRef();
		const rect = containerRef?.getBoundingClientRect();
		if (!rect) return;

		pointerStartPosition = { x: event.clientX, y: event.clientY };

		dragOffset = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
		setIsDragging(true);
		hasDragMoved = false;
		velocity = { x: 0, y: 0 };
		lastPointerPosition = {
			x: event.clientX,
			y: event.clientY,
			time: performance.now(),
		};

		teardownDragListeners();
		dragAbortController = new AbortController();
		const { signal } = dragAbortController;
		window.addEventListener('pointermove', handleWindowPointerMove, { signal });
		window.addEventListener('pointerup', handleWindowPointerUp, { signal });
		window.addEventListener('pointercancel', handleWindowPointerUp, { signal });
	});

	const createDragAwareHandler = (callback: () => void) => (event: MouseEvent) => {
		event.stopImmediatePropagation();
		if (didDragOccur) {
			didDragOccur = false;
			return;
		}
		callback();
	};

	const dispose = (): void => {
		teardownDragListeners();
		cancelSnapAnimationFrame();
		clearTimeout(snapAnimationTimeout);
	};

	// When constructed inside a reactive root (adapted upstream suites), dispose
	// with the owner — same contract as Solid's onCleanup.
	onCleanup(dispose);

	return {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		isDragging: () => isDraggingState,
		isSnapping: () => isSnappingState,
		handlePointerDown,
		createDragAwareHandler,
		dispose,
	};
};
