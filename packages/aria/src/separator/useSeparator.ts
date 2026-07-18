// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/separator/useSeparator.ts).
import type { AriaLabelingProps, DOMAttributes, DOMProps, Orientation } from '@react-types/shared';

import { filterDOMProps } from '../utils/filterDOMProps';

export interface SeparatorProps extends DOMProps, AriaLabelingProps {
	/**
	 * The orientation of the separator.
	 *
	 * @default 'horizontal'
	 */
	orientation?: Orientation;
	/** The HTML element type that will be used to render the separator. */
	elementType?: string;
}

export interface SeparatorAria {
	/** Props for the separator element. */
	separatorProps: DOMAttributes;
}

export function useSeparator(props: SeparatorProps): SeparatorAria {
	let domProps = filterDOMProps(props, { labelable: true });
	let ariaOrientation: 'vertical' | undefined;
	// if orientation is horizontal, aria-orientation default is horizontal, so we leave it undefined
	// if it's vertical, we need to specify it
	if (props.orientation === 'vertical') {
		ariaOrientation = 'vertical';
	}
	// hr elements implicitly have role = separator and a horizontal orientation
	if (props.elementType !== 'hr') {
		return {
			separatorProps: {
				...domProps,
				role: 'separator',
				'aria-orientation': ariaOrientation,
			},
		};
	}
	return { separatorProps: domProps };
}
