'use client';
import type * as React from 'octane';
import type { BaseUIComponentProps, Orientation } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement.tsrx';

/**
 * A visual separator between items.
 * Renders a `<div>` element.
 *
 * @internal
 */
export const ListboxSeparator = function ListboxSeparator(
	componentPropsWithRef: React.PropsWithoutRef<ListboxSeparator.Props> & {
		ref?: React.Ref<HTMLDivElement>;
	},
) {
	const { ref: forwardedRef = null, ...componentProps } = componentPropsWithRef;
	const { className, render, orientation = 'horizontal', style, ...elementProps } = componentProps;

	const state: ListboxSeparatorState = { orientation };

	return useRenderElement('div', componentProps, {
		state,
		ref: forwardedRef,
		props: [{ role: 'presentation' }, elementProps],
	});
};

export interface ListboxSeparatorProps extends BaseUIComponentProps<'div', ListboxSeparatorState> {
	/**
	 * The orientation of the separator.
	 * @default 'horizontal'
	 */
	orientation?: Orientation | undefined;
}

export interface ListboxSeparatorState {
	/**
	 * The orientation of the separator.
	 */
	orientation: Orientation;
}

export namespace ListboxSeparator {
	export type Props = ListboxSeparatorProps;
	export type State = ListboxSeparatorState;
}
