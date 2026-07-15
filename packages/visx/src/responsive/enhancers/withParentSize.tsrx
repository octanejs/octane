import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import type { ComponentType, CSSProperties } from 'react';
import type { DebounceSettings, Simplify, PrivateWindow, ResizeObserverPolyfill } from '../types';
import { debounce } from '../utils/debounce';

const CONTAINER_STYLES: CSSProperties = {
	width: '100%',
	height: '100%',
	position: 'relative',
};

const MEASUREMENT_STYLES: CSSProperties = {
	position: 'absolute',
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
	overflow: 'hidden',
};

/** @deprecated @TODO remove in the next major version - exported for backwards compatibility */
export type WithParentSizeProps = DebounceSettings;

type WithParentSizeConfig = {
	initialWidth?: number;
	initialHeight?: number;
} & DebounceSettings;

type WithParentSizeState = {
	parentWidth?: number;
	parentHeight?: number;
};

export type WithParentSizeProvidedProps = WithParentSizeState;

type WithParentSizeComponentProps<P extends WithParentSizeProvidedProps> = Simplify<
	Omit<P, keyof WithParentSizeProvidedProps> & WithParentSizeConfig
>;

export default function withParentSize<P extends WithParentSizeProvidedProps>(
	BaseComponent: ComponentType<P>,
	resizeObserverPolyfill?: ResizeObserverPolyfill,
): ComponentType<WithParentSizeComponentProps<P>> {
	function WrappedComponent(props: WithParentSizeComponentProps<P>) {
		const [size, setSize] = useState<WithParentSizeState>({});
		const containerRef = useRef<HTMLDivElement | null>(null);
		const animationFrameRef = useRef(0);
		const resize = useMemo(
			() =>
				debounce(
					({ width, height }: { width: number; height: number }) => {
						setSize({ parentWidth: width, parentHeight: height });
					},
					props.debounceTime ?? 300,
					{ leading: props.enableDebounceLeadingCall ?? true },
				),
			[props.debounceTime, props.enableDebounceLeadingCall],
		);
		const setContainerRef = useCallback((node: HTMLDivElement | null) => {
			containerRef.current = node;
		}, []);

		useEffect(() => {
			const ResizeObserverLocal =
				resizeObserverPolyfill || (window as unknown as PrivateWindow).ResizeObserver;
			const observer = new ResizeObserverLocal((entries) => {
				entries.forEach((entry) => {
					const { width, height } = entry.contentRect;
					animationFrameRef.current = window.requestAnimationFrame(() => {
						resize({ width, height });
					});
				});
			});
			if (containerRef.current) observer.observe(containerRef.current);
			return () => {
				window.cancelAnimationFrame(animationFrameRef.current);
				observer.disconnect();
				resize.cancel();
			};
		}, [resize]);

		const parentWidth = size.parentWidth ?? props.initialWidth;
		const parentHeight = size.parentHeight ?? props.initialHeight;
		return (
			<div style={CONTAINER_STYLES}>
				<div style={MEASUREMENT_STYLES} ref={setContainerRef}>
					{parentWidth != null && parentHeight != null && (
						<BaseComponent
							parentWidth={parentWidth}
							parentHeight={parentHeight}
							{...(props as P)}
						/>
					)}
				</div>
			</div>
		);
	}

	WrappedComponent.displayName = `withParentSize(${BaseComponent.displayName ?? BaseComponent.name ?? 'Component'})`;
	return WrappedComponent as ComponentType<WithParentSizeComponentProps<P>>;
}
