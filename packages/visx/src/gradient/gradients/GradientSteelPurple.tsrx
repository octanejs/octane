import type { LinearGradientProps } from './LinearGradient.tsrx';
import LinearGradient from './LinearGradient.tsrx';

/**
 * All props pass through to `<LinearGradient {...props} />`
 */
export default function GradientSteelPurple({
	from = '#65799B',
	to = '#5E2563',
	...restProps
}: LinearGradientProps) {
	return <LinearGradient from={from} to={to} {...restProps} />;
}
