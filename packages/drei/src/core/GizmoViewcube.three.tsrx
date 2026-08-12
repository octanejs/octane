/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeEvent, useThree } from '@octanejs/three';
import { useMemo, useState } from '@octanejs/three/renderer';
import { CanvasTexture, Vector3 } from 'three';
import { useGizmoContext } from './GizmoHelper.three.tsrx';

type XYZ = [number, number, number];
type GizmoViewcubeProps = {
	font?: string;
	opacity?: number;
	color?: string;
	hoverColor?: string;
	textColor?: string;
	strokeColor?: string;
	onClick?: (event: ThreeEvent<MouseEvent>) => null;
	faces?: string[];
};
type FaceMaterialProps = GizmoViewcubeProps & { hover: boolean; index: number };
type EdgeCubeProps = GizmoViewcubeProps & { dimensions: XYZ; position: Vector3 };
const colors = { bg: '#f0f0f0', hover: '#999', text: 'black', stroke: 'black' };
const defaultFaces = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'];
const makePositionVector = (xyz: number[]) => new Vector3(...(xyz as XYZ)).multiplyScalar(0.38);
const corners = [[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]].map(makePositionVector);
const edges = [[1,1,0],[1,0,1],[1,0,-1],[1,-1,0],[0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1],[-1,1,0],[-1,0,1],[-1,0,-1],[-1,-1,0]].map(makePositionVector);
const cornerDimensions: XYZ = [0.25, 0.25, 0.25];
const edgeDimensions = edges.map((edge) => edge.toArray().map((axis) => axis === 0 ? 0.5 : 0.25) as XYZ);

function FaceMaterial({ hover, index, font = '20px Inter var, Arial, sans-serif', faces = defaultFaces, color = colors.bg, hoverColor = colors.hover, textColor = colors.text, strokeColor = colors.stroke, opacity = 1 }: FaceMaterialProps) @{
	const gl = useThree((state) => state.gl);
	const texture = useMemo(() => {
		const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
		const context = canvas.getContext('2d')!;
		context.fillStyle = color; context.fillRect(0, 0, 128, 128); context.strokeStyle = strokeColor; context.strokeRect(0, 0, 128, 128);
		context.font = font; context.textAlign = 'center'; context.fillStyle = textColor; context.fillText(faces[index]!.toUpperCase(), 64, 76);
		return new CanvasTexture(canvas);
	}, [index, faces, font, color, textColor, strokeColor]);
	<meshBasicMaterial map={texture} map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1} attach={`material-${index}`} color={hover ? hoverColor : 'white'} transparent opacity={opacity} />
}

function FaceCube(props: GizmoViewcubeProps) @{
	const { tweenCamera } = useGizmoContext();
	const [hover, setHover] = useState<number | null>(null);
	<mesh
		onPointerOut={(event) => { event.stopPropagation(); setHover(null); }}
		onPointerMove={(event) => { event.stopPropagation(); setHover(Math.floor(event.faceIndex! / 2)); }}
		onClick={props.onClick || ((event) => { event.stopPropagation(); tweenCamera(event.face!.normal); })}
	>
		<FaceMaterial index={0} hover={hover === 0} {...props} /><FaceMaterial index={1} hover={hover === 1} {...props} />
		<FaceMaterial index={2} hover={hover === 2} {...props} /><FaceMaterial index={3} hover={hover === 3} {...props} />
		<FaceMaterial index={4} hover={hover === 4} {...props} /><FaceMaterial index={5} hover={hover === 5} {...props} />
		<boxGeometry />
	</mesh>
}

function EdgeCube({ onClick, dimensions, position, hoverColor = colors.hover }: EdgeCubeProps) @{
	const { tweenCamera } = useGizmoContext();
	const [hover, setHover] = useState(false);
	<mesh scale={1.01} position={position}
		onPointerOver={(event) => { event.stopPropagation(); setHover(true); }}
		onPointerOut={(event) => { event.stopPropagation(); setHover(false); }}
		onClick={onClick || ((event) => { event.stopPropagation(); tweenCamera(position); })}
	>
		<meshBasicMaterial color={hover ? hoverColor : 'white'} transparent opacity={0.6} visible={hover} />
		<boxGeometry args={dimensions} />
	</mesh>
}

export function GizmoViewcube(props: GizmoViewcubeProps) @{
	<group scale={[60, 60, 60]}>
		<FaceCube {...props} />
		<EdgeCube position={edges[0]!} dimensions={edgeDimensions[0]!} {...props} /><EdgeCube position={edges[1]!} dimensions={edgeDimensions[1]!} {...props} />
		<EdgeCube position={edges[2]!} dimensions={edgeDimensions[2]!} {...props} /><EdgeCube position={edges[3]!} dimensions={edgeDimensions[3]!} {...props} />
		<EdgeCube position={edges[4]!} dimensions={edgeDimensions[4]!} {...props} /><EdgeCube position={edges[5]!} dimensions={edgeDimensions[5]!} {...props} />
		<EdgeCube position={edges[6]!} dimensions={edgeDimensions[6]!} {...props} /><EdgeCube position={edges[7]!} dimensions={edgeDimensions[7]!} {...props} />
		<EdgeCube position={edges[8]!} dimensions={edgeDimensions[8]!} {...props} /><EdgeCube position={edges[9]!} dimensions={edgeDimensions[9]!} {...props} />
		<EdgeCube position={edges[10]!} dimensions={edgeDimensions[10]!} {...props} /><EdgeCube position={edges[11]!} dimensions={edgeDimensions[11]!} {...props} />
		<EdgeCube position={corners[0]!} dimensions={cornerDimensions} {...props} /><EdgeCube position={corners[1]!} dimensions={cornerDimensions} {...props} />
		<EdgeCube position={corners[2]!} dimensions={cornerDimensions} {...props} /><EdgeCube position={corners[3]!} dimensions={cornerDimensions} {...props} />
		<EdgeCube position={corners[4]!} dimensions={cornerDimensions} {...props} /><EdgeCube position={corners[5]!} dimensions={cornerDimensions} {...props} />
		<EdgeCube position={corners[6]!} dimensions={cornerDimensions} {...props} /><EdgeCube position={corners[7]!} dimensions={cornerDimensions} {...props} />
	</group>
}
