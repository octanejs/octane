import { DragControls } from '@octanejs/drei';
import { useThree } from '@octanejs/three';

export function DragControlsScene(props) @{
	const state = useThree();
	state.controls = props.controls;
	<DragControls
		ref={props.controlRef}
		autoTransform={props.autoTransform}
		matrix={props.matrix}
		axisLock={props.axisLock}
		dragLimits={props.dragLimits}
		onHover={props.onHover}
		onDragStart={props.onDragStart}
		onDrag={props.onDrag}
		onDragEnd={props.onDragEnd}
		dragConfig={props.dragConfig}
		name="drag-controls"
	>
		<mesh name="drag-child" />
	</DragControls>
}
