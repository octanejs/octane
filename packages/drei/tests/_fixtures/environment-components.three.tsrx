import { Environment, EnvironmentCube, EnvironmentMap, EnvironmentPortal } from '@octanejs/drei';

export function EnvironmentMapScene(props) @{
	<EnvironmentMap
		map={props.map}
		background={props.background}
		scene={props.targetScene}
		backgroundBlurriness={props.backgroundBlurriness}
		backgroundIntensity={props.backgroundIntensity}
		backgroundRotation={props.backgroundRotation}
		environmentIntensity={props.environmentIntensity}
		environmentRotation={props.environmentRotation}
	/>
}

function LoadedEnvironmentCube(props) @{
	<EnvironmentCube {...props} />
}

export function EnvironmentCubeScene(props) @{
	@try {
		<LoadedEnvironmentCube {...props} />
	} @pending {
		<group name="loading" />
	}
}

export function EnvironmentPortalScene(props) @{
	<EnvironmentPortal
		map={props.map}
		background={props.background}
		frames={props.frames}
		near={props.near}
		far={props.far}
		resolution={props.resolution}
	>
		<group ref={props.childRef} name="portal-child" position={[1, 2, 3]} />
	</EnvironmentPortal>
}

function LoadedGroundEnvironment(props) @{
	<Environment {...props} />
}

export function EnvironmentGroundScene(props) @{
	@try {
		<LoadedGroundEnvironment {...props} />
	} @pending {
		<group name="loading" />
	}
}

export function EnvironmentMapRouteScene(props) @{
	<Environment map={props.map} background={props.background} />
}
