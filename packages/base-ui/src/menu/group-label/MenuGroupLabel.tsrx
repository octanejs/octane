'use client';
import type * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useMenuGroupRootContext } from '../group/MenuGroupContext';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export const MenuGroupLabel = function MenuGroupLabel(
	componentPropsWithRef: React.PropsWithoutRef<MenuGroupLabel.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const id = useBaseUiId(idProp);

	const setLabelId = useMenuGroupRootContext();

	useIsoLayoutEffect(() => {
		setLabelId(id);
		return () => {
			setLabelId((currentId) => (currentId === id ? undefined : currentId));
		};
	}, [setLabelId, id]);

	return useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: {
			id,
			'aria-hidden': true,
			...elementProps,
		},
	});
};

export interface MenuGroupLabelProps extends BaseUIComponentProps<'div', MenuGroupLabelState> {}

export interface MenuGroupLabelState {}

export namespace MenuGroupLabel {
	export type Props = MenuGroupLabelProps;
	export type State = MenuGroupLabelState;
}
