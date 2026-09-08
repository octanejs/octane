import { useEffect, useRef } from 'octane';

interface ScrollManagerOptions {
	enabled: boolean;
	captureEnabled: boolean;
	lockEnabled: boolean;
	target: { current: HTMLElement | null };
	onBottomArrive?: (event: WheelEvent | TouchEvent) => void;
	onTopArrive?: (event: WheelEvent | TouchEvent) => void;
}

let activeScrollLocks = 0;
let originalBodyStyle: {
	boxSizing: string;
	height: string;
	overflow: string;
	paddingRight: string;
	position: string;
} | null = null;

function cancelScroll(event: Event) {
	if (event.cancelable) event.preventDefault();
	event.stopPropagation();
}

export function useScrollManager(options: ScrollManagerOptions) {
	const atBottom = useRef(false);
	const atTop = useRef(false);
	const touchStart = useRef(0);

	useEffect(() => {
		const element = options.target.current;
		if (!options.enabled || !options.captureEnabled || !element) return;

		const handleDelta = (event: WheelEvent | TouchEvent, delta: number) => {
			const { scrollTop, scrollHeight, clientHeight } = element;
			const available = scrollHeight - clientHeight - scrollTop;
			let nextDelta = delta;
			if (delta > available && available > 0) {
				element.scrollTop = scrollHeight;
				nextDelta = 0;
			} else if (delta > 0 && available <= 0) {
				if (!atBottom.current) options.onBottomArrive?.(event);
				atBottom.current = true;
				nextDelta = 0;
			} else if (delta < -scrollTop && scrollTop > 0) {
				element.scrollTop = 0;
				nextDelta = 0;
			} else if (delta < 0 && scrollTop <= 0) {
				if (!atTop.current) options.onTopArrive?.(event);
				atTop.current = true;
				nextDelta = 0;
			}
			if (nextDelta !== 0) {
				atTop.current = false;
				atBottom.current = false;
			}
			if (nextDelta === 0) cancelScroll(event);
		};
		const onWheel = (event: WheelEvent) => handleDelta(event, event.deltaY);
		const onTouchStart = (event: TouchEvent) => {
			touchStart.current = event.changedTouches[0]?.clientY ?? 0;
		};
		const onTouchMove = (event: TouchEvent) => {
			const next = event.changedTouches[0]?.clientY ?? touchStart.current;
			handleDelta(event, touchStart.current - next);
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		element.addEventListener('touchstart', onTouchStart, { passive: false });
		element.addEventListener('touchmove', onTouchMove, { passive: false });
		return () => {
			element.removeEventListener('wheel', onWheel);
			element.removeEventListener('touchstart', onTouchStart);
			element.removeEventListener('touchmove', onTouchMove);
		};
	}, [
		options.captureEnabled,
		options.enabled,
		options.onBottomArrive,
		options.onTopArrive,
		options.target,
	]);

	useEffect(() => {
		if (!options.enabled || !options.lockEnabled || typeof document === 'undefined') return;
		const style = document.body.style;
		if (activeScrollLocks === 0) {
			originalBodyStyle = {
				boxSizing: style.boxSizing,
				height: style.height,
				overflow: style.overflow,
				paddingRight: style.paddingRight,
				position: style.position,
			};
			const currentPadding = Number.parseInt(originalBodyStyle.paddingRight, 10) || 0;
			const scrollbar = window.innerWidth - document.body.clientWidth;
			style.boxSizing = 'border-box';
			style.height = '100%';
			style.overflow = 'hidden';
			style.position = 'relative';
			style.paddingRight = `${scrollbar + currentPadding}px`;
		}
		activeScrollLocks += 1;
		return () => {
			activeScrollLocks = Math.max(activeScrollLocks - 1, 0);
			if (activeScrollLocks === 0 && originalBodyStyle) {
				Object.assign(style, originalBodyStyle);
				originalBodyStyle = null;
			}
		};
	}, [options.enabled, options.lockEnabled]);
}
