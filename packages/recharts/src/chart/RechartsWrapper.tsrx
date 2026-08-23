import type {
	CSSProperties,
	HTMLAttributes,
	MutableRefObject,
	NativeKeyboardEvent,
	NativeMouseEvent,
	NativeTouchEvent,
	OctaneNode,
	Ref,
} from '../util/OctaneTypes.ts';
import type { ExternalMouseEvents } from './types';
import type { Percent } from '../util/types';

export type RechartsWrapperProps =
	ExternalMouseEvents & {
		children: OctaneNode;
		width: number | Percent | undefined;
		height: number | Percent | undefined;
		responsive: boolean;
		className?: string;
		style?: CSSProperties;
		ref?: Ref<HTMLDivElement>;
		dispatchTouchEvents?: boolean;
	};
type WrapperDivProps =
	Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
		width: number | string | undefined;
		height: number | string | undefined;
		style?: CSSProperties;
		ref?: Ref<HTMLDivElement>;
	};
type StaticDivProps =
	Omit<WrapperDivProps, 'width' | 'height'> & {
		width: number;
		height: number;
	};
// Port of chart/RechartsWrapper.tsx — the outer <div class="recharts-wrapper">:
// hosts the tooltip/legend portals, reports container size (static, read-once,
// or ResizeObserver-driven), measures CSS scale, and feeds every user
// interaction into the store's event middlewares. Events are NATIVE delegated
// DOM events (octane has no synthetic layer); the middlewares read coordinates
// off the real event, and octane shadows `currentTarget` during delegated
// dispatch so `getRelativeCoordinate` sees the wrapper node as React would.
import { useCallback, useEffect, useRef, useState } from 'octane';
import { clsx } from 'clsx';
import { mouseLeaveChart } from '../state/tooltipSlice';
import { useAppDispatch } from '../state/hooks';
import { mouseClickAction, mouseMoveAction } from '../state/mouseEventsMiddleware';
import {
	useSynchronisedEventsFromOtherCharts,
} from '../synchronisation/useChartSynchronisation.tsrx';
import { focusAction, keyDownAction, blurAction } from '../state/keyboardEventsMiddleware';
import { useReportScale } from '../util/useReportScale.ts';
import { externalEventAction } from '../state/externalEventsMiddleware';
import { touchEventAction } from '../state/touchEventsMiddleware';
import { TooltipPortalContext } from '../context/tooltipPortalContext.ts';
import { LegendPortalContext } from '../context/legendPortalContext.ts';
import { ReportChartSize } from '../context/chartLayoutContext.ts';
import { useResponsiveContainerContext } from '../component/ResponsiveContainer.ts';

function EventSynchronizer() {
	useSynchronisedEventsFromOtherCharts();
	return null;
}

function getNumberOrZero(value: number | string | undefined) {
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}
	return 0;
}

function ResponsiveDiv(props: WrapperDivProps) {
	const { ref, ...divProps } = props;
	const observerRef: MutableRefObject<ResizeObserver | null> = useRef(null);
	const [sizes, setSizes] = useState({
		containerWidth: getNumberOrZero(props.style?.width),
		containerHeight: getNumberOrZero(props.style?.height),
	});
	const setContainerSize = useCallback((newWidth, newHeight) => {
		setSizes((prevState) => {
			const roundedWidth = Math.round(newWidth);
			const roundedHeight = Math.round(newHeight);
			if (
				prevState.containerWidth === roundedWidth && prevState.containerHeight === roundedHeight
			) {
				return prevState;
			}
			return { containerWidth: roundedWidth, containerHeight: roundedHeight };
		});
	}, []);
	const innerRef = useCallback((node) => {
		// 1. First, call the external ref if it was provided
		if (typeof ref === 'function') {
			ref(node);
		}
		// 2. Disconnect any previously active ResizeObserver
		if (observerRef.current != null) {
			observerRef.current.disconnect();
			observerRef.current = null;
		}
		// 3. Observe the new node
		if (node != null && typeof ResizeObserver !== 'undefined') {
			const { width: containerWidth, height: containerHeight } = node.getBoundingClientRect();
			setContainerSize(containerWidth, containerHeight);
			const callback = (entries: ResizeObserverEntry[]) => {
				const entry = entries[0];
				if (entry == null) {
					return;
				}
				const { width, height } = entry.contentRect;
				setContainerSize(width, height);
			};
			const observer = new ResizeObserver(callback);
			observer.observe(node);
			observerRef.current = observer;
		}
	}, [ref, setContainerSize]);
	useEffect(() => {
		return () => {
			const observer = observerRef.current;
			if (observer != null) {
				observer.disconnect();
			}
		};
	}, [setContainerSize]);
	return <>
		<ReportChartSize width={sizes.containerWidth} height={sizes.containerHeight} />
		<div ref={innerRef} {...divProps} />
	</>;
}

