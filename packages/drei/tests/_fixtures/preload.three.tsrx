import { Preload } from '@octanejs/drei';

export function PreloadScene(props) @{
	<>
		<group name="default-content">
			<object3D name="hidden" visible={false} />
		</group>
		<Preload all={props.all} scene={props.scene} camera={props.camera} />
	</>
}
