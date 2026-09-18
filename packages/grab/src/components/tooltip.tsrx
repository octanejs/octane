import { useEffect, useRef, useState } from 'octane';
import { Show, useProp } from '../reactive.js';
import type { Component } from '../reactive.js';
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

export const Tooltip: Component<TooltipProps> = (props) => {
	const [delayedVisible, setDelayedVisible, getDelayedVisible] = useState(false);
	const [shouldAnimate, setShouldAnimate] = useState(true);
	const visible = useProp(props.visible);
	const position = useProp(props.position);
	const textContent = useProp(props.textContent);
	const delayTimeoutId = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		if (delayTimeoutId.current !== undefined) {
			clearTimeout(delayTimeoutId.current);
			delayTimeoutId.current = undefined;
		}

		if (visible) {
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
			if (getDelayedVisible()) {
				lastCloseTimestamp = Date.now();
			}
			setDelayedVisible(false);
		}
	}, [visible]);

	useEffect(() => {
		return () => {
			if (delayTimeoutId.current !== undefined) {
				clearTimeout(delayTimeoutId.current);
			}
			if (getDelayedVisible()) {
				lastCloseTimestamp = Date.now();
			}
		};
	}, []);

	const positionStyle = (): Record<string, string> => {
		const isHorizontal = position === 'top' || position === 'bottom';
		if (isHorizontal) {
			return { left: '50%', translate: '-50%', zIndex: `${Z_INDEX_OVERLAY}` };
		}
		return { top: '50%', translate: '0 -50%', zIndex: `${Z_INDEX_OVERLAY}` };
	};

	return <Show when={delayedVisible}>
		<div
			class={cn(
				'absolute whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-sans font-medium leading-4 pointer-events-none',
				'bg-[var(--rg-panel-bg)] text-[var(--rg-text-primary)] [box-shadow:var(--rg-shadow)]',
				position === 'top' && 'bottom-full mb-2.5',
				position === 'bottom' && 'top-full mt-2.5',
				position === 'left' && 'right-full mr-2.5',
				position === 'right' && 'left-full ml-2.5',
				shouldAnimate && 'animate-tooltip-fade-in',
			)}
			style={positionStyle()}
		>{textContent}</div>
	</Show>;
};
