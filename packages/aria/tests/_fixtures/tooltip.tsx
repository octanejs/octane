import { useRef } from 'octane';

import { useTooltipTriggerState } from '../../src/stately/tooltip/useTooltipTriggerState';
import { useTooltipTrigger } from '../../src/tooltip/useTooltipTrigger';
import { useTooltip } from '../../src/tooltip/useTooltip';

// A minimal, realistic tooltip: a focusable trigger wired to a tooltip overlay that
// renders only while the state reports open. The consumer-observable contracts are the
// ARIA wiring (aria-describedby ↔ tooltip id, role="tooltip") and the open/close
// transitions driven by hover (with warmup delay), focus, blur, and Escape.
export interface TooltipHarnessProps {
	delay?: number;
	closeDelay?: number;
	trigger?: 'hover' | 'focus';
	tooltipText?: string;
}

export function TooltipHarness(props: TooltipHarnessProps) {
	const state = useTooltipTriggerState(props);
	const ref = useRef<any>(null);
	const { triggerProps, tooltipProps } = useTooltipTrigger(props, state, ref);
	const { tooltipProps: overlayProps } = useTooltip(props, state);
	const text = (props.tooltipText ?? 'Help text') as string;

	return (
		<div data-testid="root">
			<button {...triggerProps} ref={ref} data-testid="trigger">
				Trigger
			</button>
			{state.isOpen ? (
				<div {...tooltipProps} {...overlayProps} data-testid="tooltip">
					{text}
				</div>
			) : null}
		</div>
	);
}
