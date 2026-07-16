import type { AxisScaleOutput, AxisScale } from '@octanejs/visx/axis';
import type { ScaleConfig, ScaleInput } from '@octanejs/visx/scale';
import { createScale, scaleCanBeZeroed } from '@octanejs/visx/scale';
import { extent as d3Extent } from 'd3-array';
import { useMemo } from 'octane';
import type DataRegistry from '../classes/DataRegistry';
import isDiscreteScale from '../utils/isDiscreteScale';

/** A hook for creating memoized x- and y-scales. */
export default function useScales<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	dataRegistry,
	xRange,
	xScaleConfig,
	yRange,
	yScaleConfig,
}: {
	xScaleConfig: ScaleConfig<AxisScaleOutput>;
	yScaleConfig: ScaleConfig<AxisScaleOutput>;
	dataRegistry: Omit<DataRegistry<XScale, YScale, Datum>, 'registry' | 'registryKeys'>;
	xRange: [number, number];
	yRange: [number, number];
}) {
	// pull out memoization keys that are less likely to change
	const registryKeys = dataRegistry.keys();
	const [xMin, xMax] = xRange;
	const [yMin, yMax] = yRange;

	const memoizedXScale = useMemo(() => {
		const registryEntries = registryKeys.map((key) => dataRegistry.get(key));

		type XScaleInput = ScaleInput<XScale>;

		const xValues = registryEntries.reduce<XScaleInput[]>(
			(combined, entry) => entry
				? combined.concat(entry.data.map((d: Datum) => entry.xAccessor(d)))
				: combined,
			[],
		);

		const configuredDomain = xScaleConfig.domain;

		// A fixed domain is sufficient for SSR even when a child component owns the
		// series and its registration effect has not run yet.
		if (xValues.length === 0 && configuredDomain == null) return undefined;

		const xDomain =
			configuredDomain ?? (isDiscreteScale(xScaleConfig) ? xValues : d3Extent(xValues));

		let xScale = (scaleCanBeZeroed(xScaleConfig)
			? createScale({
					range: [xMin, xMax],
					domain: xDomain as [XScaleInput, XScaleInput],
					zero: true,
					...xScaleConfig,
				})
			: createScale({
					range: [xMin, xMax],
					domain: xDomain as [XScaleInput, XScaleInput],
					...xScaleConfig,
				})) as XScale;

		// apply any scale updates from the registry
		registryEntries.forEach((entry) => {
			if (entry?.xScale) xScale = entry.xScale(xScale);
		});

		return xScale;
	}, [dataRegistry, xScaleConfig, registryKeys, xMin, xMax]);

	// same for yScale. this logic is hard to apply generically because of the scale types / accessors
	const memoizedYScale = useMemo(() => {
		const registryEntries = registryKeys.map((key) => dataRegistry.get(key));

		type YScaleInput = ScaleInput<YScale>;

		const yValues = registryEntries.reduce<YScaleInput[]>(
			(combined, entry) => entry
				? combined.concat(entry.data.map((d: Datum) => entry.yAccessor(d)))
				: combined,
			[],
		);

		const configuredDomain = yScaleConfig.domain;

		// See the x-scale branch above: explicit domains are complete server input.
		if (yValues.length === 0 && configuredDomain == null) return undefined;

		const yDomain =
			configuredDomain ?? (isDiscreteScale(yScaleConfig) ? yValues : d3Extent(yValues));

		let yScale = (scaleCanBeZeroed(yScaleConfig)
			? createScale({
					range: [yMin, yMax],
					domain: yDomain as [YScaleInput, YScaleInput],
					zero: true,
					...yScaleConfig,
				})
			: createScale({
					range: [yMin, yMax],
					domain: yDomain as [YScaleInput, YScaleInput],
					...yScaleConfig,
				})) as YScale;

		// apply any scale updates from the registry
		registryEntries.forEach((entry) => {
			if (entry?.yScale) yScale = entry.yScale(yScale);
		});

		return yScale;
	}, [dataRegistry, yScaleConfig, registryKeys, yMin, yMax]);

	return { xScale: memoizedXScale, yScale: memoizedYScale };
}
