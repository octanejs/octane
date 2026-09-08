// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { NativeMouseEvent } from '../util/OctaneTypes';

import { Coordinate, DataKey } from '../util/types';
import { useAppDispatch } from '../state/hooks';
import {
	mouseLeaveItem,
	setActiveClickItemIndex,
	setActiveMouseOverItemIndex,
	TooltipPayload,
} from '../state/tooltipSlice';

/**
 * Some graphical items choose to provide more information to the tooltip
 * and some do not.
 */
export type TooltipTriggerInfo = {
	tooltipPayload?: TooltipPayload;
	tooltipPosition?: Coordinate;
};

export type MouseEnterLeaveEvent<T, E extends SVGElement = SVGElement> = (
	data: T,
	index: number,
	event: NativeMouseEvent<E>,
) => void;

export const useMouseEnterItemDispatch = <
	T extends TooltipTriggerInfo,
	E extends SVGElement = SVGElement,
>(
	onMouseEnterFromProps: MouseEnterLeaveEvent<T, E> | undefined,
	dataKey: DataKey<any> | undefined,
	graphicalItemId: string,
) => {
	const dispatch = useAppDispatch();
	return (data: T, index: number) => (event: NativeMouseEvent<E>) => {
		onMouseEnterFromProps?.(data, index, event);
		dispatch(
			setActiveMouseOverItemIndex({
				activeIndex: String(index),
				activeDataKey: dataKey,
				activeCoordinate: data.tooltipPosition,
				activeGraphicalItemId: graphicalItemId,
			}),
		);
	};
};

export const useMouseLeaveItemDispatch = <
	T extends TooltipTriggerInfo,
	E extends SVGElement = SVGElement,
>(
	onMouseLeaveFromProps: undefined | MouseEnterLeaveEvent<T, E>,
) => {
	const dispatch = useAppDispatch();
	return (data: T, index: number) => (event: NativeMouseEvent<E>) => {
		onMouseLeaveFromProps?.(data, index, event);
		dispatch(mouseLeaveItem());
	};
};

export const useMouseClickItemDispatch = <
	T extends TooltipTriggerInfo,
	E extends SVGElement = SVGElement,
>(
	onMouseClickFromProps: MouseEnterLeaveEvent<T, E> | undefined,
	dataKey: DataKey<any> | undefined,
	graphicalItemId: string,
) => {
	const dispatch = useAppDispatch();
	return (data: T, index: number) => (event: NativeMouseEvent<E>) => {
		onMouseClickFromProps?.(data, index, event);
		dispatch(
			setActiveClickItemIndex({
				activeIndex: String(index),
				activeDataKey: dataKey,
				activeCoordinate: data.tooltipPosition,
				activeGraphicalItemId: graphicalItemId,
			}),
		);
	};
};
