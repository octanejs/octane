import type { SVGProps } from '../util/OctaneTypes.ts';
import type { PresentationAttributesWithProps } from '../util/types';

interface DotProps {
	className?: SVGProps<SVGCircleElement>['className'];
	cx?: number;
	cy?: number;
	r?: number | string;
	clipDot?: boolean;
}
export type Props = PresentationAttributesWithProps<DotProps, SVGCircleElement> & DotProps;
// Port of shape/Dot.tsx — a circle marker.
import { clsx } from 'clsx';
import { adaptEventHandlers } from '../util/types.ts';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import { isNumber } from '../util/DataUtils';

export function Dot(props: Props) {
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
