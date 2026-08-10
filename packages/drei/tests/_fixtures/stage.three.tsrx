import { Stage } from '@octanejs/drei';

export function StageScene(props) @{
	<Stage
		preset={props.preset}
		shadows={props.shadows}
		adjustCamera={false}
		environment={null}
		intensity={props.intensity}
		name="stage-bounds"
	>
		<mesh name="model" position={[1, 2, 3]}>
			<boxGeometry args={[2, 4, 6]} />
			<meshBasicMaterial />
		</mesh>
	</Stage>
}
