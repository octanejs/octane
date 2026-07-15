import { useEffect, useMemo, useState } from 'octane';
import type { ComponentType } from 'react';
import type { Simplify, DebounceSettings } from '../types';
import { debounce } from '../utils/debounce';

type WithScreenSizeConfig = {
	/** @deprecated use `debounceTime` instead */
	windowResizeDebounceTime?: number;
} & DebounceSettings;

/** @deprecated @TODO remove in the next major version - exported for backwards compatibility */
export type WithParentSizeProps = Omit<WithScreenSizeConfig, 'debounceTime'>;

type WithScreenSizeState = {
	screenWidth?: number;
	screenHeight?: number;
};

export type WithScreenSizeProvidedProps = WithScreenSizeState;

type WithScreenSizeComponentProps<P extends WithScreenSizeProvidedProps> = Simplify<
	Omit<P, keyof WithScreenSizeProvidedProps> & WithScreenSizeConfig
>;

export default function withScreenSize<P extends WithScreenSizeProvidedProps>(
	BaseComponent: ComponentType<P>,
): ComponentType<WithScreenSizeComponentProps<P>> {
	function WrappedComponent(props: WithScreenSizeComponentProps<P>) {
		const [size, setSize] = useState<WithScreenSizeState>({});
		const resize = useMemo(
			() =>
				debounce(
					() =>
						setSize({
							screenWidth: window.innerWidth,
							screenHeight: window.innerHeight,
						}),
					props.debounceTime ?? props.windowResizeDebounceTime ?? 300,
					{ leading: props.enableDebounceLeadingCall ?? true },
				),
			[props.debounceTime, props.enableDebounceLeadingCall, props.windowResizeDebounceTime],
		);

		useEffect(() => {
			window.addEventListener('resize', resize, false);
			resize();
			return () => {
				window.removeEventListener('resize', resize, false);
				resize.cancel();
			};
		}, [resize]);

		return size.screenWidth == null || size.screenHeight == null ? null : (
			<BaseComponent
				screenWidth={size.screenWidth}
				screenHeight={size.screenHeight}
				{...(props as P)}
			/>
		);
	}

	WrappedComponent.displayName = `withScreenSize(${BaseComponent.displayName ?? BaseComponent.name ?? 'Component'})`;
	return WrappedComponent as ComponentType<WithScreenSizeComponentProps<P>>;
}
