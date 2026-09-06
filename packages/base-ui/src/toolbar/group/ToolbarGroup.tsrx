'use client';
import * as React from 'octane';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';
import type { BaseUIComponentProps } from '../../internals/types';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import type { ToolbarRootState } from '../root/ToolbarRoot.tsrx';
import { ToolbarGroupContext } from './ToolbarGroupContext';

/**
 * Groups several toolbar items or toggles.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export const ToolbarGroup = function ToolbarGroup(
	componentPropsWithRef: React.PropsWithoutRef<ToolbarGroup.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const {
		className,
		disabled: disabledProp = false,
		render,
		style,
		...elementProps
	} = componentProps;

	const { orientation, disabled: toolbarDisabled } = useToolbarRootContext();

	const disabled = toolbarDisabled || disabledProp;

	const contextValue: ToolbarGroupContext = React.useMemo(
		() => ({
			disabled,
		}),
		[disabled],
	);

	const state: ToolbarRootState = {
		disabled,
		orientation,
	};

	const element = useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [{ role: 'group' }, elementProps],
	});

	return (
		<ToolbarGroupContext.Provider value={contextValue}>{element}</ToolbarGroupContext.Provider>
	);
};

export interface ToolbarGroupState extends ToolbarRootState {}

export interface ToolbarGroupProps extends BaseUIComponentProps<'div', ToolbarGroupState> {
	/**
	 * When `true` all toolbar items in the group are disabled.
	 * @default false
	 */
	disabled?: boolean | undefined;
}

export namespace ToolbarGroup {
	export type State = ToolbarGroupState;
	export type Props = ToolbarGroupProps;
}
