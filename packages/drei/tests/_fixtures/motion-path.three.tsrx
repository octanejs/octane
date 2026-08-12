import { MotionPathControls, useMotion } from '@octanejs/drei';

function MotionReader(props) @{
	const motion = useMotion();
	props.onMotion(motion);
	null
}

export function MotionPathScene(props) @{
	<MotionPathControls
		ref={props.groupRef}
		curves={props.curves}
		object={props.object}
		focus={props.focus}
		loop={props.loop}
		offset={props.offset}
		smooth={props.smooth}
		damping={props.damping}
		focusDamping={props.focusDamping}
		maxSpeed={props.maxSpeed}
		debug={props.debug}
		name="motion-path"
	>
		<MotionReader onMotion={props.onMotion} />
	</MotionPathControls>
}

export function InvalidMotionReader() @{
	const motion = useMotion();
	{motion.offset}
}
