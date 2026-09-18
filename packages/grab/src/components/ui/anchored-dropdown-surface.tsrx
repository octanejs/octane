import { useEffect, useRef } from 'octane';
import {
	resolveProp,
	runOnce,
	scoped,
	Show,
	useProp,
	type JSX,
	type OctaneNode,
} from '../../reactive.js';
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
export const AnchoredDropdownSurface = scoped<AnchoredDropdownSurfaceProps>((props) => {
	const containerRef = useRef<HTMLDivElement | null>(null);

	const dropdown = runOnce(
		() => createAnchoredDropdown(
			() => containerRef.current ?? undefined,
			() => resolveProp(props.position),
		),
	);

	const isInteractive = useProp(() => resolveProp(props.interactive) !== false);
	const shouldMount = useProp(dropdown.shouldMount);
	const isAnimatedIn = useProp(dropdown.isAnimatedIn);
	const displayPosition = useProp(dropdown.displayPosition);
	const lastAnchorEdge = useProp(dropdown.lastAnchorEdge);
	const dataAttribute = useProp(props.dataAttribute);

	useEffect(() => {
		dropdown.measure();
		const onDismiss = resolveProp(props.onDismiss);
		const unregisterOverlayDismiss =
			onDismiss
				? registerOverlayDismiss({
						isOpen: () => Boolean(resolveProp(props.position)),
						onDismiss,
					})
				: undefined;
		return () => {
			dropdown.clearAnimationHandles();
			unregisterOverlayDismiss?.();
		};
	}, []);

	return <Show when={shouldMount}>
		<div
			ref={(element) => {
				containerRef.current = element;
			}}
			data-react-grab-ignore-events
			data-react-grab-toolbar-menu={dataAttribute === 'data-react-grab-toolbar-menu'
				? true
				: undefined}
			data-react-grab-hierarchy-menu={dataAttribute === 'data-react-grab-hierarchy-menu'
				? true
				: undefined}
			class={cn(
				'fixed font-sans text-[13px] antialiased [filter:var(--rg-drop-shadow)] select-none will-change-[opacity,transform]',
				isAnimatedIn
					? 'transition-[opacity,transform] duration-220 ease-spring'
					: 'transition-[opacity,transform] duration-120 ease-drawer',
			)}
			style={{
				top: `${displayPosition.top}px`,
				left: `${displayPosition.left}px`,
				zIndex: `${Z_INDEX_OVERLAY}`,
				pointerEvents: isInteractive && isAnimatedIn ? 'auto' : 'none',
				transformOrigin: DROPDOWN_EDGE_TRANSFORM_ORIGIN[lastAnchorEdge],
				opacity: isAnimatedIn ? '1' : '0',
				transform: isAnimatedIn ? 'scale(1)' : 'scale(0.92)',
			}}
			onPointerDown={suppressMenuEvent}
			onMouseDown={suppressMenuEvent}
			onClick={suppressMenuEvent}
			onContextMenu={suppressMenuEvent}
		>{props.children}</div>
	</Show>;
});
