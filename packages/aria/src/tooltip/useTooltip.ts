// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tooltip/useTooltip.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers).
// - The `TooltipTriggerState` type is imported from the ported stately hook, not a bare
//   `react-stately/...` specifier.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { AriaLabelingProps, DOMProps } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import type { TooltipTriggerState } from '../stately/tooltip/useTooltipTriggerState';
import { useHover } from '../interactions/useHover';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TooltipProps {
	isOpen?: boolean;
}

export interface AriaTooltipProps extends TooltipProps, DOMProps, AriaLabelingProps {}

export interface TooltipAria {
	/**
	 * Props for the tooltip element.
	 */
	tooltipProps: DOMAttributes;
}

/**
 * Provides the accessibility implementation for a Tooltip component.
 */
export function useTooltip(props: AriaTooltipProps, state?: TooltipTriggerState): TooltipAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTooltip(
	props: AriaTooltipProps,
	state: TooltipTriggerState | undefined,
	slot: symbol | undefined,
): TooltipAria;
export function useTooltip(...args: any[]): TooltipAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTooltip');
	const props = user[0] as AriaTooltipProps;
	const state = user[1] as TooltipTriggerState | undefined;

	let domProps = filterDOMProps(props, { labelable: true });

	let { hoverProps } = useHover(
		{
			onHoverStart: () => state?.open(true),
			onHoverEnd: () => state?.close(),
		},
		subSlot(slot, 'hover'),
	);

	return {
		tooltipProps: mergeProps(domProps, hoverProps, {
			role: 'tooltip',
		}),
	};
}