function ReadSizeOnceDiv(props: WrapperDivProps) {
	// Upstream spreads the FULL props onto the div — width/height included
	// (they pass through as plain attributes).
	const { ref, width, height, ...rest } = props;
	const divProps = { width, height, ...rest };
	const [sizes, setSizes] = useState({
		containerWidth: getNumberOrZero(width),
		containerHeight: getNumberOrZero(height),
	});
	const setContainerSize = useCallback((newWidth, newHeight) => {
		setSizes((prevState) => {
			const roundedWidth = Math.round(newWidth);
			const roundedHeight = Math.round(newHeight);
			if (
				prevState.containerWidth === roundedWidth && prevState.containerHeight === roundedHeight
			) {
				return prevState;
			}
			return { containerWidth: roundedWidth, containerHeight: roundedHeight };
		});
	}, []);
	const innerRef = useCallback((node) => {
		if (typeof ref === 'function') {
			ref(node);
		}
		if (node != null) {
			const { width: containerWidth, height: containerHeight } = node.getBoundingClientRect();
			setContainerSize(containerWidth, containerHeight);
		}
	}, [ref, setContainerSize]);
	return <>
		<ReportChartSize width={sizes.containerWidth} height={sizes.containerHeight} />
		<div ref={innerRef} {...divProps} />
	</>;
}

function StaticDiv(props: StaticDivProps) {
	const { ref, width, height, ...rest } = props;
	const divProps = { width, height, ...rest };
	return <>
		<ReportChartSize width={width} height={height} />
		<div ref={ref} {...divProps} />
	</>;
}

function NonResponsiveDiv(props: WrapperDivProps) {
	const { width, height } = props;
	// Percentage/CSS-string sizes: read the real size from the DOM once.
	if (typeof width === 'string' || typeof height === 'string') {
		return <ReadSizeOnceDiv {...props} />;
	}
	// Both numbers: use directly.
	if (typeof width === 'number' && typeof height === 'number') {
		return <StaticDiv {...props} width={width} height={height} />;
	}
	// Undefined sizes: report as-is (renders no SVG — intentional back-compat).
	const { ref, ...divProps } = props;
	// (width/height are undefined here, so nothing extra lands on the div.)
	return <>
		<ReportChartSize width={width} height={height} />
		<div ref={ref} {...divProps} />
	</>;
}

