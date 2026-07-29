import type { OctaneNode } from 'octane';
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'octane';
import { clsx } from 'clsx';
import throttle from 'es-toolkit/compat/throttle';
import { isNumber, noop } from '../util/DataUtils';
import {
	calculateChartDimensions,
	defaultResponsiveContainerProps,
	getDefaultWidthAndHeight,
	getInnerDivStyle,
} from './responsiveContainerUtils';
import { isPositiveNumber } from '../util/isWellBehavedNumber';

export interface ResponsiveContainerDimensions {
	width: number;
	height: number;
}

export interface Props {
	aspect?: number;
	width?: `${number}%` | number;
	height?: `${number}%` | number;
	minWidth?: string | number;
	minHeight?: string | number;
	initialDimension?: ResponsiveContainerDimensions;
	maxHeight?: number;
	children: OctaneNode;
	debounce?: number;
	id?: string | number;
	className?: string | number;
	style?: React.CSSProperties;
	onResize?: (width: number, height: number) => void;
	ref?: React.Ref<HTMLDivElement>;
	[key: string]: any;
}

const initialDimension = defaultResponsiveContainerProps.initialDimension;
const ResponsiveContainerContext = createContext<ResponsiveContainerDimensions>(initialDimension);

export const ResponsiveContainerContextProviderInternal = ResponsiveContainerContext.Provider;
export const useResponsiveContainerContext = () => useContext(ResponsiveContainerContext);
export { initialDimension as defaultResponsiveContainerDimension };

function ResponsiveContainerContextProvider({
	children,
	width,
	height,
}: {
	children: OctaneNode;
	width: number | undefined;
	height: number | undefined;
}) {
	const size = useMemo(() => ({ width, height }), [width, height]);
	if (!isPositiveNumber(size.width) || !isPositiveNumber(size.height)) {
		return null;
	}
	return <ResponsiveContainerContext
		value={size as ResponsiveContainerDimensions}
	>{children}</ResponsiveContainerContext>;
}

function SizeDetectorContainer(props: Props) @{
	const {
		aspect,
		initialDimension: initial = initialDimension,
		width,
		height,
		minWidth = 0,
		minHeight,
		maxHeight,
		children,
		debounce = 0,
		id,
		className,
		onResize,
		style = {},
		ref,
		...others
	} = props;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const onResizeRef = useRef(onResize);
	onResizeRef.current = onResize;
	useImperativeHandle(ref, () => containerRef.current, []);
	const [sizes, setSizes] = useState({
		containerWidth: initial.width,
		containerHeight: initial.height,
	});
	const setContainerSize = useCallback((newWidth: number, newHeight: number) => {
		const containerWidth = Math.round(newWidth);
		const containerHeight = Math.round(newHeight);
		setSizes(
			(previous) => previous.containerWidth === containerWidth &&
			previous.containerHeight === containerHeight
				? previous
				: { containerWidth, containerHeight },
		);
	}, []);
	useEffect(() => {
		if (!containerRef.current || typeof ResizeObserver === 'undefined') {
			return noop;
		}
		const handleResize = (entries: ResizeObserverEntry[]) => {
			const entry = entries[0];
			if (!entry) return;
			setContainerSize(entry.contentRect.width, entry.contentRect.height);
			onResizeRef.current?.(entry.contentRect.width, entry.contentRect.height);
		};
		const callback =
			debounce > 0
				? throttle(handleResize, debounce, { trailing: true, leading: false })
				: handleResize;
		const observer = new ResizeObserver(callback);
		const rect = containerRef.current.getBoundingClientRect();
		setContainerSize(rect.width, rect.height);
		observer.observe(containerRef.current);
		return () => {
			if ('cancel' in callback) callback.cancel();
			observer.disconnect();
		};
	}, [setContainerSize, debounce]);
	const calculated = calculateChartDimensions(sizes.containerWidth, sizes.containerHeight, {
		width,
		height,
		aspect,
		maxHeight,
	});
	const outerProps: any = Object.assign({}, others, {
		id: id ? `${id}` : undefined,
		className: clsx('recharts-responsive-container', className),
		style: { ...style, width, height, minWidth, minHeight, maxHeight },
		ref: containerRef,
	});
	<div {...outerProps}>
		<div style={getInnerDivStyle({ width, height })}>
			<ResponsiveContainerContextProvider
				width={calculated.calculatedWidth}
				height={calculated.calculatedHeight}
			>{children}</ResponsiveContainerContextProvider>
		</div>
	</div>
}

export function ResponsiveContainer(props: Props) {
	const parent = useResponsiveContainerContext();
	if (isPositiveNumber(parent.width) && isPositiveNumber(parent.height)) {
		return props.children;
	}
	const defaults = getDefaultWidthAndHeight(props);
	const calculated = calculateChartDimensions(undefined, undefined, {
		width: defaults.width,
		height: defaults.height,
		aspect: props.aspect,
		maxHeight: props.maxHeight,
	});
	if (isNumber(calculated.calculatedWidth) && isNumber(calculated.calculatedHeight)) {
		return <ResponsiveContainerContextProvider
			width={calculated.calculatedWidth}
			height={calculated.calculatedHeight}
		>{props.children}</ResponsiveContainerContextProvider>;
	}
	return <SizeDetectorContainer {...props} width={defaults.width} height={defaults.height} />;
}
