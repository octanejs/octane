import { applyProps, type RefObject, useThree } from '@octanejs/three';
import { useState } from '@octanejs/three/renderer';
import { Camera, type Intersection, Raycaster } from 'three';
import { slotDefault } from './compiler-slot.js';

export function useCamera(camera: Camera | RefObject<Camera>, props?: Partial<Raycaster>) {
	props = slotDefault(props, undefined);
	const pointer = useThree((state) => state.pointer);
	const [raycast] = useState(() => {
		const raycaster = new Raycaster();
		if (props) applyProps(raycaster, props);
		return function (
			this: { constructor: { prototype: { raycast?: Function } } },
			_: Raycaster,
			intersects: Intersection[],
		): void {
			const activeCamera =
				camera instanceof Camera ? camera : camera.current;
			if (!activeCamera) return;
			raycaster.setFromCamera(pointer, activeCamera);
			const implementation = this.constructor.prototype.raycast?.bind(this);
			implementation?.(raycaster, intersects);
		};
	});
	return raycast;
}
