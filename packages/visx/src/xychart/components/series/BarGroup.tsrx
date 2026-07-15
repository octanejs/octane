import type { PositionScale } from '@octanejs/visx/shape';
import type { BaseBarGroupProps } from './private/BaseBarGroup.tsrx';
import BaseBarGroup from './private/BaseBarGroup.tsrx';
import Bars from './private/Bars.tsrx';

export default function BarGroup<XScale extends PositionScale, YScale extends PositionScale, Datum extends object>(props: Omit<BaseBarGroupProps<XScale, YScale, Datum>, 'BarsComponent'>) {
	return <BaseBarGroup {...props} BarsComponent={Bars} />;
}
