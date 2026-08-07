// Base UI base sheet — TRANSCRIBED from upstream's `bases/base-ui/ui/sheet.tsx`
// (maintainer-supplied), class strings verbatim. Runs on @octanejs/base-ui's Dialog:
// Overlay -> Backdrop, Content -> Popup.
//
// UPSTREAM ANIMATES THIS WITH CSS TRANSITIONS, NOT KEYFRAMES, which is why the file is transcribed
// rather than derived. Base UI publishes `data-starting-style` and `data-ending-style` (see
// utils/popupStateMapping.ts) and this source drives motion off them with a plain `transition`,
// where the radix base uses `animate-in` / `animate-out` keyframe utilities.
//
// A derived version of this file did jump visibly on close, which is what prompted the
// transcription. Do NOT infer from that a general rule that keyframes cannot work on Base UI: the
// same mapping also emits `data-open` and `data-closed`, so `data-closed:animate-out` does match,
// and the precise cause of that jump was never isolated. What is established here is only what
// upstream ships, which is this.
//
// So the motion here reads: `transition duration-200` plus per-side
// `data-starting-style:translate-*` / `data-ending-style:translate-*` and an opacity pair —
// the element sits offset-and-transparent before open and after close, and transitions to its
// resting position in between.
//
// ONE DEPARTURE FROM THE SOURCE: upstream's title carries `cn-font-heading`, a semantic hook from
// the pinned cn-* system. This package ships the utilities-inlined flavor, the react-aria base
// drops the same class, and nothing defines it here (0 occurrences in the built CSS).
//
// Octane adaptations: no `"use client"`; refs are props.
import { type OctaneNode } from 'octane';
import { Dialog as SheetPrimitive } from '@octanejs/base-ui/dialog';
import { XIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';
import { Button } from './button.tsrx';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function Sheet(props: Record<string, unknown>) @{
	<SheetPrimitive.Root data-slot="sheet" {...props} />
}

export function SheetTrigger(props: Record<string, unknown>) @{
	<SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

export function SheetClose(props: Record<string, unknown>) @{
	<SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

export function SheetPortal(props: Record<string, unknown>) @{
	<SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

export function SheetOverlay({ className, ...props }: Props) @{
	<SheetPrimitive.Backdrop
		data-slot="sheet-overlay"
		className={cn(
			'fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs',
			className,
		)}
		{...props}
	/>
}

export interface SheetContentProps extends Props {
	side?: 'top' | 'right' | 'bottom' | 'left';
	showCloseButton?: boolean;
}

export function SheetContent(props: SheetContentProps) @{
	const { className, side = 'right', showCloseButton = true, children: _children, ...rest } = props;

	<SheetPortal>
		<SheetOverlay />
		<SheetPrimitive.Popup
			data-slot="sheet-content"
			data-side={side}
			className={cn(
				'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
				className,
			)}
			{...rest}
		>
			{props.children}
			@if (showCloseButton) {
				<SheetPrimitive.Close
					data-slot="sheet-close"
					render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
						<XIcon />
						<span className="sr-only">Close</span>
					</Button>}
				/>
			}
		</SheetPrimitive.Popup>
	</SheetPortal>
}

export function SheetHeader({ className, ...props }: Props) @{
	<div data-slot="sheet-header" className={cn('flex flex-col gap-0.5 p-4', className)} {...props} />
}

export function SheetFooter({ className, ...props }: Props) @{
	<div
		data-slot="sheet-footer"
		className={cn('mt-auto flex flex-col gap-2 p-4', className)}
		{...props}
	/>
}

export function SheetTitle({ className, ...props }: Props) @{
	<SheetPrimitive.Title
		data-slot="sheet-title"
		className={cn('text-base font-medium text-foreground', className)}
		{...props}
	/>
}

export function SheetDescription({ className, ...props }: Props) @{
	<SheetPrimitive.Description
		data-slot="sheet-description"
		className={cn('text-sm text-muted-foreground', className)}
		{...props}
	/>
}
