import { Decal } from '@octanejs/drei';

export function DecalScene(props) @{
	<mesh name="parent">
		<boxGeometry args={[2, 2, 2]} />
		<meshBasicMaterial />
		<Decal
			ref={props.decalRef}
			position={props.position}
			rotation={props.rotation}
			scale={props.scale}
			debug={props.debug}
			polygonOffsetFactor={props.polygonOffsetFactor}
			depthTest={props.depthTest}
			map={props.map}
			name="decal"
		>
			<meshBasicMaterial color="hotpink" />
		</Decal>
	</mesh>
}
