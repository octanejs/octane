// Sheet — maintainer-supplied default-Tailwind flavor, class strings verbatim.
// Octane adaptations: "use client" dropped, lucide-react → @octanejs/lucide,
// radix-ui Dialog → @octanejs/radix. SheetContent composes Portal > Overlay +
// Content with createElement (radix's Portal slots its child, so children must
// be real element descriptors); consumer children flow through the ordinary
// props.children channel.
import { createElement, type OctaneNode } from 'octane';
import { Dialog as SheetPrimitive } from '@octanejs/radix';
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
	<SheetPrimitive.Overlay
		data-slot="sheet-overlay"
		className={cn(
			'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
			className,
		)}
		{...props}
	/>
}

export interface SheetContentProps extends Props {
	side?: 'top' | 'right' | 'bottom' | 'left';
	showCloseButton?: boolean;
}

export function SheetContent({
	className,
	children,
	side = 'right',
	showCloseButton = true,
	...props
}: SheetContentProps) {
	return createElement(
		SheetPrimitive.Portal,
		{ 'data-slot': 'sheet-portal' },
		createElement(SheetOverlay, { key: 'overlay' }),
		createElement(
			SheetPrimitive.Content,
			{
				key: 'content',
				'data-slot': 'sheet-content',
				'data-side': side,
				className: cn(
					'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10',
					className,
				),
				...props,
			},
			children,
			showCloseButton
				? createElement(
						SheetPrimitive.Close,
						{ key: 'close', 'data-slot': 'sheet-close', asChild: true },
						createElement(
							Button,
							{ variant: 'ghost', className: 'absolute top-3 right-3', size: 'icon-sm' },
							createElement(XIcon, { key: 'icon' }),
							createElement('span', { key: 'sr', className: 'sr-only' }, 'Close'),
						),
					)
				: null,
		),
	);
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
		className={cn('cn-font-heading text-base font-medium text-foreground', className)}
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
