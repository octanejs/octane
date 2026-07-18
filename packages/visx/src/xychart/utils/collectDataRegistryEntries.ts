import { Children } from 'octane';
import type { OctaneNode } from 'octane';
import type { AxisScale } from '@octanejs/visx/axis';
import type { DataRegistryEntry } from '../types';

type ElementWithProps = { props?: Record<string, unknown> | null };

function hasProps(value: unknown): value is ElementWithProps {
	return value !== null && typeof value === 'object' && 'props' in value;
}

/**
 * Discovers series descriptors before their effects run. Octane's return-form
 * TSRX preserves JSX children as element descriptors, so fixed-size XYChart
 * scales can be built during the server render and the first hydration pass.
 */
export default function collectDataRegistryEntries<
	XScale extends AxisScale,
	YScale extends AxisScale,
	Datum extends object,
>(children: OctaneNode): DataRegistryEntry<XScale, YScale, Datum>[] {
	const entries = new Map<string, DataRegistryEntry<XScale, YScale, Datum>>();

	function visit(value: unknown): void {
		for (const child of Children.toArray(value)) {
			if (!hasProps(child) || child.props == null) continue;
			const props = child.props;
			const { data, dataKey, xAccessor, yAccessor } = props;

			if (
				typeof dataKey === 'string' &&
				Array.isArray(data) &&
				typeof xAccessor === 'function' &&
				typeof yAccessor === 'function'
			) {
				entries.set(dataKey, {
					key: dataKey,
					data: data as Datum[],
					xAccessor: xAccessor as DataRegistryEntry<XScale, YScale, Datum>['xAccessor'],
					yAccessor: yAccessor as DataRegistryEntry<XScale, YScale, Datum>['yAccessor'],
				});
			}

			if ('children' in props) visit(props.children);
		}
	}

	visit(children);
	return [...entries.values()];
}
