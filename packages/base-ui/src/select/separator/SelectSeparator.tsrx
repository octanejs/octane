'use client';
import type * as React from 'octane';
import { ListboxSeparator } from '../../utils/listbox-separator/ListboxSeparator.tsrx';
import type { BaseUIComponentProps, Orientation } from '../../internals/types';

export interface SelectSeparatorProps extends BaseUIComponentProps<'div', SelectSeparatorState> {
	/**
	 * The orientation of the separator.
	 * @default 'horizontal'
	 */
	orientation?: Orientation | undefined;
}

export interface SelectSeparatorState {
	/**
	 * The orientation of the separator.
	 */
	orientation: Orientation;
}

/**
 * A visual separator between items or groups.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 */
export const SelectSeparator = ListboxSeparator as React.FunctionComponent<
	SelectSeparatorProps & React.RefAttributes<HTMLDivElement>
>;

export namespace SelectSeparator {
	export type Props = SelectSeparatorProps;
	export type State = SelectSeparatorState;
}
