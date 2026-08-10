/** @jsxImportSource @octanejs/three/intrinsics */
import { Progress } from '@octanejs/drei';

export function ProgressScene(props) @{
	<Progress children={props.children} />
}

export function ProgressBlockScene() @{
	<Progress>
		<group name="progress-block-child" />
	</Progress>
}
