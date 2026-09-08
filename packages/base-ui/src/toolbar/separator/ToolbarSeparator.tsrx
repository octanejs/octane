'use client';
import * as React from 'octane';
import type { Orientation } from '../../internals/types';
import { Separator, type SeparatorState } from '../../separator';
import { useToolbarRootContext } from '../root/ToolbarRootContext';

/**
 * A separator element accessible to screen readers.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export const ToolbarSeparator = function ToolbarSeparator(
	propsWithRef: React.PropsWithoutRef<ToolbarSeparator.Props> & { ref?: React.Ref<HTMLDivElement> },
) {
	const { ref: forwardedRef = null, ...props } = propsWithRef;
	const context = useToolbarRootContext();

	const orientation = context.orientation === 'vertical' ? 'horizontal' : 'vertical';

	return <Separator orientation={orientation} {...props} ref={forwardedRef} />;
};

export interface ToolbarSeparatorState extends SeparatorState {}

export interface ToolbarSeparatorProps extends Separator.Props {
	/**
	 * The orientation of the separator. Defaults to the opposite of the toolbar's
	 * orientation, so a horizontal toolbar renders vertical separators.
	 */
	orientation?: Orientation | undefined;
}

export namespace ToolbarSeparator {
	export type State = ToolbarSeparatorState;
	export type Props = ToolbarSeparatorProps;
}
