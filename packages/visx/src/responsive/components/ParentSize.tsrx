import type { CSSProperties } from 'react';
import type { Octane } from 'octane/jsx-runtime';
import type { OctaneNode } from 'octane';
import type { ParentSizeState, UseParentSizeConfig } from '../hooks/useParentSize.tsrx';
import useParentSize from '../hooks/useParentSize.tsrx';

export type ParentSizeProvidedProps = ParentSizeState & {
		ref: HTMLDivElement | null;
		resize: (state: ParentSizeState) => void;
	};

export type ParentSizeProps = {
		/** Optional `className` to add to the outer wrapper `div`. */
		className?: string;
		/**
 * @deprecated - use `style` prop as all other props are passed directly to the outer `div`.
 * @TODO remove in the next major version.
 * Optional `style` object to apply to the outer wrapper `div`. Merged with default styles
 * (`width: 100%; height: 100%; position: relative`); your values take precedence.
 * */
		parentSizeStyles?: CSSProperties;
		/** Child render function `({ width, height, top, left, ref, resize }) => OctaneNode`. */
		children: (args: ParentSizeProvidedProps) => OctaneNode;
	} & UseParentSizeConfig;

const defaultOuterStyles: CSSProperties = { width: '100%', height: '100%', position: 'relative' };

const measurementStyles: CSSProperties = {
	position: 'absolute',
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
	overflow: 'hidden',
};

export default function ParentSize({
	className,
	children,
	debounceTime,
	ignoreDimensions,
	initialSize,
	parentSizeStyles,
	enableDebounceLeadingCall = true,
	resizeObserverPolyfill,
	style,
	...restProps
}: ParentSizeProps &
	Omit<Octane.HTMLAttributes<HTMLDivElement>, keyof ParentSizeProps | 'style'> & {
		/** Octane's `style` also accepts a plain string; ParentSize merges styles, so keep the object form. */
		style?: CSSProperties;
	}) {
	const { parentRef, node, resize, ...dimensions } = useParentSize({
		initialSize,
		debounceTime,
		ignoreDimensions,
		enableDebounceLeadingCall,
		resizeObserverPolyfill,
	});

	const outerStyle: CSSProperties = parentSizeStyles
		? { position: 'relative', ...parentSizeStyles, ...style }
		: { ...defaultOuterStyles, ...style };

	return <div style={outerStyle} className={className} {...restProps}>
		<div style={measurementStyles} ref={parentRef}>{children({
			...dimensions,
			ref: node,
			resize,
		})}</div>
	</div>;
}
