import type { PositionScale } from '@octanejs/visx/shape';
import type { BaseBarStackProps } from './private/BaseBarStack.tsrx';
import BaseBarStack from './private/BaseBarStack.tsrx';
import Bars from './private/Bars.tsrx';

export default function BarStack<XScale extends PositionScale, YScale extends PositionScale, Datum extends object>(props: Omit<BaseBarStackProps<XScale, YScale, Datum>, 'BarsComponent'>) {
	return <BaseBarStack {...props} BarsComponent={Bars} />;
}
