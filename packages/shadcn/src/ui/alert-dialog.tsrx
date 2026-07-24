// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/alert-dialog.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis).
//
// AlertDialogContent renders Portal > Overlay + Content: radix's Portal
// enumerates its children with Children.map, which needs real element
// DESCRIPTORS — so the trio is composed with createElement (the cmdk
// Command.Dialog precedent); the consumer's children flow into the Content
// primitive through the ordinary props.children channel. Action/Cancel are
// upstream's `<Button asChild><Primitive.Action …>` — Slot needs a real
// element descriptor as its child, so those pairs are composed with
// createElement too (the pagination.tsrx precedent).
import { createElement } from 'octane';
import { AlertDialog as AlertDialogPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './button.tsrx';

type Props = { className?: string } & Record<string, unknown>;

export function AlertDialog(props: Record<string, unknown>) @{
	<AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

export function AlertDialogTrigger(props: Record<string, unknown>) @{
	<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export function AlertDialogPortal(props: Record<string, unknown>) @{
	<AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

export function AlertDialogOverlay({ className, ...props }: Props) @{
	<AlertDialogPrimitive.Overlay
		data-slot="alert-dialog-overlay"
		className={cn('cn-alert-dialog-overlay fixed inset-0 z-50', className)}
		{...props}
	/>
}

export interface AlertDialogContentProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm';
}

export function AlertDialogContent({
	className,
	size = 'default',
	...props
}: AlertDialogContentProps) {
	return createElement(AlertDialogPortal, {
		children: [
			createElement(AlertDialogOverlay, { key: 'overlay' }),
			createElement(AlertDialogPrimitive.Content, {
				key: 'content',
				'data-slot': 'alert-dialog-content',
				'data-size': size,
				className: cn(
					'cn-alert-dialog-content group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 outline-none',
					className,
				),
				...props,
			}),
		],
	});
}

export function AlertDialogHeader({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-header"
		className={cn('cn-alert-dialog-header', className)}
		{...props}
	/>
}

export function AlertDialogFooter({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-footer"
		className={cn(
			'cn-alert-dialog-footer flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogMedia({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-media"
		className={cn('cn-alert-dialog-media', className)}
		{...props}
	/>
}

export function AlertDialogTitle({ className, ...props }: Props) @{
	<AlertDialogPrimitive.Title
		data-slot="alert-dialog-title"
		className={cn('cn-alert-dialog-title cn-font-heading', className)}
		{...props}
	/>
}

export function AlertDialogDescription({ className, ...props }: Props) @{
	<AlertDialogPrimitive.Description
		data-slot="alert-dialog-description"
		className={cn('cn-alert-dialog-description', className)}
		{...props}
	/>
}

export interface AlertDialogActionProps extends Record<string, unknown> {
	className?: string;
	variant?: ButtonProps['variant'];
	size?: ButtonProps['size'];
}

export function AlertDialogAction({
	className,
	variant = 'default',
	size = 'default',
	...props
}: AlertDialogActionProps) {
	return createElement(
		Button,
		{ variant, size, asChild: true },
		createElement(AlertDialogPrimitive.Action, {
			'data-slot': 'alert-dialog-action',
			className: cn('cn-alert-dialog-action', className),
			...props,
		}),
	);
}

export function AlertDialogCancel({
	className,
	variant = 'outline',
	size = 'default',
	...props
}: AlertDialogActionProps) {
	return createElement(
		Button,
		{ variant, size, asChild: true },
		createElement(AlertDialogPrimitive.Cancel, {
			'data-slot': 'alert-dialog-cancel',
			className: cn('cn-alert-dialog-cancel', className),
			...props,
		}),
	);
}
