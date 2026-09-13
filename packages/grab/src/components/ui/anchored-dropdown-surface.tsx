/** @jsxImportSource octane */
import { useEffect, useMemo, useRef, useSyncExternalStore, type OctaneNode } from 'octane';
import type { DropdownAnchor } from '../../types.js';
import { DROPDOWN_EDGE_TRANSFORM_ORIGIN, Z_INDEX_OVERLAY } from '../../constants.js';
import { cn } from '../../utils/cn.js';
import { suppressMenuEvent } from '../../utils/suppress-menu-event.js';
import { createAnchoredDropdown } from '../../utils/create-anchored-dropdown.js';
import { registerOverlayDismiss } from '../../utils/register-overlay-dismiss.js';

interface AnchoredDropdownSurfaceProps {
	position: DropdownAnchor | null;
	// Test/debug hook applied as a bare attribute on the positioned container.
	dataAttribute: 'data-react-grab-toolbar-menu' | 'data-react-grab-hierarchy-menu';
	// When provided, the surface dismisses on outside click / Escape.
	onDismiss?: () => void;
	// When false the surface is display-only (pointer-events: none): it never
	// captures clicks, so page selection works through it. Defaults to true.
	interactive?: boolean;
	children: OctaneNode;
}

// Shared chrome for toolbar-anchored dropdowns: the mount/measure lifecycle,
// the spring/exit animation, viewport-clamped positioning, and the
// pointer-event suppression that keeps clicks inside the dropdown from leaking
// to the page. Consumers supply only their panel contents.
export const AnchoredDropdownSurface = (props: AnchoredDropdownSurfaceProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	// Octane props are per-render objects, unlike Solid's live getters, so keep
	// the latest props reachable from the mount-once listener callbacks.
	const propsRef = useRef(props);
	propsRef.current = props;

	const isInteractive = () => props.interactive !== false;

	// The dropdown controller owns the mount/measure/animation lifecycle and must
	// persist across renders, so create it once and bridge its state through
	// useSyncExternalStore.
	const dropdown = useMemo(
		() => createAnchoredDropdown(() => containerRef.current ?? undefined),
		[],
	);
	const shouldMount = useSyncExternalStore(dropdown.subscribe, dropdown.shouldMount);
	const isAnimatedIn = useSyncExternalStore(dropdown.subscribe, dropdown.isAnimatedIn);
	const lastAnchorEdge = useSyncExternalStore(dropdown.subscribe, dropdown.lastAnchorEdge);
	const displayPosition = useSyncExternalStore(dropdown.subscribe, dropdown.displayPosition);

	useEffect(() => {
		dropdown.setAnchor(props.position);
	}, [props.position]);

	useEffect(() => {
		dropdown.measure();
		const unregisterOverlayDismiss = propsRef.current.onDismiss
			? registerOverlayDismiss({
					isOpen: () => Boolean(propsRef.current.position),
					onDismiss: () => propsRef.current.onDismiss?.(),
				})
			: undefined;

		return () => {
			dropdown.dispose();
			unregisterOverlayDismiss?.();
		};
	}, []);

	return (
		shouldMount && (
			<div
				ref={containerRef}
				data-react-grab-ignore-events
				{...{ [props.dataAttribute]: '' }}
				class={cn(
					'fixed font-sans text-[13px] antialiased [filter:var(--rg-drop-shadow)] select-none will-change-[opacity,transform]',
					isAnimatedIn
						? 'transition-[opacity,transform] duration-220 ease-spring'
						: 'transition-[opacity,transform] duration-120 ease-drawer',
				)}
				style={{
					top: `${displayPosition.top}px`,
					left: `${displayPosition.left}px`,
					zIndex: Z_INDEX_OVERLAY,
					pointerEvents: isInteractive() && isAnimatedIn ? 'auto' : 'none',
					transformOrigin: DROPDOWN_EDGE_TRANSFORM_ORIGIN[lastAnchorEdge],
					opacity: isAnimatedIn ? 1 : 0,
					transform: isAnimatedIn ? 'scale(1)' : 'scale(0.92)',
				}}
				onPointerDown={suppressMenuEvent}
				onMouseDown={suppressMenuEvent}
				onClick={suppressMenuEvent}
				onContextMenu={suppressMenuEvent}
			>
				{props.children}
			</div>
		)
	);
};
