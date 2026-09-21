'use client';
import * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useScrollAreaViewportContext } from '../viewport/ScrollAreaViewportContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useScrollAreaRootContext } from '../root/ScrollAreaRootContext';
import { scrollAreaStateAttributesMapping } from '../root/stateAttributes';
import type { ScrollAreaRootState } from '../root/ScrollAreaRoot.tsrx';

/**
 * A container for the content of the scroll area.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Scroll Area](https://base-ui.com/react/components/scroll-area)
 */
export const ScrollAreaContent = function ScrollAreaContent(
	componentPropsWithRef: React.PropsWithoutRef<ScrollAreaContent.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { computeThumbPosition } = useScrollAreaViewportContext();
	const { viewportState } = useScrollAreaRootContext();

	const contentWrapperRef = React.useRef<HTMLDivElement | null>(null);

	useIsoLayoutEffect(() => {
		if (typeof ResizeObserver === 'undefined') {
			return undefined;
		}

		// Deferred notifications can include a resize that happened after the mount
		// measurement, so the first delivery must also recompute the current geometry.
		const resizeObserver = React.createResizeObserver(computeThumbPosition);

		if (contentWrapperRef.current) {
			resizeObserver.observe(contentWrapperRef.current);
		}

		return () => {
			resizeObserver.disconnect();
		};
	}, [computeThumbPosition]);

	const element = useRenderElement('div', componentProps, {
		ref: [forwardedRef, contentWrapperRef],
		state: viewportState,
		stateAttributesMapping: scrollAreaStateAttributesMapping,
		props: [
			{
				role: 'presentation',
				style: {
					minWidth: 'fit-content',
				},
			},
			elementProps,
		],
	});

	return element;
};

export interface ScrollAreaContentState extends ScrollAreaRootState {}

export interface ScrollAreaContentProps extends BaseUIComponentProps<
	'div',
	ScrollAreaContentState
> {}

export namespace ScrollAreaContent {
	export type State = ScrollAreaContentState;
	export type Props = ScrollAreaContentProps;
}
