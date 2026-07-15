import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'octane';
import type { PointerEvent, SVGProps, ReactNode } from 'react';
import { Group } from '@octanejs/visx/group';
import type { HandlerArgs as DragArgs } from '@octanejs/visx/drag';
import { Drag } from '@octanejs/visx/drag';

import type { BrushHandleRenderProps } from './BrushHandle.tsrx';
import BrushHandle from './BrushHandle.tsrx';
import BrushCorner from './BrushCorner.tsrx';
import BrushSelection from './BrushSelection.tsrx';
import BrushOverlay from './BrushOverlay.tsrx';
import type {
	MarginShape,
	Point,
	BrushShape,
	ResizeTriggerAreas,
	PartialBrushStartEnd,
	BrushingType,
	BrushPageOffset,
} from './types';
import { debounce, getPageCoordinates, normalizeBrushStartEnd } from './utils';

type PointerHandlerEvent = PointerEvent<SVGRectElement>;

const DEFAULT_MARGIN = { left: 0, top: 0, right: 0, bottom: 0 };
const DEFAULT_RESIZE_TRIGGER_AREAS: ResizeTriggerAreas[] = ['left', 'right'];

export type BaseBrushProps = {
	brushDirection?: 'horizontal' | 'vertical' | 'both';
	initialBrushPosition?: PartialBrushStartEnd;
	width: number;
	height: number;
	left: number;
	top: number;
	inheritedMargin?: MarginShape;
	onChange?: (state: BaseBrushState) => void;
	handleSize: number;
	resizeTriggerAreas?: ResizeTriggerAreas[];
	onBrushStart?: (start: BaseBrushState['start']) => void;
	onBrushEnd?: (state: BaseBrushState) => void;
	selectedBoxStyle: SVGProps<SVGRectElement>;
	onMouseLeave?: (event: PointerHandlerEvent) => void;
	onMouseUp?: (event: PointerHandlerEvent) => void;
	onMouseMove?: (event: PointerHandlerEvent) => void;
	onClick?: (event: PointerHandlerEvent) => void;
	clickSensitivity: number;
	disableDraggingSelection: boolean;
	disableDraggingOverlay?: boolean;
	resetOnEnd?: boolean;
	useWindowMoveEvents?: boolean;
	renderBrushHandle?: (props: BrushHandleRenderProps) => ReactNode;
};

export type BaseBrushState = BrushShape & {
	activeHandle: ResizeTriggerAreas | null;
	isBrushing: boolean;
	brushPageOffset?: BrushPageOffset;
	brushingType?: BrushingType;
};

export type UpdateBrush =
	| BaseBrushState
	| ((prevState: Readonly<BaseBrushState>, props: Readonly<BaseBrushProps>) => BaseBrushState);

