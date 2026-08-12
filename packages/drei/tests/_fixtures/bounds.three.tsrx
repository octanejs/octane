import { Bounds, useBounds } from '@octanejs/drei';

function ApiCapture(props) @{
	const api = useBounds();
	props.onApi(api);
	null;
}

export function BoundsScene(props) @{
	<Bounds
		maxDuration={props.maxDuration}
		margin={props.margin}
		observe={props.observe}
		fit={props.fit}
		clip={props.clip}
		interpolateFunc={props.interpolateFunc}
		onFit={props.onFit}
	>
		<mesh position={[2, 3, 4]}>
			<boxGeometry args={[2, 4, 6]} />
			<meshBasicMaterial />
		</mesh>
		<ApiCapture onApi={props.onApi} />
	</Bounds>
}
