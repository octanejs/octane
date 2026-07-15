import type { PositionScale } from '@octanejs/visx/shape';
import type { BaseBarStackProps } from './private/BaseBarStack.tsrx';
import BaseBarStack from './private/BaseBarStack.tsrx';
import AnimatedBars from './private/AnimatedBars.tsrx';

export default function AnimatedBarStack<XScale extends PositionScale, YScale extends PositionScale, Datum extends object>(props: Omit<BaseBarStackProps<XScale, YScale, Datum>, 'BarsComponent'>) {
	return <BaseBarStack {...props} BarsComponent={AnimatedBars} />;
}
