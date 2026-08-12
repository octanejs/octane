import { ScreenSizer } from '@octanejs/drei';

export function ScreenSizerScene(props) @{
	<ScreenSizer
		ref={props.sizerRef}
		scale={props.scale}
		position={props.position}
		name="screen-sizer"
	>
		<object3D name="content" />
	</ScreenSizer>
}
