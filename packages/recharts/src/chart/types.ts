import type { MouseHandlerDataParam } from '../synchronisation/types';

export type TooltipTrigger = 'hover' | 'click';
export type CategoricalChartFunc<E = Event> = (nextState: MouseHandlerDataParam, event: E) => void;

export interface ExternalMouseEvents {
	onClick?: CategoricalChartFunc<MouseEvent>;
	onMouseLeave?: CategoricalChartFunc<MouseEvent>;
	onMouseEnter?: CategoricalChartFunc<MouseEvent>;
	onMouseMove?: CategoricalChartFunc<MouseEvent>;
	onMouseDown?: CategoricalChartFunc<MouseEvent>;
	onMouseUp?: CategoricalChartFunc<MouseEvent>;
	onContextMenu?: CategoricalChartFunc<MouseEvent>;
	onDoubleClick?: CategoricalChartFunc<MouseEvent>;
	onTouchStart?: CategoricalChartFunc<TouchEvent>;
	onTouchMove?: CategoricalChartFunc<TouchEvent>;
	onTouchEnd?: CategoricalChartFunc<TouchEvent>;
}
