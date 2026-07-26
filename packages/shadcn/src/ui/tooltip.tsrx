// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/tooltip.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
//
// TooltipContent renders Portal > Content + Arrow: the Portal's child must be
// a real element DESCRIPTOR (radix portals cannot enumerate opaque compiled
// .tsrx children), so the pair is composed with createElement. The consumer's
// children flow into the Content primitive through the ordinary props.children
// channel.
import { createElement, type OctaneNode } from 'octane';
import { Tooltip as TooltipPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface TooltipProviderProps extends Record<string, unknown> {
	delayDuration?: number;
}

export function TooltipProvider({ delayDuration = 0, ...props }: TooltipProviderProps) @{
	<TooltipPrimitive.Provider
		data-slot="tooltip-provider"
		delayDuration={delayDuration}
		{...props}
	/>
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
		children: createElement(TooltipPrimitive.Content, {
			'data-slot': 'tooltip-content',
			sideOffset,
			className: cn(
				'z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			),
			...props,
			children: [
				children,
				createElement(TooltipPrimitive.Arrow, {
					key: 'arrow',
					className: 'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground',
				}),
			],
		}),
	});
}
