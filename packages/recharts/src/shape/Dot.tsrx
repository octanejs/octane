// Port of shape/Dot.tsx — a circle marker.
import { clsx } from 'clsx';
import { adaptEventHandlers } from '../util/types.ts';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import { isNumber } from '../util/DataUtils';

export function Dot(props) {
	const { cx, cy, r, className } = props;
	const layerClass = clsx('recharts-dot', className);
	if (isNumber(cx) && isNumber(cy) && isNumber(r)) {
		return <circle
			{...svgPropertiesNoEvents(props)}
			{...adaptEventHandlers(props)}
			className={layerClass}
			cx={cx}
			cy={cy}
			r={r}
		/>;
	}
	return null;
}
