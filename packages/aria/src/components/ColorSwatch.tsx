/** @jsxImportSource octane */
// Ported from adobe/react-spectrum@1c84a49a1faf50b571c84e00bcf9c60b22ddd03e (packages/react-aria-components/src/ColorSwatch.tsx).
import {
	type AriaColorSwatchProps,
	useColorSwatch,
} from '../upstream-exports/react-aria/useColorSwatch';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type SlotProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';
import type { Color } from '../upstream-exports/react-stately/Color';
import { filterDOMProps } from '../upstream-exports/react-aria/filterDOMProps';
import type { GlobalDOMAttributes } from '@react-types/shared';
import { mergeProps } from '../upstream-exports/react-aria/mergeProps';
import React, { createContext, type ForwardedRef, forwardRef } from '../compat/react';

export interface ColorSwatchRenderProps {
	/** The color of the swatch. */
	color: Color;
}

export interface ColorSwatchProps
	extends
		AriaColorSwatchProps,
		StyleRenderProps<ColorSwatchRenderProps>,
		SlotProps,
		GlobalDOMAttributes<HTMLDivElement> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ColorSwatch'
	 */
	className?: ClassNameOrFunction<ColorSwatchRenderProps>;
}

export const ColorSwatchContext =
	createContext<ContextValue<ColorSwatchProps, HTMLDivElement>>(null);

/**
 * A ColorSwatch displays a preview of a selected color.
 */
export const ColorSwatch = forwardRef(function ColorSwatch(
	props: ColorSwatchProps,
	ref: ForwardedRef<HTMLDivElement>,
) {
	[props, ref] = useContextProps(props, ref, ColorSwatchContext);
	let { colorSwatchProps, color } = useColorSwatch(props);
	let renderProps = useRenderProps({
		...props,
		defaultClassName: 'react-aria-ColorSwatch',
		defaultStyle: colorSwatchProps.style,
		values: {
			color,
		},
	});

	let DOMProps = filterDOMProps(props, { global: true });

	return (
		<dom.div
			{...mergeProps(DOMProps, colorSwatchProps, renderProps)}
			slot={props.slot || undefined}
			ref={ref}
		/>
	);
});
