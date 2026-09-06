'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useSelectRootContext } from '../root/SelectRootContext';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';

/**
 * An icon that indicates that the trigger button opens a select popup.
 * Renders a `<span>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectIcon = function SelectIcon(
	componentPropsWithRef: React.PropsWithoutRef<SelectIcon.Props> & {
		ref?: React.Ref<HTMLSpanElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = useSelectRootContext();
	const open = store.useState('open');

	const state: SelectIconState = {
		open,
	};

	const element = useRenderElement('span', componentProps, {
		state,
		ref: forwardedRef,
		props: [{ 'aria-hidden': true, children: '▼' }, elementProps],
		stateAttributesMapping: triggerOpenStateMapping,
	});

	return element;
};

export interface SelectIconState {
	/**
	 * Whether the select popup is currently open.
	 */
	open: boolean;
}

export interface SelectIconProps extends BaseUIComponentProps<'span', SelectIconState> {}

export namespace SelectIcon {
	export type State = SelectIconState;
	export type Props = SelectIconProps;
}
