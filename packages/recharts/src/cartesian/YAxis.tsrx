// Port of cartesian/YAxis.tsx — registers y-axis settings in the store,
// renders through CartesianAxis, and drives width="auto" via the axis
// component's imperative getCalculatedWidth handle.
import { isValidElement, useLayoutEffect, useMemo, useRef, memo } from 'octane';
import { clsx } from 'clsx';
import { CartesianAxis, defaultCartesianAxisProps } from './CartesianAxis.tsrx';
import { addYAxis, replaceYAxis, removeYAxis, updateYAxisWidth } from '../state/cartesianAxisSlice';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import {
	implicitYAxis,
	selectTicksOfAxis,
	selectYAxisPosition,
	selectYAxisSettingsNoDefaults,
	selectYAxisSize,
} from '../state/selectors/axisSelectors';
import { selectAxisViewBox } from '../state/selectors/selectChartOffsetInternal';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import { isLabelContentAFunction } from '../component/Label.tsrx';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { axisPropsAreEqual } from '../util/axisPropsAreEqual';
import { useCartesianChartLayout } from '../context/chartLayoutContext.ts';
import { getAxisTypeBasedOnLayout } from '../util/getAxisTypeBasedOnLayout';

function SetYAxisSettings(props) {
	const dispatch = useAppDispatch();
	const prevSettingsRef = useRef(null);
	const layout = useCartesianChartLayout();
	const { type: typeFromProps, ...restProps } = props;
	const evaluatedType = getAxisTypeBasedOnLayout(layout, 'yAxis', typeFromProps);
	const settings = useMemo(() => {
		if (evaluatedType == null) {
			return undefined;
		}
		return { ...restProps, type: evaluatedType };
	}, [evaluatedType, restProps]);
	useLayoutEffect(() => {
		if (settings == null) {
			return;
		}
		if (prevSettingsRef.current === null) {
			dispatch(addYAxis(settings));
		} else if (prevSettingsRef.current !== settings) {
			dispatch(replaceYAxis({ prev: prevSettingsRef.current, next: settings }));
		}
		prevSettingsRef.current = settings;
	}, [settings, dispatch]);
	useLayoutEffect(() => {
		return () => {
			if (prevSettingsRef.current) {
				dispatch(removeYAxis(prevSettingsRef.current));
				prevSettingsRef.current = null;
			}
		};
	}, [dispatch]);
	return null;
}

function YAxisImpl(props) {
	const { yAxisId, className, width, label } = props;
	const cartesianAxisRef = useRef(null);
	const labelRef = useRef(null);
	const viewBox = useAppSelector(selectAxisViewBox);
	const isPanorama = useIsPanorama();
	const dispatch = useAppDispatch();
	const axisType = 'yAxis';
	const axisSize = useAppSelector((state) => selectYAxisSize(state, yAxisId));
	const position = useAppSelector((state) => selectYAxisPosition(state, yAxisId));
	const cartesianTickItems = useAppSelector(
		(state) => selectTicksOfAxis(state, axisType, yAxisId, isPanorama),
	);
	// Settings come back from the store (not props) so every component renders
	// one consistent view of the axis (recharts#6257).
	const synchronizedSettings = useAppSelector(
		(state) => selectYAxisSettingsNoDefaults(state, yAxisId),
	);
	useLayoutEffect(() => {
		// No dynamic width calculation when width !== 'auto', or when a
		// function/element label is used.
		if (
			width !== 'auto' || !axisSize || isLabelContentAFunction(label) || isValidElement(label) ||
				synchronizedSettings == null
		) {
			return;
		}
		const axisComponent = cartesianAxisRef.current;
		if (!axisComponent) {
			return;
		}
		const updatedYAxisWidth = axisComponent.getCalculatedWidth();
		// if the width has changed, dispatch an action to update the width
		if (Math.round(axisSize.width) !== Math.round(updatedYAxisWidth)) {
			dispatch(updateYAxisWidth({ id: yAxisId, width: updatedYAxisWidth }));
		}
	}, [cartesianTickItems, axisSize, dispatch, label, yAxisId, width, synchronizedSettings]);
	if (axisSize == null || position == null || synchronizedSettings == null) {
		return null;
	}
	const { dangerouslySetInnerHTML, ticks, scale: _del, ...allOtherProps } = props;
	const { id, scale: _del2, ...restSynchronizedSettings } = synchronizedSettings;
	return <CartesianAxis
		{...allOtherProps}
		{...restSynchronizedSettings}
		ref={cartesianAxisRef}
		labelRef={labelRef}
		x={position.x}
		y={position.y}
		tickTextProps={width === 'auto' ? { width: undefined } : { width }}
		width={axisSize.width}
		height={axisSize.height}
		className={clsx('recharts-' + axisType + ' ' + axisType, className)}
		viewBox={viewBox}
		ticks={cartesianTickItems}
		axisType={axisType}
		axisId={yAxisId}
	/>;
}

export const yAxisDefaultProps = {
	allowDataOverflow: implicitYAxis.allowDataOverflow,
	allowDecimals: implicitYAxis.allowDecimals,
	allowDuplicatedCategory: implicitYAxis.allowDuplicatedCategory,
	angle: implicitYAxis.angle,
	axisLine: defaultCartesianAxisProps.axisLine,
	hide: false,
	includeHidden: implicitYAxis.includeHidden,
	interval: implicitYAxis.interval,
	label: false,
	minTickGap: implicitYAxis.minTickGap,
	mirror: implicitYAxis.mirror,
	orientation: implicitYAxis.orientation,
	padding: implicitYAxis.padding,
	reversed: implicitYAxis.reversed,
	scale: implicitYAxis.scale,
	tick: implicitYAxis.tick,
	tickCount: implicitYAxis.tickCount,
	tickLine: defaultCartesianAxisProps.tickLine,
	tickSize: defaultCartesianAxisProps.tickSize,
	type: implicitYAxis.type,
	niceTicks: implicitYAxis.niceTicks,
	width: implicitYAxis.width,
	yAxisId: 0,
};

function YAxisSettingsDispatcher(outsideProps) @{
	const props = resolveDefaultProps(outsideProps, yAxisDefaultProps);
	<>
		<SetYAxisSettings
			interval={props.interval}
			id={props.yAxisId}
			scale={props.scale}
			type={props.type}
			domain={props.domain}
			allowDataOverflow={props.allowDataOverflow}
			dataKey={props.dataKey}
			allowDuplicatedCategory={props.allowDuplicatedCategory}
			allowDecimals={props.allowDecimals}
			tickCount={props.tickCount}
			padding={props.padding}
			includeHidden={props.includeHidden}
			reversed={props.reversed}
			ticks={props.ticks}
			width={props.width}
			orientation={props.orientation}
			mirror={props.mirror}
			hide={props.hide}
			unit={props.unit}
			name={props.name}
			angle={props.angle}
			minTickGap={props.minTickGap}
			tick={props.tick}
			tickFormatter={props.tickFormatter}
			niceTicks={props.niceTicks}
		/>
		<YAxisImpl {...props} />
	</>
}

/**
 * @consumes CartesianViewBoxContext
 * @provides CartesianLabelContext
 */
export const YAxis = memo(YAxisSettingsDispatcher, axisPropsAreEqual);
YAxis.displayName = 'YAxis';
