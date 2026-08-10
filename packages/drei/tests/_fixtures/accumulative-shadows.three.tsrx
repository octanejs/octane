import { AccumulativeShadows, RandomizedLight } from '@octanejs/drei';

export function AccumulativeShadowsScene(props) @{
	<AccumulativeShadows
		ref={props.apiRef}
		frames={props.frames}
		blend={props.blend}
		temporal={props.temporal}
		opacity={props.opacity}
		alphaTest={props.alphaTest}
		color={props.color}
		colorBlend={props.colorBlend}
		resolution={props.resolution}
		scale={props.scale}
		name="accumulative"
	>
		<RandomizedLight
			ref={props.lightApiRef}
			amount={props.amount}
			position={[2, 4, 3]}
			radius={2}
			ambient={0.25}
			intensity={6}
			bias={0.002}
			mapSize={128}
			size={7}
			near={0.2}
			far={80}
			name="randomized"
		/>
	</AccumulativeShadows>
}
