import { useEffect, useMemo, useState } from 'octane';
import type { FC } from 'react';
import useMeasure from '../../internal/useMeasure.tsrx';
import type {
	RectReadOnly,
	Options as BaseUseMeasureOptions,
} from '../../internal/useMeasure.tsrx';

import type { PortalProps } from '../Portal.tsrx';
import Portal from '../Portal.tsrx';
import type { TooltipProps } from '../tooltips/Tooltip.tsrx';
import Tooltip from '../tooltips/Tooltip.tsrx';
import TooltipWithBounds from '../tooltips/TooltipWithBounds.tsrx';

export type TooltipInPortalProps =
	TooltipProps & Pick<UseTooltipPortalOptions, 'detectBounds' | 'zIndex'>;

export type UseTooltipInPortal = {
	/** Ref callback to be attached to the container element for boundary detection. */
	containerRef: (element: HTMLElement | SVGElement | null) => void;
	/** The bounding box of the container element. */
	containerBounds: RectReadOnly;
	/** Function to force a refresh of the container bounds. */
	forceRefreshBounds: () => void;
	/** Component to render the tooltip in a portal. */
	TooltipInPortal: FC<TooltipInPortalProps>;
};

export type UseTooltipPortalOptions = Pick<PortalProps, 'zIndex'> & {
		/** whether TooltipWithBounds should be used to auto-detect (page) boundaries and reposition itself. */
		detectBounds?: boolean;
		/** Debounce resize or scroll events in milliseconds (needed for positioning) */
		debounce?: number | { scroll: number; resize: number };
		/** React to nested scroll changes, don't use this if you know your view is static */
		scroll?: boolean;
		/** You can optionally inject a ResizeObserver polyfill. */
		polyfill?: BaseUseMeasureOptions['polyfill'];
	};

/**
 * Hook that handles rendering of a Tooltip or TooltipWithBounds in a Portal.
 * Handles conversion of container coordinates to page coordinates using the container bounds.
 */
export default function useTooltipInPortal(
	{
		detectBounds: detectBoundsOption = true,
		zIndex: zIndexOption,
		...useMeasureOptions
	}: UseTooltipPortalOptions | undefined = {},
): UseTooltipInPortal {
	const [containerRef, containerBounds, forceRefreshBounds] = useMeasure(useMeasureOptions);
	// Keep the server and the first hydration render on the same browser-free path.
	// The effect flips this only after Octane has adopted the existing DOM.
	const [isSsr, setIsSsr] = useState(true);

	useEffect(() => {
		setIsSsr(false);
	}, []);

	const TooltipInPortal = useMemo(
		() => function ({
			left: containerLeft = 0,
			top: containerTop = 0,
			detectBounds: detectBoundsProp, // allow override at component-level
			zIndex: zIndexProp, // allow override at the component-level
			...tooltipProps
		}: TooltipInPortalProps) {
			const detectBounds =
				detectBoundsProp == null ? detectBoundsOption : detectBoundsProp;
			const zIndex =
				zIndexProp == null ? zIndexOption : zIndexProp;
			const TooltipComponent = detectBounds ? TooltipWithBounds : Tooltip;
			// convert container coordinates to page coordinates
			const scrollX = isSsr ? 0 : window.scrollX;
			const scrollY = isSsr ? 0 : window.scrollY;
			const portalLeft = containerLeft + (containerBounds.left || 0) + scrollX;
			const portalTop = containerTop + (containerBounds.top || 0) + scrollY;

			return <Portal zIndex={zIndex}>
				<TooltipComponent left={portalLeft} top={portalTop} {...tooltipProps} />
			</Portal>;
		},
		[detectBoundsOption, zIndexOption, containerBounds.left, containerBounds.top, isSsr],
	);

	return {
		containerRef,
		containerBounds,
		forceRefreshBounds,
		TooltipInPortal,
	};
}
