import * as React from 'octane';

type UseClickOutsideOptions = {
	/** Whether the click-outside detection is active */
	enabled: boolean;
	/** Callback when a click outside is detected */
	onClickOutside: () => void;
	/** Whether to also close on Escape key press (default: true) */
	closeOnEscape?: boolean;
	/** Additional refs to consider as "inside" */
	additionalRefs?: React.RefObject<HTMLElement | null>[];
};

/**
 * Hook to detect clicks outside of a referenced element.
 * Returns a ref to attach to the element you want to detect clicks outside of.
 *
 * @example
 * ```tsx
 * const menuRef = useClickOutside({
 *   enabled: isMenuOpen,
 *   onClickOutside: () => setIsMenuOpen(false),
 * })
 *
 * return <div ref={menuRef}>Menu content</div>
 * ```
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>({
	enabled,
	onClickOutside,
	closeOnEscape = true,
	additionalRefs = [],
}: UseClickOutsideOptions): React.RefObject<T | null> {
	const ref = React.useRef<T>(null);
	const touchStartRef = React.useRef<{
		x: number;
		y: number;
		outside: boolean;
	} | null>(null);

	React.useEffect(() => {
		if (!enabled) return;

		const isInsideRefs = (target: Node) => {
			if (ref.current?.contains(target)) return true;
			for (const additionalRef of additionalRefs) {
				if (additionalRef.current?.contains(target)) return true;
			}
			return false;
		};

		// Mouse: handle on mousedown for immediate response
		const handleMouseDown = (event: MouseEvent) => {
			// If this mousedown was generated from a touch, ignore it
			if ((event as any).sourceCapabilities?.firesTouchEvents) return;

			if (!isInsideRefs(event.target as Node)) {
				onClickOutside();
			}
		};

		// Touch: only close if tap started AND ended outside
		const handleTouchStart = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (touch) {
				const target = event.target as Node;
				const startedOutside = !isInsideRefs(target);
				touchStartRef.current = {
					x: touch.clientX,
					y: touch.clientY,
					outside: startedOutside,
				};
			}
		};

		const handleTouchEnd = (event: TouchEvent) => {
			const start = touchStartRef.current;
			touchStartRef.current = null;

			if (!start) return;

			// Only consider closing if touch started outside
			if (!start.outside) return;

			const touch = event.changedTouches[0];
			if (!touch) return;

			// If finger moved more than 10px, it's a scroll not a tap
			const dx = Math.abs(touch.clientX - start.x);
			const dy = Math.abs(touch.clientY - start.y);
			if (dx > 10 || dy > 10) return;

			onClickOutside();
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClickOutside();
			}
		};

		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('touchstart', handleTouchStart, { passive: true });
		document.addEventListener('touchend', handleTouchEnd);
		if (closeOnEscape) {
			document.addEventListener('keydown', handleEscape);
		}

		return () => {
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchend', handleTouchEnd);
			if (closeOnEscape) {
				document.removeEventListener('keydown', handleEscape);
			}
		};
	}, [enabled, onClickOutside, closeOnEscape, additionalRefs]);

	return ref;
}
