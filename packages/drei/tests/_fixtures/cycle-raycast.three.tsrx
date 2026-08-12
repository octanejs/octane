import { CycleRaycast } from '@octanejs/drei';

export function CycleRaycastScene(props) @{
	<CycleRaycast
		onChanged={props.onChanged}
		portal={props.portal}
		preventDefault={props.preventDefault}
		scroll={props.scroll}
		keyCode={props.keyCode}
	/>
}
