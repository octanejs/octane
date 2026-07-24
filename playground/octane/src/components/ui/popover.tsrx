// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/popover.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
//
// PopoverContent renders Portal > Content: the Portal's child must be a real
// element DESCRIPTOR (radix portals cannot enumerate opaque compiled .tsrx
// children), so the pair is composed with createElement; the consumer's
// children flow into the Content primitive through the ordinary props.children
// channel.
import { createElement } from 'octane';
import { Popover as PopoverPrimitive } from '@octanejs/radix';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Popover(props: Record<string, unknown>) @{
	<PopoverPrimitive.Root data-slot="popover" {...props} />
}

export function PopoverTrigger(props: Record<string, unknown>) @{
	<PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

export interface PopoverContentProps extends Record<string, unknown> {
	className?: string;
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function PopoverContent({
	className,
	align = 'center',
	sideOffset = 4,
	...props
}: PopoverContentProps) {
	return createElement(PopoverPrimitive.Portal, {
		children: createElement(PopoverPrimitive.Content, {
			'data-slot': 'popover-content',
			align,
			sideOffset,
			className: cn(
				'cn-popover-content z-50 w-72 origin-(--radix-popover-content-transform-origin) outline-hidden',
				className,
			),
			...props,
		}),
	});
}

export function PopoverAnchor(props: Record<string, unknown>) @{
	<PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export function PopoverHeader({ className, ...props }: Props) @{
	<div data-slot="popover-header" className={cn('cn-popover-header', className)} {...props} />
}

export function PopoverTitle({ className, ...props }: Props) @{
	<div data-slot="popover-title" className={cn('cn-popover-title', className)} {...props} />
}

export function PopoverDescription({ className, ...props }: Props) @{
	<p
		data-slot="popover-description"
		className={cn('cn-popover-description', className)}
		{...props}
	/>
}
