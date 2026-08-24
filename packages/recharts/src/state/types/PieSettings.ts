// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { SVGProps } from '../../util/OctaneTypes';

import { BasePolarGraphicalItemSettings } from '../graphicalItemsSlice';
import { DataKey, LegendType } from '../../util/types';
import { TooltipType } from '../../component/DefaultTooltipContent.tsrx';
import { SVGPropsNoEvents } from '../../util/svgPropertiesNoEvents';
import { WithoutId } from '../../util/useUniqueId';

export type PiePresentationProps = SVGPropsNoEvents<WithoutId<SVGProps<SVGPathElement>>>;

export interface PieSettings extends BasePolarGraphicalItemSettings {
	type: 'pie';
	name: string | number | undefined;
	nameKey: DataKey<any>;
	tooltipType: TooltipType | undefined;

	legendType: LegendType;
	fill: string;

	cx: number | string;
	cy: number | string;
	startAngle: number;
	endAngle: number;
	paddingAngle: number;
	minAngle: number;
	innerRadius: number | string;
	outerRadius: number | string | ((element: any) => number | string);
	maxRadius: number | undefined;
	cornerRadius: number | string | undefined;
	presentationProps: PiePresentationProps | null;
}
