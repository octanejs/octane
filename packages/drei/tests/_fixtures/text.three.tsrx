import { Text } from '@octanejs/drei';

export function TextScene(props) @{
	<Text
		ref={props.textRef}
		font={props.font}
		fontSize={props.fontSize}
		color={props.color}
		onSync={props.onSync}
		children={[props.label, <mesh name="nested-child" />]}
	/>
}
