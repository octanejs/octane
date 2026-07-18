// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/tooltip/useTooltipTriggerState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the module-level warmup/cooldown timers and global tooltip registry are
// ported verbatim; upstream's explicit useEffect dep arrays are kept verbatim with a
// trailing subSlot.
import { useEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import {
	type OverlayTriggerProps,
	useOverlayTriggerState,
} from '../overlays/useOverlayTriggerState';

export interface TooltipTriggerProps extends OverlayTriggerProps {
	/**
	 * Whether the tooltip should be disabled, independent from the trigger.
	 */
	isDisabled?: boolean;

	/**
	 * The delay time for the tooltip to show up. [See
	 * guidelines](https://spectrum.adobe.com/page/tooltip/#Immediate-or-delayed-appearance).
	 *
	 * @default 1500
	 */
	delay?: number;

	/**
	 * The delay time for the tooltip to close. [See
	 * guidelines](https://spectrum.adobe.com/page/tooltip/#Warmup-and-cooldown).
	 *
	 * @default 500
	 */
	closeDelay?: number;

	/**
	 * By default, opens for both focus and hover. Can be made to open only for focus.
	 *
	 * @default 'hover'
	 */
	trigger?: 'hover' | 'focus';

	/**
	 * Whether the tooltip should close when the trigger is pressed.
	 *
	 * @default true
	 */
	shouldCloseOnPress?: boolean;
}

const TOOLTIP_DELAY = 1500; // this seems to be a 1.5 second delay, check with design
const TOOLTIP_COOLDOWN = 500;

export interface TooltipTriggerState {
	/** Whether the tooltip is currently showing. */
	isOpen: boolean;
	/**
	 * Shows the tooltip. By default, the tooltip becomes visible after a delay
	 * depending on a global warmup timer. The `immediate` option shows the
	 * tooltip immediately instead.
	 */
	open(immediate?: boolean): void;
	/** Hides the tooltip. */
	close(immediate?: boolean): void;
}

// octane adaptation: loose index type (upstream's `{}`) so the cleanup's truthiness
// check on a registry entry isn't flagged as an always-defined function.
let tooltips: Record<string, any> = {};
let tooltipId = 0;
let globalWarmedUp = false;
let globalWarmUpTimeout: ReturnType<typeof setTimeout> | null = null;
let globalCooldownTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Manages state for a tooltip trigger. Tracks whether the tooltip is open, and provides
 * methods to toggle this state. Ensures only one tooltip is open at a time and controls
 * the delay for showing a tooltip.
 */
export function useTooltipTriggerState(props?: TooltipTriggerProps): TooltipTriggerState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTooltipTriggerState(
	props: TooltipTriggerProps | undefined,
	slot: symbol | undefined,
): TooltipTriggerState;
export function useTooltipTriggerState(...args: any[]): TooltipTriggerState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTooltipTriggerState');
	const props = (user[0] as TooltipTriggerProps) ?? {};

	let { delay = TOOLTIP_DELAY, closeDelay = TOOLTIP_COOLDOWN } = props;
	let { isOpen, open, close } = useOverlayTriggerState(props, subSlot(slot, 'overlay'));
	let id = useMemo(() => `${++tooltipId}`, [], subSlot(slot, 'id'));
	let closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(
		null,
		subSlot(slot, 'closeTimeout'),
	);
	let closeCallback = useRef<() => void>(close, subSlot(slot, 'closeCallback'));

	let ensureTooltipEntry = () => {
		tooltips[id] = hideTooltip;
	};

	let closeOpenTooltips = () => {
		for (let hideTooltipId in tooltips) {
			if (hideTooltipId !== id) {
				tooltips[hideTooltipId](true);
				delete tooltips[hideTooltipId];
			}
		}
	};

	let showTooltip = () => {
		if (closeTimeout.current) {
			clearTimeout(closeTimeout.current);
		}
		closeTimeout.current = null;
		closeOpenTooltips();
		ensureTooltipEntry();
		globalWarmedUp = true;
		open();
		if (globalWarmUpTimeout) {
			clearTimeout(globalWarmUpTimeout);
			globalWarmUpTimeout = null;
		}
		if (globalCooldownTimeout) {
			clearTimeout(globalCooldownTimeout);
			globalCooldownTimeout = null;
		}
	};

	let hideTooltip = (immediate?: boolean) => {
		if (immediate || closeDelay <= 0) {
			if (closeTimeout.current) {
				clearTimeout(closeTimeout.current);
			}
			closeTimeout.current = null;
			closeCallback.current();
		} else if (!closeTimeout.current) {
			closeTimeout.current = setTimeout(() => {
				closeTimeout.current = null;
				closeCallback.current();
			}, closeDelay);
		}

		if (globalWarmUpTimeout) {
			clearTimeout(globalWarmUpTimeout);
			globalWarmUpTimeout = null;
		}
		if (globalWarmedUp) {
			if (globalCooldownTimeout) {
				clearTimeout(globalCooldownTimeout);
			}
			globalCooldownTimeout = setTimeout(
				() => {
					delete tooltips[id];
					globalCooldownTimeout = null;
					globalWarmedUp = false;
				},
				Math.max(TOOLTIP_COOLDOWN, closeDelay),
			);
		}
	};

	let warmupTooltip = () => {
		closeOpenTooltips();
		ensureTooltipEntry();
		if (!isOpen && !globalWarmedUp) {
			if (globalWarmUpTimeout) {
				clearTimeout(globalWarmUpTimeout);
			}

			globalWarmUpTimeout = setTimeout(() => {
				globalWarmUpTimeout = null;
				globalWarmedUp = true;
				showTooltip();
			}, delay);
		} else if (!isOpen) {
			showTooltip();
		}
	};

	useEffect(
		() => {
			closeCallback.current = close;
		},
		[close],
		subSlot(slot, 'closeCallback'),
	);

	useEffect(
		() => {
			return () => {
				if (closeTimeout.current) {
					clearTimeout(closeTimeout.current);
				}
				let tooltip = tooltips[id];
				if (tooltip) {
					delete tooltips[id];
				}
			};
		},
		[id],
		subSlot(slot, 'cleanup'),
	);

	return {
		isOpen,
		open: (immediate) => {
			if (!immediate && delay > 0 && !closeTimeout.current) {
				warmupTooltip();
			} else {
				showTooltip();
			}
		},
		close: hideTooltip,
	};
}
