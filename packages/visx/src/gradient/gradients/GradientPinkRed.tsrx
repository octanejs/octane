import type { LinearGradientProps } from './LinearGradient.tsrx';
import LinearGradient from './LinearGradient.tsrx';

/**
 * All props pass through to `<LinearGradient {...props} />`
 */
export default function GradientPinkRed({
	from = '#F54EA2',
	to = '#FF7676',
	...restProps
}: LinearGradientProps) {
	return <LinearGradient from={from} to={to} {...restProps} />;
}
