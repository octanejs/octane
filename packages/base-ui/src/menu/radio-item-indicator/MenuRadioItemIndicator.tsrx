'use client';
import * as React from 'octane';
import { useMenuRadioItemContext } from '../radio-item/MenuRadioItemContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { itemMapping } from '../utils/stateAttributesMapping';
import { type TransitionStatus, useTransitionStatus } from '../../internals/useTransitionStatus';
import { useOpenChangeComplete } from '../../internals/useOpenChangeComplete.tsrx';

/**
 * Indicates whether the radio item is selected.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export const MenuRadioItemIndicator = function MenuRadioItemIndicator(
	componentPropsWithRef: React.PropsWithoutRef<MenuRadioItemIndicator.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, keepMounted = false, ...elementProps } = componentProps;

	const item = useMenuRadioItemContext();

	const indicatorRef = React.useRef<HTMLSpanElement | null>(null);

	const { transitionStatus, mounted, setMounted } = useTransitionStatus(item.checked);

	useOpenChangeComplete({
		batch: true,
		enabled: !item.checked,
		open: item.checked,
		ref: indicatorRef,
		onComplete() {
			if (!item.checked) {
				setMounted(false);
			}
		},
	});

	const state: MenuRadioItemIndicatorState = {
		checked: item.checked,
		disabled: item.disabled,
		highlighted: item.highlighted,
		transitionStatus,
	};

	const element = useRenderElement('span', componentProps, {
		state,
		stateAttributesMapping: itemMapping,
		ref: [forwardedRef, indicatorRef],
		props: {
			'aria-hidden': true,
			...elementProps,
		},
		enabled: keepMounted || mounted,
	});

	return element;
};

export interface MenuRadioItemIndicatorProps extends BaseUIComponentProps<
	'span',
	MenuRadioItemIndicatorState
> {
	/**
	 * Whether to keep the HTML element in the DOM when the radio item is inactive.
	 * @default false
	 */
	keepMounted?: boolean | undefined;
}

export interface MenuRadioItemIndicatorState {
	/**
	 * Whether the radio item is currently selected.
	 */
	checked: boolean;
	/**
	 * Whether the component should ignore user interaction.
	 */
	disabled: boolean;
	/**
	 * Whether the item is highlighted.
	 */
	highlighted: boolean;
	/**
	 * The transition status of the component.
	 */
	transitionStatus: TransitionStatus;
}

export namespace MenuRadioItemIndicator {
	export type Props = MenuRadioItemIndicatorProps;
	export type State = MenuRadioItemIndicatorState;
}
