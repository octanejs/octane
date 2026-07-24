// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/sheet.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). Sheet is the radix Dialog primitive with
// side variants. IconPlaceholder resolves to lucide (see spinner.tsrx).
//
// SheetContent renders Portal > Overlay + Content: radix's Portal enumerates
// its children with Children.map, which needs real element DESCRIPTORS — so
// the trio is composed with createElement (the cmdk Command.Dialog precedent);
// the consumer's children flow into the Content primitive through the ordinary
// props.children channel, routed through a pass-through host so they can sit
// in an array next to the close-button descriptor (see dialog.tsrx).
import { createElement, type OctaneNode } from 'octane';
import { Dialog as SheetPrimitive } from '@octanejs/radix';
import { XIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Props = { className?: string } & Record<string, unknown>;

// Opaque compiled children cannot sit directly inside a children ARRAY (the
// runtime's list renderers ignore render functions) — route them through a
// pass-through component descriptor (the radix Tooltip ChildrenHost pattern).
function ChildrenHost(props: { children?: OctaneNode }): OctaneNode {
	return props.children as OctaneNode;
}

export function Sheet(props: Record<string, unknown>) @{
	<SheetPrimitive.Root data-slot="sheet" {...props} />
}

export function SheetTrigger(props: Record<string, unknown>) @{
	<SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

export function SheetClose(props: Record<string, unknown>) @{
	<SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

// SheetPortal/SheetOverlay are internal upstream (defined but not exported) —
// kept unexported for export-name fidelity.
function SheetPortal(props: Record<string, unknown>) @{
	<SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: Props) @{
	<SheetPrimitive.Overlay
		data-slot="sheet-overlay"
		className={cn(
			'cn-sheet-overlay fixed inset-0 z-50 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
			className,
		)}
		{...props}
	/>
}

export interface SheetContentProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
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
	return createElement(SheetPortal, {
		children: [
			createElement(SheetOverlay, { key: 'overlay' }),
			createElement(SheetPrimitive.Content, {
				key: 'content',
				'data-slot': 'sheet-content',
				'data-side': side,
				className: cn(
					'cn-sheet-content data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10',
					className,
				),
				...props,
				children: [
					createElement(ChildrenHost, { key: 'children', children }),
					showCloseButton
						? createElement(
								SheetPrimitive.Close,
								{ key: 'close', 'data-slot': 'sheet-close', asChild: true },
								createElement(
									Button,
									{ variant: 'ghost', className: 'cn-sheet-close', size: 'icon-sm' },
									createElement(XIcon, { key: 'icon' }),
									createElement('span', { key: 'label', className: 'sr-only' }, 'Close'),
								),
							)
						: null,
				],
			}),
		],
	});
}

export function SheetHeader({ className, ...props }: Props) @{
	<div
		data-slot="sheet-header"
		className={cn('cn-sheet-header flex flex-col', className)}
		{...props}
	/>
}

export function SheetFooter({ className, ...props }: Props) @{
	<div
		data-slot="sheet-footer"
		className={cn('cn-sheet-footer mt-auto flex flex-col', className)}
		{...props}
	/>
}

export function SheetTitle({ className, ...props }: Props) @{
	<SheetPrimitive.Title
		data-slot="sheet-title"
		className={cn('cn-sheet-title cn-font-heading', className)}
		{...props}
	/>
}

export function SheetDescription({ className, ...props }: Props) @{
	<SheetPrimitive.Description
		data-slot="sheet-description"
		className={cn('cn-sheet-description', className)}
		{...props}
	/>
}
