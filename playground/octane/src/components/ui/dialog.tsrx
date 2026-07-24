// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/dialog.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx).
//
// DialogContent renders Portal > Overlay + Content: radix's Portal enumerates
// its children with Children.map, which needs real element DESCRIPTORS —
// opaque compiled .tsrx children are ignored there — so the trio is composed
// with createElement (the cmdk Command.Dialog precedent). The consumer's own
// children still flow into the Content primitive through the ordinary
// props.children channel, routed through a pass-through host so they can sit
// in an array next to the close-button descriptor (mirrors @octanejs/radix
// Tooltip's internal ChildrenHost).
import { createElement, type OctaneNode } from 'octane';
import { Dialog as DialogPrimitive } from '@octanejs/radix';
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

export function Dialog(props: Record<string, unknown>) @{
	<DialogPrimitive.Root data-slot="dialog" {...props} />
}

export function DialogTrigger(props: Record<string, unknown>) @{
	<DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogPortal(props: Record<string, unknown>) @{
	<DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

export function DialogClose(props: Record<string, unknown>) @{
	<DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

export function DialogOverlay({ className, ...props }: Props) @{
	<DialogPrimitive.Overlay
		data-slot="dialog-overlay"
		className={cn('cn-dialog-overlay fixed inset-0 isolate z-50', className)}
		{...props}
	/>
}

export interface DialogContentProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
	showCloseButton?: boolean;
}

export function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: DialogContentProps) {
	return createElement(DialogPortal, {
		children: [
			createElement(DialogOverlay, { key: 'overlay' }),
			createElement(DialogPrimitive.Content, {
				key: 'content',
				'data-slot': 'dialog-content',
				className: cn(
					'cn-dialog-content fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none',
					className,
				),
				...props,
				children: [
					createElement(ChildrenHost, { key: 'children', children }),
					showCloseButton
						? createElement(
								DialogPrimitive.Close,
								{ key: 'close', 'data-slot': 'dialog-close', asChild: true },
								createElement(
									Button,
									{ variant: 'ghost', className: 'cn-dialog-close', size: 'icon-sm' },
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

export function DialogHeader({ className, ...props }: Props) @{
	<div
		data-slot="dialog-header"
		className={cn('cn-dialog-header flex flex-col', className)}
		{...props}
	/>
}

export interface DialogFooterProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
	showCloseButton?: boolean;
}

export function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: DialogFooterProps) {
	return createElement(
		'div',
		{
			'data-slot': 'dialog-footer',
			className: cn(
				'cn-dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
				className,
			),
			...props,
		},
		createElement(ChildrenHost, { key: 'children', children }),
		showCloseButton
			? createElement(
					DialogPrimitive.Close,
					{ key: 'close', asChild: true },
					createElement(Button, { variant: 'outline' }, 'Close'),
				)
			: null,
	);
}

export function DialogTitle({ className, ...props }: Props) @{
	<DialogPrimitive.Title
		data-slot="dialog-title"
		className={cn('cn-dialog-title cn-font-heading', className)}
		{...props}
	/>
}

export function DialogDescription({ className, ...props }: Props) @{
	<DialogPrimitive.Description
		data-slot="dialog-description"
		className={cn('cn-dialog-description', className)}
		{...props}
	/>
}
