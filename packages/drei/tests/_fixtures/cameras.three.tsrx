import { CubeCamera, OrthographicCamera, PerspectiveCamera, useCubeCamera } from '@octanejs/drei';

export function PerspectiveScene(props) @{
	<PerspectiveCamera
		ref={props.cameraRef}
		makeDefault={props.makeDefault}
		manual={props.manual}
		frames={props.frames}
		resolution={props.resolution}
		envMap={props.envMap}
		name="perspective"
		children={props.children}
	/>
}

export function PerspectiveContentScene(props) @{
	<PerspectiveCamera ref={props.cameraRef} name="perspective">
		<group name="camera-child" />
	</PerspectiveCamera>
}

export function OrthographicScene(props) @{
	<OrthographicCamera
		ref={props.cameraRef}
		makeDefault={props.makeDefault}
		manual={props.manual}
		frames={props.frames}
		resolution={props.resolution}
		envMap={props.envMap}
		name="orthographic"
		children={props.children}
	/>
}

export function UseCubeCameraScene(props) @{
	const value = useCubeCamera(props.options);
	props.onValue(value);
	null;
}

export function CubeCameraScene(props) @{
	<CubeCamera
		name="cube-root"
		frames={props.frames}
		resolution={props.resolution}
		near={props.near}
		far={props.far}
		children={props.children}
	/>
}
