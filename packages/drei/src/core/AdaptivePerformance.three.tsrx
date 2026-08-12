import { useThree } from '@octanejs/three';
import { useEffect } from '@octanejs/three/renderer';

export function AdaptiveEvents() @{
	const get = useThree((state) => state.get);
	const setEvents = useThree((state) => state.setEvents);
	const current = useThree((state) => state.performance.current);
	useEffect(() => {
		const enabled = get().events.enabled;
		return () => setEvents({ enabled });
	}, []);
	useEffect(() => setEvents({ enabled: current === 1 }), [current]);
	null;
}

export function BakeShadows() @{
	const gl = useThree((state) => state.gl);
	const shadowMap = gl.shadowMap!;
	useEffect(() => {
		shadowMap.autoUpdate = false;
		shadowMap.needsUpdate = true;
		return () => {
			shadowMap.autoUpdate = shadowMap.needsUpdate = true;
		};
	}, [shadowMap]);
	null;
}

export function AdaptiveDpr({ pixelated }: { pixelated?: boolean }) @{
	const gl = useThree((state) => state.gl);
	const active = useThree((state) => state.internal.active);
	const current = useThree((state) => state.performance.current);
	const initialDpr = useThree((state) => state.viewport.initialDpr);
	const setDpr = useThree((state) => state.setDpr);
	useEffect(() => {
		const domElement = gl.domElement as HTMLElement;
		return () => {
			if (active) setDpr(initialDpr);
			if (pixelated && domElement) domElement.style.imageRendering = 'auto';
		};
	}, []);
	useEffect(() => {
		setDpr(current * initialDpr);
		if (pixelated && gl.domElement) {
			(gl.domElement as HTMLElement).style.imageRendering = current === 1 ? 'auto' : 'pixelated';
		}
	}, [current]);
	null;
}
