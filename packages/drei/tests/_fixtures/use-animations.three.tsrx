import { useAnimations } from '@octanejs/drei';

export function UseAnimationsScene(props) @{
	const api = useAnimations(props.clips, props.root);
	props.onApi(api);
	null;
}
