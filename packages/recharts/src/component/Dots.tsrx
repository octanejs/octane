// Port of component/Dots.tsx — the dot layer Line/Area/Radar render per data
// point; `dot` accepts boolean | props object | element | render function.
import { cloneElement, isValidElement } from 'octane';
import { clsx } from 'clsx';
import { Dot } from '../shape/Dot.tsrx';
import { Layer } from '../container/Layer.tsrx';
import { isClipDot } from '../util/ReactUtils';
import { svgPropertiesAndEventsFromUnknown } from '../util/svgPropertiesAndEvents.ts';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';

function DotItem(props) {
	const { option, dotProps, className } = props;
	if (isValidElement(option)) {
		return cloneElement(option, dotProps);
	}
	if (typeof option === 'function') {
		return option(dotProps);
	}
	const finalClassName = clsx(className, typeof option !== 'boolean' ? option.className : '');
	const { points, ...rest } = dotProps ?? {};
	return <Dot {...rest} className={finalClassName} />;
}

function shouldRenderDots(points, dot) {
	if (points == null) {
		return false;
	}
	if (dot) {
		return true;
	}
	return points.length === 1;
}

export function Dots(dotsProps) {
	const {
		points,
		dot,
		className,
		dotClassName,
		dataKey,
		baseProps,
		needClip,
		clipPathId,
		zIndex = DefaultZIndexes.scatter,
	} = dotsProps;
	if (!shouldRenderDots(points, dot)) {
		return null;
	}
	const clipDot = isClipDot(dot);
	const customDotProps = svgPropertiesAndEventsFromUnknown(dot);
	const dots = points.map((entry, i) => {
		const dotProps = {
			r: 3,
			...baseProps,
			...customDotProps,
			index: i,
			cx: entry.x ?? undefined,
			cy: entry.y ?? undefined,
			dataKey,
			value: entry.value,
			payload: entry.payload,
			points,
		};
		return <DotItem key={'dot-' + i} option={dot} dotProps={dotProps} className={dotClassName} />;
	});
	const layerProps = {};
	if (needClip && clipPathId != null) {
		layerProps.clipPath = 'url(#clipPath-' + (clipDot ? '' : 'dots-') + clipPathId + ')';
	}
	return <ZIndexLayer zIndex={zIndex}>
		<Layer className={className} {...layerProps}>{dots}</Layer>
	</ZIndexLayer>;
}
