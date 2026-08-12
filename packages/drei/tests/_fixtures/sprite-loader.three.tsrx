import { useSpriteLoader } from '@octanejs/drei';

export function SpriteLoaderScene(props) @{
	const result = useSpriteLoader(
		props.input,
		props.json,
		props.animationNames,
		props.numberOfFrames,
		props.onLoad,
		props.contextSettings,
	);
	props.onRender(result);
	null;
}
