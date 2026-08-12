import { Point, Points, PointsBuffer } from '@octanejs/drei';

export function PointsInstancesScene(props) @{
	<Points ref={props.ref} limit={props.limit} range={props.range} position={props.parentPosition}>
		<Point ref={props.firstRef} position={props.firstPosition} size={props.firstSize} color={props.firstColor} />
		@if (props.showSecond) {
			<Point ref={props.secondRef} position={props.secondPosition} size={props.secondSize} color={props.secondColor} />
		}
	</Points>
}

export function PointsBufferScene(props) @{
	<PointsBuffer
		ref={props.ref}
		positions={props.positions}
		colors={props.colors}
		sizes={props.sizes}
		stride={props.stride}
	/>
}

export function PointsDispatchBufferScene(props) @{
	<Points
		ref={props.ref}
		positions={props.positions}
		colors={props.colors}
		sizes={props.sizes}
		stride={props.stride}
	/>
}

export function PointWithoutParentScene() @{
	<Point position={[0, 0, 0]} />
}
