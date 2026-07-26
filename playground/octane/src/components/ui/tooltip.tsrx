// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/tooltip.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
//
// TooltipContent renders Portal > Content + Arrow: the Portal's child must be
// a real element DESCRIPTOR (radix portals cannot enumerate opaque compiled
// .tsrx children), so the pair is composed with createElement. The consumer's
// children flow into the Content primitive through the ordinary props.children
// channel, routed through a pass-through host so they can sit in an array next
// to the arrow descriptor (mirrors @octanejs/radix Tooltip's internal
// ChildrenHost).
import { createElement, type OctaneNode } from 'octane';
import { Tooltip as TooltipPrimitive } from '@octanejs/radix';

import { cn } from '@/lib/utils';

// Opaque compiled children cannot sit directly inside a children ARRAY (the
// runtime's list renderers ignore render functions) — route them through a
// pass-through component descriptor (the radix Tooltip ChildrenHost pattern).
function ChildrenHost(props: { children?: OctaneNode }): OctaneNode {
	return props.children as OctaneNode;
}

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
				'cn-tooltip-content z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) bg-foreground text-background',
				className,
			),
			...props,
			children: [
				createElement(ChildrenHost, { key: 'children', children }),
				createElement(TooltipPrimitive.Arrow, {
					key: 'arrow',
					className: 'cn-tooltip-arrow z-50 translate-y-[calc(-50%_-_2px)] bg-foreground fill-foreground',
				}),
			],
		}),
	});
}
