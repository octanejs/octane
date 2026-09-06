'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useComboboxRootContext } from '../root/ComboboxRootContext.tsrx';
import { popupStateMapping } from '../../utils/popupStateMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

const stateAttributesMapping: StateAttributesMapping<ComboboxBackdropState> = {
	...popupStateMapping,
	...transitionStatusMapping,
};

/**
 * An overlay displayed beneath the popup.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxBackdrop = function ComboboxBackdrop(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxBackdrop.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = useComboboxRootContext();

	const open = store.useState('open');
	const mounted = store.useState('mounted');
	const transitionStatus = store.useState('transitionStatus');

	const state: ComboboxBackdropState = {
		open,
		transitionStatus,
	};

	return useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		stateAttributesMapping,
		props: [
			{
				role: 'presentation',
				hidden: !mounted,
				style: {
					userSelect: 'none',
					WebkitUserSelect: 'none',
				},
			},
			elementProps,
		],
	});
};

export interface ComboboxBackdropProps extends BaseUIComponentProps<'div', ComboboxBackdropState> {}

export interface ComboboxBackdropState {
	/**
	 * Whether the popup is currently open.
	 */
	open: boolean;
	/**
	 * The transition status of the component.
	 */
	transitionStatus: TransitionStatus;
}

export namespace ComboboxBackdrop {
	export type Props = ComboboxBackdropProps;
	export type State = ComboboxBackdropState;
}
