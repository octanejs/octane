export function RootScene(props) @{
	<group name={props.name} ref={props.groupRef}>
		<mesh name="child" />
	</group>
}
