import { useEffect, useMemo, useRef } from 'octane';
import { useDrawerContext } from './context';
import { assignStyle, chain, isVertical, reset } from './helpers';
import { BORDER_RADIUS, TRANSITIONS, WINDOW_TOP_OFFSET } from './constants';
import { subSlot } from './internal';

const noop = () => () => {};

export function useScaleBackground(slot?: symbol) {
	const { direction, isOpen, shouldScaleBackground, setBackgroundColorOnScale, noBodyStyles } =
		useDrawerContext(subSlot(slot, 'context'));
	const timeoutIdRef = useRef<number | null>(null, subSlot(slot, 'timeout'));
	const initialBackgroundColor = useMemo(
		() => (typeof document === 'undefined' ? '' : document.body.style.backgroundColor),
		[],
		subSlot(slot, 'background'),
	);

	function getScale() {
		return (window.innerWidth - WINDOW_TOP_OFFSET) / window.innerWidth;
	}

	useEffect(
		() => {
			if (isOpen && shouldScaleBackground) {
				if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
				const wrapper =
					(document.querySelector('[data-vaul-drawer-wrapper]') as HTMLElement) ||
					(document.querySelector('[vaul-drawer-wrapper]') as HTMLElement);

				if (!wrapper) return;

				chain(
					setBackgroundColorOnScale && !noBodyStyles
						? assignStyle(document.body, { background: 'black' })
						: noop,
					assignStyle(wrapper, {
						transformOrigin: isVertical(direction) ? 'top' : 'left',
						transitionProperty: 'transform, border-radius',
						transitionDuration: `${TRANSITIONS.DURATION}s`,
						transitionTimingFunction: `cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
					}),
				);

				const wrapperStylesCleanup = assignStyle(wrapper, {
					borderRadius: `${BORDER_RADIUS}px`,
					overflow: 'hidden',
					...(isVertical(direction)
						? {
								transform: `scale(${getScale()}) translate3d(0, calc(env(safe-area-inset-top) + 14px), 0)`,
							}
						: {
								transform: `scale(${getScale()}) translate3d(calc(env(safe-area-inset-top) + 14px), 0, 0)`,
							}),
				});

				return () => {
					wrapperStylesCleanup();
					timeoutIdRef.current = window.setTimeout(() => {
						if (initialBackgroundColor) {
							document.body.style.background = initialBackgroundColor;
						} else {
							document.body.style.removeProperty('background');
						}
					}, TRANSITIONS.DURATION * 1000);
				};
			}
		},
		[
			isOpen,
			shouldScaleBackground,
			initialBackgroundColor,
			direction,
			setBackgroundColorOnScale,
			noBodyStyles,
		],
		subSlot(slot, 'effect'),
	);
}
