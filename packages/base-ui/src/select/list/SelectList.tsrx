'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useSelectRootContext, useSelectRootPropsContext } from '../root/SelectRootContext';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { styleDisableScrollbar } from '../../utils/styles.tsrx';
import { LIST_FUNCTIONAL_STYLES } from '../popup/utils';

/**
 * A container for the select items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectList = function SelectList(
	componentPropsWithRef: React.PropsWithoutRef<SelectList.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const store = useSelectRootContext();
	const { multiple, readOnly } = useSelectRootPropsContext();
	const { alignItemWithTriggerActive } = useSelectPositionerContext();

	const hasScrollArrows = store.useState('hasScrollArrows');
	const openMethod = store.useState('openMethod');
	const id = store.useState('id');

	const defaultProps: HTMLProps = {
		id: `${id}-list`,
		role: 'listbox',
		'aria-multiselectable': multiple || undefined,
		'aria-readonly': readOnly || undefined,
		onScroll(event) {
			store.context.scrollHandlerRef.current?.(event.currentTarget);
		},
		...(alignItemWithTriggerActive && {
			style: LIST_FUNCTIONAL_STYLES,
		}),
		className:
			hasScrollArrows && openMethod !== 'touch' ? styleDisableScrollbar.className : undefined,
	};

	const setListElement = store.useStateSetter('listElement');

	return useRenderElement('div', componentProps, {
		ref: [forwardedRef, setListElement],
		props: [defaultProps, elementProps],
	});
};

export interface SelectListProps extends BaseUIComponentProps<'div', SelectListState> {}

export interface SelectListState {}

export namespace SelectList {
	export type Props = SelectListProps;
	export type State = SelectListState;
}
