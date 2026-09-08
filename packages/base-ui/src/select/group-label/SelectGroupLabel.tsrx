'use client';
import type * as React from 'octane';
import { useIsoLayoutEffect } from '@octanejs/base-ui-utils/useIsoLayoutEffect';
import type { BaseUIComponentProps } from '../../internals/types';
import { useBaseUiId } from '../../internals/useBaseUiId';
import { useSelectGroupContext } from '../group/SelectGroupContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * An accessible label that is automatically associated with its parent group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectGroupLabel = function SelectGroupLabel(
	componentPropsWithRef: React.PropsWithoutRef<SelectGroupLabel.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, id: idProp, ...elementProps } = componentProps;

	const { setLabelId } = useSelectGroupContext();

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

export interface SelectGroupLabelState {}

export interface SelectGroupLabelProps extends BaseUIComponentProps<'div', SelectGroupLabelState> {}

export namespace SelectGroupLabel {
	export type State = SelectGroupLabelState;
	export type Props = SelectGroupLabelProps;
}