export function BaseBrush(inputProps: BaseBrushProps) {
	const props: BaseBrushProps = {
		...inputProps,
		brushDirection: inputProps.brushDirection ?? 'both',
		inheritedMargin: inputProps.inheritedMargin ?? DEFAULT_MARGIN,
		handleSize: inputProps.handleSize ?? 4,
		resizeTriggerAreas: inputProps.resizeTriggerAreas ?? DEFAULT_RESIZE_TRIGGER_AREAS,
		clickSensitivity: inputProps.clickSensitivity ?? 200,
		disableDraggingSelection: inputProps.disableDraggingSelection ?? false,
		disableDraggingOverlay: inputProps.disableDraggingOverlay ?? false,
		resetOnEnd: inputProps.resetOnEnd ?? false,
		useWindowMoveEvents: inputProps.useWindowMoveEvents ?? false,
	};
	const propsRef = useRef(props);
	propsRef.current = props;
	const mouseUpTimeRef = useRef(0);
	const mouseDownTimeRef = useRef(0);

	const getExtent = useCallback((start: Partial<Point>, end: Partial<Point>) => {
		const { brushDirection, width, height } = propsRef.current;
		return {
			x0: brushDirection === 'vertical' ? 0 : Math.min(start.x || 0, end.x || 0),
			x1: brushDirection === 'vertical' ? width : Math.max(start.x || 0, end.x || 0),
			y0: brushDirection === 'horizontal' ? 0 : Math.min(start.y || 0, end.y || 0),
			y1: brushDirection === 'horizontal' ? height : Math.max(start.y || 0, end.y || 0),
		};
	}, []);

	const getIdleState = useCallback((): BaseBrushState => {
		const { width, height } = propsRef.current;
		return {
			start: { x: 0, y: 0 },
			end: { x: 0, y: 0 },
			extent: { x0: -1, x1: -1, y0: -1, y1: -1 },
			bounds: { x0: 0, x1: width, y0: 0, y1: height },
			isBrushing: false,
			brushPageOffset: undefined,
			activeHandle: null,
			brushingType: undefined,
		};
	}, []);

	const [brush, setBrush, getBrush] = useState<BaseBrushState>(() => {
		const { initialBrushPosition, width, height } = props;
		const extent = initialBrushPosition
			? getExtent(initialBrushPosition.start, initialBrushPosition.end)
			: { x0: -1, x1: -1, y0: -1, y1: -1 };
		return {
			start: { x: Math.max(0, extent.x0), y: Math.max(0, extent.y0) },
			end: { x: Math.max(0, extent.x1), y: Math.max(0, extent.y1) },
			extent,
			bounds: { x0: 0, x1: width, y0: 0, y1: height },
			isBrushing: false,
			brushingType: undefined,
			activeHandle: null,
		};
	});

	const updateBrush = useCallback((updater: UpdateBrush) => {
		setBrush((previous) => {
			const next = typeof updater === 'function' ? updater(previous, propsRef.current) : updater;
			propsRef.current.onChange?.(next);
			return next;
		});
	}, []);

	const previousSizeRef = useRef({ width: props.width, height: props.height });
	useLayoutEffect(() => {
		const previousSize = previousSizeRef.current;
		if (props.width !== previousSize.width || props.height !== previousSize.height) {
			setBrush((previous) => {
				let { start, end, extent } = previous;
				if (!(extent.x0 === -1 && extent.x1 === -1 && extent.y0 === -1 && extent.y1 === -1)) {
					const widthRatio = props.width / previousSize.width;
					const heightRatio = props.height / previousSize.height;
					start = { x: widthRatio * extent.x0, y: heightRatio * extent.y0 };
					end = { x: widthRatio * extent.x1, y: heightRatio * extent.y1 };
					extent = getExtent(start, end);
				}
				return {
					...previous,
					start,
					end,
					extent,
					bounds: { x0: 0, x1: props.width, y0: 0, y1: props.height },
				};
			});
		}
		previousSizeRef.current = { width: props.width, height: props.height };
	}, [props.width, props.height, getExtent]);

	const handleWindowPointerUp = useCallback(() => {
		const { useWindowMoveEvents, onBrushEnd, resetOnEnd } = propsRef.current;
		if (!useWindowMoveEvents || !getBrush().brushingType) return;
		updateBrush((previous) => {
			const start = { ...previous.start };
			const end = { ...previous.end };
			normalizeBrushStartEnd(start, end, previous.extent);
			let next = {
				...previous,
				start,
				end,
				activeHandle: null,
				isBrushing: false,
				brushingType: undefined,
			};
			onBrushEnd?.(next);
			if (resetOnEnd) next = { ...next, ...getIdleState() };
			return next;
		});
	}, [getBrush, getIdleState, updateBrush]);

	const handleWindowPointerMove = useCallback(
		(event: MouseEvent) => {
			const current = getBrush();
			const { useWindowMoveEvents } = propsRef.current;
			const { brushingType, isBrushing, brushPageOffset } = current;
			if (!useWindowMoveEvents || !isBrushing) return;
			const offsetX = event.pageX - (brushPageOffset?.pageX || 0);
			const offsetY = event.pageY - (brushPageOffset?.pageY || 0);

			if (['left', 'right', 'top', 'bottom'].includes(brushingType ?? '')) {
				updateBrush((previous) => {
					const { x: x0, y: y0 } = previous.start;
					const { x: x1, y: y1 } = previous.end;
					return {
						...previous,
						isBrushing: true,
						extent: {
							...previous.extent,
							...getExtent(
								{
									x:
										brushingType === 'left'
											? Math.min(Math.max(x0 + offsetX, previous.bounds.x0), previous.bounds.x1)
											: x0,
									y:
										brushingType === 'top'
											? Math.min(Math.max(y0 + offsetY, previous.bounds.y0), previous.bounds.y1)
											: y0,
								},
								{
									x:
										brushingType === 'right'
											? Math.min(Math.max(x1 + offsetX, previous.bounds.x0), previous.bounds.x1)
											: x1,
									y:
										brushingType === 'bottom'
											? Math.min(Math.max(y1 + offsetY, previous.bounds.y0), previous.bounds.y1)
											: y1,
								},
							),
						},
					};
				});
			}

			if (brushingType === 'move') {
				updateBrush((previous) => {
					const { x: x0, y: y0 } = previous.start;
					const { x: x1, y: y1 } = previous.end;
					const validDx =
						offsetX > 0
							? Math.min(offsetX, previous.bounds.x1 - x1)
							: Math.max(offsetX, previous.bounds.x0 - x0);
					const validDy =
						offsetY > 0
							? Math.min(offsetY, previous.bounds.y1 - y1)
							: Math.max(offsetY, previous.bounds.y0 - y0);
					return {
						...previous,
						isBrushing: true,
						extent: {
							...previous.extent,
							x0: x0 + validDx,
							y0: y0 + validDy,
							x1: x1 + validDx,
							y1: y1 + validDy,
						},
					};
				});
			}

			if (brushingType === 'select') {
				updateBrush((previous) => {
					const newEnd = {
						x: Math.min(
							Math.max(previous.start.x + offsetX, previous.bounds.x0),
							previous.bounds.x1,
						),
						y: Math.min(
							Math.max(previous.start.y + offsetY, previous.bounds.y0),
							previous.bounds.y1,
						),
					};
					return {
						...previous,
						end: newEnd,
						extent: getExtent(previous.start, newEnd),
					};
				});
			}
		},
		[getBrush, getExtent, updateBrush],
	);

	const debouncedHandleWindowPointerMove = useMemo(
		() => debounce(handleWindowPointerMove, 1),
		[handleWindowPointerMove],
	);

	useEffect(() => {
		if (!props.useWindowMoveEvents) return;
		window.addEventListener('mouseup', handleWindowPointerUp);
		window.addEventListener('mousemove', debouncedHandleWindowPointerMove);
		return () => {
			window.removeEventListener('mouseup', handleWindowPointerUp);
			window.removeEventListener('mousemove', debouncedHandleWindowPointerMove);
		};
	}, [props.useWindowMoveEvents, handleWindowPointerUp, debouncedHandleWindowPointerMove]);

	function handleDragStart(draw: DragArgs) {
		const { onBrushStart, left, top, inheritedMargin, useWindowMoveEvents } = propsRef.current;
		const start = {
			x: (draw.x || 0) + draw.dx - left - (inheritedMargin?.left || 0),
			y: (draw.y || 0) + draw.dy - top - (inheritedMargin?.top || 0),
		};
		onBrushStart?.(start);
		updateBrush((previous) => ({
			...previous,
			start,
			end: { ...start },
			extent: { x0: -1, x1: -1, y0: -1, y1: -1 },
			isBrushing: true,
			brushingType: 'select',
			brushPageOffset: useWindowMoveEvents ? getPageCoordinates(draw.event) : undefined,
		}));
	}

	function handleBrushStart(drag: DragArgs) {
		const { onBrushStart, left, top, inheritedMargin } = propsRef.current;
		if (!onBrushStart) return;
		onBrushStart({
			x: (drag.x || 0) + drag.dx - left - (inheritedMargin?.left || 0),
			y: (drag.y || 0) + drag.dy - top - (inheritedMargin?.top || 0),
		});
	}

	function handleDragMove(drag: DragArgs) {
		const { left, top, inheritedMargin, useWindowMoveEvents } = propsRef.current;
		if (!drag.isDragging || useWindowMoveEvents) return;
		const end = {
			x: (drag.x || 0) + drag.dx - left - (inheritedMargin?.left || 0),
			y: (drag.y || 0) + drag.dy - top - (inheritedMargin?.top || 0),
		};
		updateBrush((previous) => ({
			...previous,
			end,
			extent: getExtent(previous.start, end),
		}));
	}

	function handleDragEnd() {
		const { onBrushEnd, resetOnEnd, useWindowMoveEvents } = propsRef.current;
		if (useWindowMoveEvents) return;
		updateBrush((previous) => {
			let next = {
				...previous,
				start: { x: previous.extent.x0, y: previous.extent.y0 },
				end: { x: previous.extent.x1, y: previous.extent.y1 },
				isBrushing: false,
				brushingType: undefined,
				activeHandle: null,
			};
			onBrushEnd?.(next);
			if (resetOnEnd) next = { ...next, ...getIdleState() };
			return next;
		});
	}

	function reset() {
		updateBrush(getIdleState());
	}

	function handleBrushingTypeChange(type?: BrushingType, brushPageOffset?: BrushPageOffset) {
		updateBrush((previous) => {
			const next = {
				...previous,
				brushingType: type,
				isBrushing: type !== undefined,
			};
			if (brushPageOffset || type === undefined) next.brushPageOffset = brushPageOffset;
			return next;
		});
	}

	const {
		top,
		left,
		width: stageWidth,
		height: stageHeight,
		onMouseLeave,
		onMouseUp,
		onMouseMove,
		onBrushEnd,
		onClick,
		resizeTriggerAreas = DEFAULT_RESIZE_TRIGGER_AREAS,
		selectedBoxStyle,
		disableDraggingSelection,
		disableDraggingOverlay,
		clickSensitivity,
		useWindowMoveEvents,
		renderBrushHandle,
		handleSize,
	} = props;
	const { start, end, extent, brushingType } = brush;
	const width = Math.max(Math.max(extent.x0, extent.x1) - Math.min(extent.x0, extent.x1), 0);
	const height = Math.max(Math.max(extent.y0, extent.y1) - Math.min(extent.y0, extent.y1), 0);
	const offset = handleSize / 2;
	const handles: Partial<
		Record<ResizeTriggerAreas, { x: number; y: number; width: number; height: number }>
	> = {
		top: {
			x: extent.x0 - offset,
			y: extent.y0 - offset,
			height: handleSize,
			width: width + handleSize,
		},
		bottom: {
			x: extent.x0 - offset,
			y: extent.y1 - offset,
			height: handleSize,
			width: width + handleSize,
		},
		right: {
			x: extent.x1 - offset,
			y: extent.y0 - offset,
			height: height + handleSize,
			width: handleSize,
		},
		left: {
			x: extent.x0 - offset,
			y: extent.y0 - offset,
			height: height + handleSize,
			width: handleSize,
		},
	};
	const corners: Partial<
		Record<ResizeTriggerAreas, { x: number; y: number; width: number; height: number }>
	> = {
		topLeft: {
			x: Math.min(extent.x0, extent.x1) - offset,
			y: Math.min(extent.y0, extent.y1) - offset,
			width: handleSize,
			height: handleSize,
		},
		topRight: {
			x: Math.max(extent.x0, extent.x1) - offset,
			y: Math.min(extent.y0, extent.y1) - offset,
			width: handleSize,
			height: handleSize,
		},
		bottomLeft: {
			x: Math.min(extent.x0, extent.x1) - offset,
			y: Math.max(extent.y0, extent.y1) - offset,
			width: handleSize,
			height: handleSize,
		},
		bottomRight: {
			x: Math.max(extent.x0, extent.x1) - offset,
			y: Math.max(extent.y0, extent.y1) - offset,
			width: handleSize,
			height: handleSize,
		},
	};
	const resizeTriggerAreaSet = new Set(resizeTriggerAreas);

	return (
		<Group className="visx-brush" top={top} left={left}>
			{disableDraggingOverlay ? (
				<BrushOverlay
					width={stageWidth}
					height={stageHeight}
					onClick={(event) => {
						const duration = mouseUpTimeRef.current - mouseDownTimeRef.current;
						if (onClick && duration < clickSensitivity) onClick(event);
					}}
					style={{ cursor: 'default' }}
				/>
			) : (
				<Drag
					width={stageWidth}
					height={stageHeight}
					resetOnStart
					onDragStart={handleDragStart}
					onDragMove={handleDragMove}
					onDragEnd={handleDragEnd}
					isDragging={useWindowMoveEvents ? brushingType === 'select' : undefined}
				>
					{({ dragStart, isDragging, dragMove, dragEnd }) => (
						<BrushOverlay
							width={stageWidth}
							height={stageHeight}
							onDoubleClick={reset}
							onClick={(event: PointerHandlerEvent) => {
								const duration = mouseUpTimeRef.current - mouseDownTimeRef.current;
								if (onClick && duration < clickSensitivity) onClick(event);
							}}
							onPointerDown={(event: PointerHandlerEvent) => {
								mouseDownTimeRef.current = Date.now();
								dragStart(event);
							}}
							onPointerLeave={(event: PointerHandlerEvent) => onMouseLeave?.(event)}
							onPointerMove={(event: PointerHandlerEvent) => {
								if (!isDragging) onMouseMove?.(event);
								if (isDragging) dragMove(event);
							}}
							onPointerUp={(event: PointerHandlerEvent) => {
								mouseUpTimeRef.current = Date.now();
								onMouseUp?.(event);
								dragEnd(event);
							}}
							style={{ cursor: 'crosshair' }}
						/>
					)}
				</Drag>
			)}

			{start && end && (
				<BrushSelection
					updateBrush={updateBrush}
					width={width}
					height={height}
					stageWidth={stageWidth}
					stageHeight={stageHeight}
					brush={brush}
					disableDraggingSelection={disableDraggingSelection}
					onBrushEnd={onBrushEnd}
					onBrushStart={handleBrushStart}
					onMouseLeave={onMouseLeave}
					onMouseMove={onMouseMove}
					onMouseUp={onMouseUp}
					onMoveSelectionChange={handleBrushingTypeChange}
					onClick={onClick}
					selectedBoxStyle={selectedBoxStyle}
					isControlled={useWindowMoveEvents}
					isDragInProgress={useWindowMoveEvents ? brushingType === 'move' : undefined}
				/>
			)}

			{start &&
				end &&
				(Object.keys(handles) as ResizeTriggerAreas[])
					.filter((handleKey) => resizeTriggerAreaSet.has(handleKey))
					.map((handleKey) => {
						const handle = handles[handleKey];
						return (
							handle && (
								<BrushHandle
									key={`handle-${handleKey}`}
									type={handleKey}
									handle={handle}
									stageWidth={stageWidth}
									stageHeight={stageHeight}
									updateBrush={updateBrush}
									brush={brush}
									onBrushStart={handleBrushStart}
									onBrushEnd={onBrushEnd}
									isControlled={useWindowMoveEvents}
									isDragInProgress={useWindowMoveEvents ? brushingType === handleKey : undefined}
									onBrushHandleChange={handleBrushingTypeChange}
									renderBrushHandle={renderBrushHandle}
								/>
							)
						);
					})}

			{start &&
				end &&
				(Object.keys(corners) as ResizeTriggerAreas[])
					.filter((cornerKey) => resizeTriggerAreaSet.has(cornerKey))
					.map((cornerKey) => {
						const corner = corners[cornerKey];
						return (
							corner && (
								<BrushCorner
									key={`corner-${cornerKey}`}
									type={cornerKey}
									brush={brush}
									updateBrush={updateBrush}
									stageWidth={stageWidth}
									stageHeight={stageHeight}
									corner={corner}
									onBrushEnd={onBrushEnd}
								/>
							)
						);
					})}
		</Group>
	);
}

export default BaseBrush;
