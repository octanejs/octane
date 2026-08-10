import { Resize } from '@octanejs/drei';

export function ResizeScene(props) @{
	<Resize
		ref={props.resizeRef}
		width={props.width}
		height={props.height}
		depth={props.depth}
		box3={props.box3}
		precise={props.precise}
		name="resize"
	>
		<mesh position={[2, 3, 4]}>
			<boxGeometry args={[2, 4, 8]} />
			<meshBasicMaterial />
		</mesh>
	</Resize>
}
