import { Cloud, CloudInstance, Clouds } from '@octanejs/drei';

function LoadedCloudScene(props) @{
	<Clouds
		ref={props.ref}
		texture={props.texture}
		limit={props.limit}
		range={props.range}
		material={props.material}
		frustumCulled={props.frustumCulled}
		position={props.parentPosition}
	>
		<CloudInstance
			ref={props.firstRef}
			seed={props.firstSeed}
			segments={props.firstSegments}
			bounds={props.firstBounds}
			concentrate={props.firstConcentrate}
			volume={props.firstVolume}
			smallestVolume={props.firstSmallestVolume}
			distribute={props.firstDistribute}
			growth={props.firstGrowth}
			speed={props.firstSpeed}
			fade={props.firstFade}
			opacity={props.firstOpacity}
			color={props.firstColor}
			position={props.firstPosition}
		/>
		@if (props.showSecond) {
			<CloudInstance ref={props.secondRef} seed={props.secondSeed} segments={props.secondSegments} color={props.secondColor} />
		}
	</Clouds>
}

export function CloudScene(props) @{
	@try {
		<LoadedCloudScene {...props} />
	} @pending {
		<group name="loading" />
	}
}

function LoadedStandaloneCloud(props) @{
	<Cloud ref={props.ref} seed={props.seed} segments={props.segments} color={props.color} />
}

export function StandaloneCloudScene(props) @{
	@try {
		<LoadedStandaloneCloud {...props} />
	} @pending {
		<group name="loading" />
	}
}

export function CloudInstanceWithoutParentScene() @{
	<CloudInstance segments={1} />
}
