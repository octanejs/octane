// Default-Tailwind alert-dialog flavor (package canonical) — user-supplied
// styling, class strings verbatim. Octane adaptations: "use client" dropped,
// radix-ui → @octanejs/radix; Content composes Portal > Overlay + Content via
// createElement (Portal slots its child); Action/Cancel wrap the primitive in
// Button-asChild (descriptor child), consumer children via props.children.
import { createElement, type OctaneNode } from 'octane';
import { AlertDialog as AlertDialogPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './button.tsrx';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

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
		className={cn(
			'fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
			className,
		)}
		{...props}
	/>
}

export interface AlertDialogContentProps extends Props {
	size?: 'default' | 'sm';
}

export function AlertDialogContent({
	className,
	size = 'default',
	children,
	...props
}: AlertDialogContentProps) {
	return createElement(
		AlertDialogPrimitive.Portal,
		{ 'data-slot': 'alert-dialog-portal' },
		createElement(AlertDialogOverlay, { key: 'overlay' }),
		createElement(AlertDialogPrimitive.Content, {
			key: 'content',
			'data-slot': 'alert-dialog-content',
			'data-size': size,
			className: cn(
				'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			),
			...props,
			children,
		}),
	);
}

export function AlertDialogHeader({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-header"
		className={cn(
			'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogFooter({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-footer"
		className={cn(
			'-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogMedia({ className, ...props }: Props) @{
	<div
		data-slot="alert-dialog-media"
		className={cn(
			'mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*=\'size-\'])]:size-6',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogTitle({ className, ...props }: Props) @{
	<AlertDialogPrimitive.Title
		data-slot="alert-dialog-title"
		className={cn(
			'cn-font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
			className,
		)}
		{...props}
	/>
}

export function AlertDialogDescription({ className, ...props }: Props) @{
	<AlertDialogPrimitive.Description
		data-slot="alert-dialog-description"
		className={cn(
			'text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>
}

export interface AlertDialogActionProps extends Props {
	variant?: ButtonProps['variant'];
	size?: ButtonProps['size'];
}

export function AlertDialogAction({
	className,
	variant = 'default',
	size = 'default',
	children,
	...props
}: AlertDialogActionProps) {
	return createElement(
		Button,
		{ variant, size, asChild: true },
		createElement(AlertDialogPrimitive.Action, {
			'data-slot': 'alert-dialog-action',
			className: cn(className),
			...props,
			children,
		}),
	);
}

export function AlertDialogCancel({
	className,
	variant = 'outline',
	size = 'default',
	children,
	...props
}: AlertDialogActionProps) {
	return createElement(
		Button,
		{ variant, size, asChild: true },
		createElement(AlertDialogPrimitive.Cancel, {
			'data-slot': 'alert-dialog-cancel',
			className: cn(className),
			...props,
			children,
		}),
	);
}
