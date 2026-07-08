// Port of shape/Cross.tsx — the axis-cursor crosshair (a vertical + horizontal
// line pair as one path).
import { clsx } from 'clsx';
import { isNumber } from '../vendor/util/DataUtils';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

function getPath(x, y, width, height, top, left) {
	return 'M' + x + ',' + top + 'v' + height + 'M' + left + ',' + y + 'h' + width;
}

export function Cross(crossProps) {
	const { x = 0, y = 0, top = 0, left = 0, width = 0, height = 0, className, ...rest } = crossProps;
	const props = { x, y, top, left, width, height, ...rest };
	if (
		!isNumber(x) || !isNumber(y) || !isNumber(width) || !isNumber(height) || !isNumber(top) ||
			!isNumber(left)
	) {
		return null;
	}
	return <path
		{...svgPropertiesAndEvents(props)}
		className={clsx('recharts-cross', className)}
		d={getPath(x, y, width, height, top, left)}
	/>;
}
