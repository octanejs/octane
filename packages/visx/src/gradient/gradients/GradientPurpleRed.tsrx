import type { LinearGradientProps } from './LinearGradient.tsrx';
import LinearGradient from './LinearGradient.tsrx';

/**
 * All props pass through to `<LinearGradient {...props} />`
 */
export default function GradientPurpleRed({
	from = '#622774',
	to = '#C53364',
	...restProps
}: LinearGradientProps) {
	return <LinearGradient from={from} to={to} {...restProps} />;
}
