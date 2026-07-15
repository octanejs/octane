import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseAreaStackProps } from './private/BaseAreaStack.tsrx';
import BaseAreaStack from './private/BaseAreaStack.tsrx';

export default function AreaStack<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: Omit<BaseAreaStackProps<XScale, YScale, Datum>, 'PathComponent'>) {
	return <BaseAreaStack {...props} />;
}
