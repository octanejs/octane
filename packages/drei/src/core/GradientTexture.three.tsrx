/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, useThree } from '@octanejs/three';
import { useMemo } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { GradientType } from './gradient-types.js';

export { GradientType } from './gradient-types.js';

export type GradientTextureProps =
	{
		stops: number[];
		colors: THREE.ColorRepresentation[];
		attach?: string;
		size?: number;
		width?: number;
		type?: GradientType;
		innerCircleRadius?: number;
		outerCircleRadius?: string | number;
	} & Omit<ThreeElements['texture'], 'args' | 'type'>;

export function GradientTexture({
	stops,
	colors,
	size = 1024,
	width = 16,
	type = GradientType.Linear,
	innerCircleRadius = 0,
	outerCircleRadius = 'auto',
	...props
}: GradientTextureProps) @{
	const gl = useThree((state) => state.gl);
	const canvas = useMemo(() => {
		const value = document.createElement('canvas');
		const context = value.getContext('2d')!;
		value.width = width;
		value.height = size;
		let gradient: CanvasGradient;
		if (type === GradientType.Linear) {
			gradient = context.createLinearGradient(0, 0, 0, size);
		} else {
			const centerX = value.width / 2;
			const centerY = value.height / 2;
			const radius =
				outerCircleRadius !== 'auto'
					? Math.abs(Number(outerCircleRadius))
					: Math.sqrt(centerX ** 2 + centerY ** 2);
			gradient = context.createRadialGradient(
				centerX,
				centerY,
				Math.abs(innerCircleRadius),
				centerX,
				centerY,
				radius,
			);
		}
		const color = new THREE.Color();
		let index = stops.length;
		while (index--) gradient.addColorStop(stops[index], color.set(colors[index]).getStyle());
		context.save();
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, size);
		context.restore();
		return value;
	}, [stops]);
	<canvasTexture colorSpace={gl.outputColorSpace} args={[canvas]} attach="map" {...props as any} />
}
