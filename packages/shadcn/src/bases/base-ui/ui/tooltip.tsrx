// Base UI base tooltip — runs on @octanejs/base-ui's Tooltip.
//
// SAME TWO POSITIONING DIFFERENCES AS POPOVER: the transform-origin var is plain
// `--transform-origin` rather than radix's `--radix-tooltip-content-transform-origin`, and the
// tree gains a Positioner layer (Portal > Positioner > Popup) which owns the offset.
//
// ONE RADIX-ONLY STATE IS DROPPED. The radix base styles `data-[state=delayed-open]:` alongside
// `data-open:`, because radix distinguishes an immediate open from one that waited out the
// delay. Base UI publishes only `data-open`/`data-closed` — there is no delayed-open state to
// match, so those three utilities would be dead weight referencing an attribute that never
// appears. The `data-open:` variants they duplicate are kept and cover both cases.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source.
import { createElement, Fragment, type OctaneNode } from 'octane';
import { Tooltip as TooltipPrimitive } from '@octanejs/base-ui/tooltip';

import { cn } from '../../../lib/utils';

export interface TooltipProviderProps extends Record<string, unknown> {
	delay?: number;
}

export function TooltipProvider({ delay = 0, ...props }: TooltipProviderProps) @{
	<TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

export function Tooltip(props: Record<string, unknown>) @{
	<TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

export function TooltipTrigger(props: Record<string, unknown>) @{
	<TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

export interface TooltipContentProps extends Record<string, unknown> {
	className?: string;
	sideOffset?: number;
	children?: OctaneNode;
}

export function TooltipContent({
	className,
	sideOffset = 0,
	children,
	...props
}: TooltipContentProps) {
	return createElement(TooltipPrimitive.Portal, {
		children: createElement(TooltipPrimitive.Positioner, {
			sideOffset,
			children: createElement(TooltipPrimitive.Popup, {
				'data-slot': 'tooltip-content',
				className: cn(
					'z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				),
				...props,
				// Octane reconciles ARRAY children as a keyed list, so every entry needs a key —
				// including the consumer's. Leaving `children` bare emits the missing-key warning
				// and lets the consumer node be mismatched against the arrow when its identity
				// changes. The consumer may pass anything (a string, an element, an array), so it
				// is wrapped in a keyed Fragment rather than keyed in place.
				children: [
					createElement(Fragment, { key: 'content', children }),
					createElement(TooltipPrimitive.Arrow, {
						key: 'arrow',
						className: 'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground',
					}),
				],
			}),
		}),
	});
}
