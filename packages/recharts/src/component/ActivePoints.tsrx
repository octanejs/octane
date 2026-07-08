// Port of component/ActivePoints.tsx — the highlighted dot on the active
// tooltip data point (Line/Area/Scatter).
import { cloneElement, isValidElement } from 'octane';
import { adaptEventHandlers } from '../util/types.ts';
import { Dot } from '../shape/Dot.tsrx';
import { Layer } from '../container/Layer.tsrx';
import { useAppSelector } from '../state/hooks';
import { selectActiveTooltipIndex } from '../state/selectors/tooltipSelectors';
import { useActiveTooltipDataPoints } from '../hooks';
import { isNullish } from '../util/DataUtils';
import { svgPropertiesNoEventsFromUnknown } from '../util/svgPropertiesNoEvents';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';

function ActivePoint(activePointProps) {
	const { point, childIndex, mainColor, activeDot, dataKey, clipPath } = activePointProps;
	if (activeDot === false || point.x == null || point.y == null) {
		return null;
	}
	const dotPropsTyped = {
		index: childIndex,
		dataKey,
		cx: point.x,
		cy: point.y,
		r: 4,
		fill: mainColor ?? 'none',
		strokeWidth: 2,
		stroke: '#fff',
		payload: point.payload,
		value: point.value,
	};
	const dotProps = {
		...dotPropsTyped,
		...svgPropertiesNoEventsFromUnknown(activeDot),
		...adaptEventHandlers(activeDot),
	};
	let dot;
	if (isValidElement(activeDot)) {
		dot = cloneElement(activeDot, dotProps);
	} else if (typeof activeDot === 'function') {
		dot = activeDot(dotProps);
	} else {
		dot = <Dot {...dotProps} />;
	}
	return <Layer className="recharts-active-dot" clipPath={clipPath}>{dot}</Layer>;
}

export function ActivePoints(props) {
	const {
		points,
		mainColor,
		activeDot,
		itemDataKey,
		clipPath,
		zIndex = DefaultZIndexes.activeDot,
	} = props;
	const activeTooltipIndex = useAppSelector(selectActiveTooltipIndex);
	const activeDataPoints = useActiveTooltipDataPoints();
	if (points == null || activeDataPoints == null) {
		return null;
	}
	const activePoint = points.find((p) => activeDataPoints.includes(p.payload));
	if (isNullish(activePoint)) {
		return null;
	}
	return <ZIndexLayer zIndex={zIndex}>
		<ActivePoint
			point={activePoint}
			childIndex={Number(activeTooltipIndex)}
			mainColor={mainColor}
			dataKey={itemDataKey}
			activeDot={activeDot}
			clipPath={clipPath}
		/>
	</ZIndexLayer>;
}
