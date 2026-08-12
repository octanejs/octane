import { TransformControls } from '@octanejs/drei';

export function TransformControlsScene(props) @{
	<TransformControls
		ref={props.ref}
		object={props.object}
		makeDefault={props.makeDefault}
		enabled={props.enabled}
		axis={props.axis}
		mode={props.mode}
		translationSnap={props.translationSnap}
		rotationSnap={props.rotationSnap}
		scaleSnap={props.scaleSnap}
		space={props.space}
		size={props.size}
		showX={props.showX}
		showY={props.showY}
		showZ={props.showZ}
		onChange={props.onChange}
		onMouseDown={props.onMouseDown}
		onMouseUp={props.onMouseUp}
		onObjectChange={props.onObjectChange}
		name="controlled-group"
	>
		<mesh name="controlled-child" />
	</TransformControls>
}
