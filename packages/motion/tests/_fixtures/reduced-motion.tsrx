import { useReducedMotion } from '@octanejs/motion';

export function ReducedMotionPreference() @{
	const shouldReduceMotion = useReducedMotion();
	<output data-reduced-motion={shouldReduceMotion ? 'true' : 'false'}>
		{shouldReduceMotion ? 'reduce' : 'no-preference'}
	</output>
}
