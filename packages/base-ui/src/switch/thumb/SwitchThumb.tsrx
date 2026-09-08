'use client';
import type * as React from 'octane';
import type { SwitchRootState } from '../root/SwitchRoot.tsrx';
import { useSwitchRootContext } from '../root/SwitchRootContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { stateAttributesMapping } from '../stateAttributesMapping';

/**
 * The movable part of the switch that indicates whether the switch is on or off.
 * Renders a `<span>`.
 *
 * Documentation: [Base UI Switch](https://base-ui.com/react/components/switch)
 */
export const SwitchThumb = function SwitchThumb(
	componentPropsWithRef: React.PropsWithoutRef<SwitchThumb.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const state = useSwitchRootContext();

	return useRenderElement('span', componentProps, {
		state,
		ref: forwardedRef,
		stateAttributesMapping,
		props: elementProps,
	});
};

export interface SwitchThumbProps extends BaseUIComponentProps<'span', SwitchThumbState> {}

export interface SwitchThumbState extends SwitchRootState {}

export namespace SwitchThumb {
	export type Props = SwitchThumbProps;
	export type State = SwitchThumbState;
}
