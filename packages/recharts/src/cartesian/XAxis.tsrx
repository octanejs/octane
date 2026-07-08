// Port of cartesian/XAxis.tsx — registers x-axis settings in the store and
// renders through CartesianAxis with store-synchronized settings.
import { useLayoutEffect, useMemo, useRef, memo } from 'octane';
import { clsx } from 'clsx';
import { CartesianAxis, defaultCartesianAxisProps } from './CartesianAxis.tsrx';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { addXAxis, replaceXAxis, removeXAxis } from '../state/cartesianAxisSlice';
import {
	implicitXAxis,
	selectTicksOfAxis,
	selectXAxisPosition,
	selectXAxisSettingsNoDefaults,
	selectXAxisSize,
} from '../state/selectors/axisSelectors';
import { selectAxisViewBox } from '../state/selectors/selectChartOffsetInternal';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { axisPropsAreEqual } from '../util/axisPropsAreEqual';
import { useCartesianChartLayout } from '../context/chartLayoutContext.ts';
import { getAxisTypeBasedOnLayout } from '../util/getAxisTypeBasedOnLayout';

function SetXAxisSettings(props) {
	const dispatch = useAppDispatch();
	const prevSettingsRef = useRef(null);
	const layout = useCartesianChartLayout();
	const { type: typeFromProps, ...restProps } = props;
	const evaluatedType = getAxisTypeBasedOnLayout(layout, 'xAxis', typeFromProps);
	const settings = useMemo(() => {
		if (evaluatedType == null) {
			return undefined;
		}
		return { ...restProps, type: evaluatedType };
	}, [restProps, evaluatedType]);
	useLayoutEffect(() => {
		if (settings == null) {
			return;
		}
		if (prevSettingsRef.current === null) {
			dispatch(addXAxis(settings));
		} else if (prevSettingsRef.current !== settings) {
			dispatch(replaceXAxis({ prev: prevSettingsRef.current, next: settings }));
		}
		prevSettingsRef.current = settings;
	}, [settings, dispatch]);
	useLayoutEffect(() => {
		return () => {
			if (prevSettingsRef.current) {
				dispatch(removeXAxis(prevSettingsRef.current));
				prevSettingsRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
}

function XAxisImpl(props) {
	const { xAxisId, className } = props;
	const viewBox = useAppSelector(selectAxisViewBox);
	const isPanorama = useIsPanorama();
	const axisType = 'xAxis';
	const cartesianTickItems = useAppSelector(
		(state) => selectTicksOfAxis(state, axisType, xAxisId, isPanorama),
	);
	const axisSize = useAppSelector((state) => selectXAxisSize(state, xAxisId));
	const position = useAppSelector((state) => selectXAxisPosition(state, xAxisId));
	// Settings come back from the store (not props) so every component renders
	// one consistent view of the axis (recharts#6257).
	const synchronizedSettings = useAppSelector(
		(state) => selectXAxisSettingsNoDefaults(state, xAxisId),
	);
	if (axisSize == null || position == null || synchronizedSettings == null) {
		return null;
	}
	const { dangerouslySetInnerHTML, ticks, scale: _del, ...allOtherProps } = props;
	const { id, scale: _del2, ...restSynchronizedSettings } = synchronizedSettings;
	return <CartesianAxis
		{...allOtherProps}
		{...restSynchronizedSettings}
		x={position.x}
		y={position.y}
		width={axisSize.width}
		height={axisSize.height}
		className={clsx('recharts-' + axisType + ' ' + axisType, className)}
		viewBox={viewBox}
		ticks={cartesianTickItems}
		axisType={axisType}
		axisId={xAxisId}
	/>;
}

export const xAxisDefaultProps = {
	allowDataOverflow: implicitXAxis.allowDataOverflow,
	allowDecimals: implicitXAxis.allowDecimals,
	allowDuplicatedCategory: implicitXAxis.allowDuplicatedCategory,
	angle: implicitXAxis.angle,
	axisLine: defaultCartesianAxisProps.axisLine,
	height: implicitXAxis.height,
	hide: false,
	includeHidden: implicitXAxis.includeHidden,
	interval: implicitXAxis.interval,
	label: false,
	minTickGap: implicitXAxis.minTickGap,
	mirror: implicitXAxis.mirror,
	orientation: implicitXAxis.orientation,
	padding: implicitXAxis.padding,
	reversed: implicitXAxis.reversed,
	scale: implicitXAxis.scale,
	tick: implicitXAxis.tick,
	tickCount: implicitXAxis.tickCount,
	tickLine: defaultCartesianAxisProps.tickLine,
	tickSize: defaultCartesianAxisProps.tickSize,
	type: implicitXAxis.type,
	niceTicks: implicitXAxis.niceTicks,
	xAxisId: 0,
};

function XAxisSettingsDispatcher(outsideProps) @{
	const props = resolveDefaultProps(outsideProps, xAxisDefaultProps);
	<>
		<SetXAxisSettings
			allowDataOverflow={props.allowDataOverflow}
			allowDecimals={props.allowDecimals}
			allowDuplicatedCategory={props.allowDuplicatedCategory}
			angle={props.angle}
			dataKey={props.dataKey}
			domain={props.domain}
			height={props.height}
			hide={props.hide}
			id={props.xAxisId}
			includeHidden={props.includeHidden}
			interval={props.interval}
			minTickGap={props.minTickGap}
			mirror={props.mirror}
			name={props.name}
			orientation={props.orientation}
			padding={props.padding}
			reversed={props.reversed}
			scale={props.scale}
			tick={props.tick}
			tickCount={props.tickCount}
			tickFormatter={props.tickFormatter}
			ticks={props.ticks}
			type={props.type}
			unit={props.unit}
			niceTicks={props.niceTicks}
		/>
		<XAxisImpl {...props} />
	</>
}

/**
 * @consumes CartesianViewBoxContext
 * @provides CartesianLabelContext
 */
export const XAxis = memo(XAxisSettingsDispatcher, axisPropsAreEqual);
XAxis.displayName = 'XAxis';
