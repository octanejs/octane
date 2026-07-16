function SceneMesh(props) @{
	<mesh name={props.item.name} position={props.item.position} scale={props.item.scale}>
		<boxGeometry args={props.item.size} />
		<meshBasicMaterial color={props.item.color} />
	</mesh>
}

export function BasicScene(props) @{
	<group args={props.groupArgs} name={props.name} position={props.position} ref={props.groupRef}>
		@for (const item of props.items; key item.id) {
			<SceneMesh item={item} />
		}
	</group>
}
