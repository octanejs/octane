// Port of shape/Trapezoid.tsx — the funnel-chart segment. Phase 0 ports the
// STATIC path (isUpdateAnimationActive defaults false); the update animation
// and the getTotalLength entrance dash arrive with the Phase 5 animation port.
// Path strings mirror upstream's roundTemplateLiteral output byte-for-byte.
import { clsx } from 'clsx';
import { resolveDefaultProps } from '../vendor/util/resolveDefaultProps';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { roundTemplateLiteral } from '../vendor/util/round';

const getTrapezoidPath = (x, y, upperWidth, lowerWidth, height) => {
	const widthGap = upperWidth - lowerWidth;
	let path;
	path = roundTemplateLiteral`M ${x},${y}`;
	path += roundTemplateLiteral`L ${x + upperWidth},${y}`;
	path += roundTemplateLiteral`L ${x + upperWidth - widthGap / 2},${y + height}`;
	path += roundTemplateLiteral`L ${x + upperWidth - widthGap / 2 - lowerWidth},${y + height}`;
	path += roundTemplateLiteral`L ${x},${y} Z`;
	return path;
};

export const defaultTrapezoidProps = {
	x: 0,
	y: 0,
	upperWidth: 0,
	lowerWidth: 0,
	height: 0,
	isUpdateAnimationActive: false,
	animationBegin: 0,
	animationDuration: 1500,
	animationEasing: 'ease',
};

export function Trapezoid(outsideProps) {
	const trapezoidProps = resolveDefaultProps(outsideProps, defaultTrapezoidProps);
	const { x, y, upperWidth, lowerWidth, height, className } = trapezoidProps;

	if (
		x !== +x || y !== +y || upperWidth !== +upperWidth || lowerWidth !== +lowerWidth ||
			height !== +height ||
			upperWidth === 0 && lowerWidth === 0 ||
			height === 0
	) {
		return null;
	}
	const layerClass = clsx('recharts-trapezoid', className);

	// Static path — the update-animation branch is a Phase 5 port. Upstream's
	// static branch wraps the path in a <g>, so mirror that.
	return <g>
		<path
			{...svgPropertiesAndEvents(trapezoidProps)}
			className={layerClass}
			d={getTrapezoidPath(x, y, upperWidth, lowerWidth, height)}
		/>
	</g>;
}
