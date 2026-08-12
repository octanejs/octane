import { Parallax, ParallaxLayer } from '@octanejs/spring/parallax';

export function ParallaxFixture(props) @{
	<Parallax
		id="parallax"
		ref={props.api}
		pages={3}
		horizontal={props.horizontal}
		enabled={props.enabled}
	>
		<ParallaxLayer id="normal-layer" offset={1} speed={0.5}>
			normal
		</ParallaxLayer>
		<ParallaxLayer id="sticky-layer" sticky={{ start: 1, end: 2 }}>
			sticky
		</ParallaxLayer>
	</Parallax>
}
