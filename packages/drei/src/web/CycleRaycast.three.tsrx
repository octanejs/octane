import { type RefObject, useThree } from '@octanejs/three';
import { useEffect, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';

type CycleRaycastProps = {
	onChanged?: (hits: THREE.Intersection[], cycle: number) => null;
	preventDefault?: boolean;
	scroll?: boolean;
	keyCode?: number;
	portal?: RefObject<HTMLElement>;
};

export function CycleRaycast({
	onChanged,
	portal,
	preventDefault = true,
	scroll = true,
	keyCode = 9,
}: CycleRaycastProps) @{
	const cycle = useRef(0);
	const setEvents = useThree((state) => state.setEvents);
	const get = useThree((state) => state.get);
	const renderer = useThree((state) => state.gl);
	useEffect(() => {
		let hits: THREE.Intersection[] = [];
		let lastEvent: PointerEvent = undefined!;
		const previous = get().events.filter;
		const target = portal?.current ?? (renderer.domElement as Node).parentNode;
		const renderStatus = () =>
			target && onChanged && onChanged(hits, Math.round(cycle.current) % hits.length);
		setEvents({
			filter: (intersections, state) => {
				let clone = [...intersections];
				if (
					clone.length !== hits.length ||
						!hits.every((hit) => clone.map((entry) => entry.object.uuid).includes(hit.object.uuid))
				) {
					cycle.current = 0;
					hits = clone;
					renderStatus();
				}
				if (previous) clone = previous(clone, state);
				for (let index = 0; index < Math.round(cycle.current) % clone.length; index++) {
					const first = clone.shift() as THREE.Intersection;
					clone = [...clone, first];
				}
				return clone;
			},
		});
		const refresh = (update: (current: number) => number) => {
			cycle.current = update(cycle.current);
			get().events.handlers?.onPointerCancel(undefined as any);
			get().events.handlers?.onPointerMove(lastEvent);
			renderStatus();
		};
		const tabEvent = (event: KeyboardEvent) => {
			if ((event.keyCode || event.which) === keyCode) {
				if (preventDefault) event.preventDefault();
				if (hits.length > 1) refresh((current) => current + 1);
			}
		};
		const wheelEvent = (event: WheelEvent) => {
			if (preventDefault) event.preventDefault();
			let delta = 0;
			if ((event as any).wheelDelta) delta = (event as any).wheelDelta / 120;
			else if (event.detail) delta = -event.detail / 3;
			if (hits.length > 1) refresh((current) => Math.abs(current - delta));
		};
		const moveEvent = (event: PointerEvent) => (lastEvent = event);
		document.addEventListener('pointermove', moveEvent, { passive: true });
		if (scroll) document.addEventListener('wheel', wheelEvent);
		if (keyCode !== undefined) document.addEventListener('keydown', tabEvent);
		return () => {
			setEvents({ filter: previous });
			if (keyCode !== undefined) document.removeEventListener('keydown', tabEvent);
			if (scroll) document.removeEventListener('wheel', wheelEvent);
			document.removeEventListener('pointermove', moveEvent);
		};
	}, [renderer, get, setEvents, preventDefault, scroll, keyCode]);
	null;
}
