import { Mask, MeshDiscardMaterial, PointMaterial, ScreenQuad, useMask } from '@octanejs/drei';

export function DiscardScene(props) @{
	<mesh>
		<MeshDiscardMaterial ref={props.materialRef} transparent />
	</mesh>
}

export function PointMaterialScene(props) @{
	<points>
		<PointMaterial ref={props.materialRef} size={3} color="hotpink" />
	</points>
}

export function ScreenQuadScene(props) @{
	<ScreenQuad ref={props.meshRef} name="screen-quad">
		<meshBasicMaterial />
	</ScreenQuad>
}

export function MaskScene(props) @{
	<Mask
		ref={props.meshRef}
		id={props.id}
		colorWrite={props.colorWrite}
		depthWrite={props.depthWrite}
	>
		<meshBasicMaterial />
	</Mask>
}

export function UseMaskScene(props) @{
	const values = useMask(props.id, props.inverse);
	props.onValue(values);
	null;
}
