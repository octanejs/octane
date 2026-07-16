import type { LinearGradientProps } from './LinearGradient.tsrx';
import LinearGradient from './LinearGradient.tsrx';

/**
 * All props pass through to `<LinearGradient {...props} />`
 */
export default function GradientPinkBlue({
	from = '#F02FC2',
	to = '#6094EA',
	...restProps
}: LinearGradientProps) {
	return <LinearGradient from={from} to={to} {...restProps} />;
}
