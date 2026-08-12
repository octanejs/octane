import { useBoxProjectedEnv } from '@octanejs/drei';

export function BoxProjectedEnvScene(props) @{
	const spread = useBoxProjectedEnv(props.position, props.size);
	props.onSpread(spread);
	<mesh>
		<meshStandardMaterial {...spread} />
	</mesh>
}
