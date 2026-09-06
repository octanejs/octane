'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * A small rectangular area that appears at the intersection of horizontal and vertical scrollbars.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export const ScrollAreaCorner = function ScrollAreaCorner(
	componentPropsWithRef: React.PropsWithoutRef<ScrollAreaCorner.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { cornerRef, cornerSize, hiddenState } = useScrollAreaRootContext();

	const element = useRenderElement('div', componentProps, {
		ref: [forwardedRef, cornerRef],
		props: [
			{
				'aria-hidden': true,
				style: {
					position: 'absolute',
					bottom: 0,
					insetInlineEnd: 0,
					width: cornerSize.width,
					height: cornerSize.height,
				},
			},
			elementProps,
		],
	});

	if (hiddenState.corner) {
		return null;
	}

	return element;
};

export interface ScrollAreaCornerState {}

export interface ScrollAreaCornerProps extends BaseUIComponentProps<'div', ScrollAreaCornerState> {}

export namespace ScrollAreaCorner {
	export type State = ScrollAreaCornerState;
	export type Props = ScrollAreaCornerProps;
}
