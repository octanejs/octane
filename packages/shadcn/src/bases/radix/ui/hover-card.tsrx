// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/hover-card.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis).
//
// HoverCardContent renders Portal > Content: the Portal's child must be a real
// element DESCRIPTOR (radix portals cannot enumerate opaque compiled .tsrx
// children), so the pair is composed with createElement; the consumer's
// children flow into the Content primitive through the ordinary props.children
// channel.
import { createElement } from 'octane';
import { HoverCard as HoverCardPrimitive } from '@octanejs/radix';

import { cn } from '../../../lib/utils';

export function HoverCard(props: Record<string, unknown>) @{
	<HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

export function HoverCardTrigger(props: Record<string, unknown>) @{
	<HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

export interface HoverCardContentProps extends Record<string, unknown> {
	className?: string;
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function HoverCardContent({
	className,
	align = 'center',
	sideOffset = 4,
	...props
}: HoverCardContentProps) {
	return createElement(HoverCardPrimitive.Portal, {
		'data-slot': 'hover-card-portal',
		children: createElement(HoverCardPrimitive.Content, {
			'data-slot': 'hover-card-content',
			align,
			sideOffset,
			className: cn(
				'z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
				className,
			),
			...props,
		}),
	});
}
