'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { AccordionItemState } from '../item/AccordionItem.tsrx';
import { useAccordionItemContext } from '../item/AccordionItemContext';
import { accordionStateAttributesMapping } from '../item/stateAttributesMapping';

/**
 * A heading that labels the corresponding panel.
 * Renders an `<h3>` element.
 *
 * Documentation: [Base UI Accordion](https://base-ui.com/react/components/accordion)
 */
export const AccordionHeader = function AccordionHeader(
	componentPropsWithRef: React.PropsWithoutRef<AccordionHeader.Props> & {
		ref?: React.Ref<HTMLHeadingElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const { state } = useAccordionItemContext();

	const element = useRenderElement('h3', componentProps, {
		state,
		ref: forwardedRef,
		props: elementProps,
		stateAttributesMapping: accordionStateAttributesMapping,
	});

	return element;
};

export interface AccordionHeaderState extends AccordionItemState {}

export interface AccordionHeaderProps extends BaseUIComponentProps<'h3', AccordionHeaderState> {}

export namespace AccordionHeader {
	export type State = AccordionHeaderState;
	export type Props = AccordionHeaderProps;
}
