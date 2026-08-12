import { MarchingCube, MarchingCubes, MarchingPlane } from '@octanejs/drei';

export function MarchingCubesScene(props) @{
	<MarchingCubes
		ref={props.ref}
		resolution={props.resolution}
		maxPolyCount={props.maxPolyCount}
		enableUvs={props.enableUvs}
		enableColors={props.enableColors}
	>
		<MarchingCube
			ref={props.cubeRef}
			position={[0.2, -0.4, 0.6]}
			strength={props.cubeStrength}
			subtract={props.cubeSubtract}
			color={props.color}
		/>
		<MarchingPlane
			ref={props.planeRef}
			planeType={props.planeType}
			strength={props.planeStrength}
			subtract={props.planeSubtract}
		/>
	</MarchingCubes>
}
