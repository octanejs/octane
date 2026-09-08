'use client';
import * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import { ComboboxRowContext } from './ComboboxRowContext';

/**
 * Displays a single row of items in a grid list.
 * Enable `grid` on the root component to turn the listbox into a grid.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Combobox](https://base-ui.com/react/components/combobox)
 */
export const ComboboxRow = function ComboboxRow(
	componentPropsWithRef: React.PropsWithoutRef<ComboboxRow.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const element = useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: [{ role: 'row' }, elementProps],
	});

	return <ComboboxRowContext.Provider value>{element}</ComboboxRowContext.Provider>;
};

export interface ComboboxRowState {}

export interface ComboboxRowProps extends BaseUIComponentProps<'div', ComboboxRowState> {}

export namespace ComboboxRow {
	export type State = ComboboxRowState;
	export type Props = ComboboxRowProps;
}
