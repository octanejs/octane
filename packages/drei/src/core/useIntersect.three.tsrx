import { addAfterEffect, addEffect } from '@octanejs/three';
import { useEffect, useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type { Object3D } from 'three';

export function useIntersect<T extends Object3D>(onChange: (visible: boolean) => void) {
	const ref = useRef<T | null>(null);
	const check = useRef(false);
	const previous = useRef(false);
	const callback = useRef(onChange);
	useLayoutEffect(() => {
		callback.current = onChange;
	}, [onChange]);
	useEffect(() => {
		const object = ref.current;
		if (!object) return;
		const removeBefore = addEffect(() => {
			check.current = false;
			return true;
		});
		const oldOnBeforeRender = object.onBeforeRender;
		object.onBeforeRender = () => {
			check.current = true;
		};
		const removeAfter = addAfterEffect(() => {
			if (check.current !== previous.current) {
				previous.current = check.current;
				callback.current(previous.current);
			}
			return true;
		});
		return () => {
			object.onBeforeRender = oldOnBeforeRender;
			removeBefore();
			removeAfter();
		};
	}, []);
	return ref;
}
