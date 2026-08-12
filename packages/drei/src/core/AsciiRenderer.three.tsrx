/** @jsxImportSource @octanejs/three/intrinsics */
import { useFrame, useThree } from '@octanejs/three';
import { useEffect, useLayoutEffect, useMemo } from '@octanejs/three/renderer';
import { AsciiEffect } from 'three-stdlib';

export type AsciiRendererProps = {
	renderIndex?: number;
	bgColor?: string;
	fgColor?: string;
	characters?: string;
	invert?: boolean;
	color?: boolean;
	resolution?: number;
};

export function AsciiRenderer({
	renderIndex = 1,
	bgColor = 'black',
	fgColor = 'white',
	characters = ' .:-+*=%@#',
	invert = true,
	color = false,
	resolution = 0.15,
}: AsciiRendererProps) @{
	const { size, gl, scene, camera } = useThree();
	const canvas = gl.domElement as HTMLCanvasElement;
	const effect = useMemo(() => {
		// three-stdlib follows the workspace's newer Three types while the renderer
		// intentionally accepts the binding's structural renderer contract.
		const value = new AsciiEffect(gl as any, characters, { invert, color, resolution });
		value.domElement.style.position = 'absolute';
		value.domElement.style.top = '0px';
		value.domElement.style.left = '0px';
		value.domElement.style.pointerEvents = 'none';
		return value;
	}, [characters, invert, color, resolution]);

	useLayoutEffect(() => {
		effect.domElement.style.color = fgColor;
		effect.domElement.style.backgroundColor = bgColor;
	}, [fgColor, bgColor]);

	useEffect(() => {
		canvas.style.opacity = '0';
		canvas.parentNode!.appendChild(effect.domElement);
		return () => {
			canvas.style.opacity = '1';
			canvas.parentNode!.removeChild(effect.domElement);
		};
	}, [effect]);

	useEffect(() => {
		effect.setSize(size.width, size.height);
	}, [effect, size]);

	useFrame(() => {
		effect.render(scene as any, camera as any);
	}, renderIndex);

	null;
}