export function RechartsWrapper(props: RechartsWrapperProps) {
	const {
		children,
		className,
		height: heightFromProps,
		onClick,
		onContextMenu,
		onDoubleClick,
		onMouseDown,
		onMouseEnter,
		onMouseLeave,
		onMouseMove,
		onMouseUp,
		onTouchEnd,
		onTouchMove,
		onTouchStart,
		style,
		width: widthFromProps,
		responsive,
		dispatchTouchEvents = true,
		ref,
	} = props;
	const containerRef: MutableRefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null);
	const dispatch = useAppDispatch();
	const [tooltipPortal, setTooltipPortal] = useState(null);
	const [legendPortal, setLegendPortal] = useState(null);
	const setScaleRef = useReportScale();
	const responsiveContainerCalculations = useResponsiveContainerContext();
	const width =
		responsiveContainerCalculations?.width > 0
			? responsiveContainerCalculations.width
			: widthFromProps;
	const height =
		responsiveContainerCalculations?.height > 0
			? responsiveContainerCalculations.height
			: heightFromProps;
	const innerRef = useCallback((node) => {
		setScaleRef(node);
		if (typeof ref === 'function') {
			ref(node);
		}
		setTooltipPortal(node);
		setLegendPortal(node);
		if (node != null) {
			containerRef.current = node;
		}
	}, [setScaleRef, ref, setTooltipPortal, setLegendPortal]);
	const myOnClick = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(mouseClickAction(e));
		dispatch(externalEventAction({ handler: onClick, reactEvent: e }));
	}, [dispatch, onClick]);
	const myOnMouseEnter = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(mouseMoveAction(e));
		dispatch(externalEventAction({ handler: onMouseEnter, reactEvent: e }));
	}, [dispatch, onMouseEnter]);
	const myOnMouseLeave = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(mouseLeaveChart());
		dispatch(externalEventAction({ handler: onMouseLeave, reactEvent: e }));
	}, [dispatch, onMouseLeave]);
	const myOnMouseMove = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(mouseMoveAction(e));
		dispatch(externalEventAction({ handler: onMouseMove, reactEvent: e }));
	}, [dispatch, onMouseMove]);
	const onFocus = useCallback(() => {
		dispatch(focusAction());
	}, [dispatch]);
	const onBlur = useCallback(() => {
		dispatch(blurAction());
	}, [dispatch]);
	const onKeyDown = useCallback((e: NativeKeyboardEvent<HTMLDivElement>) => {
		dispatch(keyDownAction(e.key));
	}, [dispatch]);
	const myOnContextMenu = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onContextMenu, reactEvent: e }));
	}, [dispatch, onContextMenu]);
	const myOnDoubleClick = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onDoubleClick, reactEvent: e }));
	}, [dispatch, onDoubleClick]);
	const myOnMouseDown = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onMouseDown, reactEvent: e }));
	}, [dispatch, onMouseDown]);
	const myOnMouseUp = useCallback((e: NativeMouseEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onMouseUp, reactEvent: e }));
	}, [dispatch, onMouseUp]);
	const myOnTouchStart = useCallback((e: NativeTouchEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onTouchStart, reactEvent: e }));
	}, [dispatch, onTouchStart]);
	// Touch has no enter/leave; the middleware resolves the touched element via
	// document.elementFromPoint.
	const myOnTouchMove = useCallback((e: NativeTouchEvent<HTMLDivElement>) => {
		if (dispatchTouchEvents) {
			dispatch(touchEventAction(e));
		}
		dispatch(externalEventAction({ handler: onTouchMove, reactEvent: e }));
	}, [dispatch, dispatchTouchEvents, onTouchMove]);
	const myOnTouchEnd = useCallback((e: NativeTouchEvent<HTMLDivElement>) => {
		dispatch(externalEventAction({ handler: onTouchEnd, reactEvent: e }));
	}, [dispatch, onTouchEnd]);
	const WrapperDiv = responsive ? ResponsiveDiv : NonResponsiveDiv;
	return <TooltipPortalContext.Provider value={tooltipPortal}>
		<LegendPortalContext.Provider value={legendPortal}>
			<WrapperDiv
				width={width ?? style?.width}
				height={height ?? style?.height}
				className={clsx('recharts-wrapper', className)}
				style={{ position: 'relative', cursor: 'default', width, height, ...style }}
				onClick={myOnClick}
				onContextMenu={myOnContextMenu}
				onDoubleClick={myOnDoubleClick}
				onFocus={onFocus}
				onBlur={onBlur}
				onKeyDown={onKeyDown}
				onMouseDown={myOnMouseDown}
				onMouseEnter={myOnMouseEnter}
				onMouseLeave={myOnMouseLeave}
				onMouseMove={myOnMouseMove}
				onMouseUp={myOnMouseUp}
				onTouchEnd={myOnTouchEnd}
				onTouchMove={myOnTouchMove}
				onTouchStart={myOnTouchStart}
				ref={innerRef}
			>
				<EventSynchronizer />
				{children}
			</WrapperDiv>
		</LegendPortalContext.Provider>
	</TooltipPortalContext.Provider>;
}
