import type { LinearGradientProps } from './LinearGradient.tsrx';
import LinearGradient from './LinearGradient.tsrx';

/**
 * All props pass through to `<LinearGradient {...props} />`
 */
export default function GradientPurpleTeal({
	from = '#5B247A',
	to = '#1BCEDF',
	...restProps
}: LinearGradientProps) {
	return <LinearGradient from={from} to={to} {...restProps} />;
}
