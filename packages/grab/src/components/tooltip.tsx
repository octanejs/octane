/** @jsxImportSource octane */
import { useEffect, useRef, useState } from 'octane';
import { cn } from '../utils/cn.js';
import { TOOLTIP_DELAY_MS, TOOLTIP_GRACE_PERIOD_MS, Z_INDEX_OVERLAY } from '../constants.js';

let lastCloseTimestamp = 0;

const wasTooltipRecentlyVisible = () => {
	return Date.now() - lastCloseTimestamp < TOOLTIP_GRACE_PERIOD_MS;
};

interface TooltipProps {
	visible: boolean;
	position: 'top' | 'bottom' | 'left' | 'right';
	textContent: string;
}

export const Tooltip = (props: TooltipProps) => {
	const [, setDelayedVisible, delayedVisible] = useState(false);
	const [, setShouldAnimate, shouldAnimate] = useState(true);
	const delayTimeoutId = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	// Mirrors the former `createEffect(on(() => props.visible, ...))`: run on
	// mount and whenever visibility flips.
	useEffect(() => {
		const isVisible = props.visible;
		if (delayTimeoutId.current !== undefined) {
			clearTimeout(delayTimeoutId.current);
			delayTimeoutId.current = undefined;
		}

		if (isVisible) {
			// Reopening within the grace period skips the delay and the fade so
			// moving between adjacent buttons reads as one continuous tooltip.
			if (wasTooltipRecentlyVisible()) {
				setShouldAnimate(false);
				setDelayedVisible(true);
			} else {
				setShouldAnimate(true);
				delayTimeoutId.current = setTimeout(() => {
					setDelayedVisible(true);
				}, TOOLTIP_DELAY_MS);
			}
		} else {
			if (delayedVisible()) {
				lastCloseTimestamp = Date.now();
			}
			setDelayedVisible(false);
		}
	}, [props.visible]);

	useEffect(() => {
		return () => {
			if (delayTimeoutId.current !== undefined) {
				clearTimeout(delayTimeoutId.current);
			}
			if (delayedVisible()) {
				lastCloseTimestamp = Date.now();
			}
		};
	}, []);

	const positionStyle = (): Record<string, string | number> => {
		const isHorizontal = props.position === 'top' || props.position === 'bottom';
		if (isHorizontal) {
			return { left: '50%', translate: '-50%', zIndex: Z_INDEX_OVERLAY };
		}
		return { top: '50%', translate: '0 -50%', zIndex: Z_INDEX_OVERLAY };
	};

	return (
		delayedVisible() && (
			<div
				class={cn(
					'absolute whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-sans font-medium leading-4 pointer-events-none',
					'bg-[var(--rg-panel-bg)] text-[var(--rg-text-primary)] [box-shadow:var(--rg-shadow)]',
					props.position === 'top' && 'bottom-full mb-2.5',
					props.position === 'bottom' && 'top-full mt-2.5',
					props.position === 'left' && 'right-full mr-2.5',
					props.position === 'right' && 'left-full ml-2.5',
					shouldAnimate() && 'animate-tooltip-fade-in',
				)}
				style={positionStyle()}
			>
				{props.textContent as string}
			</div>
		)
	);
};
