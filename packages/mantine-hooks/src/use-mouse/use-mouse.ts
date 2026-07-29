import { useCallback, useEffect, useRef, useState } from 'octane';

export interface UseMouseReturnValue<T extends HTMLElement = any> {
	ref: React.RefCallback<T | null>;
	x: number;
	y: number;
}

export function useMouse<T extends HTMLElement = any>(
	options: { resetOnExit?: boolean } = { resetOnExit: false },
): UseMouseReturnValue<T> {
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const [element, setElement] = useState<T | null>(null);
	const elementRef = useRef<T | null>(null);
	const resetOnExit = typeof options === 'symbol' ? false : (options.resetOnExit ?? false);

	const refCallback: React.RefCallback<T | null> = useCallback((node) => {
		elementRef.current = node;
		setElement(node);

		return () => {
			if (elementRef.current === node) {
				elementRef.current = null;
				setElement(null);
			}
		};
	}, []);

	useEffect(() => {
		const target = element ?? document;
		const setMousePosition = (event: Event) => {
			const mouseEvent = event as globalThis.MouseEvent;
			if (element) {
				const rect = element.getBoundingClientRect();
				const x = Math.max(0, Math.round(mouseEvent.clientX - rect.left));
				const y = Math.max(0, Math.round(mouseEvent.clientY - rect.top));

				setPosition({ x, y });
			} else {
				setPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });
			}
		};

		const resetMousePosition = () => setPosition({ x: 0, y: 0 });

		target.addEventListener('mousemove', setMousePosition);
		if (element && resetOnExit) {
			element.addEventListener('mouseleave', resetMousePosition);
		}

		return () => {
			target.removeEventListener('mousemove', setMousePosition);
			if (element && resetOnExit) {
				element.removeEventListener('mouseleave', resetMousePosition);
			}
		};
	}, [element, resetOnExit]);

	return { ref: refCallback, ...position };
}

export interface UseMousePositionReturnValue {
	x: number;
	y: number;
}

export function useMousePosition(): UseMousePositionReturnValue {
	const [position, setPosition] = useState({ x: 0, y: 0 });

	useEffect(() => {
		const setMousePosition = (event: MouseEvent) => {
			setPosition({ x: event.clientX, y: event.clientY });
		};

		document.addEventListener('mousemove', setMousePosition);

		return () => {
			document.removeEventListener('mousemove', setMousePosition);
		};
	}, []);

	return position;
}

export namespace useMouse {
	export type ReturnValue<T extends HTMLElement> = UseMouseReturnValue<T>;
}

export namespace useMousePosition {
	export type ReturnValue = UseMousePositionReturnValue;
}
