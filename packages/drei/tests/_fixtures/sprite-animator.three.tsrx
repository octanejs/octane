import { SpriteAnimator, useSpriteAnimator } from '@octanejs/drei';

function ContextProbe(props) @{
	const state = useSpriteAnimator();
	props.onContext(state);
	null;
}

export function SpriteAnimatorScene(props) @{
	const { groupRef, onContext, ...animatorProps } = props;
	<SpriteAnimator {...animatorProps} ref={groupRef}>
		<ContextProbe onContext={onContext} />
	</SpriteAnimator>
}
