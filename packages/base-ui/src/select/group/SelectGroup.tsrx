'use client';
import * as React from 'octane';
import type { BaseUIComponentProps } from '../../internals/types';
import { SelectGroupContext } from './SelectGroupContext';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * Groups related select items with the corresponding label.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectGroup = function SelectGroup(
	componentPropsWithRef: React.PropsWithoutRef<SelectGroup.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { render, className, style, ...elementProps } = componentProps;

	const [labelId, setLabelId] = React.useState<string | undefined>();

	const contextValue: SelectGroupContext = React.useMemo(
		() => ({
			labelId,
			setLabelId,
		}),
		[labelId, setLabelId],
	);

	const element = useRenderElement('div', componentProps, {
		ref: forwardedRef,
		props: [
			{
				role: 'group',
				'aria-labelledby': labelId,
			},
			elementProps,
		],
	});

	return <SelectGroupContext.Provider value={contextValue}>{element}</SelectGroupContext.Provider>;
};

export interface SelectGroupState {}

export interface SelectGroupProps extends BaseUIComponentProps<'div', SelectGroupState> {}

export namespace SelectGroup {
	export type State = SelectGroupState;
	export type Props = SelectGroupProps;
}
