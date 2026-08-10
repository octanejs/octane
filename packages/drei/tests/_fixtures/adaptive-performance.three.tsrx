import { AdaptiveDpr, AdaptiveEvents, BakeShadows, useAspect } from '@octanejs/drei';

export function AspectScene(props) @{
	const aspect = useAspect(props.width, props.height, props.factor);
	props.onValue(aspect);
	null;
}

export function AdaptiveEventsScene() @{
	<AdaptiveEvents />
}

export function AdaptiveDprScene(props) @{
	<AdaptiveDpr pixelated={props.pixelated} />
}

export function BakeShadowsScene() @{
	<BakeShadows />
}
