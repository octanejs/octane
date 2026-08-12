/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeEvent, useThree } from '@octanejs/three';
import { useMemo, useState } from '@octanejs/three/renderer';
import { CanvasTexture } from 'three';
import { universalComponent } from 'octane/universal';
import { useGizmoContext } from './GizmoHelper.three.tsrx';

type AxisProps = { color: string; rotation: [number, number, number]; scale?: [number, number, number] };
type AxisHeadProps = Omit<ThreeElements['sprite'], 'ref'> & {
	arcStyle: string;
	label?: string;
	labelColor: string;
	axisHeadScale?: number;
	disabled?: boolean;
	font: string;
	onClick?: (event: ThreeEvent<MouseEvent>) => null;
};

type GizmoViewportProps = ThreeElements['group'] & {
	axisColors?: [string, string, string];
	axisScale?: [number, number, number];
	labels?: [string, string, string];
	axisHeadScale?: number;
	labelColor?: string;
	hideNegativeAxes?: boolean;
	hideAxisHeads?: boolean;
	disabled?: boolean;
	font?: string;
	onClick?: (event: ThreeEvent<MouseEvent>) => null;
};

function Axis({ scale = [0.8, 0.05, 0.05], color, rotation }: AxisProps) @{
	<group rotation={rotation}>
		<mesh position={[0.4, 0, 0]}>
			<boxGeometry args={scale} />
			<meshBasicMaterial color={color} toneMapped={false} />
		</mesh>
	</group>
}

function AxisHead({ onClick, font, disabled, arcStyle, label, labelColor, axisHeadScale = 1, ...props }: AxisHeadProps) @{
	const gl = useThree((state) => state.gl);
	const texture = useMemo(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const context = canvas.getContext('2d')!;
		context.beginPath();
		context.arc(32, 32, 16, 0, 2 * Math.PI);
		context.closePath();
		context.fillStyle = arcStyle;
		context.fill();
		if (label) {
			context.font = font;
			context.textAlign = 'center';
			context.fillStyle = labelColor;
			context.fillText(label, 32, 41);
		}
		return new CanvasTexture(canvas);
	}, [arcStyle, label, labelColor, font]);
	const [active, setActive] = useState(false);
	const scale = (label ? 1 : 0.75) * (active ? 1.2 : 1) * axisHeadScale;
	<sprite
		scale={scale}
		onPointerOver={!disabled ? (event) => { event.stopPropagation(); setActive(true); } : undefined}
		onPointerOut={!disabled ? onClick || ((event) => { event.stopPropagation(); setActive(false); }) : undefined}
		{...props}
	>
		<spriteMaterial map={texture} map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1} alphaTest={0.3} opacity={label ? 1 : 0.75} toneMapped={false} />
	</sprite>
}

type HeadsProps = {
	font: string; disabled?: boolean; labelColor: string; onClick?: (event: ThreeEvent<MouseEvent>) => null;
	axisHeadScale: number; pointerDown?: (event: ThreeEvent<PointerEvent>) => void;
	colors: [string, string, string]; labels: [string, string, string];
};

function PositiveHeads({ font, disabled, labelColor, onClick, axisHeadScale, pointerDown, colors, labels }: HeadsProps) @{
	<>
		<AxisHead font={font} disabled={disabled} labelColor={labelColor} onClick={onClick} axisHeadScale={axisHeadScale} onPointerDown={pointerDown} arcStyle={colors[0]} position={[1, 0, 0]} label={labels[0]} />
		<AxisHead font={font} disabled={disabled} labelColor={labelColor} onClick={onClick} axisHeadScale={axisHeadScale} onPointerDown={pointerDown} arcStyle={colors[1]} position={[0, 1, 0]} label={labels[1]} />
		<AxisHead font={font} disabled={disabled} labelColor={labelColor} onClick={onClick} axisHeadScale={axisHeadScale} onPointerDown={pointerDown} arcStyle={colors[2]} position={[0, 0, 1]} label={labels[2]} />
	</>
}

function AllHeads(props: HeadsProps) @{
	<>
		<PositiveHeads {...props} />
		<AxisHead font={props.font} disabled={props.disabled} labelColor={props.labelColor} onClick={props.onClick} axisHeadScale={props.axisHeadScale} onPointerDown={props.pointerDown} arcStyle={props.colors[0]} position={[-1, 0, 0]} />
		<AxisHead font={props.font} disabled={props.disabled} labelColor={props.labelColor} onClick={props.onClick} axisHeadScale={props.axisHeadScale} onPointerDown={props.pointerDown} arcStyle={props.colors[1]} position={[0, -1, 0]} />
		<AxisHead font={props.font} disabled={props.disabled} labelColor={props.labelColor} onClick={props.onClick} axisHeadScale={props.axisHeadScale} onPointerDown={props.pointerDown} arcStyle={props.colors[2]} position={[0, 0, -1]} />
	</>
}

function NoHeads() @{}

export function GizmoViewport({
	hideNegativeAxes,
	hideAxisHeads,
	disabled,
	font = '18px Inter var, Arial, sans-serif',
	axisColors = ['#ff2060', '#20df80', '#2080ff'],
	axisHeadScale = 1,
	axisScale,
	labels = ['X', 'Y', 'Z'],
	labelColor = '#000',
	onClick,
	...props
}: GizmoViewportProps) @{
	const [colorX, colorY, colorZ] = axisColors;
	const { tweenCamera } = useGizmoContext();
	const pointerDown = !disabled ? (event: ThreeEvent<PointerEvent>) => { tweenCamera(event.object.position); event.stopPropagation(); } : undefined;
	const headsComponent = hideAxisHeads ? NoHeads : hideNegativeAxes ? PositiveHeads : AllHeads;
	const headsProps: HeadsProps = { font, disabled, labelColor, onClick, axisHeadScale, pointerDown, colors: axisColors, labels };
	<group scale={40} {...props}>
		<Axis color={colorX} rotation={[0, 0, 0]} scale={axisScale} />
		<Axis color={colorY} rotation={[0, 0, Math.PI / 2]} scale={axisScale} />
		<Axis color={colorZ} rotation={[0, -Math.PI / 2, 0]} scale={axisScale} />
		{universalComponent('three', headsComponent as any, headsProps as unknown as Record<string, unknown>)}
	</group>
}
