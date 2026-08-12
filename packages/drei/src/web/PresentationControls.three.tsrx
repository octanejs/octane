/** @jsxImportSource @octanejs/three/intrinsics */
import { useFrame, useThree } from '@octanejs/three';
import { useEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { easing } from 'maath';
import type { OctaneNode } from 'octane';
import { Group, MathUtils } from 'three';
import { useGesture } from './useGesture.js';

export type PresentationControlProps = {
	snap?: Boolean | number;
	global?: boolean;
	cursor?: boolean;
	speed?: number;
	zoom?: number;
	rotation?: [number, number, number];
	polar?: [number, number];
	azimuth?: [number, number];
	damping?: number;
	enabled?: boolean;
	children?: OctaneNode;
	domElement?: HTMLElement;
};

export function PresentationControls({
	enabled = true, snap, global, domElement, cursor = true, children, speed = 1, rotation = [0, 0, 0], zoom = 1,
	polar = [0, Math.PI / 2], azimuth = [-Infinity, Infinity], damping = 0.25,
}: PresentationControlProps) @{
	const events = useThree((state) => state.events);
	const gl = useThree((state) => state.gl);
	const canvas = gl.domElement as HTMLElement;
	const size = useThree((state) => state.size);
	const target = domElement || events.connected || canvas;
	const rPolar = useMemo(() => [rotation[0] + polar[0], rotation[0] + polar[1]] as [number, number], [rotation[0], polar[0], polar[1]]);
	const rAzimuth = useMemo(() => [rotation[1] + azimuth[0], rotation[1] + azimuth[1]] as [number, number], [rotation[1], azimuth[0], azimuth[1]]);
	const rInitial = useMemo(() => [MathUtils.clamp(rotation[0], ...rPolar), MathUtils.clamp(rotation[1], ...rAzimuth), rotation[2]], [rotation[0], rotation[1], rotation[2], rPolar, rAzimuth]);
	useEffect(() => {
		if (global && cursor && enabled) {
			target.style.cursor = 'grab'; canvas.style.cursor = '';
			return () => { target.style.cursor = 'default'; canvas.style.cursor = 'default'; };
		}
	}, [global, cursor, target, enabled]);
	const [animation] = useState({ scale: 1, rotation: rInitial, damping });
	const ref = useRef<Group | null>(null);
	useFrame((_state, delta) => {
		if (!ref.current) return;
		easing.damp3(ref.current.scale, animation.scale, animation.damping, delta);
		easing.dampE(ref.current.rotation, animation.rotation as any, animation.damping, delta);
	});
	const bind = useGesture({
		onHover: ({ last }: any) => { if (cursor && !global && enabled) target.style.cursor = last ? 'auto' : 'grab'; },
		onDrag: ({ down, delta: [deltaX, deltaY], memo: [oldY, oldX] = animation.rotation || rInitial }: any) => {
			if (!enabled) return [deltaY, deltaX];
			if (cursor) target.style.cursor = down ? 'grabbing' : 'grab';
			const x = MathUtils.clamp(oldX + (deltaX / size.width) * Math.PI * speed, ...rAzimuth);
			const y = MathUtils.clamp(oldY + (deltaY / size.height) * Math.PI * speed, ...rPolar);
			animation.scale = down && y > rPolar[1] / 2 ? zoom : 1;
			animation.rotation = snap && !down ? rInitial : [y, x, 0];
			animation.damping = snap && !down && typeof snap !== 'boolean' ? snap as number : damping;
			return [y, x];
		},
	}, { target: global ? target : undefined });
	<group ref={ref} {...((bind?.() ?? {}) as any)}>{children}</group>
}
