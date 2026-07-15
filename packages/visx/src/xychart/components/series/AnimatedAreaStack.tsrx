import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseAreaStackProps } from './private/BaseAreaStack.tsrx';
import BaseAreaStack from './private/BaseAreaStack.tsrx';
import AnimatedPath from './private/AnimatedPath.tsrx';

export default function AnimatedAreaStack<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: Omit<BaseAreaStackProps<XScale, YScale, Datum>, 'PathComponent'>) {
	return <BaseAreaStack {...props} PathComponent={AnimatedPath} />;
}
