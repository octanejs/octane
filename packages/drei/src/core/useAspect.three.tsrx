import { useThree } from '@octanejs/three';
import { slotDefault } from './compiler-slot.js';

export function useAspect(width: number, height: number, factor = 1): [number, number, number] {
	factor = slotDefault(factor, 1);
	const viewport = useThree((state) => state.viewport);
	const scale =
		viewport.aspect > width / height ? viewport.width / width : viewport.height / height;
	return [width * scale * factor, height * scale * factor, 1];
}
