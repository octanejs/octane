// Port of shape/Rectangle.tsx — a rectangle path with per-corner rounding.
// Phase 0 ports the STATIC path (isUpdateAnimationActive defaults false, and
// standalone Rectangles never animate); the width/height update animation and
// the getTotalLength entrance dash arrive with the Phase 5 animation port.
// Path strings must be BYTE-IDENTICAL to upstream: recharts builds them via
// roundTemplateLiteral (every interpolated number rounded to 4dp, template
// whitespace/newlines preserved verbatim) — mirrored exactly here.
import { clsx } from 'clsx';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { round } from '../util/round';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

function getRectanglePath(x, y, width, height, radius) {
	const roundedWidth = round(width);
	const roundedHeight = round(height);
	const maxRadius = Math.min(Math.abs(roundedWidth) / 2, Math.abs(roundedHeight) / 2);
	const ySign =
		roundedHeight >= 0 ? 1 : -1;
	const xSign =
		roundedWidth >= 0 ? 1 : -1;
	const clockWise =
		roundedHeight >= 0 && roundedWidth >= 0 || roundedHeight < 0 && roundedWidth < 0 ? 1 : 0;
	let path;

	if (maxRadius > 0 && Array.isArray(radius)) {
		const newRadius = [0, 0, 0, 0];
		for (let i = 0; i < 4; i++) {
			const r = radius[i] ?? 0;
			newRadius[i] = r > maxRadius ? maxRadius : r;
		}
		// roundTemplateLiteral`M${…},${…}` etc. — values rounded, whitespace verbatim.
		path = 'M' + round(x) + ',' + round(y + ySign * newRadius[0]);
		if (newRadius[0] > 0) {
			path += 'A ' + round(newRadius[0]) + ',' + round(newRadius[0]) + ',0,0,' + round(clockWise) +
				',' +
				round(x + xSign * newRadius[0]) +
				',' +
			round(y);
		}
		path += 'L ' + round(x + width - xSign * newRadius[1]) + ',' + round(y);
		if (newRadius[1] > 0) {
			path += 'A ' + round(newRadius[1]) + ',' + round(newRadius[1]) + ',0,0,' + round(clockWise) +
				',\n        ' +
				round(x + width) +
				',' +
			round(y + ySign * newRadius[1]);
		}
		path += 'L ' + round(x + width) + ',' + round(y + height - ySign * newRadius[2]);
		if (newRadius[2] > 0) {
			path += 'A ' + round(newRadius[2]) + ',' + round(newRadius[2]) + ',0,0,' + round(clockWise) +
				',\n        ' +
				round(x + width - xSign * newRadius[2]) +
				',' +
			round(y + height);
		}
		path += 'L ' + round(x + xSign * newRadius[3]) + ',' + round(y + height);
		if (newRadius[3] > 0) {
			path += 'A ' + round(newRadius[3]) + ',' + round(newRadius[3]) + ',0,0,' + round(clockWise) +
				',\n        ' +
				round(x) +
				',' +
			round(y + height - ySign * newRadius[3]);
		}
		path += 'Z';
	} else if (maxRadius > 0 && radius === +radius && radius > 0) {
		const r = Math.min(maxRadius, radius);
		path = 'M ' + round(x) + ',' + round(y + ySign * r) + '\n            A ' + round(r) + ',' +
			round(r) +
			',0,0,' +
			round(clockWise) +
			',' +
			round(x + xSign * r) +
			',' +
			round(y) +
			'\n            L ' +
			round(x + width - xSign * r) +
			',' +
			round(y) +
			'\n            A ' +
			round(r) +
			',' +
			round(r) +
			',0,0,' +
			round(clockWise) +
			',' +
			round(x + width) +
			',' +
			round(y + ySign * r) +
			'\n            L ' +
			round(x + width) +
			',' +
			round(y + height - ySign * r) +
			'\n            A ' +
			round(r) +
			',' +
			round(r) +
			',0,0,' +
			round(clockWise) +
			',' +
			round(x + width - xSign * r) +
			',' +
			round(y + height) +
			'\n            L ' +
			round(x + xSign * r) +
			',' +
			round(y + height) +
			'\n            A ' +
			round(r) +
			',' +
			round(r) +
			',0,0,' +
			round(clockWise) +
			',' +
			round(x) +
			',' +
			round(y + height - ySign * r) +
		' Z';
	} else {
		path = 'M ' + round(x) + ',' + round(y) + ' h ' + round(width) + ' v ' + round(height) + ' h ' +
			round(-width) +
		' Z';
	}
	return path;
}

export const defaultRectangleProps = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	radius: 0,
	isAnimationActive: false,
	isUpdateAnimationActive: false,
	animationBegin: 0,
	animationDuration: 1500,
	animationEasing: 'ease',
};

export function Rectangle(rectangleProps) {
	const props = resolveDefaultProps(rectangleProps, defaultRectangleProps);
	const { x, y, width, height, radius, className } = props;

	if (
		x !== +x || y !== +y || width !== +width || height !== +height || width === 0 || height === 0
	) {
		return null;
	}
	const layerClass = clsx('recharts-rectangle', className);

	// Static path — the update-animation branch is a Phase 5 port.
	const { radius: _radius, ...otherPathProps } = svgPropertiesAndEvents(props);
	return <path
		{...otherPathProps}
		x={round(x)}
		y={round(y)}
		width={round(width)}
		height={round(height)}
		radius={typeof radius === 'number' ? radius : undefined}
		className={layerClass}
		d={getRectanglePath(x, y, width, height, radius)}
	/>;
}
