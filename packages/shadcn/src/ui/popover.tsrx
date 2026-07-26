// Popover — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: "use client" dropped, radix-ui →
// @octanejs/radix.
//
// PopoverContent renders Portal > Content: the Portal's child must be a real
// element DESCRIPTOR (radix portals cannot enumerate opaque compiled .tsrx
// children), so the pair is composed with createElement; the consumer's
// children flow into the Content primitive through the ordinary props.children
// channel.
import { createElement } from 'octane';
import { Popover as PopoverPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

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
				'z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
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
	<div
		data-slot="popover-header"
		className={cn('flex flex-col gap-0.5 text-sm', className)}
		{...props}
	/>
}

export function PopoverTitle({ className, ...props }: Props) @{
	<div data-slot="popover-title" className={cn('font-medium', className)} {...props} />
}

export function PopoverDescription({ className, ...props }: Props) @{
	<p
		data-slot="popover-description"
		className={cn('text-muted-foreground', className)}
		{...props}
	/>
}
