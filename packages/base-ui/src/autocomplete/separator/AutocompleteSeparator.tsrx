'use client';
import type * as React from 'octane';
import { ListboxSeparator } from '../../utils/listbox-separator/ListboxSeparator.tsrx';
import type { BaseUIComponentProps, Orientation } from '../../internals/types';

export interface AutocompleteSeparatorProps extends BaseUIComponentProps<
	'div',
	AutocompleteSeparatorState
> {
	/**
	 * The orientation of the separator.
	 * @default 'horizontal'
	 */
	orientation?: Orientation | undefined;
}

export interface AutocompleteSeparatorState {
	/**
	 * The orientation of the separator.
	 */
	orientation: Orientation;
}

/**
 * A visual separator between items or groups.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 */
export const AutocompleteSeparator = ListboxSeparator as React.FunctionComponent<
	AutocompleteSeparatorProps & React.RefAttributes<HTMLDivElement>
>;

export namespace AutocompleteSeparator {
	export type Props = AutocompleteSeparatorProps;
	export type State = AutocompleteSeparatorState;
}
