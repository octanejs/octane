'use client';
import type * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useComboboxGroupContext } from '../group/ComboboxGroupContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxGroupLabel = function ComboboxGroupLabel(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxGroupLabel.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const { setLabelId } = useComboboxGroupContext();

	const id = useBaseUiId(idProp);

	useIsoLayoutEffect(() => {
		setLabelId(id);
		return () => {
			setLabelId((currentId) => (currentId === id ? undefined : currentId));
		};
	}, [id, setLabelId]);

	const element = useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: [{ id, 'aria-hidden': true }, elementProps],
	});

	return element;
};

export interface ComboboxGroupLabelState {}

export interface ComboboxGroupLabelProps extends BaseUIComponentProps<
	'div',
	ComboboxGroupLabelState
> {}

export namespace ComboboxGroupLabel {
	export type State = ComboboxGroupLabelState;
	export type Props = ComboboxGroupLabelProps;
}
