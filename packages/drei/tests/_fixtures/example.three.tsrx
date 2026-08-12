import { Example } from '@octanejs/drei';

export function ExampleScene(props) @{
	<Example
		ref={props.apiRef}
		font={props.font}
		color={props.color}
		debug={props.debug}
		bevelSize={props.bevelSize}
		name="example"
		position={[1, 2, 3]}
	>
		<group name="user-child" />
	</Example>
}
