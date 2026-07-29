import * as React from 'octane';
import { CartesianChartProps } from '../util/types';
/**
 * @consumes ResponsiveContainerContext
 * @provides CartesianViewBoxContext
 * @provides CartesianChartContext
 */
export declare const ComposedChart: <DataPointType = any>(
	props: CartesianChartProps<DataPointType> & {
		ref?: React.Ref<SVGSVGElement>;
	},
) => React.ReactElement;
