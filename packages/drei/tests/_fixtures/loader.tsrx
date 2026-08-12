import { Loader } from '@octanejs/drei';

export function LoaderScene(props) @{
	<Loader
		containerStyles={props.containerStyles}
		barStyles={props.barStyles}
		dataInterpolation={props.dataInterpolation}
		initialState={props.initialState}
	/>
}
