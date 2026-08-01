// Base UI base popover — runs on @octanejs/base-ui's Popover.
//
// TWO POSITIONING DIFFERENCES FROM THE RADIX BASE, both verified by rendering the primitive and
// reading the DOM rather than inferred:
//
//   1. THE TRANSFORM-ORIGIN CSS VAR IS NAMED DIFFERENTLY. Radix publishes
//      `--radix-popover-content-transform-origin`; Base UI's Positioner publishes plain
//      `--transform-origin`. Copying radix's `origin-(--radix-popover-content-transform-origin)`
//      leaves the utility referencing a variable nothing ever sets, so the popup would scale
//      from the wrong corner on open — visible only in motion, and invisible to any class
//      comparison.
//
//   2. THERE IS A POSITIONER LAYER. Radix goes Portal > Content; Base UI goes
//      Portal > Positioner > Popup, and the Positioner owns side/align/offset. `data-side` and
//      `data-align` land on BOTH the positioner and the popup, so the `data-[side=…]` slide
//      utilities still resolve on the popup where the radix base put them.
//
// NO PopoverAnchor. Radix ships an Anchor part for positioning against something other than the
// trigger; Base UI's Positioner takes an `anchor` prop instead, so there is no element to render
// and no slot to emit. Recorded in tests/cross-base.test.ts rather than faked.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source.
import { createElement } from 'octane';
import { Popover as PopoverPrimitive } from '@octanejs/base-ui/popover';

import { cn } from '../../../lib/utils';

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
		children: createElement(PopoverPrimitive.Positioner, {
			align,
			sideOffset,
			children: createElement(PopoverPrimitive.Popup, {
				'data-slot': 'popover-content',
				className: cn(
					'z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				),
				...props,
			}),
		}),
	});
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
