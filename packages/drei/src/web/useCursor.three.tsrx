import { useEffect } from '@octanejs/three/renderer';
import { slotDefault } from '../core/compiler-slot.js';

export function useCursor(
	hovered: boolean,
	onPointerOver = 'pointer',
	onPointerOut = 'auto',
	container: HTMLElement = document.body,
) {
	onPointerOver = slotDefault(onPointerOver, 'pointer');
	onPointerOut = slotDefault(onPointerOut, 'auto');
	container = slotDefault(container, document.body);
	useEffect(() => {
		if (hovered) {
			container.style.cursor = onPointerOver;
			return () => void (container.style.cursor = onPointerOut);
		}
	}, [hovered]);
}
